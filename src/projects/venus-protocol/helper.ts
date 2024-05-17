import { vToken } from './../../../generated/templates/vToken/vToken';
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Address, BigInt } from "@graphprotocol/graph-ts";

/**
 * id: investment id  = "Venus{vTokenAddress}{UnderlyingToken}"
 */
export class VenusHelper extends InvestmentHelper {
  static protocolName:string = "Venus";
  /**
   *
   * @param vToken Venus V2 vToken Contract Address
   * @param tag ""
   */
  constructor(
    vToken: Address,
    readonly comptroller: Address,
    readonly xvsAddr: Address
  ) {
    super("Venus", vToken, "");
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    const underlying = this.getUnderlyingToken();
    return new InvestmentInfo([underlying], [this.xvsAddr], []);
  }

  getUnderlyingToken(): Address {
    const callResult = vToken.bind(this.investmentAddress).try_underlying();
    const vTokenAddress = callResult.reverted
      ? Address.zero()
      : callResult.value;
    return vTokenAddress;
  }

  getUnderlyingAmount(owner:Address): BigInt{
    const balanceResult = vToken.bind(this.investmentAddress).try_balanceOfUnderlying(owner)
    return balanceResult.reverted ? balanceResult.value : BigInt.fromI32(0);
  }
  getBorrowedAmount(owner: Address): BigInt {
    return vToken.bind(this.investmentAddress).borrowBalanceStored(owner);
  }
}
