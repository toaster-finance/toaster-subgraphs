import { UniPoolDataProvider } from "./../../../generated/Pool/UniPoolDataProvider";
import { Address, BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { savePositionChange } from "../../common/savePositionChange";
import {
  Borrow,
  LiquidationCall,
  Repay,
  Supply,
  Withdraw,
} from "./../../../generated/Pool/Pool";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { ReserveUserData } from "./type";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { Protocol } from "../../../generated/schema";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { AaveV3Helper } from "./helper";

//PositionType.Invest: it means deposit (deposit amount is positive, withdraw amount is negative)
//PositionType.Borrow: it means borrow (borrow amount is positive, repay amount is negative)

export const AAVE_V3 = "aave-v3";
export function handleSupply(event: Supply):void {
  const underlying = event.params.reserve;
  const owner = event.params.onBehalfOf;
  const data = new ReserveUserData(owner, underlying);
  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    data.helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [data.underlyingAmount],
      [],
      BigInt.fromI32(0),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount], // + : deposit, - :withdraw
    [BigInt.fromI32(0)]
  );
}
export function handleWithdraw(event: Withdraw):void {
  const underlying = event.params.reserve;
  const owner = event.params.user;
  const data = new ReserveUserData(owner, underlying);
  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    data.helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [data.underlyingAmount],
      [],
      BigInt.fromI32(0),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount.neg()], // + : deposit, - :withdraw
    [BigInt.fromI32(0)]
  );
}
export function handleBorrow(event: Borrow):void {
  const underlying = event.params.reserve;
  const owner = event.params.onBehalfOf;
  const data = new ReserveUserData(owner, underlying);
  savePositionChange(
    event,
    PositionChangeAction.Borrow,
    data.helper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [data.stableDebt.plus(data.variavbleDebt).neg()],
      [],
      BigInt.fromI32(0),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount.neg()], // + : repay, - : borrow
    [BigInt.fromI32(0)]
  );
}
export function handleRepay(event: Repay):void {
  const underlying = event.params.reserve;
  const owner = event.params.user;
  const data = new ReserveUserData(owner, underlying);
  savePositionChange(
    event,
    PositionChangeAction.Repay,
    data.helper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [data.stableDebt.plus(data.variavbleDebt).neg()],
      [],
      BigInt.fromI32(0),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount], // + : repay, - : borrow
    [BigInt.fromI32(0)]
  );
}
// Actually, Liquidation is withdraw collateral and repay debt
export function handleLiquidation(event: LiquidationCall):void {
  const collateral = event.params.collateralAsset;
  const debt = event.params.debtAsset;
  const owner = event.params.user;
  const debtData = new ReserveUserData(owner, debt);
  const collateralData = new ReserveUserData(owner, collateral);
  // for debt
  savePositionChange(
    event,
    PositionChangeAction.Liquidate,
    debtData.helper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [debtData.stableDebt.plus(debtData.variavbleDebt).neg()],
      [],
      BigInt.fromI32(0),
      [debtData.stableDebt.toString(), debtData.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.debtToCover], // + : repay, - : borrow
    [BigInt.fromI32(0)]
  );
  // for collateral
  savePositionChange(
    event,
    PositionChangeAction.Liquidate,
    collateralData.helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [collateralData.stableDebt.plus(collateralData.variavbleDebt).neg()],
      [],
      BigInt.fromI32(0),
      [
        collateralData.stableDebt.toString(),
        collateralData.variavbleDebt.toString(),
      ] // stable debt / variable debt
    ),
    [event.params.liquidatedCollateralAmount.neg()], // + : deposit, - : withdraw
    [BigInt.fromI32(0)]
  );
}

export function handleBlock(block: ethereum.Block): void {
  const protocol = Protocol.load(getProtocolId(AAVE_V3));
  if (!protocol) return;
  const investments = protocol.investments.load();
  const protocolInit = protocol._batchIterator.toI32();
  const batch = dataSource.context().getI32("snapshotBatch");
  const startSnapshotBlock = dataSource.context().getI32("startSnapshotBlock");
  if (block.number < BigInt.fromI32(startSnapshotBlock)) return;
  const pool = dataSource.address();
  const uniDataProvider = UniPoolDataProvider.bind(
    getContextAddress("uniDataProvider")
  );
  const dataProviderAddr = getContextAddress("dataProvider");

  for (let i = protocolInit; i < investments.length; i += batch) {
    // gather all users of all positions
    const investment = investments[i];
    const positions = investment.positions.load();
    const users = new Set<Address>();
    for (let j = 0; j < positions.length; j += 1) {
      if(positions[j].closed) continue;
      users.add(Address.fromBytes(positions[j].owner));
    }
    const userAddr = users.values();
    for (let u = 0; u < userAddr.length; u += 1) {
      const user = userAddr[u];
      const reserveDatas = uniDataProvider
        .getUserReservesData(dataProviderAddr, user)
        .getValue0();
      for (let d = 0; d < reserveDatas.length; d += 1) {
        const reserveData = reserveDatas[d];

        const totalDebt = reserveData.principalStableDebt.plus(
          reserveData.scaledVariableDebt
        );
        // for debt
        if(totalDebt.notEqual(BigInt.fromI32(0))) savePositionSnapshot(
          block,
          new AaveV3Helper(pool, reserveData.underlyingAsset.toHexString()),
          new PositionParams(
            user,
            "",
            PositionType.Invest,
            [
              reserveData.principalStableDebt
                .plus(reserveData.scaledVariableDebt)
                .neg(),
            ],
            [],
            BigInt.fromI32(0),
            [
              reserveData.principalStableDebt.toString(),
              reserveData.scaledVariableDebt.toString(),
            ] // stable debt / variable debt
          )
        );
        // for collateral
        if (reserveData.scaledATokenBalance.notEqual(BigInt.fromI32(0)))
          savePositionSnapshot(
            block,
            new AaveV3Helper(pool, reserveData.underlyingAsset.toHexString()),
            new PositionParams(
              user,
              "",
              PositionType.Invest,
              [reserveData.scaledATokenBalance],
              [],
              BigInt.fromI32(0),
              [
                reserveData.principalStableDebt.toString(),
                reserveData.scaledVariableDebt.toString(),
              ] // stable debt / variable debt
            )
          );
      }
    }
  }
  protocol._batchIterator = BigInt.fromI32((protocolInit + 1) % batch);
  protocol.save();
}
