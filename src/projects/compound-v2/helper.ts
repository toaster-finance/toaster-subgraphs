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
import { Comptroller as ComptrollerContract } from "../../../generated/Comptroller/Comptroller";

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
  constructor(cToken: Address, comptroller: Address, compAddr: Address) {
    super(CompoundV2Helper.protocolName, cToken, "");
    this.comptroller = comptroller;
    this.compAddr = compAddr;
  }

  getProtocolMeta(): string[] {
    return [];
  }

  cToken(): cTokenContract {
    return cTokenContract.bind(this.investmentAddress);
  }

  Comptroller(): ComptrollerContract {
    return ComptrollerContract.bind(this.comptroller);
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

  getBorrowIndex(): BigInt {
    return this.Comptroller()
      .compBorrowState(this.investmentAddress)
      .getIndex();
  }
  getSupplyIndex(): BigInt {
    return this.Comptroller()
      .compSupplyState(this.investmentAddress)
      .getIndex();
  }

  // ref: https://github.com/compound-finance/compound-protocol/blob/a3214f67b73310d547e00fc578e8355911c9d376/contracts/Comptroller.sol#L1269
  // Calculate COMP accrued: cTokenAmount * accruedPerBorrowedUnit
  // uint borrowIndex = borrowState.index;
  // uint borrowerIndex = compBorrowerIndex[cToken][borrower];
  // uint borrowerAmount = div_(CToken(cToken).borrowBalanceStored(borrower), cToken.borrowIndex());
  // uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
  getBorrowRewardDelta(
    borrowAmount: BigInt,
    borrowStateIndex: BigInt,
    borrowerIndex: BigInt
  ): BigInt {
    return borrowStateIndex.minus(borrowerIndex).times(borrowAmount);
  }

  getSupplyRewardDelta(
    mintAmount: BigInt,
    suppyStateIndex: BigInt,
    supplierIndex: BigInt
  ): BigInt {
    return suppyStateIndex.minus(supplierIndex).times(mintAmount);
  }

  getBorrowerIndex(owner: Address): BigInt {
    return this.Comptroller().compBorrowerIndex(this.investmentAddress, owner);
  }

  getSupplierIndex(owner: Address): BigInt {
    return this.Comptroller().compSupplierIndex(this.investmentAddress, owner);
  }
  getRewardAmountStored(owner: Address): BigInt {
    return this.Comptroller().compAccrued(owner);
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

  getRewardAmount(
    owner: Address,
    supplyIdx: BigInt,
    borrowIdx: BigInt,
    supplierIdx: BigInt,
    borrowerIdx: BigInt
  ): BigInt {
    return this.getRewardAmountStored(owner)
      .plus(
        this.getBorrowRewardDelta(
          this.getBorrowedAmount(owner),
          borrowIdx,
          borrowerIdx
        )
      )
      .plus(
        this.getSupplyRewardDelta(
          this.getCTokenAmount(owner),
          supplyIdx,
          supplierIdx
        )
      );
  }
}
