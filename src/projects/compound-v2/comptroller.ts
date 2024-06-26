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
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
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
  const helper = new CompoundV2Helper(cTokenAddr, comptroller, compAddr);
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

// distributeBorrowerComp할때 borrower index를 업데이트
export function handleDistributedBorrower(
  event: DistributedBorrowerComp
): void {
  const rewardAmount = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;
  const helper = new CompoundV2Helper(
    cTokenAddr,
    getContextAddress("Comptroller"),
    getContextAddress("COMP")
  );
  const investPos = Position.load(helper.getInvestPositionId(owner, ""));
  if (!investPos) throw new Error("Invest position not found");
  const investPosAmt = investPos.amounts[0];
  const investPosReward = investPos.amounts[1];
  const investPosLiquidity = investPos.liquidity;
  const borrowPos = Position.load(helper.getBorrowPositionId(owner, ""));
  if (!borrowPos) throw new Error("Borrow position not found");
  const borrowPosAmt = borrowPos.amounts[0];
  const borrowPosReward = borrowPos.amounts[1];

  const supplyIdx = helper.getSupplyIndex();
  const borrowIdx = helper.getBorrowIndex();
  const supplierIdx = BigInt.fromString(investPos.meta[0]);
  const borrowerIdx = helper.getBorrowerIndex(owner);

  const borrowDelta = helper.getBorrowRewardDelta(
    borrowPosAmt,
    borrowIdx,
    borrowerIdx
  );
  const supplyDelta = helper.getSupplyRewardDelta(
    investPosAmt,
    supplyIdx,
    supplierIdx
  );
  const newBorrowReward = borrowPosReward.plus(borrowDelta);
  const newSupplyReward = investPosReward.plus(supplyDelta);
  if (!rewardAmount.equals(BigInt.zero())) {
    // make snapshot & update borrower index
    savePositionSnapshot(
      event.block,
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [investPosAmt],
        [newSupplyReward],
        investPosLiquidity,
        [supplierIdx.toString()] // supplierIdx
      )
    );
    savePositionSnapshot(
      event.block,
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowPosAmt],
        [newBorrowReward],
        BigInt.zero(),
        [borrowIdx.toString()] // borrowerIdx
      )
    );
  }

  const claimLog = getLog(
    event,
    TRANSFER_TOPIC,
    "(address,address,uint256)",
    function (log: LogData, event: DistributedBorrowerComp): boolean {
      return (
        log.data[2].toBigInt().notEqual(BigInt.zero()) &&
        log.data[0].toAddress() == event.address
      );
    }
  );

  if (claimLog) {
    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [investPosAmt],
        [BigInt.zero()],
        investPosLiquidity,
        [supplierIdx.toString()] //supplierIdx
      ),
      [BigInt.zero()],
      [investPosReward.neg()]
    );

    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowPosAmt],
        [BigInt.zero()],
        BigInt.zero(),
        [borrowIdx.toString()] // borrowerIdx
      ),
      [BigInt.zero()],
      [borrowPosReward.neg()]
    );
  }
}
// distributeSupplierComp할때 supplier index를 업데이트
export function handleDistributedSupplier(
  event: DistributedSupplierComp
): void {
  const deltaReward = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.supplier;
  if (!matchAddress(owner)) return;
  const helper = new CompoundV2Helper(
    cTokenAddr,
    getContextAddress("Comptroller"),
    getContextAddress("COMP")
  );

  const investPos = Position.load(helper.getInvestPositionId(owner, ""));
  if (!investPos) throw new Error("Invest position not found");
  const investPosAmt = investPos.amounts[0];
  const investPosReward = investPos.amounts[1];
  const investPosLiquidity = investPos.liquidity;
  const borrowPos = Position.load(helper.getBorrowPositionId(owner, ""));
  if (!borrowPos) throw new Error("Borrow position not found");
  const borrowPosAmt = borrowPos.amounts[0];
  const borrowPosReward = borrowPos.amounts[1];

  const supplyIdx = helper.getSupplyIndex();
  const borrowIdx = helper.getBorrowIndex();
  const supplierIdx = helper.getSupplierIndex(owner);
  const borrowerIdx = BigInt.fromString(borrowPos.meta[0]);

  const borrowDelta = helper.getBorrowRewardDelta(
    borrowPosAmt,
    borrowIdx,
    borrowerIdx
  );
  const supplyDelta = helper.getSupplyRewardDelta(
    investPosAmt,
    supplyIdx,
    supplierIdx
  );
  const newBorrowReward = borrowPosReward.plus(borrowDelta);
  const newSupplyReward = investPosReward.plus(supplyDelta);

  if (!deltaReward.equals(BigInt.zero())) {
    // make snapshot & update supplier index
    savePositionSnapshot(
      event.block,
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [investPosAmt],
        [newSupplyReward],
        investPosLiquidity,
        [supplierIdx.toString()] //supplierIdx
      )
    );
    savePositionSnapshot(
      event.block,
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowPosAmt],
        [newBorrowReward],
        BigInt.zero(),
        [borrowIdx.toString()] // borrowerIdx
      )
    );
  }
  //같은 트랜잭션에서 DistributedBorrowerComp 이벤트가 없는 경우에만 Harvest action을 처리.
  const distrBorrowerLog = getLog(
    event,
    DISTRIBUTE_BORROWER_COMP_TOPIC,
    "(address,address,uint256,uint256)",
    function (log: LogData, event: DistributedSupplierComp): boolean {
      return log.data[2].toBigInt().notEqual(BigInt.zero());
    }
  );
  const claimLog = getLog(
    event,
    TRANSFER_TOPIC,
    "(address,address,uint256)",
    function (log: LogData, event: DistributedSupplierComp): boolean {
      return (
        BigInt.fromByteArray(log.topics[2]).notEqual(BigInt.zero()) &&
        log.data[0].toAddress() == event.address // from comptroller
      );
    }
  );

  if (!distrBorrowerLog && claimLog) {
    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [investPosAmt],
        [BigInt.zero()],
        investPosLiquidity,
        [supplierIdx.toString()] //supplierIdx
      ),
      [BigInt.zero()],
      [investPosReward.neg()]
    );

    savePositionChange(
      event,
      PositionChangeAction.Harvest, // receive reward COMP token
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowPosAmt],
        [BigInt.zero()],
        BigInt.zero(),
        [borrowIdx.toString()] //borrowerIdx
      ),
      [BigInt.zero()],
      [borrowPosReward.neg()]
    );
  }
}
