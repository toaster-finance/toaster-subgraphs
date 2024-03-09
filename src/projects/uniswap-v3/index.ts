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
  BaseInvestment,
  InvestmentTokens,
  getProtocol,
} from "../../common/helpers/investmentHelper";
import { UniswapV3Pool } from "../../../generated/UniswapV3/UniswapV3Pool";
import { PositionParams } from "../../common/helpers/positionHelper";
import { LogData, filterAndDecodeLogs } from "../../common/filterEventLogs";
import { computeTokenId, feesOf, principalOf } from "./positionAmount";
import { PositionInfo, getLog, getPositionInfo } from "./getPositionInfo";
import { UniswapV3Factory } from "../../../generated/UniswapV3/UniswapV3Factory";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { str2Int, str2Uint } from "../../common/helpers/bigintHelper";

const UNISWAP_V3_PROTOCOL = "UniswapV3";

class UniswapInvestment extends BaseInvestment {
  constructor(readonly investmentAddress: Address) {
    super(UNISWAP_V3_PROTOCOL, investmentAddress);
  }

  getTokens(investmentAddress: Address): InvestmentTokens {
    const pool = UniswapV3Pool.bind(investmentAddress);
    const token0 = pool.token0();
    const token1 = pool.token1();
    return new InvestmentTokens(
      [token0, token1],
      [token0, token1],
      [Bytes.fromI32(pool.fee())]
    );
  }
}

///////////////////////////////////////////
//////////// Position Changes /////////////
///////////////////////////////////////////

const MINT_TOPIC =
  "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde";

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
    throw new Error(" : Mint log not found");
  }

  const info = getPositionInfo(mintLog);
  const investment = new UniswapInvestment(info.pool);

  let liquidity: BigInt;
  let principals: BigInt[];
  let fees: BigInt[];

  const dbPosition = investment.findPosition(info.owner, tag);
  // In case of adding liquidity to an existing position
  if (dbPosition) {
    const poolContract = UniswapV3Pool.bind(info.pool);
    const pm = UniswapV3PositionManager.bind(dataSource.address());
    const position = pm.positions(event.params.tokenId);

    principals = principalOf(
      info.tl,
      info.tu,
      position.getLiquidity(),
      poolContract.slot0().getSqrtPriceX96()
    );
    fees = feesOf(
      position,
      poolContract.positions(computeTokenId(pm._address, info.tl, info.tu))
    );

    liquidity = position.getLiquidity();
  }

  // In case of a new position
  else {
    liquidity = event.params.liquidity;
    principals = [event.params.amount0, event.params.amount1];
    fees = [BigInt.zero(), BigInt.zero()];
  }

  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    investment,
    new PositionParams(
      info.owner, // owner
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
      return str2Uint(log.topics[1].toHexString()).equals(event.params.tokenId);
    }
  );

  let investment: UniswapInvestment;
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
    investment = new UniswapInvestment(info.pool);
    const dbPosition = investment.findPosition(info.owner, tag);
    if (!dbPosition) {
      throw new Error(" : Position not found");
    }
    liquidity = dbPosition.liquidity;
    currPrincipals = principalOf(
      info.tl,
      info.tu,
      liquidity,
      UniswapV3Pool.bind(info.pool).slot0().getSqrtPriceX96()
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
    investment = new UniswapInvestment(info.pool);
    const dbPosition = investment.findPosition(info.owner, tag);
    if (!dbPosition) throw new Error("Position not found");

    liquidity = dbPosition.liquidity.minus(burnLog.data[0].toBigInt());

    currPrincipals = liquidity.gt(BigInt.zero())
      ? principalOf(
          info.tl,
          info.tu,
          liquidity,
          UniswapV3Pool.bind(info.pool).slot0().getSqrtPriceX96()
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
    investment,
    new PositionParams(
      info.owner, // owner
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
  if (event.params.from == zeroAddress || event.params.to == zeroAddress)
    return;

  const pm = UniswapV3PositionManager.bind(dataSource.address());
  const factory = UniswapV3Factory.bind(
    Address.fromBytes(
      Bytes.fromHexString(dataSource.context().getString("factory"))
    )
  );

  const position = pm.positions(event.params.tokenId);
  const pool = factory.getPool(
    position.getToken0(),
    position.getToken1(),
    position.getFee()
  );
  const investment = new UniswapInvestment(pool);

  const principals = principalOf(
    position.getTickLower(),
    position.getTickUpper(),
    position.getLiquidity(),
    UniswapV3Pool.bind(pool).slot0().getSqrtPriceX96()
  );
  const fees = feesOf(
    position,
    UniswapV3Pool.bind(pool).positions(
      computeTokenId(
        pm._address,
        position.getTickLower(),
        position.getTickUpper()
      )
    )
  );

  const meta = [
    Bytes.fromI32(position.getTickLower()),
    Bytes.fromI32(position.getTickUpper()),
  ];

  savePositionChange(
    event,
    PositionChangeAction.Send,
    investment,
    new PositionParams(
      event.params.from, // owner
      event.params.tokenId.toString(), // tag
      PositionType.Invest, // type
      [BigInt.zero(), BigInt.zero()], // principals
      [BigInt.zero(), BigInt.zero()], // fees
      BigInt.zero(), // liquidity
      meta
    ),
    [principals[0].neg(), principals[1].neg()], // dInputs
    [fees[0].neg(), fees[1].neg()] // dInputs
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
      fees,
      position.getLiquidity(), // liquidity
      meta
    ),
    principals,
    fees
  );
}

///////////////////////////////////////////
////////// Position Snapshots /////////////
///////////////////////////////////////////

export function handleBlock(block: ethereum.Block): void {
  const protocol = getProtocol(UNISWAP_V3_PROTOCOL);
  const investments = protocol.investments.load();
  const pm = UniswapV3PositionManager.bind(dataSource.address());

  for (let i = 0; i < investments.length; i++) {
    const investment = investments[i];
    const pool = UniswapV3Pool.bind(Address.fromBytes(investment.address));
    const sqrtPriceX96 = pool.slot0().getSqrtPriceX96();
    const positions = investment.positions.load();

    for (let j = 0; j < positions.length; j++) {
      const position = positions[j];
      const onChainP = pm.positions(BigInt.fromString(position.tag));

      const principals = principalOf(
        onChainP.getTickLower(),
        onChainP.getTickUpper(),
        onChainP.getLiquidity(),
        sqrtPriceX96
      );

      const fees = feesOf(
        onChainP,
        pool.positions(
          computeTokenId(
            pm._address,
            onChainP.getTickLower(),
            onChainP.getTickUpper()
          )
        )
      );

      savePositionSnapshot(
        block,
        new UniswapInvestment(Address.fromBytes(investment.address)),
        new PositionParams(
          Address.fromBytes(position.owner),
          position.tag,
          PositionType.Invest,
          principals,
          fees,
          onChainP.getLiquidity(),
          position.meta
        )
      );
    }
  }
}
