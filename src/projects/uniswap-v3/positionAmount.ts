import {
  Address,
  BigInt,
  Bytes,
  crypto,
  ethereum,
} from "@graphprotocol/graph-ts";
import { getAmountsForLiquidity } from "./liquidityAmount";
import { UniswapV3Pool__positionsResult } from "../../../generated/UniswapV3/UniswapV3Pool";
import { UniswapV3PositionManager__positionsResult } from "../../../generated/UniswapV3/UniswapV3PositionManager";
import { getSqrtRatioAtTick } from "./tickMath";

export function principalOf(
  tickLower: i32,
  tickUpper: i32,
  liquidity: BigInt,
  sqrtPriceX96: BigInt
): BigInt[] {
  return getAmountsForLiquidity(
    sqrtPriceX96,
    getSqrtRatioAtTick(tickLower),
    getSqrtRatioAtTick(tickUpper),
    liquidity
  );
}

export function computeTokenId(
  positionManager: Address,
  tickLower: i32,
  tickUpper: i32
): Bytes {
  const tuple = new ethereum.Tuple();
  tuple.push(ethereum.Value.fromAddress(positionManager));
  tuple.push(ethereum.Value.fromI32(tickUpper));
  tuple.push(ethereum.Value.fromI32(tickLower));

  let encoded = ethereum.encode(ethereum.Value.fromTuple(tuple))!;
  return Bytes.fromByteArray(crypto.keccak256(encoded));
}

const Q128 = BigInt.fromI32(2).pow(128);
export function feesOf(
  position: UniswapV3PositionManager__positionsResult,
  poolPosition: UniswapV3Pool__positionsResult
): BigInt[] {
  const liq = position.getLiquidity();
  const fee0 = position
    .getTokensOwed0()
    .plus(
      position
        .getFeeGrowthInside0LastX128()
        .minus(poolPosition.getFeeGrowthInside0LastX128())
        .times(liq)
        .div(Q128)
    );
  const fee1 = position
    .getTokensOwed1()
    .plus(
      position
        .getFeeGrowthInside1LastX128()
        .minus(poolPosition.getFeeGrowthInside1LastX128())
        .times(liq)
        .div(Q128)
    );

  return [fee0, fee1];
}
