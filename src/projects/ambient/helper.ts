import {
  Address,
  BigInt,
  Bytes,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Investment, Position } from "../../../generated/schema";

export const AMBIENT_FINANCE = "Ambient";

interface AmbientDetails extends Map<string, string> {
    poolIdx: string,
    token0: string,
    token1: string
}

export class AmbientHelper extends InvestmentHelper {
  constructor(investmentAddress: Address) {
    super(AMBIENT_FINANCE, investmentAddress);
  }
  getProtocolMeta(): string[] {
    return [];
  }
  /**
   *
   * @param investmentAddress
   * @param details
   * AmbientDetails
   * {
   *   poolIdx : string
   *   token0 : string
   *   token1 : string
   * }
   * @returns investment info
   */
  getInfo(investmentAddress: Address, details: AmbientDetails): InvestmentInfo {
    const token0 = Address.fromString(details.token0);
    const token1 = Address.fromString(details.token1);
    return new InvestmentInfo(
      [token0, token1],
      [token0, token1],
      [details.poolIdx]
    );
  }

  getOrCreateInvestment(block: ethereum.Block): Investment {
    let investment = Investment.load(this.id);
    if (!investment) {
      const protocol = this.getProtocol(block);
      const info = this.getInfo(this.investmentAddress);
      investment = new Investment(this.id);
      investment.protocol = protocol.id;
      investment.address = this.investmentAddress;
      investment.inputTokens = info.inputTokens.map<Bytes>((addr) =>
        Bytes.fromHexString(addr.toHexString())
      );
      investment.rewardTokens = info.rewardTokens.map<Bytes>((addr) =>
        Bytes.fromHexString(addr.toHexString())
      );
      investment.meta = info.meta;
      investment.blockNumber = block.number;
      investment.blockTimestamp = block.timestamp;
      investment.save();
    }

    return investment as Investment;
  }
  getLiquidityInfo(block: ethereum.Block): LiquidityInfo {
    const investment = this.getOrCreateInvestment(block);
    const reserve0 = BigInt.fromString(investment.meta[1]);
    const reserve1 = BigInt.fromString(investment.meta[2]);
    const totalSupply = BigInt.fromString(investment.meta[3]);

    return new LiquidityInfo(investment, reserve0, reserve1, totalSupply);
  }

  getPositionId(owner: Address, tag: string): Bytes {
    
  }
}

class LiquidityInfo {
  constructor(
    readonly investment: Investment,
    readonly reserve0: BigInt,
    readonly reserve1: BigInt,
    readonly totalSupply: BigInt
  ) {}

  saveTotalSupply(ts: BigInt): void {
    this.investment.meta[3] = ts.toString();
    this.investment.save();
  }
}
