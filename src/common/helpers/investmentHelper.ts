import { Address, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";
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

export function getProtocol(protocolName: string): Protocol | null {
  const protocolId = getProtocolId(protocolName);
  return Protocol.load(protocolId);
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

  // used at : upsertPosition
  getPositionId(owner: Address, tag: string): Bytes {
    return this.id.concat(
      Bytes.fromHexString(owner.toHexString()).concat(Bytes.fromUTF8(tag))
    );
  }

  findPosition(owner: Address, tag: string): Position | null {
    const positionId = this.getPositionId(owner, tag);
    return Position.load(positionId);
  }

  getOrCreateInvestment(block: ethereum.Block): Investment {
    let investment = Investment.load(this.id);
    if (!investment) {
      const protocol = getProtocol(this.protocolName);
      if (!protocol) throw new Error("Protocol not found");

      const tokens = this.getInfo(this.investmentAddress);
      investment = new Investment(this.id);
      investment.protocol = protocol.id;
      investment.address = this.investmentAddress;
      investment.inputTokens = tokens.inputTokens.map<Bytes>((addr) =>
        Bytes.fromHexString(addr.toHexString())
      );
      investment.rewardTokens = tokens.rewardTokens.map<Bytes>((addr) =>
        Bytes.fromHexString(addr.toHexString())
      );
      investment.meta = tokens.meta;
      investment.blockNumber = block.number;
      investment.blockTimestamp = block.timestamp;
      investment.save();
    }

    return investment as Investment;
  }
}
