import { cToken } from './../../../generated/templates/cToken/cToken';
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { Comptroller } from "../../../generated/Comptroller/Comptroller";

/**
 * id: investment id  = "CompoundV2{cTokenAddress}{UnderlyingToken}"
 */
export class CompoundV2Helper extends InvestmentHelper {

  static protocolName:string = "CompoundV2";
  /**
   *
   * @param cToken Compound V2 cToken Contract Address
   * @param tag ""
   */
  constructor(cToken: Address, readonly comptroller:Address,readonly compAddr: Address) {
    super(CompoundV2Helper.protocolName, cToken, "");
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    const underlying = this.getUnderlyingToken();
    return new InvestmentInfo(
      [underlying],
      [this.compAddr],
      []
    );
  }

  getUnderlyingToken(): Address {

    const callResult = cToken.bind(this.investmentAddress).try_underlying();
    const cTokenAddress = callResult.reverted ? Address.zero() : callResult.value;
    return cTokenAddress;
  }

  getUnderlyingAmount(owner:Address): BigInt{
    const balanceResult = cToken.bind(this.investmentAddress).try_balanceOfUnderlying(owner)
    return balanceResult.reverted ? balanceResult.value : BigInt.fromI32(0);
  }
  getBorrowedAmount(owner:Address): BigInt{
    return cToken.bind(this.investmentAddress).borrowBalanceStored(owner);
  }

}
