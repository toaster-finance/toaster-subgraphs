import { Address, Bytes, dataSource } from "@graphprotocol/graph-ts";
import { Investment, Position, Protocol } from "../../../generated/schema";

export class InvestmentTokens {
  constructor(
    readonly inputTokens: Address[],
    readonly rewardTokens: Address[],
    readonly meta: Bytes[] = []
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
  return Bytes.fromUTF8(protocol).concat(
    Bytes.fromHexString(investmentAddress.toHexString())
  );
}

export function getProtocolId(protocolName: string): Bytes {
  return Bytes.fromUTF8(protocolName + ":" + dataSource.network());
}

export function getProtocol(protocolName: string): Protocol {
  const protocolId = getProtocolId(protocolName);
  let protocol = Protocol.load(protocolId);
  if (!protocol) {
    protocol = new Protocol(protocolId);
    protocol.name = protocolName;
    protocol.chain = dataSource.network();
    protocol.save();
  }
  return protocol as Protocol;
}

export abstract class BaseInvestment {
  id: Bytes;
  constructor(
    readonly protocolName: string,
    readonly investmentAddress: Address
  ) {
    this.id = getInvestmentId(protocolName, investmentAddress);
  }

  ////// ABSTRACTS //////
  abstract getTokens(investmentAddress: Address): InvestmentTokens;

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

  getOrCreateInvestment(): Investment {
    let investment = Investment.load(this.id);
    if (!investment) {
      const protocol = getProtocol(this.protocolName);
      const tokens = this.getTokens(this.investmentAddress);
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
      investment.save();
    }

    return investment as Investment;
  }
}
