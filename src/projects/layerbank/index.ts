import {
  MarketListed,
  MarketRedeem,
  MarketSupply,
} from "./../../../generated/Core/Core";
import { Investment, Position, Protocol } from "./../../../generated/schema";
import {
  Address,
  BigInt,
  DataSourceContext,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";

import { getContextAddress } from "../../common/helpers/contextHelper";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { LayerBankV2Helper } from "./helper";
import { lToken as lTokenTemplate } from "../../../generated/templates";
import { Borrow, LiquidateBorrow, RepayBorrow, Transfer } from "../../../generated/Core/lToken";

export function handleMarketListed(event: MarketListed): void {
  const core = dataSource.address();
  const lTokenAddr = event.params.lToken;
  const helper = new LayerBankV2Helper(lTokenAddr, core);
  const investment = Investment.load(helper.id);
  if (investment) return;
  helper.getOrCreateInvestment(event.block);
  const lTokenContext = new DataSourceContext();
  lTokenContext.setString("Core", core.toHexString());
  lTokenTemplate.createWithContext(lTokenAddr, lTokenContext);
}
export function handleMarketRedeem(event: MarketRedeem):void {
  const dInputAmount = event.params.uAmount;
  const owner = event.params.user;
  const coreAddr = dataSource.address();
  const helper = new LayerBankV2Helper(event.address, coreAddr);
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
export function handleMarketSupply(event: MarketSupply):void{
  const dInputAmount = event.params.uAmount;
  const owner = event.params.user;
  const coreAddr = dataSource.address();
  const helper = new LayerBankV2Helper(event.address, coreAddr);
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
// handleBorrow
export function handleBorrow(event: Borrow): void {
  const dBorrowAmount = event.params.borrowAmount; // underlying amount
  const borrowAmount = event.params.accountBorrows;
  const owner = event.params.borrower;
  const coreAddr = getContextAddress("Core");
  const helper = new LayerBankV2Helper(event.address,coreAddr);
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
  const coreAddr = getContextAddress("Core");
  const helper = new LayerBankV2Helper(event.address, coreAddr);
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
  const collateralAddr = event.params.lTokenCollateral;
  const collateralSeizeAmount = event.params.seizeTokens;
  const coreAddr = getContextAddress("Core");
  const colletaralHelper = new LayerBankV2Helper(
    collateralAddr,
    coreAddr,
  );
  const borrowHelper = new LayerBankV2Helper(
    event.address,
    coreAddr,
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
  const helper = new LayerBankV2Helper(
    event.address,
    getContextAddress("Core"),
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

export function handleBlock(block: ethereum.Block): void {
  const protocol = Protocol.load(getProtocolId(LayerBankV2Helper.protocolName));
  if (!protocol) return;
  const investments = protocol.investments.load();
  const protocolInit = protocol._batchIterator.toI32();
  const batch = dataSource.context().getI32("snapshotBatch");
  const startSnapshotBlock = dataSource.context().getI32("startSnapshotBlock");
  if (block.number < BigInt.fromI32(startSnapshotBlock)) return;
  const core = dataSource.address();
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
    const helper = new LayerBankV2Helper(
      Address.fromBytes(investment.address),
      core,
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
