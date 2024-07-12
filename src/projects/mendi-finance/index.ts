import { Investment, Position, Protocol } from "./../../../generated/schema";
import {
  Address,
  BigInt,
  DataSourceContext,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import { MarketEntered } from "./../../../generated/Comptroller/Comptroller";
import { CompoundV2Helper } from "./helper";

import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { getPosType, PositionType } from "../../common/PositionType.enum";
import {
  Borrow,
  LiquidateBorrow,
  Mint,
  Redeem,
  RepayBorrow,
  Transfer,
} from "../../../generated/templates/cToken/cToken";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { cToken as cTokenTemplate } from "../../../generated/templates";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { matchAddress } from "../../common/matchAddress";
import { calcBatchIdFromAddr } from "../../common/calcGraphId";

export function handleMarketEntered(event: MarketEntered): void {
  const comptroller = dataSource.address();
  const cTokenAddr = event.params.cToken;
  const mendiAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(cTokenAddr, comptroller, mendiAddr);
  const investment = Investment.load(helper.id);
  if (investment) return;
  helper.getOrCreateInvestment(event.block);

  const cTokenContext = new DataSourceContext();
  cTokenContext.setString("Comptroller", comptroller.toHexString());
  cTokenContext.setString("COMP", mendiAddr.toHexString());

  const ctx = dataSource.context();
  cTokenContext.setI32("graphId", ctx.getI32("graphId"));
  cTokenContext.setI32("totalGraphs", ctx.getI32("totalGraphs"));
  cTokenContext.setI32("snapshotBatch", ctx.getI32("snapshotBatch"));
  cTokenTemplate.createWithContext(cTokenAddr, cTokenContext);
}

export function handleMint(event: Mint): void {
  const owner = event.params.minter;
  if (!matchAddress(owner)) return;

  const dInputAmount = event.params.mintTokens;
  const comptrollerAddr = getContextAddress("Comptroller");
  const mendiAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(
    event.address,
    comptrollerAddr,
    mendiAddr
  );
  const posId = helper.getInvestPositionId(owner, "");
  const position = Position.load(posId);
  // get current underlying amount
  let inputAmount: BigInt;
  if (position) {
    inputAmount = helper.getUnderlyingAmount(owner);
  } else {
    inputAmount = BigInt.zero();
  }
  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [inputAmount],
      [],
      BigInt.zero(),
      []
    ),
    [dInputAmount],
    []
  );
}
// handleMint

// handleRedeem
export function handleRedeem(event: Redeem): void {
  const owner = event.params.redeemer;
  if (!matchAddress(owner)) return;

  const dInputAmount = event.params.redeemTokens;
  const comptrollerAddr = getContextAddress("Comptroller");
  const mendiAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(
    event.address,
    comptrollerAddr,
    mendiAddr
  );
  // get current underlying amount
  const inputAmount = helper.getUnderlyingAmount(owner);

  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [inputAmount],
      [],
      BigInt.zero(),
      []
    ),
    [dInputAmount.neg()],
    []
  );
}
// handleBorrow
export function handleBorrow(event: Borrow): void {
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;

  const dBorrowAmount = event.params.borrowAmount; // underlying amount
  const borrowAmount = event.params.accountBorrows;
  const comptrollerAddr = getContextAddress("Comptroller");
  const mendiAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(
    event.address,
    comptrollerAddr,
    mendiAddr
  );
  savePositionChange(
    event,
    PositionChangeAction.Borrow,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [borrowAmount],
      [],
      BigInt.zero(),
      []
    ),
    [dBorrowAmount.neg()],
    []
  );
}
// handleRepayBorrow
export function handleRepayBorrow(event: RepayBorrow): void {
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;

  const dRepayAmount = event.params.repayAmount; // underlying amount
  const borrowAmount = event.params.accountBorrows;
  const comptrollerAddr = getContextAddress("Comptroller");
  const mendiAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(
    event.address,
    comptrollerAddr,
    mendiAddr
  );
  savePositionChange(
    event,
    PositionChangeAction.Repay,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [borrowAmount],
      [],
      BigInt.zero(),
      []
    ),
    [dRepayAmount],
    []
  );
}
// handleLiquidateBorrow
export function handleLiquidateBorrow(event: LiquidateBorrow): void {
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;

  const dRepayAmount = event.params.repayAmount; // underlying amount
  const collateralAddr = event.params.cTokenCollateral;
  const collateralSeizeAmount = event.params.seizeTokens;
  const comptrollerAddr = getContextAddress("Comptroller");
  const mendiAddr = getContextAddress("COMP");
  const colletaralHelper = new CompoundV2Helper(
    collateralAddr,
    comptrollerAddr,
    mendiAddr
  );
  const borrowHelper = new CompoundV2Helper(
    event.address,
    comptrollerAddr,
    mendiAddr
  );
  const currCollateralAmount = colletaralHelper.getUnderlyingAmount(owner);
  const currBorrowAmount = borrowHelper.getBorrowedAmount(owner);
  savePositionChange(
    event,
    PositionChangeAction.Liquidate,
    colletaralHelper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [currCollateralAmount],
      [],
      BigInt.zero(),
      []
    ),
    [collateralSeizeAmount.neg()],
    []
  );
  savePositionChange(
    event,
    PositionChangeAction.Liquidate,
    borrowHelper,
    new PositionParams(
      owner,
      "",
      PositionType.Borrow,
      [currBorrowAmount],
      [],
      BigInt.zero(),
      []
    ),
    [dRepayAmount],
    []
  );
}

export function handleBlock(block: ethereum.Block): void {
  const protocol = Protocol.load(getProtocolId(CompoundV2Helper.protocolName));
  if (!protocol) return;

  const address = dataSource.address();
  const comptroller = getContextAddress("Comptroller");
  const mendiAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(address, comptroller, mendiAddr);
  const inv = helper.getOrCreateInvestment(block);

  const positions = inv.positions.load();
  const currentBatchId = i32(parseInt(inv.meta[0]));
  const batch = dataSource.context().getI32("snapshotBatch");

  for (let i = 0; i < positions.length; i += 1) {
    const owner = Address.fromBytes(positions[i].owner);
    const addrBatchId = calcBatchIdFromAddr(owner, batch);
    if (addrBatchId != currentBatchId) continue;

    const pos = positions[i];
    if (pos.closed) continue;

    if (pos.type == getPosType(PositionType.Invest)) {
      const underlyingAmount = helper.getUnderlyingAmount(owner);
      savePositionSnapshot(
        block,
        helper,
        new PositionParams(
          owner,
          "",
          PositionType.Invest,
          [underlyingAmount],
          [],
          BigInt.zero(),
          []
        )
      );
    } else {
      const borrowedAmount = helper.getBorrowedAmount(owner);
      savePositionSnapshot(
        block,
        helper,
        new PositionParams(
          owner,
          "",
          PositionType.Borrow,
          [borrowedAmount],
          [],
          BigInt.zero(),
          []
        )
      );
    }
  }

  inv.meta = [((currentBatchId + 1) % batch).toString()];
  inv.save();
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
  const helper = new CompoundV2Helper(
    event.address,
    getContextAddress("Comptroller"),
    getContextAddress("COMP")
  );
  const senderUnderlyingAmount = helper.getUnderlyingAmount(sender);
  const receiverUnderlyingAmount = helper.getUnderlyingAmount(receiver);
  const sendingAmount = event.params.value;
  savePositionChange(
    event,
    action,
    helper,
    new PositionParams(
      sender,
      "",
      PositionType.Invest,
      [senderUnderlyingAmount],
      [],
      BigInt.zero(),
      []
    ),
    [sendingAmount.neg()], // + : deposit, - :withdraw
    [BigInt.zero()]
  );

  savePositionChange(
    event,
    action,
    helper,
    new PositionParams(
      receiver,
      "",
      PositionType.Invest,
      [receiverUnderlyingAmount],
      [],
      BigInt.zero(),
      []
    ),
    [sendingAmount],
    [BigInt.zero()]
  );
}
