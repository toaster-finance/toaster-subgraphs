import { Address, BigInt, Bytes, dataSource } from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Position } from "../../../generated/schema";
import { UniswapV3Pool } from "../../../generated/UniswapV3/UniswapV3Pool";
import { UniswapV3PositionManager } from "../../../generated/UniswapV3/UniswapV3PositionManager";
import { getContextAddress } from "../../common/helpers/contextHelper";

export const PANCAKESWAP_V3_PROTOCOL = "PancakeSwapV3";

export class PancakeSwapV3Helper extends InvestmentHelper {
  static getPcsV3PosId(tokenId: BigInt): Bytes {
    return Bytes.fromUTF8(PANCAKESWAP_V3_PROTOCOL)
      .concat(
        Bytes.fromHexString(dataSource.context().getString("positionManager"))
      )
      .concat(Bytes.fromI32(tokenId.toI32()));
  }

  static findNft(tokenId: BigInt): Position | null {
    const positionId = PancakeSwapV3Helper.getPcsV3PosId(tokenId);
    return Position.load(positionId);
  }

  constructor(readonly investmentAddress: Address) {
    super(PANCAKESWAP_V3_PROTOCOL, investmentAddress, "");
  }

  getProtocolMeta(): string[] {
    const totalSupply = UniswapV3PositionManager.bind(
      getContextAddress("positionManager")
    ).totalSupply();

    return [totalSupply.toString()];
  }
  // how to get the position id is different from other protocols
  getInvestPositionId(_owner: Address, tag: string): Bytes {
    return PancakeSwapV3Helper.getPcsV3PosId(BigInt.fromString(tag));
  }

  findNftPosition(tokenId: BigInt): Position | null {
    // since `getPositionId` don't use owner
    // pass just Address.zero() as owner
    return this.findPosition(Address.zero(), tokenId.toString());
  }

  getInfo(investmentAddress: Address): InvestmentInfo {
    const pool = UniswapV3Pool.bind(investmentAddress);
    const token0 = pool.token0();
    const token1 = pool.token1();
    const CAKE = Address.fromBytes(
      Bytes.fromHexString(dataSource.context().getString("CAKE"))
    );
    const slot0 = pool.slot0();
    return new InvestmentInfo(
      [token0, token1],
      [token0, token1, CAKE],
      [pool.fee().toString()]
    );
  }
}
