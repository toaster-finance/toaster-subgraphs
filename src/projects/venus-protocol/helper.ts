import { cToken } from './../../../generated/templates/cToken/cToken';
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Address, BigInt } from "@graphprotocol/graph-ts";

/**
 * id: investment id  = "Venus{cTokenAddress}{UnderlyingToken}"
 */
export class VenusHelper extends InvestmentHelper {
  static protocolName = "Venus";
  /**
   *
   * @param cToken Venus V2 cToken Contract Address
   * @param tag ""
   */
  constructor(
    cToken: Address,
    tag: string,
    readonly comptroller: Address,
    readonly compAddr: Address
  ) {
    super("Venus", cToken, tag);
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    const underlying = this.getUnderlyingToken();
    return new InvestmentInfo([underlying], [this.compAddr], []);
  }

  getUnderlyingToken(): Address {
    const callResult = cToken.bind(this.investmentAddress).try_underlying();
    const cTokenAddress = callResult.reverted
      ? Address.zero()
      : callResult.value;
    return cTokenAddress;
  }

  getUnderlyingAmount(owner:Address): BigInt{
    const balanceResult = cToken.bind(this.investmentAddress).try_balanceOfUnderlying(owner)
    return balanceResult.reverted ? balanceResult.value : BigInt.fromI32(0);
  }
  getBorrowedAmount(owner: Address): BigInt {
    return cToken.bind(this.investmentAddress).borrowBalanceStored(owner);
  }
}
