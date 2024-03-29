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
  abstract getInfo(investmentAddress: Address): InvestmentInfo;

  // used at : upsertPosition, positionSnapshot
  // this.id = investmentId
  getPositionId(owner: Address, tag: string): Bytes {
    return this.id.concat(owner).concat(Bytes.fromUTF8(tag));
  }

  findPosition(owner: Address, tag: string): Position | null {
    const positionId = this.getPositionId(owner, tag);
    return Position.load(positionId);
  }

  abstract getProtocolMeta(): string[];

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
