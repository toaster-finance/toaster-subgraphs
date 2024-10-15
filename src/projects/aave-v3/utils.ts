import { Address, BigInt, dataSource } from "@graphprotocol/graph-ts";
import { AaveV3Helper } from "./helper";
import {
  PoolDataProvider,
  PoolDataProvider__getUserReserveDataResult,
} from "../../../generated/Pool/PoolDataProvider";
import { PoolAddressProvider } from "../../../generated/Pool/PoolAddressProvider";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { Position } from "../../../generated/schema";

export class AaveInvestUserData {
  helper: AaveV3Helper;
  underlyingAmount: BigInt;
  stableDebt: BigInt;
  variavbleDebt: BigInt;

  constructor(owner: Address, underlying: Address, amount: BigInt) {
    const pool = dataSource.address();
    this.helper = new AaveV3Helper(pool, underlying);
    const posId = this.helper.getInvestPositionId(owner, "");
    const position = Position.load(posId);

    if (!position) {
      this.underlyingAmount = amount;
      this.stableDebt = BigInt.zero();
      this.variavbleDebt = BigInt.zero();
    } else {
      const userData = getUserReserveData(underlying, owner);
      this.underlyingAmount = userData.getCurrentATokenBalance();
      this.stableDebt = userData.getCurrentStableDebt();
      this.variavbleDebt = userData.getCurrentVariableDebt();
    }
  }
}

export class AaveBorrowUserData {
  helper: AaveV3Helper;
  underlyingAmount: BigInt;
  stableDebt: BigInt;
  variavbleDebt: BigInt;
  constructor(owner: Address, underlying: Address) {
    const pool = dataSource.address();
    this.helper = new AaveV3Helper(pool, underlying);

    const userData = getUserReserveData(underlying, owner);
    this.underlyingAmount = userData.getCurrentATokenBalance();
    this.stableDebt = userData.getCurrentStableDebt();
    this.variavbleDebt = userData.getCurrentVariableDebt();
  }
}

function getUserReserveData(
  underlying: Address,
  owner: Address
): PoolDataProvider__getUserReserveDataResult {
  let poolDataProvider = PoolDataProvider.bind(
    getContextAddress("dataProvider")
  );
  const userData_try = poolDataProvider.try_getUserReserveData(
    underlying,
    owner
  );
  let userData: PoolDataProvider__getUserReserveDataResult;
  if (userData_try.reverted) {
    const addrProvider = PoolAddressProvider.bind(
      getContextAddress("poolAddressProvider")
    );
    poolDataProvider = PoolDataProvider.bind(
      addrProvider.getPoolDataProvider()
    );
    userData = poolDataProvider.getUserReserveData(underlying, owner);
  } else {
    userData = userData_try.value;
  }

  return userData;
}