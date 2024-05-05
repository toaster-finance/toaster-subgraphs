import { Address, BigInt, dataSource } from "@graphprotocol/graph-ts";
import { AaveV3Helper } from "./helper";
import { PoolDataProvider } from "../../../generated/Pool/PoolDataProvider";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { Position } from "../../../generated/schema";

export class ReserveUserData {
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
    const posId = this.helper.getPositionId(owner, "");
    const position = Position.load(posId);

    if (!position) {
      this.underlyingAmount = BigInt.fromI32(0);
      this.stableDebt = BigInt.fromI32(0);
      this.variavbleDebt = BigInt.fromI32(0);
    } else {
      const userData = poolDataProvider.getUserReserveData(underlying, owner);
      this.underlyingAmount = userData.getCurrentATokenBalance();
      this.stableDebt = userData.getCurrentStableDebt();
      this.variavbleDebt = userData.getCurrentVariableDebt();
    }
  }
}
