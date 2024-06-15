import { UiPoolDataProvider } from "./../../../generated/Pool/UiPoolDataProvider";
import {
  Address,
  BigInt,
  DataSourceContext,
  dataSource,
  ethereum,
  log,
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
import { matchAddress } from "../../common/matchAddress";
import { calcGraphId, calcBatchIdFromAddress } from "../../common/calcGraphId";

//PositionType.Invest: it means deposit (deposit amount is positive, withdraw amount is negative)
//PositionType.Borrow: it means borrow (borrow amount is positive, repay amount is negative)

// Create aToken template by handling supply event
// handle supply event will be handled by aToken contract transfer event
export function handleSupply(event: Supply): void {
  const amount = event.params.amount;
  const underlying = event.params.reserve;
  const owner = event.params.onBehalfOf;
  if (!matchAddress(owner)) return;
  const data = new InvestUserData(owner, underlying, amount);
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
    []
  );
  createATokenTemplate(underlying, event.address);
}

export function handleWithdraw(event: Withdraw): void {
  const amount = event.params.amount;
  const underlying = event.params.reserve;
  const owner = event.params.user;
  if (!matchAddress(owner)) return;
  const data = new InvestUserData(owner, underlying, amount);
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
    []
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
  if (matchAddress(sender)) {
    const senderData = new InvestUserData(sender, underlying, BigInt.zero());
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
      []
    );
  }
  if (matchAddress(receiver)) {
    const receiverData = new InvestUserData(
      receiver,
      underlying,
      BigInt.zero()
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
}
export function handleBorrow(event: Borrow): void {
  const underlying = event.params.reserve;
  const owner = event.params.onBehalfOf;
  if (!matchAddress(owner)) return;
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
    []
  );
}
export function handleRepay(event: Repay): void {
  const underlying = event.params.reserve;
  const owner = event.params.user;
  if (!matchAddress(owner)) return;
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
    []
  );
}
// Actually, Liquidation Event makes positions to withdraw collateral and repay debt
export function handleLiquidation(event: LiquidationCall): void {
  const collateralAsset = event.params.collateralAsset;
  const debtAsset = event.params.debtAsset;
  const owner = event.params.user;
  if (!matchAddress(owner)) return;
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
    []
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
    []
  );
}

export function handleBlock(block: ethereum.Block): void {
  const protocol = Protocol.load(getProtocolId(AaveV3Helper.protocolName));
  if (!protocol) return;

  const startSnapshotBlock = dataSource.context().getI32("startSnapshotBlock");
  if (block.number < BigInt.fromI32(startSnapshotBlock)) return;

  const investments = protocol.investments.load();
  const targetBatchId = protocol._batchIterator.toI32();
  const batch = dataSource.context().getI32("snapshotBatch");
  const pool = dataSource.address();
  const uiDataProvider = UiPoolDataProvider.bind(
    getContextAddress("uiDataProvider")
  );
  const poolAddressProvider = getContextAddress("poolAddressProvider");

  let users: Address[];

  // userSet is used to prevent duplicate users
  // After being converted to an array, userSet is no longer needed
  // So we unallocated memory by setting it to null
  let userSet = new Set<Address>();
  // gather all users of all positions of all investments
  for (let i = 0; i < investments.length; i += 1) {
    const investment = investments[i];
    const positions = investment.positions.load();
    for (let j = 0; j < positions.length; j += 1) {
      if (positions[j].closed) continue;
      const batchId = calcBatchIdFromAddress(positions[j].owner);
      if (batchId === targetBatchId)
        userSet.add(Address.fromBytes(positions[j].owner));
    }
  }
  users = userSet.values();
  userSet = new Set()

  const reserveData_try =
    uiDataProvider.try_getReservesData(poolAddressProvider);
  if (reserveData_try.reverted) return;
  const reserveData = reserveData_try.value.getValue0();

  for (let u = 0; u < users.length; u += 1) {
    const user = users[u];
    const userReserve_try = uiDataProvider.try_getUserReservesData(
      poolAddressProvider,
      user
    );
    if (userReserve_try.reverted) continue;
    const userReserves = userReserve_try.value.getValue0();
    for (let d = 0; d < userReserves.length; d += 1) {
      const userReserve = userReserves[d];

      const variableDebt = userReserve.scaledVariableDebt
        .times(reserveData[d].variableBorrowIndex)
        .div(BigInt.fromI32(10).pow(27));
      const totalDebt = userReserve.principalStableDebt.plus(variableDebt);

      // for debt
      if (totalDebt.gt(BigInt.zero()))
        savePositionSnapshot(
          block,
          new AaveV3Helper(pool, userReserve.underlyingAsset.toHexString()),
          new PositionParams(
            user,
            "",
            PositionType.Borrow,
            [totalDebt.neg()],
            [],
            BigInt.zero(),
            [
              userReserve.principalStableDebt.toString(),
              variableDebt.toString(),
            ] // stable debt / variable debt
          )
        );
      // for collateral
      if (userReserve.scaledATokenBalance.notEqual(BigInt.zero())) {
        const liquidity = userReserve.scaledATokenBalance;
        const balance = userReserve.scaledATokenBalance
          .times(reserveData[d].liquidityIndex)
          .div(BigInt.fromI32(10).pow(27));
        savePositionSnapshot(
          block,
          new AaveV3Helper(pool, userReserve.underlyingAsset.toHexString()),
          new PositionParams(
            user,
            "",
            PositionType.Invest,
            [balance],
            [],
            userReserve.scaledATokenBalance,
            [] // stable debt / variable debt
          )
        );
      }
    }
  }
  protocol._batchIterator = BigInt.fromI32((targetBatchId + 1) % batch);
  protocol.save();
}

// create atoken template
function createATokenTemplate(
  underlying: Address,
  aTokenAddress: Address
): void {
  const aTokenContext = new DataSourceContext();
  aTokenContext.setString(
    "protocolName",
    dataSource.context().getString("protocolName")
  );
  aTokenContext.setString("underlying", underlying.toHexString());
  aTokenContext.setString(
    "dataProvider",
    getContextAddress("dataProvider").toHexString()
  );
  aTokenContext.setI32("graphId", dataSource.context().getI32("graphId"));
  aTokenContext.setI32(
    "totalGraphs",
    dataSource.context().getI32("totalGraphs")
  );
  aToken.createWithContext(aTokenAddress, aTokenContext);
}
