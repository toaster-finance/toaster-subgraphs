import { ethereum, dataSource, BigInt, Address } from "@graphprotocol/graph-ts";
import {
  UniswapV3PositionManager,
  Collect,
  IncreaseLiquidity,
  Transfer,
} from "../../../generated/UniswapV3/UniswapV3PositionManager";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { getEventLogData } from "../../common/getEventLogData";
import { getPositionInfo } from "./getPositionInfo";

const UNISWAP_V3_PROTOCOL = "UniswapV3";

function saveUniswapV3PositionSnapshot(
  block: ethereum.Block,
  tokenId: BigInt,
  pm: UniswapV3PositionManager,
  factory: Address
): void {
  const position = pm.try_positions(tokenId);
  if (position.reverted) return;

  const owner = pm.ownerOf(tokenId);
  const p = getPositionInfo(position.value, pm, factory);

  savePositionSnapshot(
    block,
    UNISWAP_V3_PROTOCOL,
    p.pool._address,
    owner,
    tokenId.toString(),
    p.tokens,
    p.tokens,
    p.principal,
    p.fees
  );
}

export function handleBlock(block: ethereum.Block): void {
  const pm = UniswapV3PositionManager.bind(dataSource.address());
  const totalSupply = pm.try_totalSupply();
  if (totalSupply.reverted) return;
  const positionLength = totalSupply.value.toI32();
  const factory = pm.factory();

  for (let i = 0; i < positionLength; i++) {
    saveUniswapV3PositionSnapshot(block, BigInt.fromI32(i), pm, factory);
  }
}

interface TokenIdEvent {
  tokenId: BigInt;
}

class UniswapV3Event extends ethereum.Event {
  params: TokenIdEvent;
}

function saveUniswapV3PositionChange<E extends UniswapV3Event>(
  event: E,
  action: PositionChangeAction,
  dInput: BigInt[],
  dReward: BigInt[]
): void {
  const pm = UniswapV3PositionManager.bind(dataSource.address());
  const owner = pm.ownerOf(event.params.tokenId);
  const position = pm.positions(event.params.tokenId);
  const factory = pm.factory();

  const p = getPositionInfo(position, pm, factory);
  savePositionChange(
    event,
    UNISWAP_V3_PROTOCOL,
    p.pool._address,
    owner,
    action,
    event.params.tokenId.toString(),
    p.tokens,
    p.tokens,
    dInput,
    dReward,
    p.principal,
    p.fees
  );
}

export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {
  saveUniswapV3PositionChange(
    event,
    PositionChangeAction.Deposit,
    [event.params.amount0, event.params.amount1],
    [BigInt.zero(), BigInt.zero()]
  );
}

const DECREASE_LIQUIDITY_TOPIC =
  "0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4";
export function handleCollect(event: Collect): void {
  const withdrawLog = getEventLogData(
    event,
    DECREASE_LIQUIDITY_TOPIC,
    "(uint128,uint256,uint256)"
  );

  if (!withdrawLog) {
    // Harvest only
    saveUniswapV3PositionChange(
      event,
      PositionChangeAction.Harvest,
      [BigInt.zero(), BigInt.zero()],
      [event.params.amount0, event.params.amount1]
    );
  } else {
    // Withdraw position
    const withdrawAmt0 = withdrawLog.data[1].toBigInt();
    const withdrawAmt1 = withdrawLog.data[2].toBigInt();

    saveUniswapV3PositionChange(
      event,
      PositionChangeAction.Withdraw,
      [withdrawAmt0, withdrawAmt1],
      [
        event.params.amount0.minus(withdrawAmt0),
        event.params.amount1.minus(withdrawAmt1),
      ]
    );
  }
}

export function handleTransfer(event: Transfer): void {
  const zeroAddress = Address.zero();
  if (event.params.from == zeroAddress || event.params.to == zeroAddress)
    return;

  const pm = UniswapV3PositionManager.bind(dataSource.address());
  const position = pm.positions(event.params.tokenId);
  const factory = pm.factory();
  const p = getPositionInfo(position, pm, factory);
  savePositionChange(
    event,
    UNISWAP_V3_PROTOCOL,
    p.pool._address,
    event.params.from,
    PositionChangeAction.Send,
    event.params.tokenId.toString(),
    p.tokens,
    p.tokens,
    [p.principal[0].neg(), p.principal[1].neg()],
    [p.fees[0].neg(), p.fees[1].neg()],
    [BigInt.zero(), BigInt.zero()],
    [BigInt.zero(), BigInt.zero()]
  );

  savePositionChange(
    event,
    UNISWAP_V3_PROTOCOL,
    p.pool._address,
    event.params.to,
    PositionChangeAction.Receive,
    event.params.tokenId.toString(),
    p.tokens,
    p.tokens,
    p.principal,
    p.fees,
    p.principal,
    p.fees
  );
}
