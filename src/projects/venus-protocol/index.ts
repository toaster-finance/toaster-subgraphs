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
import { VenusHelper } from "./helper";

import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { vToken as vTokenTemplate } from "../../../generated/templates";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import {
  Borrow,
  Mint,
  Redeem,
  LiquidateBorrow,
  RepayBorrow,
} from "../../../generated/templates/vToken/VToken";


export function handleMarketEntered(event: MarketEntered): void {
  const comptroller = dataSource.address();
  const vTokenAddr = event.params.cToken;
  const xvsAddr = getContextAddress("XVS");
  const helper = new VenusHelper(vTokenAddr,comptroller,xvsAddr);
  const investment = Investment.load(helper.id);
  if (investment) return;
  helper.getOrCreateInvestment(event.block);
  const cTokenContext = new DataSourceContext();
  cTokenContext.setString("Comptroller", comptroller.toHexString());
  cTokenContext.setString("XVS", xvsAddr.toHexString());
  vTokenTemplate.createWithContext(vTokenAddr, cTokenContext);
}

export function handleDistributedBorrower(event: DistributedBorrowerComp): void {
  const rewardAmount = event.params.compDelta;
  const vTokenAddr = event.params.cToken;
  const owner = event.params.borrower;
  const xvsAddr = getContextAddress("XVS");
  const helper = new VenusHelper(vTokenAddr, event.address,xvsAddr);
  savePositionChange(
    event,
    PositionChangeAction.Harvest, // receive reward XVS token
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

export function handleDistributedSupplier(event: DistributedSupplierComp): void {
  const rewardAmount = event.params.compDelta;
  const vTokenAddr = event.params.cToken;
  const owner = event.params.supplier;
  const xvsAddr = getContextAddress("XVS");
  const helper = new VenusHelper(vTokenAddr,event.address,xvsAddr);
  savePositionChange(
    event,
    PositionChangeAction.Harvest, // receive reward XVS token
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
  const xvsAddr = getContextAddress("XVS");
  const helper = new VenusHelper(event.address, comptrollerAddr,xvsAddr);
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
  const comptrollerAddr = getContextAddress("Comptroller");
  const xvsAddr = getContextAddress("XVS");
  const helper = new VenusHelper(event.address, comptrollerAddr,xvsAddr);
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
  const comptrollerAddr = getContextAddress("Comptroller");
  const xvsAddr = getContextAddress("XVS");
  const helper = new VenusHelper(event.address,comptrollerAddr,xvsAddr);
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
  const borrowAmount = event.params.accountBorrows;
  const comptrollerAddr = getContextAddress("Comptroller");
  const xvsAddr = getContextAddress("XVS");
  const helper = new VenusHelper(event.address,comptrollerAddr,xvsAddr);
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
  const collateralAddr = event.params.cTokenCollateral;
  const collateralSeizeAmount = event.params.seizeTokens;
  const comptrollerAddr = getContextAddress("Comptroller");
  const xvsAddr = getContextAddress("XVS");
  const colletaralHelper = new VenusHelper(
    collateralAddr,
    comptrollerAddr,
    xvsAddr
  );
  const borrowHelper = new VenusHelper(event.address,comptrollerAddr,xvsAddr);
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
export function handleBlock(block: ethereum.Block):void {
  const protocol = Protocol.load(getProtocolId(VenusHelper.protocolName));
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
    const xvsAddr = getContextAddress("XVS");
    const helper = new VenusHelper(Address.fromBytes(investment.address),comptroller,xvsAddr);
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
