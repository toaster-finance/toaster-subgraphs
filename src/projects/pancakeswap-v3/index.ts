import {
  Address,
  BigInt,
  Bytes,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  BaseInvestment,
  InvestmentTokens,
  getProtocol,
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
} from "../../../generated/UniswapV3/UniswapV3PositionManager";
import {
  PositionInfo,
  getLog,
  getPositionInfo,
} from "../uniswap-v3/getPositionInfo";
import { LogData, filterAndDecodeLogs } from "../../common/filterEventLogs";
import { str2Uint } from "../../common/helpers/bigintHelper";
import { hash2Address } from "../../common/helpers/hashHelper";
import {
  GlobalFeeGrowth,
  feesOf,
  principalOf,
} from "../uniswap-v3/positionAmount";
import { PositionType } from "../../common/PositionType.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { UniswapV3Factory } from "../../../generated/UniswapV3/UniswapV3Factory";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { getContextAddress } from "../../common/helpers/contextHelper";

export const PANCAKESWAP_V3_PROTOCOL = "PancakeSwapV3";

function getPcsV3PosId(tokenId: BigInt): Bytes {
  return Bytes.fromUTF8(PANCAKESWAP_V3_PROTOCOL)
    .concat(
      Bytes.fromHexString(dataSource.context().getString("positionManager"))
    )
    .concat(Bytes.fromI32(tokenId.toI32()));
}

function findNft(tokenId: BigInt): Position | null {
  const positionId = getPcsV3PosId(tokenId);
  return Position.load(positionId);
}

class PancakeSwapV3Investment extends BaseInvestment {
  constructor(readonly investmentAddress: Address) {
    super(PANCAKESWAP_V3_PROTOCOL, investmentAddress);
  }

  // how to get the position id is different from other protocols
  getPositionId(_owner: Address, tag: string): Bytes {
    return getPcsV3PosId(BigInt.fromString(tag));
  }

  findNftPosition(tokenId: BigInt): Position | null {
    // since `getPositionId` don't use owner
    // pass just Address.zero() as owner
    return this.findPosition(Address.zero(), tokenId.toString());
  }

  getTokens(investmentAddress: Address): InvestmentTokens {
    const pool = UniswapV3Pool.bind(investmentAddress);
    const token0 = pool.token0();
    const token1 = pool.token1();
    const CAKE = Address.fromBytes(
      Bytes.fromHexString(dataSource.context().getString("CAKE"))
    );
    return new InvestmentTokens(
      [token0, token1],
      [token0, token1, CAKE],
      [Bytes.fromI32(pool.fee())]
    );
  }
}

function masterChef(): PancakeSwapV3MasterChef {
  return PancakeSwapV3MasterChef.bind(
    Address.fromBytes(
      Bytes.fromHexString(dataSource.context().getString("masterChef"))
    )
  );
}

function isStaked(position: Position): boolean {
  return position.meta[2].equals(Bytes.fromI32(1));
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
        str2Uint(log.topics[3].toHexString()).equals(event.params.tokenId)
      );
    }
  );

  const info = getPositionInfo(mintLog);
  const investment = new PancakeSwapV3Investment(info.pool);

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
    const protocol = getProtocol(PANCAKESWAP_V3_PROTOCOL);
    if (!protocol) throw new Error("Protocol not found");
    const totalSupply = protocol.meta[0].toI32();
    protocol.meta = [Bytes.fromI32(totalSupply + 1), protocol.meta[1]];
    protocol.save();
  }
  // Added liquidity to an existing position
  else {
    const dbPosition = investment.findNftPosition(event.params.tokenId);
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

    rewards = feesOf(
      position,
      poolContract,
      slot0.getTick(),
      info.tl,
      info.tu,
      new GlobalFeeGrowth()
    );

    const pendingCake = masterChef().pendingCake(event.params.tokenId);
    rewards.push(pendingCake);
  }

  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    investment,
    new PositionParams(
      owner, // owner
      tag, // tag
      PositionType.Invest, // type
      principals,
      rewards,
      liquidity,
      [
        Bytes.fromI32(info.tl),
        Bytes.fromI32(info.tu),
        Bytes.fromI32(staked ? 1 : 0),
      ] // meta: [tickLower, tickUpper, staked]
    ),
    [event.params.amount0, event.params.amount1], // inputAmounts
    [BigInt.zero(), BigInt.zero(), BigInt.zero()] // rewardAmounts
  );
}

export function handleHarvest(event: Harvest): void {
  const dbPosition = findNft(event.params.tokenId);
  if (!dbPosition) throw new Error("handleHarvest: Position not found");
  const i = Investment.load(dbPosition.investment);
  if (!i) throw new Error("handleHarvest: Investment not found");

  const pool = Address.fromBytes(i.address);
  const investment = new PancakeSwapV3Investment(pool);
  const reward = event.params.reward;
  savePositionChange(
    event,
    PositionChangeAction.Harvest,
    investment,
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
        Bytes.fromI32(1), // true
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
      return str2Uint(log.topics[1].toHexString()).equals(event.params.tokenId);
    }
  );

  let investment: PancakeSwapV3Investment;
  let owner: Address;
  let liquidity: BigInt;
  let info: PositionInfo;
  let action: PositionChangeAction;
  let currPrincipals: BigInt[];
  let currRewards: BigInt[];
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
    investment = new PancakeSwapV3Investment(info.pool);
    const dbPosition = investment.findNftPosition(event.params.tokenId);

    if (dbPosition) {
      liquidity = dbPosition.liquidity;
      owner = Address.fromBytes(dbPosition.owner);
      staked = isStaked(dbPosition);
    } else {
      const pm = UniswapV3PositionManager.bind(dataSource.address());
      liquidity = pm.positions(event.params.tokenId).getLiquidity();
      owner = pm.ownerOf(event.params.tokenId);
      if (owner.equals(masterChef()._address)) {
        owner = event.transaction.from;
        staked = true;
      } else {
        staked = false;
      }
    }

    currPrincipals = principalOf(
      info.tl,
      info.tu,
      liquidity,
      UniswapV3Pool.bind(info.pool).slot0().getSqrtPriceX96()
    );
    currRewards = [BigInt.zero(), BigInt.zero(), BigInt.zero()];
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
    investment = new PancakeSwapV3Investment(info.pool);
    const dbPosition = investment.findNftPosition(event.params.tokenId);

    let pendingCake = BigInt.zero();
    if (dbPosition) {
      liquidity = dbPosition.liquidity.minus(burnLog.data[0].toBigInt());
      owner = Address.fromBytes(dbPosition.owner);
      staked = isStaked(dbPosition);
    } else {
      const pm = UniswapV3PositionManager.bind(dataSource.address());
      liquidity = pm.positions(event.params.tokenId).getLiquidity();
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

    currPrincipals = liquidity.gt(BigInt.zero())
      ? principalOf(
          info.tl,
          info.tu,
          liquidity,
          UniswapV3Pool.bind(info.pool).slot0().getSqrtPriceX96()
        )
      : [BigInt.zero(), BigInt.zero()];
    currRewards = [BigInt.zero(), BigInt.zero(), pendingCake];

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

  savePositionChange(
    event,
    action,
    investment,
    new PositionParams(
      owner, // owner
      tag, // tag
      PositionType.Invest, // type
      currPrincipals,
      currRewards,
      liquidity,
      [
        Bytes.fromI32(info.tl),
        Bytes.fromI32(info.tu),
        Bytes.fromI32(staked ? 1 : 0),
      ] // meta: [tickLower, tickUpper, staked]
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
  const investment = new PancakeSwapV3Investment(pool);
  const poolContract = UniswapV3Pool.bind(pool);
  const slot0 = poolContract.slot0();

  const principals = principalOf(
    position.value.getTickLower(),
    position.value.getTickUpper(),
    position.value.getLiquidity(),
    slot0.getSqrtPriceX96()
  );
  const fees = feesOf(
    position.value,
    poolContract,
    slot0.getTick(),
    position.value.getTickLower(),
    position.value.getTickUpper(),
    new GlobalFeeGrowth()
  );

  const meta = [
    Bytes.fromI32(position.value.getTickLower()),
    Bytes.fromI32(position.value.getTickUpper()),
    Bytes.fromI32(0), // to be transferred, should not be staked
  ];

  // pendingCake should be 0
  // because the position is transferred to another address

  savePositionChange(
    event,
    PositionChangeAction.Send,
    investment,
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
    investment,
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
  const position = findNft(tokenId);
  if (!position) throw new Error("stakeOrUnstake: Position not found");
  const i = Investment.load(position.investment);
  if (!i) throw new Error("stakeOrUnstake: Investment not found");

  const pool = Address.fromBytes(i.address);
  const investment = new PancakeSwapV3Investment(pool);
  savePositionChange(
    event,
    isStake ? PositionChangeAction.Stake : PositionChangeAction.Unstake,
    investment,
    new PositionParams(
      Address.fromBytes(position.owner), // owner
      position.tag, // tag
      PositionType.Invest, // type
      [position.amounts[0], position.amounts[1]], // principals
      [position.amounts[2], position.amounts[3], position.amounts[4]], // rewards
      position.liquidity, // liquidity
      [position.meta[0], position.meta[1], Bytes.fromI32(isStake ? 1 : 0)] // meta
    ),
    [BigInt.zero(), BigInt.zero()], // dInputs
    [BigInt.zero(), BigInt.zero(), BigInt.zero()] // dRewards
  );
}

///////////////////////////////////////////
////////// Position Snapshots /////////////
///////////////////////////////////////////
export function handleBlock(block: ethereum.Block): void {
  const protocol = getProtocol(PANCAKESWAP_V3_PROTOCOL);
  if (!protocol) return; // before initialization

  const totalSupply = protocol.meta[0].toI32();
  const init = protocol.meta[1].toI32();
  const snapshotBatch = dataSource.context().getI32("snapshotBatch");

  const pm = UniswapV3PositionManager.bind(dataSource.address());
  const feeGrowthMaps = new GlobalFeeGrowth();

  for (let tokenId = init; tokenId < totalSupply; tokenId += snapshotBatch) {
    const position = findNft(BigInt.fromI32(tokenId));
    if (position == null || position.closed) continue;

    const investment = Investment.load(position.investment);
    if (investment == null) continue;

    const onChainP = pm.try_positions(BigInt.fromString(position.tag));
    if (onChainP.reverted) continue;

    const poolContract = UniswapV3Pool.bind(
      Address.fromBytes(investment.address)
    );
    const slot0 = poolContract.slot0();

    let principals: BigInt[];
    let rewards: BigInt[];
    if (onChainP.value.getLiquidity().equals(BigInt.zero())) {
      principals = [BigInt.zero(), BigInt.zero()];
      rewards = [BigInt.zero(), BigInt.zero()];
    } else {
      principals = principalOf(
        onChainP.value.getTickLower(),
        onChainP.value.getTickUpper(),
        onChainP.value.getLiquidity(),
        slot0.getSqrtPriceX96()
      );
      rewards = feesOf(
        onChainP.value,
        poolContract,
        slot0.getTick(),
        onChainP.value.getTickLower(),
        onChainP.value.getTickUpper(),
        feeGrowthMaps
      );
    }

    const pendingCake = isStaked(position)
      ? masterChef().pendingCake(BigInt.fromString(position.tag))
      : BigInt.zero();
    rewards.push(pendingCake);

    savePositionSnapshot(
      block,
      new PancakeSwapV3Investment(Address.fromBytes(investment.address)),
      new PositionParams(
        Address.fromBytes(position.owner),
        position.tag,
        PositionType.Invest,
        principals,
        rewards,
        onChainP.value.getLiquidity(),
        position.meta
      )
    );
  }

  protocol.meta = [protocol.meta[0], Bytes.fromI32((init + 1) % snapshotBatch)];
  protocol.save();
}

export function handleOnce(block: ethereum.Block): void {
  getOrCreateProtocol();
}

export function getOrCreateProtocol(): Protocol {
  let protocol = getProtocol(PANCAKESWAP_V3_PROTOCOL);
  if (protocol) return protocol;

  const protocolId = getProtocolId(PANCAKESWAP_V3_PROTOCOL);
  protocol = new Protocol(protocolId);
  protocol.name = PANCAKESWAP_V3_PROTOCOL;
  protocol.chain = dataSource.network();

  const totalSupply = UniswapV3PositionManager.bind(
    getContextAddress("positionManager")
  ).totalSupply();

  protocol.meta = [Bytes.fromI32(totalSupply.toI32()), Bytes.fromI32(1)];
  protocol.save();

  return protocol;
}
