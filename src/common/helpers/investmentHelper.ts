import {
  Address,
  BigInt,
  Bytes,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import { Investment, Position, Protocol } from "../../../generated/schema";

export class InvestmentInfo {
  constructor(
    readonly inputTokens: Address[],
    readonly rewardTokens: Address[],
    readonly meta: string[] = []
  ) {}
}

export class InvestmentAmounts {
  constructor(
    readonly inputAmounts: Address[],
    readonly rewardAmounts: Address[]
  ) {}
}

export function getInvestmentId(
  protocol: string,
  investmentAddress: Address
): Bytes {
  return Bytes.fromUTF8(protocol).concat(investmentAddress);
}

export function getProtocolId(protocolName: string): Bytes {
  return Bytes.fromUTF8(protocolName + ":" + dataSource.network());
}

export abstract class InvestmentHelper {
  id: Bytes;
  constructor(
    readonly protocolName: string,
    readonly investmentAddress: Address
  ) {
    this.id = getInvestmentId(protocolName, investmentAddress);
  }

  ////// ABSTRACTS //////
  /**
   * 
   * @param investmentAddress : investment address. 
   * ex. uniswap v3 usdc-usdt pool address , ambient finance pool address(it's only one, so it needs extra poolInfo parameter to get the investment info)
   * @param details: extra pool info. ex. ambient finance pool info, aave pool info
   */
  abstract getInfo(investmentAddress: Address, details?: Map<string,string>): InvestmentInfo;

  // used at : upsertPosition, positionSnapshot
  // this.id = investmentId
  getPositionId(owner: Address, tag: string): Bytes {
    return this.id.concat(owner).concat(Bytes.fromUTF8(tag));
  }
  
  /**
   * 
   * @param owner owner address of the position
   * @param tag 
   * @returns 
   */
  findPosition(owner: Address, tag: string): Position | null {
    const positionId = this.getPositionId(owner, tag);
    return Position.load(positionId);
  }
  // 저장하고 싶은 프로토콜 메타. ex. syncswap: ethcall 줄이기 위해서 totalSupply 저장
  abstract getProtocolMeta(): string[];
  // 
  getProtocol(block: ethereum.Block): Protocol {
    const protocolId = getProtocolId(this.protocolName);
    let protocol = Protocol.load(protocolId);
    if (!protocol) {
      protocol = new Protocol(protocolId);
      protocol.name = this.protocolName;
      protocol.blockNumber = block.number;
      protocol.chain = dataSource.network();
      protocol._batchIterator = BigInt.fromI32(0);
      protocol.meta = this.getProtocolMeta();
      protocol.save();
    }
    return protocol;
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
}
