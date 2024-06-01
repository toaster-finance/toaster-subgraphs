import { Investment, Position, Protocol } from "./../../../generated/schema";
import {
  Address,
  BigInt,
  DataSourceContext,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  DistributedBorrowerComp,
  DistributedSupplierComp,
  MarketEntered,
} from "./../../../generated/Comptroller/Comptroller";
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
import { getContextAddress } from "../../common/helpers/contextHelper";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { cToken as cTokenTemplate } from "../../../generated/templates";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { skipAddress } from "../../common/skipAddress";

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
  cTokenTemplate.createWithContext(cTokenAddr, cTokenContext);
}
//Q? COMP Token 을 어떻게 표시하지?
export function handleDistributedBorrower(
  event: DistributedBorrowerComp
): void {
  const rewardAmount = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.borrower;
  const compAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(cTokenAddr, event.address, compAddr);
  if (skipAddress(owner)) return;
  savePositionChange(
    event,
    PositionChangeAction.Harvest, // receive reward COMP token
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [],
      [],
      BigInt.zero(),
      []
    ),
    [],
    [rewardAmount]
  );
}

export function handleDistributedSupplier(
  event: DistributedSupplierComp
): void {
  const rewardAmount = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.supplier;
  const compAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(cTokenAddr, event.address, compAddr);
  if (skipAddress(owner)) return;
  savePositionChange(
    event,
    PositionChangeAction.Harvest, // receive reward COMP token
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [],
      [],
      BigInt.zero(),
      []
    ),
    [],
    [rewardAmount]
  );
}

export function handleMint(event: Mint): void {
  const dInputAmount = event.params.mintTokens;
  const owner = event.params.minter;
  const comptrollerAddr = getContextAddress("Comptroller");
  const compAddr = getContextAddress("COMP");
  if (skipAddress(owner)) return;
  const helper = new CompoundV2Helper(event.address, comptrollerAddr, compAddr);
  const posId = helper.getPositionId(owner, "");
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
  const dInputAmount = event.params.redeemTokens;
  const owner = event.params.redeemer;
  if (skipAddress(owner)) return;
  const comptrollerAddr = getContextAddress("Comptroller");
  const compAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(event.address, comptrollerAddr, compAddr);
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
  const dBorrowAmount = event.params.borrowAmount; // underlying amount
  const borrowAmount = event.params.accountBorrows;
  const owner = event.params.borrower;
  if (skipAddress(owner)) return;
  const comptrollerAddr = getContextAddress("Comptroller");
  const compAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(event.address, comptrollerAddr, compAddr);
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
  const dRepayAmount = event.params.repayAmount; // underlying amount
  const owner = event.params.borrower;
  if (skipAddress(owner)) return;
  const borrowAmount = event.params.accountBorrows;
  const comptrollerAddr = getContextAddress("Comptroller");
  const compAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(event.address, comptrollerAddr, compAddr);
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
  const dRepayAmount = event.params.repayAmount; // underlying amount
  const owner = event.params.borrower;
  if (skipAddress(owner)) return;
  const collateralAddr = event.params.cTokenCollateral;
  const collateralSeizeAmount = event.params.seizeTokens;
  const comptrollerAddr = getContextAddress("Comptroller");
  const compAddr = getContextAddress("COMP");
  const colletaralHelper = new CompoundV2Helper(
    collateralAddr,
    comptrollerAddr,
    compAddr
  );
  const borrowHelper = new CompoundV2Helper(
    event.address,
    comptrollerAddr,
    compAddr
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
  const investments = protocol.investments.load();
  const protocolInit = protocol._batchIterator.toI32();
  const batch = dataSource.context().getI32("snapshotBatch");
  const startSnapshotBlock = dataSource.context().getI32("startSnapshotBlock");
  if (block.number < BigInt.fromI32(startSnapshotBlock)) return;
  const comptroller = dataSource.address();
  for (let i = protocolInit; i < investments.length; i += batch) {
    // gather all users of all positions
    const investment = investments[i]; // cTokens
    const positions = investment.positions.load();
    const users = new Set<Address>();
    for (let j = 0; j < positions.length; j += 1) {
      if (positions[j].closed) continue;
      users.add(Address.fromBytes(positions[j].owner));
    }
    const userAddr = users.values();
    const compAddr = getContextAddress("COMP");
    const helper = new CompoundV2Helper(
      Address.fromBytes(investment.address),
      comptroller,
      compAddr
    );
    for (let u = 0; u < userAddr.length; u += 1) {
      const owner = userAddr[u];
      const borrowedAmount = helper.getBorrowedAmount(owner);
      const underlyingAmount = helper.getUnderlyingAmount(owner);
      if (!underlyingAmount)
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
      if (!borrowedAmount)
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
  protocol._batchIterator = BigInt.fromI32((protocolInit + 1) % batch);
  protocol.save();
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
  const sendingAmount = event.params.value;
  if (!skipAddress(sender)) {
    const senderUnderlyingAmount = helper.getUnderlyingAmount(sender);

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
  }
  if (!skipAddress(receiver)) {
    const receiverUnderlyingAmount = helper.getUnderlyingAmount(receiver);
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
}
