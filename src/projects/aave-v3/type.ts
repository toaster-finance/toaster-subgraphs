import { Address, BigInt, dataSource } from "@graphprotocol/graph-ts";
import { AaveV3Helper } from "./helper";
import { PoolDataProvider } from "../../../generated/Pool/PoolDataProvider";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { Position } from "../../../generated/schema";

export class InvestUserData {
  helper: AaveV3Helper;
  underlyingAmount: BigInt;
  stableDebt: BigInt;
  variavbleDebt: BigInt;
  constructor(owner: Address, underlying: Address, amount: BigInt) {
    const pool = dataSource.address();
    const poolDataProvider = PoolDataProvider.bind(
      getContextAddress("dataProvider")
    );
    this.helper = new AaveV3Helper(pool, underlying.toHexString());
    const posId = this.helper.getPositionId(owner, "");
    const position = Position.load(posId);

    if (!position) {
      this.underlyingAmount = amount;
      this.stableDebt = BigInt.zero();
      this.variavbleDebt = BigInt.zero();
    } else {
      const userData = poolDataProvider.getUserReserveData(underlying, owner);
      this.underlyingAmount = userData.getCurrentATokenBalance();
      this.stableDebt = userData.getCurrentStableDebt();
      this.variavbleDebt = userData.getCurrentVariableDebt();
    }
  }
}

export class BorrowUserData {
  helper: AaveV3Helper;
  underlyingAmount: BigInt;
  stableDebt: BigInt;
  variavbleDebt: BigInt;
  constructor(owner: Address, underlying: Address) {
    const pool = dataSource.address();
    const poolDataProvider = PoolDataProvider.bind(
      getContextAddress("dataProvider")
    );
    this.helper = new AaveV3Helper(pool, underlying.toHexString());

    const userData = poolDataProvider.getUserReserveData(underlying, owner);
    this.underlyingAmount = userData.getCurrentATokenBalance();
    this.stableDebt = userData.getCurrentStableDebt();
    this.variavbleDebt = userData.getCurrentVariableDebt();
  }
}
