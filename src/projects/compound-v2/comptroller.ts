import { Investment, Position } from "./../../../generated/schema";
import { BigInt, DataSourceContext, dataSource } from "@graphprotocol/graph-ts";
import {
  DistributedBorrowerComp,
  DistributedSupplierComp,
  MarketEntered,
} from "./../../../generated/Comptroller/Comptroller";
import { CompoundV2Helper } from "./helper";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { matchAddress } from "../../common/matchAddress";
import { cToken as cTokenTemplate } from "../../../generated/templates";
import { LogData } from "../../common/filterEventLogs";
import { getLog } from "../../common/getLog";
const DISTRIBUTE_BORROWER_COMP_TOPIC =
  "0x1fc3ecc087d8d2d15e23d0032af5a47059c3892d003d8e139fdcb6bb327c99a6";
const DISTRIBUTE_SUPPLIER_COMP_TOPIC =
  "0x2caecd17d02f56fa897705dcc740da2d237c373f70686f4e0d9bd3bf0400ea7a";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function handleMarketEntered(event: MarketEntered): void {
  const comptroller = dataSource.address();
  const cTokenAddr = event.params.cToken;
  const compAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(cTokenAddr);
  const investment = Investment.load(helper.id);
  if (investment) return;
  helper.getOrCreateInvestment(event.block);
  const cTokenContext = new DataSourceContext();
  cTokenContext.setString("Comptroller", comptroller.toHexString());
  cTokenContext.setString("COMP", compAddr.toHexString());
  cTokenContext.setI32(
    "totalGraphs",
    dataSource.context().getI32("totalGraphs")
  );
  cTokenContext.setI32(
    "snapshotBatch",
    dataSource.context().getI32("snapshotBatch")
  );
  cTokenContext.setI32(
    "startSnapshotBlock",
    dataSource.context().getI32("startSnapshotBlock")
  );
  cTokenContext.setI32("graphId", dataSource.context().getI32("graphId"));
  cTokenTemplate.createWithContext(cTokenAddr, cTokenContext);
}

// distributeBorrowerComp와 distributeSupplierComp 이벤트가 동시에 발생하는 경우, 중복되지 않도록 Transfer를 한번만 처리함.
export function handleDistributedBorrower(
  event: DistributedBorrowerComp
): void {
  const rewardAmount = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;
  const helper = new CompoundV2Helper(cTokenAddr);
  const borrowAmt = helper.getBorrowedAmount(owner);
  const currReward = helper.getBorrowRewardAmount(owner, borrowAmt);

  if (!rewardAmount.equals(BigInt.zero())) {
    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowAmt],
        [currReward],
        BigInt.zero(),
        []
      ),
      [BigInt.zero()],
      [rewardAmount]
    );
  }
  const transferLog = getLog(
    event,
    TRANSFER_TOPIC,
    "(address,address,uint256)",
    function (log: LogData, event: DistributedBorrowerComp): boolean {
      return log.data[2].toBigInt().notEqual(BigInt.zero());
    }
  );

  if (transferLog) {
    const claimedReward = BigInt.fromByteArray(transferLog.topics[2]);
    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowAmt],
        [currReward],
        BigInt.zero(),
        []
      ),
      [BigInt.zero()],
      [claimedReward]
    );
  }
}

export function handleDistributedSupplier(
  event: DistributedSupplierComp
): void {
  const deltaReward = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.supplier;
  if (!matchAddress(owner)) return;

  const helper = new CompoundV2Helper(cTokenAddr);
  const mintAmt = helper.getCTokenAmount(owner);
  const currReward = helper.getSupplyRewardAmount(owner, mintAmt);
  const underlyingAmt = helper.getUnderlyingAmount(owner);

  const posId = helper.getInvestPositionId(owner, "");
  const position = Position.load(posId);
  if (!deltaReward.equals(BigInt.zero())) {
    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [underlyingAmt],
        [currReward],
        position?.liquidity ?? BigInt.zero(),
        []
      ),
      [BigInt.zero()],
      [deltaReward]
    );
  }
  //같은 트랜잭션에서 DistributedBorrowerComp 이벤트가 없는 경우에만 Harvest를 처리.
  const transferLog = getLog(
    event,
    TRANSFER_TOPIC,
    "(address,address,uint256)",
    function (log: LogData, event: DistributedSupplierComp): boolean {
      return (
        BigInt.fromByteArray(log.topics[2]).notEqual(BigInt.zero()) &&
        log.topics[0].toHexString() != DISTRIBUTE_BORROWER_COMP_TOPIC
      );
    }
  );

  if (transferLog) {
    const claimedReward = BigInt.fromByteArray(transferLog.topics[2]);
    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [underlyingAmt],
        [currReward],
        position?.liquidity ?? BigInt.zero(),
        []
      ),
      [BigInt.zero()],
      [claimedReward.neg()]
    );
  }
}
