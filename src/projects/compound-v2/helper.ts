import {
  cToken as cTokenContract,
  cToken__getAccountSnapshotResult,
} from "./../../../generated/templates/cToken/cToken";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { getContextAddress } from "../../common/helpers/contextHelper";

/**
 * id: investment id  = "CompoundV2{cTokenAddress}"
 * no need investment tag, because cToken address is unique
 */
export class CompoundV2Helper extends InvestmentHelper {
  static protocolName: string = "CompoundV2";

  readonly comptroller: Address;
  readonly compAddr: Address;
  /**
   *
   * @param cToken Compound V2 cToken Contract Address
   * @param tag underlying token address
   */
  constructor(cToken: Address) {
    super(CompoundV2Helper.protocolName, cToken, "");
    this.comptroller = getContextAddress("Comptroller");
    this.compAddr = getContextAddress("COMP");
  }

  getProtocolMeta(): string[] {
    return [];
  }

  cToken(): cTokenContract {
    return cTokenContract.bind(this.investmentAddress);
  }

  getInfo(_invest: Address): InvestmentInfo {
    const underlying = this.cToken().underlying();
    return new InvestmentInfo([underlying], [this.compAddr], []);
  }

  getUnderlyingAmount(owner: Address): BigInt {
    const balanceResult = this.cToken().try_balanceOfUnderlying(owner);
    return balanceResult.reverted ? BigInt.fromI32(0) : balanceResult.value;
  }

  getCTokenAmount(owner: Address): BigInt {
    const balanceResult = this.cToken().try_balanceOf(owner);
    return balanceResult.reverted ? BigInt.fromI32(0) : balanceResult.value;
  }
  getBorrowedAmount(owner: Address): BigInt {
    return this.cToken().borrowBalanceStored(owner);
  }

  /**
   * 
   * @param owner position owner
   * @returns 
   * NO_ERROR  
   * accountTokens[account] -> cToken balance  
   * borrowBalanceStoredInternal(account) -> borrowed amount  
   * exchangeRateStoredInternal() -> exchange rate  
   */
  getAccountSnapshot(owner: Address): cToken__getAccountSnapshotResult {
    return this.cToken().getAccountSnapshot(owner);
  }
}
