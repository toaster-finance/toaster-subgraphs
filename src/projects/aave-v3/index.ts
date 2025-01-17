import {
  UiPoolDataProvider,
  UiPoolDataProvider__getReservesDataResultValue0Struct,
} from "./../../../generated/Pool/UiPoolDataProvider";
import {
  Address,
  BigInt,
  Bytes,
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
import { AaveBorrowUserData, AaveInvestUserData } from "./utils";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { Protocol } from "../../../generated/schema";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { AaveV3Helper } from "./helper";
import { matchAddress } from "../../common/matchAddress";
import { calcBatchIdFromAddr } from "../../common/calcGraphId";
import { logFindFirst } from "../../common/filterEventLogs";
import { PoolAddressProvider } from "../../../generated/Pool/PoolAddressProvider";

//PositionType.Invest: it means deposit (deposit amount is positive, withdraw amount is negative)
//PositionType.Borrow: it means borrow (borrow amount is positive, repay amount is negative)

// Create aToken template by handling supply event
// handle supply event will be handled by aToken contract transfer event
export function handleSupply(event: Supply): void {
  const amount = event.params.amount;
  const underlying = event.params.reserve;
  const owner = event.params.onBehalfOf;
  if (!matchAddress(owner)) return;
  const data = new AaveInvestUserData(owner, underlying, amount);
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
}

export function handleWithdraw(event: Withdraw): void {
  const amount = event.params.amount;
  const underlying = event.params.reserve;
  const owner = event.params.user;
  if (!matchAddress(owner)) return;
  const data = new AaveInvestUserData(owner, underlying, amount);
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

const MINT_TOPIC =
  "0x458f5fa412d0f69b08dd84872b0215675cc67bc1d5b6fd93300a1c3878b86196";
const BURN_TOPIC =
  "0x4cf25bc1d991c17529c25213d3cc0cda295eeaad5f13f361969b12ea48015f90";
export function handleTransfer(event: Transfer): void {
  if (event.params.value.equals(BigInt.zero())) return;

  const underlying = getContextAddress("underlying");

  let sender: Address;
  let receiver: Address;
  if (event.params.from.equals(Address.zero())) {
    const receipt = event.receipt;
    if (receipt == null) return;

    // in case of depositETH
    const mintLog = logFindFirst(receipt.logs, event, (log, event) => {
      if (log.logIndex <= event.logIndex) return false;
      if (log.address.notEqual(event.address)) return false;
      return log.topics[0].equals(Bytes.fromHexString(MINT_TOPIC));
    });
    if (mintLog == null) return; // burn
    const data = new AaveInvestUserData(
      event.params.to,
      underlying,
      BigInt.zero()
    );

    savePositionChange(
      event,
      PositionChangeAction.Deposit,
      data.helper,
      new PositionParams(
        event.params.to,
        "",
        PositionType.Invest,
        [data.underlyingAmount],
        [],
        BigInt.zero(),
        [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
      ),
      [event.params.value], // + : deposit, - :withdraw
      []
    );
  }

  if (event.params.to.equals(Address.zero())) return; // Withdraw

  // withdrawETH
  const WETHGateway = getContextAddress("WETHGateway");
  if (event.params.to.equals(WETHGateway)) {
    const receipt = event.receipt;
    if (receipt == null) return;
    const burnLog = logFindFirst(receipt.logs, event, (log, event) => {
      if (log.logIndex <= event.logIndex) return false;
      if (log.address.notEqual(event.address)) return false;
      return log.topics[0].equals(Bytes.fromHexString(BURN_TOPIC));
    });
    if (burnLog == null) return; // just transfer to WETHGateway
    const data = new AaveInvestUserData(
      event.params.from,
      underlying,
      BigInt.zero()
    );
    savePositionChange(
      event,
      PositionChangeAction.Withdraw,
      data.helper,
      new PositionParams(
        event.params.from,
        "",
        PositionType.Invest,
        [data.underlyingAmount],
        [],
        BigInt.zero(),
        [data.stableDebt.toString(), data.variavbleDebt.toString()] // stable debt / variable debt
      ),
      [event.params.value.neg()], // + : deposit, - :withdraw
      []
    );
  }

  sender = event.params.from; // aToken amount decrease
  receiver = event.params.to; // aToken amount increase
  const sendingAmount = event.params.value;
  if (matchAddress(sender)) {
    const senderData = new AaveInvestUserData(
      sender,
      underlying,
      BigInt.zero()
    );
    savePositionChange(
      event,
      PositionChangeAction.Send,
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
    const receiverData = new AaveInvestUserData(
      receiver,
      underlying,
      BigInt.zero()
    );
    savePositionChange(
      event,
      PositionChangeAction.Receive,
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
  const data = new AaveBorrowUserData(owner, underlying);
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
  const data = new AaveBorrowUserData(owner, underlying);
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
  const debtData = new AaveBorrowUserData(owner, debtAsset);
  const collateralData = new AaveInvestUserData(
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
  const batch = dataSource.context().getI32("snapshotBatch"); // 256
  const pool = dataSource.address();

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
      const batchId = calcBatchIdFromAddr(positions[j].owner, batch);
      if (batchId == targetBatchId)
        userSet.add(Address.fromBytes(positions[j].owner));
    }
  }
  users = userSet.values();
  userSet = new Set();

  const addrProvider = getContextAddress("poolAddressProvider");
  let uiDataProvider = UiPoolDataProvider.bind(
    getContextAddress("uiDataProvider")
  );
  const reserveData_try = uiDataProvider.try_getReservesData(addrProvider);
  let reserveData: UiPoolDataProvider__getReservesDataResultValue0Struct[];
  if (reserveData_try.reverted) {
    uiDataProvider = UiPoolDataProvider.bind(
      getContextAddress("uiDataProvider_old")
    );
    reserveData = uiDataProvider.getReservesData(addrProvider).value0
  } else {
    reserveData = reserveData_try.value.getValue0();
  }

  for (let u = 0; u < users.length; u += 1) {
    const user = users[u];
    const userReserve_try = uiDataProvider.try_getUserReservesData(
      addrProvider,
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
          new AaveV3Helper(pool, userReserve.underlyingAsset),
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
        const balance = userReserve.scaledATokenBalance
          .times(reserveData[d].liquidityIndex)
          .div(BigInt.fromI32(10).pow(27));
        savePositionSnapshot(
          block,
          new AaveV3Helper(pool, userReserve.underlyingAsset),
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
