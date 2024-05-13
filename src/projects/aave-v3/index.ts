import { UniPoolDataProvider } from "./../../../generated/Pool/UniPoolDataProvider";
import {
  Address,
  BigInt,
  DataSourceContext,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import { savePositionChange } from "../../common/savePositionChange";
import {
  Borrow,
  LiquidationCall,
  Repay,
  Supply,
  Withdraw,
} from "./../../../generated/Pool/Pool";
import { Transfer } from "../../../generated/templates/aToken/aToken";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { BorrowUserData, InvestUserData } from "./type";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { Protocol } from "../../../generated/schema";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { AaveV3Helper } from "./helper";
import { aToken } from "../../../generated/templates";

//PositionType.Invest: it means deposit (deposit amount is positive, withdraw amount is negative)
//PositionType.Borrow: it means borrow (borrow amount is positive, repay amount is negative)

// Create aToken template by handling supply event
// handle supply event will be handled by aToken contract transfer event
export const AAVE_V3 = "aave-v3";
export function handleSupply(event: Supply): void {
  const amount = event.params.amount;
  const underlying = event.params.reserve;
  const owner = event.params.onBehalfOf;
  const data = new InvestUserData(owner, underlying, amount);
  if (data.underlyingAmount.equals(BigInt.zero())) return;
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
      BigInt.zero(),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount], // + : deposit, - :withdraw
    [BigInt.zero()]
  );
  const aTokenAddress = data.helper.getAtokenAddress(underlying);
  const aTokenContext = new DataSourceContext();
  aTokenContext.setString("underlying", underlying.toHexString());
  aTokenContext.setString(
    "dataProvider",
    getContextAddress("dataProvider").toHexString()
  );
  aToken.createWithContext(aTokenAddress, aTokenContext);
}

export function handleWithdraw(event: Withdraw): void {
  const amount = event.params.amount;
  const underlying = event.params.reserve;
  const owner = event.params.user;
  const data = new InvestUserData(owner, underlying, amount);
  if (data.underlyingAmount.equals(BigInt.zero())) return;
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
      BigInt.zero(),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount.neg()], // + : deposit, - :withdraw
    [BigInt.zero()]
  );
}

export function handleTransfer(event: Transfer): void {
  if (event.params.value.equals(BigInt.zero())) return;
  let action: PositionChangeAction;
  let sender: Address;
  let receiver: Address;
  if (event.params.from.equals(Address.zero())) return; // Supply
  if (event.params.to.equals(Address.zero())) return; // Withdraw
  action = PositionChangeAction.Send;
  sender = event.params.from; // aToken amount decrease
  receiver = event.params.to; // aToken amount increase
  const underlying = getContextAddress("underlying");
  const sendingAmount = event.params.value;
  const senderData = new InvestUserData(sender, underlying, BigInt.zero());
  const receiverData = new InvestUserData(receiver, underlying, BigInt.zero());
  savePositionChange(
    event,
    action,
    senderData.helper,
    new PositionParams(
      sender,
      "",
      PositionType.Invest,
      [senderData.underlyingAmount],
      [],
      BigInt.zero(),
      [senderData.stableDebt.toString(), senderData.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [sendingAmount.neg()], // + : deposit, - :withdraw
    [BigInt.zero()]
  );

  savePositionChange(
    event,
    action,
    receiverData.helper,
    new PositionParams(
      receiver,
      "",
      PositionType.Invest,
      [receiverData.underlyingAmount],
      [],
      BigInt.zero(),
      [
        receiverData.stableDebt.toString(),
        receiverData.variavbleDebt.toString(),
      ] // stable debt / variable debt
    ),
    [sendingAmount],
    [BigInt.zero()]
  );
}
export function handleBorrow(event: Borrow): void {
  const underlying = event.params.reserve;
  const owner = event.params.onBehalfOf;
  const data = new BorrowUserData(owner, underlying);
  if (data.underlyingAmount.equals(BigInt.zero())) return;
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
      BigInt.zero(),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount.neg()], // + : repay, - : borrow
    [BigInt.zero()]
  );
}
export function handleRepay(event: Repay): void {
  const underlying = event.params.reserve;
  const owner = event.params.user;
  const data = new BorrowUserData(owner, underlying);
  if (data.underlyingAmount.equals(BigInt.zero())) return;
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
      BigInt.zero(),
      [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.amount], // + : repay, - : borrow
    [BigInt.zero()]
  );
}
// Actually, Liquidation Event makes positions to withdraw collateral and repay debt
export function handleLiquidation(event: LiquidationCall): void {
  const collateralAsset = event.params.collateralAsset;
  const debtAsset = event.params.debtAsset;
  const owner = event.params.user;
  const debtData = new BorrowUserData(owner, debtAsset);
  const collateralData = new InvestUserData(
    owner,
    collateralAsset,
    BigInt.zero()
  );

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
      BigInt.zero(),
      [debtData.stableDebt.toString(), debtData.variavbleDebt.toString()] // stable debt / variable debt
    ),
    [event.params.debtToCover], // + : repay, - : borrow
    [BigInt.zero()]
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
      BigInt.zero(),
      [
        collateralData.stableDebt.toString(),
        collateralData.variavbleDebt.toString(),
      ] // stable debt / variable debt
    ),
    [event.params.liquidatedCollateralAmount.neg()], // + : deposit, - : withdraw
    [BigInt.zero()]
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
  const users = new Set<Address>();
  // gather all users of all positions
  for (let i = protocolInit; i < investments.length; i += batch) {
    const investment = investments[i];
    const positions = investment.positions.load();
    for (let j = 0; j < positions.length; j += 1) {
      if (positions[j].closed) continue;
      users.add(Address.fromBytes(positions[j].owner));
    }
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
      if (totalDebt.notEqual(BigInt.zero()))
        savePositionSnapshot(
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
            BigInt.zero(),
            [
              reserveData.principalStableDebt.toString(),
              reserveData.scaledVariableDebt.toString(),
            ] // stable debt / variable debt
          )
        );
      // for collateral
      if (reserveData.scaledATokenBalance.notEqual(BigInt.zero()))
        savePositionSnapshot(
          block,
          new AaveV3Helper(pool, reserveData.underlyingAsset.toHexString()),
          new PositionParams(
            user,
            "",
            PositionType.Invest,
            [reserveData.scaledATokenBalance],
            [],
            BigInt.zero(),
            [
              reserveData.principalStableDebt.toString(),
              reserveData.scaledVariableDebt.toString(),
            ] // stable debt / variable debt
          )
        );
    }
  }
  protocol._batchIterator = BigInt.fromI32((protocolInit + 1) % batch);
  protocol.save();
}
