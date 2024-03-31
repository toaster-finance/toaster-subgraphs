import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  ETHDistributed,
  Transfer,
  stETH,
} from "../../../generated/LidoStETH/stETH";
import { WithdrawalClaimed } from "../../../generated/WithdrawalNFT/WithdrawalNFT";
import { Completed } from "../../../generated/LegacyOracle/LegacyOracle";
import { getLog } from "../uniswap-v3/utils/getPositionInfo";
import { LidoHelper, RewardInfo } from "./helper";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { hash2Address } from "../../common/helpers/hashHelper";

export function handleTransfer(event: Transfer): void {
  const helper = new LidoHelper();
  if (event.params.from.equals(helper.WITHDRAWAL_NFT)) return;

  if (event.params.from.equals(Address.zero())) {
    _mint(event, helper);
  } else if (event.params.to.equals(helper.WITHDRAWAL_NFT)) {
    _requestWithdrawal(event, helper);
  } else {
    _transfer(event, helper);
  }
}

function _mint(event: Transfer, helper: LidoHelper): void {
  const submitLog = getLog(
    event,
    // Submitted
    "0x96a25c8ce0baabc1fdefd93e9ed25d8e092a3332f3aa9a41722b5697231d1d1a",
    "(uint256,address)",
    (log, event) => hash2Address(log.topics[1]).equals(event.params.to)
  );

  const action = submitLog
    ? PositionChangeAction.Deposit
    : PositionChangeAction.Receive;

  const amountETHIn = submitLog
    ? submitLog.data[0].toBigInt()
    : event.params.value;
  const stETHamount = event.params.value;

  const owner = event.params.to;
  const prevState = helper.findPrevState(owner);

  savePositionChange(
    event,
    action,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [prevState.bal.plus(amountETHIn)],
      [],
      prevState.bal.plus(stETHamount),
      [prevState.inRequest.toString()]
    ),
    [amountETHIn],
    []
  );

  const i = helper.getOrCreateInvestment(event.block);
  const totals = helper.getTotalEthAndShares(i);
  
  helper.setTotalEthAndShares(
    i,
    totals.eth.plus(amountETHIn),
    totals.shares.plus(
      totals.eth.gt(BigInt.zero())
        ? stETHamount.times(totals.shares).div(totals.eth)
        : stETHamount
    )
  );
}

// V2 features
// No need to track totalShares after LIDO V2
function _requestWithdrawal(event: Transfer, helper: LidoHelper): void {
  const withdrawRequestLog = getLog(
    event,
    // WithdrawalRequested
    "0xf0cb471f23fb74ea44b8252eb1881a2dca546288d9f6e90d1a0e82fe0ed342ab",
    // "(uint256 amountOfStETH, uint256 amountOfShares)",
    "(uint256, uint256)",
    (log, event) => true
  );

  if (!withdrawRequestLog)
    throw new Error("handleTransfer:!withdrawRequestLog");
  const amountOfStETH = withdrawRequestLog.data[0].toBigInt();
  const amountOfShares = withdrawRequestLog.data[1].toBigInt();
  const owner = event.params.from;

  const position = helper.findPosition(owner, "");
  if (!position) throw new Error("_requestWithdrawal:!position");

  // no position snapshot
  // just request unstake
  position.meta[0] = BigInt.fromString(position.meta[0])
    .plus(amountOfStETH)
    .toString();
  position.save();

  // update shares and pooledETH
  const i = helper.getOrCreateInvestment(event.block);
  const totals = helper.getTotalEthAndShares(i);
  helper.setTotalEthAndShares(
    i,
    totals.eth,
    totals.shares.minus(amountOfShares)
  );
}

function _transfer(event: Transfer, helper: LidoHelper): void {
  const senderPrev = helper.findPrevState(event.params.from);
  const receiverPrev = helper.findPrevState(event.params.to);
  const stETHAmount = event.params.value;

  savePositionChange(
    event,
    PositionChangeAction.Receive,
    helper,
    helper.positionParams(
      event.params.to,
      receiverPrev.bal.plus(stETHAmount),
      receiverPrev.inRequest
    ),
    [stETHAmount],
    []
  );

  savePositionChange(
    event,
    PositionChangeAction.Send,
    helper,
    helper.positionParams(
      event.params.from,
      senderPrev.bal.minus(stETHAmount),
      senderPrev.inRequest
    ),
    [stETHAmount.neg()],
    []
  );
}

export function handleETHDistributed(event: ETHDistributed): void {
  const tokenRebasedLog = getLog(
    event,
    // TokenRebased
    "0xff08c3ef606d198e316ef5b822193c489965899eb4e3c248cea1a4626c3eda50",
    // uint256 timeElapsed, uint256 preTotalShares, uint256 preTotalEther,
    // uint256 postTotalShares, uint256 postTotalEther, uint256 sharesMintedAsFees
    "(uint256,uint256,uint256,uint256,uint256,uint256)",
    (log, event) => true
  );
  if (!tokenRebasedLog)
    throw new Error("handleETHDistributed:!tokenRebasedLog");

  const sb = tokenRebasedLog.data[1].toBigInt(); // totalSharesBefore
  const eb = tokenRebasedLog.data[2].toBigInt(); // totalPooledEtherBefore
  const sa = tokenRebasedLog.data[3].toBigInt(); // totalSharesAfter
  const ea = tokenRebasedLog.data[4].toBigInt(); // totalPooledEtherAfter

  _updateRewards(event, new RewardInfo(eb, ea, sb, sa));
}

export function handleWithdrawalClaimed(event: WithdrawalClaimed): void {
  const helper = new LidoHelper();
  const prevState = helper.findPrevState(event.params.owner);
  if (!prevState) throw new Error("handleWithdrawalClaimed:!prevState");

  const burned = event.params.amountOfETH;
  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    helper,
    helper.positionParams(
      event.params.owner,
      prevState.bal.minus(burned),
      prevState.inRequest.minus(burned)
    ),
    [burned.neg()],
    []
  );
}

export function handleCompleted(event: Completed): void {
  const helper = new LidoHelper();
  const i = helper.getOrCreateInvestment(event.block);

  const postSharesLog = getLog(
    event,
    // PostTotalShares
    "0xdafd48d1eba2a416b2aca45e9ead3ad18b84e868fa6d2e1a3048bfd37ed10a32",
    // postTotalPooledEther,preTotalPooledEther,timeElapsed,totalShares
    "(uint256,uint256,uint256,uint256)",
    () => true
  );

  let rewardInfo: RewardInfo;
  const totals = helper.getTotalEthAndShares(i);
  const sb = totals.shares; // totalSharesBefore
  if (postSharesLog) {
    const eb = postSharesLog.data[1].toBigInt(); // totalPooledEtherBefore
    const sa = postSharesLog.data[3].toBigInt(); // totalSharesAfter
    const ea = postSharesLog.data[0].toBigInt(); // totalPooledEtherAfter
    rewardInfo = new RewardInfo(eb, ea, sb, sa);
  } else {
    const eb = totals.eth; // totalSharesBefore
    const lido = stETH.bind(helper.investmentAddress);
    const ea = lido.getTotalPooledEther();
    const sa = lido.getTotalShares();
    rewardInfo = new RewardInfo(eb, ea, sb, sa);
  }

  _updateRewards(event, rewardInfo);
}

export function _updateRewards(event: ethereum.Event, r: RewardInfo): void {
  const helper = new LidoHelper();
  const i = helper.getOrCreateInvestment(event.block);

  helper.setTotalEthAndShares(i, r.ea, r.sa);
  if (r.eb.equals(BigInt.zero())) return;

  const positions = i.positions.load();

  const posLen = positions.length;
  for (let i = 0; i < posLen; i++) {
    const pos = positions[i];
    if (pos.closed) continue;

    const stEthBalance = pos.liquidity.minus(
      helper.amountInWithdrawRequest(pos)
    );
    if (stEthBalance.lt(BigInt.fromI32(100))) continue;

    const reward = helper.calcReward(stEthBalance, r);
    if (reward.equals(BigInt.zero())) continue;

    savePositionChange(
      event,
      PositionChangeAction.Compound,
      helper,
      new PositionParams(
        Address.fromBytes(pos.owner),
        pos.tag,
        PositionType.Invest,
        [pos.amounts[0].plus(reward)],
        [],
        stEthBalance,
        pos.meta
      ),
      [reward],
      []
    );
  }
}
