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
  /**
   *
   * @param cToken Compound V2 cToken Contract Address
   * @param tag ""
   */
  constructor(cToken: Address, tag: string, readonly comptroller:Address,readonly compAddr: Address) {
    super("CompoundV2", cToken, tag);
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
    const cTokenBalance  = cToken.bind(this.investmentAddress).balanceOf(owner);
    const exchangeRate = cToken.bind(this.investmentAddress).exchangeRateStored();
    return cTokenBalance.times(exchangeRate).div(BigInt.fromI32(10).pow(18));
  }
  getBorrowedAmount(owner:Address): BigInt{
    return cToken.bind(this.investmentAddress).borrowBalanceStored(owner);
  }

}
