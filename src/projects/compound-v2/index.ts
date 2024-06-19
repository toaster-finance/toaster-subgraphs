import { Position, Protocol } from "./../../../generated/schema";
import { Address, BigInt, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { CompoundV2Helper } from "./helper";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import {
  Borrow,
  LiquidateBorrow,
  Mint,
  Redeem,
  RepayBorrow,
  Transfer,
} from "../../../generated/templates/cToken/cToken";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { matchAddress } from "../../common/matchAddress";
import { logFindFirst } from "../../common/filterEventLogs";
import { calcBatchIdFromAddr } from "../../common/calcGraphId";
import { getContextAddress } from "../../common/helpers/contextHelper";
// handleMint start
export function handleMint(event: Mint): void {
  const owner = event.params.minter;
  if (!matchAddress(owner)) return;

  const dInputAmount = event.params.mintAmount;
  const dCToken = event.params.mintTokens;

  const helper = new CompoundV2Helper(event.address,getContextAddress("Comptroller"),getContextAddress("COMP"));
  const posId = helper.getInvestPositionId(owner, "");
  const position = Position.load(posId);

  // get current underlying amount after mint
  let inputAmount: BigInt;
  let liquidity: BigInt;
  if (position) {
    liquidity = position.liquidity.plus(dCToken);
    inputAmount = liquidity.times(dInputAmount).div(dCToken);
    savePositionChange(
      event,
      PositionChangeAction.Deposit,
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [inputAmount],
        [BigInt.zero()], // no change in reward amount
        liquidity, // cToken amount
        [position.meta[0]]
      ),
      [dInputAmount],
      [BigInt.zero()]
    );
  } else {
    liquidity = dCToken;
    inputAmount = dInputAmount;
    const supplierIdx = helper.getSupplierIndex(owner);
    savePositionChange(
      event,
      PositionChangeAction.Deposit,
      helper,
      new PositionParams(
        owner,
        "",
        PositionType.Invest,
        [inputAmount],//?
        [BigInt.zero()], // no change in reward amount
        liquidity, // cToken amount
        [supplierIdx.toString()]
      ),
      [dInputAmount],
      [BigInt.zero()]
    );
  }
  
}
// handleMint end

// handleRedeem start
export function handleRedeem(event: Redeem): void {
  const owner = event.params.redeemer;
  if (!matchAddress(owner)) return;

  const dInputAmount = event.params.redeemAmount;
  const dCToken = event.params.redeemTokens;

  const helper = new CompoundV2Helper(event.address,getContextAddress("Comptroller"),getContextAddress("COMP"));
  const posId = helper.getInvestPositionId(owner, "");
  const position = Position.load(posId);

  // get current underlying amount
  let inputAmount: BigInt;
  let liquidity: BigInt;
  if (!position) throw new Error("Invest position not found");

  liquidity = position.liquidity.minus(dCToken);
  inputAmount = liquidity.times(dInputAmount).div(dCToken);
  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [inputAmount],
      [BigInt.zero()],
      liquidity,
      [position.meta[0]]
    ),
    [dInputAmount.neg()],
    [BigInt.zero()]
  );
}
// handleRedeem end

// handleBorrow start
export function handleBorrow(event: Borrow): void {
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;

  const dBorrowAmount = event.params.borrowAmount; // underlying amount
  const borrowAmount = event.params.accountBorrows;
  const borrowHelper = new CompoundV2Helper(event.address,getContextAddress("Comptroller"),getContextAddress("COMP"));
  const position = Position.load(borrowHelper.getBorrowPositionId(owner, ""));
  if (position) {
    savePositionChange(
      event,
      PositionChangeAction.Borrow,
      borrowHelper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowAmount.neg()],
        [BigInt.zero()],
        BigInt.zero(),
        [position.meta[0]]
      ),
      [dBorrowAmount],
      [BigInt.zero()]
    );
  } else {
    const borrowerIdx = borrowHelper.getBorrowerIndex(owner);
    savePositionChange(
      event,
      PositionChangeAction.Borrow,
      borrowHelper,
      new PositionParams(
        owner,
        "",
        PositionType.Borrow,
        [borrowAmount.neg()],
        [BigInt.zero()],
        BigInt.zero(),
        [borrowerIdx.toString()]
      ),
      [dBorrowAmount],
      [BigInt.zero()]
    );
  }
}
// handleBorrow end

// handleRepayBorrow
export function handleRepayBorrow(event: RepayBorrow): void {
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;

  const dRepayAmount = event.params.repayAmount; // underlying amount
  const borrowAmount = event.params.accountBorrows;

  const borrowHelper = new CompoundV2Helper(event.address,getContextAddress("Comptroller"),getContextAddress("COMP"));
  const position = Position.load(borrowHelper.getBorrowPositionId(owner, ""));
  if (!position) throw new Error("Borrow position not found");
  savePositionChange(
    event,
    PositionChangeAction.Repay,
    borrowHelper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [borrowAmount.neg()],
      [BigInt.zero()],
      BigInt.zero(),
      [position.meta[0]]
    ),
    [dRepayAmount],
    [BigInt.zero()]
  );
}

// handleLiquidateBorrow
// In terms of the `seizeTokens`,
// it is handled at the `handleTransfer` function
export function handleLiquidateBorrow(event: LiquidateBorrow): void {
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;
  const dRepayAmount = event.params.repayAmount; // underlying amount

  const borrowHelper = new CompoundV2Helper(event.address,getContextAddress("Comptroller"),getContextAddress("COMP"));
  const currBorrowAmount = borrowHelper.getBorrowedAmount(owner);
  const position = Position.load(borrowHelper.getBorrowPositionId(owner, ""));
  if (!position) throw new Error("Borrow position not found");
  savePositionChange(
    event,
    PositionChangeAction.Liquidate,
    borrowHelper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [currBorrowAmount.neg()],
      [BigInt.zero()],
      BigInt.zero(),
      [position.meta[0]]
    ),
    [dRepayAmount],
    [BigInt.zero()]
  );
}

export function handleBlock(block: ethereum.Block):void {
  const protocol = Protocol.load(getProtocolId(CompoundV2Helper.protocolName));
  if (!protocol) return;
  const helper = new CompoundV2Helper(
    dataSource.address(),
    getContextAddress("Comptroller"),
    getContextAddress("COMP")
  );
  const investment = helper.getOrCreateInvestment(block);
  const positions = investment.positions.load();

  const batch = dataSource.context().getI32("snapshotBatch");
  const targetBatchId = protocol._batchIterator.toI32();
  const supplyIdx = helper.getSupplyIndex();
  const borrowIdx = helper.getBorrowIndex();
  const expScale = BigInt.fromI32(10).pow(18);
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (pos.closed) continue;
    const batchId = calcBatchIdFromAddr(pos.owner);
    if (batchId != targetBatchId) continue;

    const snapshot = helper.getAccountSnapshot(Address.fromBytes(pos.owner));
    const liquidity = snapshot.getValue1();
    if (liquidity.gt(BigInt.zero())) {
      const underlyingAmount = liquidity
        .times(snapshot.getValue3())
        .div(expScale);
      const supplierIdx = helper.getSupplierIndex(Address.fromBytes(pos.owner));
      const investReward = pos.amounts[1].plus(
        helper.getSupplyRewardDelta(pos.liquidity, supplyIdx, supplierIdx)
      );
      savePositionSnapshot(
        block,
        helper,
        new PositionParams(
          Address.fromBytes(pos.owner),
          "",
          PositionType.Invest,
          [underlyingAmount],
          [investReward],
          pos.liquidity,
          [supplierIdx.toString()]
        )
      );
    }

    const borrowAmount = snapshot.getValue2();
    if (borrowAmount.gt(BigInt.zero())) {
      const borrowerIdx = helper.getBorrowerIndex(Address.fromBytes(pos.owner));
      const borrowReward = pos.amounts[1].plus(
        helper.getBorrowRewardDelta(borrowAmount, borrowerIdx, borrowIdx)
      );
      savePositionSnapshot(
        block,
        helper,
        new PositionParams(
          Address.fromBytes(pos.owner),
          "",
          PositionType.Borrow,
          [borrowAmount.neg()],
          [borrowReward],
          BigInt.zero(),
          [borrowIdx.toString()]
        )
      );
    }
  }

  protocol._batchIterator = BigInt.fromI32((targetBatchId + 1) % batch);
  protocol.save();
}

/**
 * Also handle liquidateBorrow seizeTokens transfer event
 */
export function handleTransfer(event: Transfer): void {
  if (event.params.value.equals(BigInt.zero())) return;
  if (event.params.from.equals(event.address)) return; // Supply
  if (event.params.to.equals(event.address)) return; // Withdraw

  // ignore if both sender and receiver are not matched
  if (!matchAddress(event.params.from) && !matchAddress(event.params.to))
    return;

  const sender = event.params.from; // aToken amount decrease
  const receiver = event.params.to; // aToken amount increase
  const isLiq = isLiquidateBorrow(event);
  
  const sendingAmount = event.params.value;
  const helper = new CompoundV2Helper(event.address,getContextAddress("Comptroller"),getContextAddress("COMP"));
  const investPos = Position.load(helper.getInvestPositionId(sender, ""));
  if (!investPos) throw new Error("Invest position not found");
  if (matchAddress(sender)) {
    const senderUnderlyingAmount = helper.getUnderlyingAmount(sender);
    const senderCTokenAmount = helper.getCTokenAmount(sender);

    savePositionChange(
      event,
      isLiq ? PositionChangeAction.Liquidate : PositionChangeAction.Send,
      helper,
      new PositionParams(
        sender,
        "",
        PositionType.Invest,
        [senderUnderlyingAmount],
        [BigInt.zero()],
        senderCTokenAmount,
        [investPos.meta[0]]
      ),
      [sendingAmount.neg()], // + : deposit, - :withdraw
      [BigInt.zero()]
    );
  }

  if (matchAddress(receiver)) {
    const receiverUnderlyingAmount = helper.getUnderlyingAmount(receiver);
    const receiverCTokenAmount = helper.getCTokenAmount(receiver);
    savePositionChange(
      event,
      isLiq
        ? PositionChangeAction.LiquidateReward
        : PositionChangeAction.Receive,
      helper,
      new PositionParams(
        receiver,
        "",
        PositionType.Invest,
        [receiverUnderlyingAmount],
        [BigInt.zero()],
        receiverCTokenAmount,
        [investPos.meta[0]]
      ),
      [sendingAmount],
      [BigInt.zero()]
    );
  }
}

const LIQUIDATE_BORROW_TOPIC =
  "0x298637f684da70674f26509b10f07ec2fbc77a335ab1e7d6215a4b2484d8bb52";
// (address liquidator, address borrower, uint256 repayAmount, address cTokenCollateral, uint256 seizeTokens)
const LIQUIDATE_BORROW_ABI = "(address,address,uint256,address,uint256)";

function isLiquidateBorrow(event: Transfer): boolean {
  const receipt = event.receipt;
  if (!receipt) return false;
  // find liquidateBorrow event log
  const liqLog = logFindFirst(receipt.logs, event, (log, event) => {
    if (log.topics[0].notEqual(Bytes.fromHexString(LIQUIDATE_BORROW_TOPIC)))
      return false;

    const decoded = ethereum.decode(LIQUIDATE_BORROW_ABI, log.data);
    if (decoded == null) return false;
    const liquidator = decoded.toTuple()[0].toAddress();
    const borrower = decoded.toTuple()[1].toAddress();

    return (
      (event as Transfer).params.from.equals(borrower) &&
      (event as Transfer).params.to.equals(liquidator)
    );
  });

  return liqLog != null;
}
