import { cToken as cTokenContract } from './../../../generated/templates/cToken/cToken';
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Address, BigInt } from "@graphprotocol/graph-ts";

/**
 * id: investment id  = "CompoundV2{cTokenAddress}{UnderlyingToken}"
 */
export class CompoundV2Helper extends InvestmentHelper {

  static protocolName:string = "CompoundV2";
  /**
   *
   * @param cToken Compound V2 cToken Contract Address
   * @param tag underlying token address
   */
  constructor(cToken: Address, readonly comptroller:Address,readonly compAddr: Address) {
    const callResult = cTokenContract.bind(cToken).try_underlying();
    const cTokenAddress = callResult.reverted
      ? Address.zero()
      : callResult.value;
    super(CompoundV2Helper.protocolName, cToken, cTokenAddress.toHexString());
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
    return Address.fromString(this.tag)
    
  }

  getUnderlyingAmount(owner:Address): BigInt{
    const balanceResult = cTokenContract.bind(this.investmentAddress).try_balanceOfUnderlying(owner)
    return balanceResult.reverted ?  BigInt.fromI32(0) : balanceResult.value;
  }
  getBorrowedAmount(owner:Address): BigInt{
    return cTokenContract.bind(this.investmentAddress).borrowBalanceStored(owner);
  }

}
