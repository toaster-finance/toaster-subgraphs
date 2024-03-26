import {
  Address,
  BigInt,
  Bytes,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  getInvestmentId,
  getProtocolId,
} from "../../common/helpers/investmentHelper";
import { Investment, Position, Protocol } from "../../../generated/schema";
import { UniswapV3Pool } from "../../../generated/UniswapV3/UniswapV3Pool";
import {
  Harvest,
  PancakeSwapV3MasterChef,
} from "../../../generated/PancakeSwapV3/PancakeSwapV3MasterChef";
import {
  Collect,
  IncreaseLiquidity,
  Transfer,
  UniswapV3PositionManager,
  UniswapV3PositionManager__positionsResult,
} from "../../../generated/UniswapV3/UniswapV3PositionManager";
import {
  PositionInfo,
  getLog,
  getPositionInfo,
} from "../uniswap-v3/utils/getPositionInfo";
import { LogData, filterAndDecodeLogs } from "../../common/filterEventLogs";
import { hex2Uint } from "../../common/helpers/bigintHelper";
import { hash2Address } from "../../common/helpers/hashHelper";
import { feesOf, principalOf } from "../uniswap-v3/utils/positionAmount";
import { PositionType } from "../../common/PositionType.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { UniswapV3Factory } from "../../../generated/UniswapV3/UniswapV3Factory";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { PANCAKESWAP_V3_PROTOCOL, PancakeSwapV3Helper } from "./helper";
import { getContextAddress } from "../../common/helpers/contextHelper";

function masterChef(): PancakeSwapV3MasterChef {
  return PancakeSwapV3MasterChef.bind(
    Address.fromBytes(
      Bytes.fromHexString(dataSource.context().getString("masterChef"))
    )
  );
}

function isStaked(position: Position): boolean {
  return position.meta[2] == "1";
}

const MINT_TOPIC =
  "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Same as UniswapV3
export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {
  const tag = event.params.tokenId.toString();
  const mintLog = getLog(
    event,
    MINT_TOPIC,
    "(address,uint128,uint256,uint256)",
    function (log: LogData, event: IncreaseLiquidity): boolean {
      return log.data[1].toBigInt().equals(event.params.liquidity);
    }
  );
  if (!mintLog) throw new Error("Mint log not found");

  const nftTransferLog = getLog(
    event,
    TRANSFER_TOPIC,
    "()",
    function (log: LogData, event: IncreaseLiquidity): boolean {
      if (log.topics.length < 3) return false;
      return (
        log.address.equals(dataSource.address()) &&
        hash2Address(log.topics[1]).equals(Address.zero()) &&
        hex2Uint(log.topics[3].toHexString()).equals(event.params.tokenId)
      );
    }
  );

  const info = getPositionInfo(mintLog);
  const helper = new PancakeSwapV3Helper(info.pool);

  let liquidity: BigInt;
  let principals: BigInt[];
  let rewards: BigInt[];
  let owner: Address;
  let staked: boolean;

  // Created a new position
  if (nftTransferLog) {
    liquidity = event.params.liquidity;
    principals = [event.params.amount0, event.params.amount1];
    rewards = [BigInt.zero(), BigInt.zero(), BigInt.zero()];
    owner = hash2Address(nftTransferLog.topics[2]);
    staked = false;

    // Update totalSupply of the protocol
    const protocol = helper.getProtocol(event.block);
    if (!protocol) throw new Error("Protocol not found");
    protocol.meta = [event.params.tokenId.toString()];
    protocol.save();
  }
  // Added liquidity to an existing position
  else {
    const dbPosition = helper.findNftPosition(event.params.tokenId);
    const pm = UniswapV3PositionManager.bind(dataSource.address());

    if (dbPosition) {
      owner = Address.fromBytes(dbPosition.owner);
      staked = isStaked(dbPosition);
    } else {
      owner = pm.ownerOf(event.params.tokenId);
      const mc = masterChef();
      if (owner.equals(mc._address)) {
        owner = mc.userPositionInfos(event.params.tokenId).getUser();
        staked = true;
      } else {
        staked = false;
      }
    }

    const poolContract = UniswapV3Pool.bind(info.pool);
    const position = pm.positions(event.params.tokenId);

    const slot0 = poolContract.slot0();

    liquidity = position.getLiquidity();
    principals = principalOf(
      info.tl,
      info.tu,
      liquidity,
      slot0.getSqrtPriceX96()
    );

    rewards = feesOf(position, poolContract, slot0.getTick());

    const pendingCake = masterChef().pendingCake(event.params.tokenId);
    rewards.push(pendingCake);
  }

  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    helper,
    new PositionParams(
      owner, // owner
      tag, // tag
      PositionType.Invest, // type
      principals,
      rewards,
      liquidity,
      [info.tl.toString(), info.tu.toString(), staked ? "1" : "0"] // meta: [tickLower, tickUpper, staked]
    ),
    [event.params.amount0, event.params.amount1], // inputAmounts
    [BigInt.zero(), BigInt.zero(), BigInt.zero()] // rewardAmounts
  );
}

export function handleHarvest(event: Harvest): void {
  const dbPosition = PancakeSwapV3Helper.findNft(event.params.tokenId);
  // if (!dbPosition) throw new Error("handleHarvest: Position not found");
  if (!dbPosition) return;
  const i = Investment.load(dbPosition.investment);
  // if (!i) throw new Error("handleHarvest: Investment not found");
  if (!i) return;

  const pool = Address.fromBytes(i.address);
  const helper = new PancakeSwapV3Helper(pool);
  const reward = event.params.reward;
  savePositionChange(
    event,
    PositionChangeAction.Harvest,
    helper,
    new PositionParams(
      Address.fromBytes(dbPosition.owner),
      dbPosition.tag,
      PositionType.Invest,
      [dbPosition.amounts[0], dbPosition.amounts[1]],
      [dbPosition.amounts[2], dbPosition.amounts[3], BigInt.zero()],
      dbPosition.liquidity,
      [
        dbPosition.meta[0],
        dbPosition.meta[1],
        "1", // true
      ] // meta: [tickLower, tickUpper, staked]
    ),
    [BigInt.zero(), BigInt.zero()], // inputAmounts
    [BigInt.zero(), BigInt.zero(), reward.neg()] // inputAmounts
  );
}

// Collect event from Pool, not from NFTPositionManager
const COLLECT_TOPIC =
  "0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0";
const BURN_TOPIC =
  "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c";
const DECREASE_LIQUIDITY_TOPIC =
  "0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4";

export function handleCollect(event: Collect): void {
  const tag = event.params.tokenId.toString();
  const decreaseLiquidityLog = getLog(
    event,
    DECREASE_LIQUIDITY_TOPIC,
    "(uint128,uint256,uint256)",
    function (log: LogData, event: Collect): boolean {
      return (
        log.index.equals(event.logIndex.minus(BigInt.fromI32(1))) &&
        hex2Uint(log.topics[1].toHexString()).equals(event.params.tokenId)
      );
    }
  );

  let helper: PancakeSwapV3Helper;
  let owner: Address;
  let liquidity: BigInt;
  let info: PositionInfo;
  let action: PositionChangeAction;
  let pendingCake: BigInt = BigInt.zero();
  let dInputs: BigInt[];
  let dRewards: BigInt[];
  let staked: boolean;

  // Only collect fee
  if (!decreaseLiquidityLog) {
    action = PositionChangeAction.Harvest;
    const collectLog = getLog(
      event,
      COLLECT_TOPIC,
      "(address,uint128,uint128)",
      function (log: LogData, event: Collect): boolean {
        return event.params.recipient.equals(log.data[0].toAddress());
      }
    );

    if (!collectLog) throw new Error("Collect log not found");

    info = getPositionInfo(collectLog);
    helper = new PancakeSwapV3Helper(info.pool);
    const dbPosition = helper.findNftPosition(event.params.tokenId);

    if (dbPosition) {
      liquidity = dbPosition.liquidity;
      owner = Address.fromBytes(dbPosition.owner);
      staked = isStaked(dbPosition);
    } else {
      const pm = UniswapV3PositionManager.bind(dataSource.address());
      const pos = pm.try_positions(event.params.tokenId);
      if (pos.reverted) return;
      liquidity = pos.value.getLiquidity();
      owner = pm.ownerOf(event.params.tokenId);
      if (owner.equals(masterChef()._address)) {
        owner = event.transaction.from;
        staked = true;
      } else {
        staked = false;
      }
    }

    dInputs = [BigInt.zero(), BigInt.zero()];
    dRewards = [
      event.params.amount0.neg(),
      event.params.amount1.neg(),
      BigInt.zero(),
    ];
  }

  // Collect fee and burn liquidity
  else {
    const decreasedLiq = decreaseLiquidityLog.data[0].toBigInt();
    const burnLogs = filterAndDecodeLogs(
      event,
      BURN_TOPIC,
      "(uint128,uint256,uint256)"
    );
    let targetLogIdx = 0;
    for (; targetLogIdx < burnLogs.length; targetLogIdx++) {
      if (burnLogs[targetLogIdx].data[0].toBigInt() == decreasedLiq) break;
    }

    if (targetLogIdx == burnLogs.length) throw new Error("Burn log not found");
    const burnLog = burnLogs[targetLogIdx];

    action = PositionChangeAction.Withdraw;
    info = getPositionInfo(burnLog);
    helper = new PancakeSwapV3Helper(info.pool);
    const dbPosition = helper.findNftPosition(event.params.tokenId);

    if (dbPosition) {
      liquidity = dbPosition.liquidity.minus(burnLog.data[0].toBigInt());
      owner = Address.fromBytes(dbPosition.owner);
      staked = isStaked(dbPosition);
    } else {
      const pm = UniswapV3PositionManager.bind(dataSource.address());
      const pos = pm.try_positions(event.params.tokenId);
      if (pos.reverted) return;
      liquidity = pos.value.getLiquidity();

      owner = pm.ownerOf(event.params.tokenId);
      if (owner.equals(masterChef()._address)) {
        owner = event.transaction.from;
        staked = true;
      } else {
        staked = false;
      }
    }

    if (staked) {
      pendingCake = masterChef().pendingCake(event.params.tokenId);
    }

    dInputs = [
      burnLog.data[1].toBigInt().neg(),
      burnLog.data[2].toBigInt().neg(),
    ];
    dRewards = [
      event.params.amount0.minus(burnLog.data[1].toBigInt()).neg(),
      event.params.amount1.minus(burnLog.data[2].toBigInt()).neg(),
      BigInt.zero(),
    ];
  }

  let currPrincipals: BigInt[];
  if (liquidity.equals(BigInt.zero())) {
    const poolContract = UniswapV3Pool.bind(info.pool);
    currPrincipals = principalOf(
      info.tl,
      info.tu,
      liquidity,
      poolContract.slot0().getSqrtPriceX96()
    );
  } else {
    currPrincipals = [BigInt.zero(), BigInt.zero()];
  }
  const currRewards = [BigInt.zero(), BigInt.zero(), pendingCake];

  savePositionChange(
    event,
    action,
    helper,
    new PositionParams(
      owner, // owner
      tag, // tag
      PositionType.Invest, // type
      currPrincipals,
      currRewards,
      liquidity,
      [info.tl.toString(), info.tu.toString(), staked ? "1" : "0"] // meta: [tickLower, tickUpper, staked]
    ),
    dInputs,
    dRewards
  );
}

// Just transfer position to another address
// Uncommon case
export function handleTransfer(event: Transfer): void {
  const zeroAddress = Address.zero();
  const mc = masterChef();

  if (event.params.to.equals(mc._address)) {
    return stakeOrUnstake(event, event.params.tokenId, true);
  }
  if (event.params.from.equals(mc._address)) {
    return stakeOrUnstake(event, event.params.tokenId, false);
  }
  if (
    event.params.from.equals(zeroAddress) ||
    event.params.to.equals(zeroAddress)
  )
    return;

  const pm = UniswapV3PositionManager.bind(dataSource.address());
  const factory = UniswapV3Factory.bind(
    Address.fromBytes(
      Bytes.fromHexString(dataSource.context().getString("factory"))
    )
  );

  const position = pm.try_positions(event.params.tokenId);
  if (position.reverted) return;
  const pool = factory.getPool(
    position.value.getToken0(),
    position.value.getToken1(),
    position.value.getFee()
  );
  const helper = new PancakeSwapV3Helper(pool);
  const poolContract = UniswapV3Pool.bind(pool);

  const slot0 = poolContract.slot0();

  const principals = principalOf(
    position.value.getTickLower(),
    position.value.getTickUpper(),
    position.value.getLiquidity(),
    slot0.getSqrtPriceX96()
  );

  const fees = feesOf(position.value, poolContract, slot0.getTick());

  const meta = [
    position.value.getTickLower().toString(),
    position.value.getTickUpper().toString(),
    "0", // to be transferred, should not be staked
  ];

  // pendingCake should be 0
  // because the position is transferred to another address

  savePositionChange(
    event,
    PositionChangeAction.Send,
    helper,
    new PositionParams(
      event.params.from, // owner
      event.params.tokenId.toString(), // tag
      PositionType.Invest, // type
      [BigInt.zero(), BigInt.zero()], // principals
      [BigInt.zero(), BigInt.zero(), BigInt.zero()], // fees
      BigInt.zero(), // liquidity
      meta
    ),
    [principals[0].neg(), principals[1].neg()], // dInputs
    [fees[0].neg(), fees[1].neg(), BigInt.zero()] // dRewards
  );
  savePositionChange(
    event,
    PositionChangeAction.Receive,
    helper,
    new PositionParams(
      event.params.to, // owner
      event.params.tokenId.toString(), // tag
      PositionType.Invest, // type
      principals,
      [fees[0], fees[1], BigInt.zero()], // dRewards
      position.value.getLiquidity(), // liquidity
      meta
    ),
    principals,
    [fees[0], fees[1], BigInt.zero()] // dRewards
  );
}

function stakeOrUnstake(
  event: ethereum.Event,
  tokenId: BigInt,
  isStake: boolean
): void {
  const position = PancakeSwapV3Helper.findNft(tokenId);
  // if (!position) throw new Error("stakeOrUnstake: Position not found");
  if (!position) return;
  const i = Investment.load(position.investment);
  // if (!i) throw new Error("stakeOrUnstake: Investment not found");
  if (!i) return;

  const pool = Address.fromBytes(i.address);
  const helper = new PancakeSwapV3Helper(pool);
  savePositionChange(
    event,
    isStake ? PositionChangeAction.Stake : PositionChangeAction.Unstake,
    helper,
    new PositionParams(
      Address.fromBytes(position.owner), // owner
      position.tag, // tag
      PositionType.Invest, // type
      [position.amounts[0], position.amounts[1]], // principals
      [position.amounts[2], position.amounts[3], position.amounts[4]], // rewards
      position.liquidity, // liquidity
      [position.meta[0], position.meta[1], isStake ? "1" : "0"] // meta
    ),
    [BigInt.zero(), BigInt.zero()], // dInputs
    [BigInt.zero(), BigInt.zero(), BigInt.zero()] // dRewards
  );
}

///////////////////////////////////////////
////////// Position Snapshots /////////////
///////////////////////////////////////////
export function handleBlock(block: ethereum.Block): void {
  const Sep012023 = BigInt.fromString("1693526400");
  if (block.timestamp.lt(Sep012023)) return;

  const protocolId = getProtocolId(PANCAKESWAP_V3_PROTOCOL);
  const protocol = Protocol.load(protocolId);
  if (!protocol) return; // before initialization

  const totalSupply = i32(parseInt(protocol.meta[0]));
  const init = protocol._batchIterator.toI32();
  const snapshotBatch = dataSource.context().getI32("snapshotBatch");

  const pm = UniswapV3PositionManager.bind(dataSource.address());

  for (let tokenId = init; tokenId < totalSupply; tokenId += snapshotBatch) {
    const tId = BigInt.fromI32(tokenId);
    let owner: Address;
    let investment: Investment | null;
    const dbPosition = PancakeSwapV3Helper.findNft(tId);
    let position: UniswapV3PositionManager__positionsResult;

    let staked: boolean;
    let pendingCake: BigInt;

    if (dbPosition == null) {
      const _position = pm.try_positions(tId);
      if (_position.reverted) continue;
      position = _position.value;
      owner = pm.ownerOf(tId);
      const mc = masterChef();
      if (owner.equals(mc._address)) {
        owner = mc.userPositionInfos(tId).getUser();
        staked = true;
      } else {
        staked = false;
      }

      const factory = UniswapV3Factory.bind(getContextAddress("factory"));
      const pool = factory.getPool(
        position.getToken0(),
        position.getToken1(),
        position.getFee()
      );
      investment = Investment.load(
        getInvestmentId(PANCAKESWAP_V3_PROTOCOL, pool)
      );

      pendingCake = BigInt.zero();
    } else if (dbPosition.closed) {
      continue;
    } else {
      owner = Address.fromBytes(dbPosition.owner);
      staked = isStaked(dbPosition);
      investment = Investment.load(dbPosition.investment);
      const _position = pm.try_positions(tId);
      if (_position.reverted) continue;
      position = _position.value;

      // default value of pending cake: if not staked, 0
      pendingCake = dbPosition.amounts[4]; // might be not changed since last snapshot
    }

    if (investment == null) continue;

    const poolContract = UniswapV3Pool.bind(
      Address.fromBytes(investment.address)
    );
    let principals: BigInt[];
    let rewards: BigInt[];
    const liq = position.getLiquidity();
    if (liq.equals(BigInt.zero())) {
      principals = [BigInt.zero(), BigInt.zero()];
      rewards = [BigInt.zero(), BigInt.zero()];
    } else {
      const slot0 = poolContract.slot0();
      const tick = slot0.getTick();
      const tl = position.getTickLower();
      const tu = position.getTickUpper();

      principals = principalOf(tl, tu, liq, slot0.getSqrtPriceX96());
      rewards = feesOf(position, poolContract, tick);
      pendingCake = staked
        ? // in case of staked position, pendingCake is updated if in-range or no default value
          (tl <= tick && tick <= tu) || pendingCake.equals(BigInt.zero())
          ? masterChef().pendingCake(tId)
          : pendingCake // reduce eth_call
        : BigInt.zero();
    }

    rewards.push(pendingCake);

    savePositionSnapshot(
      block,
      new PancakeSwapV3Helper(Address.fromBytes(investment.address)),
      new PositionParams(
        owner,
        tId.toString(),
        PositionType.Invest,
        principals,
        rewards,
        liq,
        [
          position.getTickLower().toString(),
          position.getTickUpper().toString(),
          staked ? "1" : "0",
        ] // meta: [tickLower, tickUpper]
      )
    );
  }

  protocol._batchIterator = BigInt.fromI32((init + 1) % snapshotBatch);
  protocol.save();
}

export function handleOnce(block: ethereum.Block): void {
  new PancakeSwapV3Helper(Address.zero()).getProtocol(block);
}
