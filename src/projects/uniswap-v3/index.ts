import {
  dataSource,
  BigInt,
  Address,
  Bytes,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  UniswapV3PositionManager,
  IncreaseLiquidity,
  Transfer,
  Collect,
} from "../../../generated/UniswapV3/UniswapV3PositionManager";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionType } from "../../common/PositionType.enum";
import {
  InvestmentHelper,
  InvestmentInfo,
  getProtocol,
  getProtocolId,
} from "../../common/helpers/investmentHelper";
import { UniswapV3Pool } from "../../../generated/UniswapV3/UniswapV3Pool";
import { PositionParams } from "../../common/helpers/positionHelper";
import { LogData, filterAndDecodeLogs } from "../../common/filterEventLogs";
import { feesOf, principalOf } from "./utils/positionAmount";
import { PositionInfo, getLog, getPositionInfo } from "./utils/getPositionInfo";
import { UniswapV3Factory } from "../../../generated/UniswapV3/UniswapV3Factory";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { hex2Uint } from "../../common/helpers/bigintHelper";
import { hash2Address } from "../../common/helpers/hashHelper";
import { Investment, Position, Protocol } from "../../../generated/schema";
import { getContextAddress } from "../../common/helpers/contextHelper";

export const UNISWAP_V3_PROTOCOL = "UniswapV3";

function getUniV3PosId(tokenId: BigInt): Bytes {
  return Bytes.fromUTF8(UNISWAP_V3_PROTOCOL)
    .concat(
      Bytes.fromHexString(dataSource.context().getString("positionManager"))
    )
    .concat(Bytes.fromI32(tokenId.toI32()));
}

function findNft(tokenId: BigInt): Position | null {
  const positionId = getUniV3PosId(tokenId);
  return Position.load(positionId);
}

class UniswapV3Helper extends InvestmentHelper {
  constructor(readonly investmentAddress: Address) {
    super(UNISWAP_V3_PROTOCOL, investmentAddress);
  }

  // the way how to get the position id is different from other protocols
  getPositionId(_owner: Address, tag: string): Bytes {
    return getUniV3PosId(BigInt.fromString(tag));
  }

  findNftPosition(tokenId: BigInt): Position | null {
    // since `getPositionId` don't use owner
    // pass just Address.zero() as owner
    return this.findPosition(Address.zero(), tokenId.toString());
  }

  getInfo(investmentAddress: Address): InvestmentInfo {
    const pool = UniswapV3Pool.bind(investmentAddress);
    const token0 = pool.token0();
    const token1 = pool.token1();

    return new InvestmentInfo(
      [token0, token1],
      [token0, token1],
      [pool.fee().toString()]
    );
  }
}

///////////////////////////////////////////
//////////// Position Changes /////////////
///////////////////////////////////////////

const MINT_TOPIC =
  "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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
  if (!mintLog) {
    throw new Error("Mint log not found");
  }

  const nftTransferLog = getLog(
    event,
    TRANSFER_TOPIC,
    "()",
    function (log: LogData, event: IncreaseLiquidity): boolean {
      return (
        log.address.equals(dataSource.address()) &&
        hex2Uint(log.topics[3].toHexString()).equals(event.params.tokenId) &&
        hash2Address(log.topics[1]).equals(Address.zero())
      );
    }
  );

  const info = getPositionInfo(mintLog);
  const helper = new UniswapV3Helper(info.pool);

  // Created a new position
  let liquidity: BigInt;
  let principals: BigInt[];
  let fees: BigInt[];
  let owner: Address;
  if (nftTransferLog) {
    liquidity = event.params.liquidity;
    principals = [event.params.amount0, event.params.amount1];
    fees = [BigInt.zero(), BigInt.zero()];
    owner = hash2Address(nftTransferLog.topics[2]);

    // Update totalSupply of the protocol
    const protocol = getProtocol(UNISWAP_V3_PROTOCOL);
    if (!protocol) throw new Error("Protocol not found");
    const totalSupply = protocol.meta[0].toI32();
    protocol.meta = [Bytes.fromI32(totalSupply + 1)];
    protocol.save();
  }
  // Added liquidity to an existing position
  else {
    const dbPosition = helper.findNftPosition(event.params.tokenId);
    const pm = UniswapV3PositionManager.bind(dataSource.address());
    if (dbPosition) {
      owner = Address.fromBytes(dbPosition.owner);
    } else {
      owner = pm.ownerOf(event.params.tokenId);
    }

    const poolContract = UniswapV3Pool.bind(info.pool);
    const position = pm.try_positions(event.params.tokenId);

    // In case of a position that has burned in a same blockNumber
    // when the position is created
    // In this case, the position is not found in the contract
    // [IncreaseLiquidity #11622]
    // https://polygonscan.com/tx/0xc7c8de36c5a8e32005114d5fa9d456f36ce55ebc499ab1b6374932aa66be1377#eventlog
    // [Burn #11622]
    // https://polygonscan.com/tx/0xd5c72036741af3921edaa3e02b41f5add29f13521bf6379e6484dc3552b15f8b#eventlog
    if (position.reverted) {
      if (dbPosition) {
        liquidity = dbPosition.liquidity;
        principals = dbPosition.amounts.slice(0, 2);
        fees = dbPosition.amounts.slice(2, 4);
      } else {
        liquidity = event.params.liquidity;
        principals = [event.params.amount0, event.params.amount1];
        fees = [BigInt.zero(), BigInt.zero()];
      }
    } else {
      liquidity = position.value.getLiquidity();
      const slot0 = poolContract.slot0();

      principals = principalOf(
        position.value.getTickLower(),
        position.value.getTickUpper(),
        liquidity,
        slot0.getSqrtPriceX96()
      );
      fees = feesOf(position.value, poolContract, slot0.getTick());
    }
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
      fees,
      liquidity,
      [Bytes.fromI32(info.tl), Bytes.fromI32(info.tu)] // meta: [tickLower, tickUpper]
    ),
    [event.params.amount0, event.params.amount1], // inputAmounts
    [BigInt.zero(), BigInt.zero()] // rewardAmounts
  );
}

const BURN_TOPIC =
  "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c";

const DECREASE_LIQUIDITY_TOPIC =
  "0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4";

// Collect event from Pool, not from NFTPositionManager
const COLLECT_TOPIC =
  "0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0";
export function handleCollect(event: Collect): void {
  const tag = event.params.tokenId.toString();
  const decreaseLiquidityLog = getLog(
    event,
    DECREASE_LIQUIDITY_TOPIC,
    "(uint128,uint256,uint256)",
    function (log: LogData, event: Collect): boolean {
      return hex2Uint(log.topics[1].toHexString()).equals(event.params.tokenId);
    }
  );

  let helper: UniswapV3Helper;
  let owner: Address;
  let liquidity: BigInt;
  let info: PositionInfo;
  let action: PositionChangeAction;
  let currPrincipals: BigInt[];
  let currFees: BigInt[];
  let dInputs: BigInt[];
  let dRewards: BigInt[];

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
    helper = new UniswapV3Helper(info.pool);
    const dbPosition = helper.findNftPosition(event.params.tokenId);

    if (dbPosition) {
      liquidity = dbPosition.liquidity;
      owner = Address.fromBytes(dbPosition.owner);
    } else {
      const pm = UniswapV3PositionManager.bind(dataSource.address());
      liquidity = pm.positions(event.params.tokenId).getLiquidity();
      owner = pm.ownerOf(event.params.tokenId);
    }

    const poolContract = UniswapV3Pool.bind(info.pool);
    currPrincipals = principalOf(
      info.tl,
      info.tu,
      liquidity,
      poolContract.slot0().getSqrtPriceX96()
    );
    currFees = [BigInt.zero(), BigInt.zero()];
    dInputs = [BigInt.zero(), BigInt.zero()];
    dRewards = [event.params.amount0.neg(), event.params.amount1.neg()];
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
    helper = new UniswapV3Helper(info.pool);
    const poolContract = UniswapV3Pool.bind(info.pool);

    const dbPosition = helper.findNftPosition(event.params.tokenId);

    if (dbPosition) {
      liquidity = dbPosition.liquidity.minus(burnLog.data[0].toBigInt());
      owner = Address.fromBytes(dbPosition.owner);
    } else {
      const pm = UniswapV3PositionManager.bind(dataSource.address());
      liquidity = pm.positions(event.params.tokenId).getLiquidity();
      owner = pm.ownerOf(event.params.tokenId);
    }

    currPrincipals = liquidity.gt(BigInt.zero())
      ? principalOf(
          info.tl,
          info.tu,
          liquidity,
          poolContract.slot0().getSqrtPriceX96()
        )
      : [BigInt.zero(), BigInt.zero()];
    currFees = [BigInt.zero(), BigInt.zero()];

    dInputs = [
      burnLog.data[1].toBigInt().neg(),
      burnLog.data[2].toBigInt().neg(),
    ];
    dRewards = [
      event.params.amount0.minus(burnLog.data[1].toBigInt()).neg(),
      event.params.amount1.minus(burnLog.data[2].toBigInt()).neg(),
    ];
  }

  savePositionChange(
    event,
    action,
    helper,
    new PositionParams(
      owner, // owner
      tag, // tag
      PositionType.Invest, // type
      currPrincipals,
      currFees,
      liquidity,
      [Bytes.fromI32(info.tl), Bytes.fromI32(info.tu)]
    ),
    dInputs,
    dRewards
  );
}

// Just transfer position to another address
// Uncommon case
export function handleTransfer(event: Transfer): void {
  const zeroAddress = Address.zero();
  if (
    event.params.from.equals(zeroAddress) ||
    event.params.to.equals(zeroAddress)
  )
    return;

  const pm = UniswapV3PositionManager.bind(dataSource.address());
  const factory = UniswapV3Factory.bind(getContextAddress("factory"));

  const position = pm.try_positions(event.params.tokenId);
  if (position.reverted) return;
  const pool = factory.getPool(
    position.value.getToken0(),
    position.value.getToken1(),
    position.value.getFee()
  );

  const helper = new UniswapV3Helper(pool);
  const poolContract = UniswapV3Pool.bind(pool);
  const slot0 = poolContract.slot0();
  const principals = principalOf(
    position.value.getTickLower(),
    position.value.getTickUpper(),
    position.value.getLiquidity(),
    slot0.getSqrtPriceX96()
  );
  const fees = feesOf(position.value, poolContract, slot0.getTick());

  const positionMeta = [
    Bytes.fromI32(position.value.getTickLower()),
    Bytes.fromI32(position.value.getTickUpper()),
  ];

  savePositionChange(
    event,
    PositionChangeAction.Send,
    helper,
    new PositionParams(
      event.params.from, // owner
      event.params.tokenId.toString(), // tag
      PositionType.Invest, // type
      [BigInt.zero(), BigInt.zero()], // principals
      [BigInt.zero(), BigInt.zero()], // fees
      BigInt.zero(), // liquidity
      positionMeta
    ),
    [principals[0].neg(), principals[1].neg()], // dInputs
    [fees[0].neg(), fees[1].neg()] // dRewards
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
      fees,
      position.value.getLiquidity(), // liquidity
      positionMeta
    ),
    principals,
    fees
  );
}

///////////////////////////////////////////
////////// Position Snapshots /////////////
///////////////////////////////////////////
export function handleBlock(block: ethereum.Block): void {
  const Sep012023 = BigInt.fromString("1693526400");
  if (block.timestamp.lt(Sep012023)) return;

  const protocol = getProtocol(UNISWAP_V3_PROTOCOL);
  if (!protocol) return; // before initialized

  const totalSupply = protocol.meta[0].toI32();
  const init = protocol._batchIterator.toI32();
  const snapshotBatch = dataSource.context().getI32("snapshotBatch");

  const pm = UniswapV3PositionManager.bind(dataSource.address());
  // const feeGrowthMaps = new GlobalFeeGrowth();

  for (let tokenId = init; tokenId < totalSupply; tokenId += snapshotBatch) {
    const dbPosition = findNft(BigInt.fromI32(tokenId));
    if (dbPosition == null || dbPosition.closed) continue;

    const investment = Investment.load(dbPosition.investment);
    if (investment == null) continue;

    const position = pm.try_positions(BigInt.fromString(dbPosition.tag));
    if (position.reverted) continue;

    const poolContract = UniswapV3Pool.bind(
      Address.fromBytes(investment.address)
    );

    let principals: BigInt[];
    let fees: BigInt[];
    if (position.value.getLiquidity().equals(BigInt.zero())) {
      principals = [BigInt.zero(), BigInt.zero()];
      fees = [BigInt.zero(), BigInt.zero()];
    } else {
      const slot0 = poolContract.slot0();
      principals = principalOf(
        position.value.getTickLower(),
        position.value.getTickUpper(),
        position.value.getLiquidity(),
        slot0.getSqrtPriceX96()
      );
      fees = feesOf(position.value, poolContract, slot0.getTick());
    }

    savePositionSnapshot(
      block,
      new UniswapV3Helper(poolContract._address),
      new PositionParams(
        Address.fromBytes(dbPosition.owner),
        dbPosition.tag,
        PositionType.Invest,
        principals,
        fees,
        position.value.getLiquidity(),
        dbPosition.meta
      )
    );
  }

  protocol._batchIterator = BigInt.fromI32((init + 1) % snapshotBatch);
  protocol.save();
}

export function handleOnce(block: ethereum.Block): void {
  getOrCreateProtocol(block);
}

export function getOrCreateProtocol(block: ethereum.Block): Protocol {
  let protocol = getProtocol(UNISWAP_V3_PROTOCOL);
  if (protocol) return protocol;

  const protocolId = getProtocolId(UNISWAP_V3_PROTOCOL);
  protocol = new Protocol(protocolId);
  protocol.name = UNISWAP_V3_PROTOCOL;
  protocol.chain = dataSource.network();
  protocol._batchIterator = BigInt.fromI32(1);
  protocol.blockNumber = block.number;

  const totalSupply = UniswapV3PositionManager.bind(
    getContextAddress("positionManager")
  ).totalSupply();

  protocol.meta = [Bytes.fromI32(totalSupply.toI32())];
  protocol.save();

  return protocol;
}
