import { Address, BigInt } from "@graphprotocol/graph-ts";
import { getAmountsForLiquidity } from "./liquidityAmount";
import { UniswapV3Pool } from "../../../../generated/UniswapV3/UniswapV3Pool";
import { UniswapV3PositionManager__positionsResult } from "../../../../generated/UniswapV3/UniswapV3PositionManager";
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

const MAX_UINT256 = BigInt.fromI32(1)
  .leftShift(u8(255))
  .minus(BigInt.fromI32(1))
  .times(BigInt.fromI32(2))
  .plus(BigInt.fromI32(1));

export function feesOf(
  position: UniswapV3PositionManager__positionsResult,
  poolContract: UniswapV3Pool,
  currentTick: i32,
  feeGrowthGlobalMap: GlobalFeeGrowth
): BigInt[] {
  const liq = position.getLiquidity();
  const poolFeeInsides = getFeeGrowthInside(
    poolContract,
    currentTick,
    position.getTickLower(),
    position.getTickUpper(),
    feeGrowthGlobalMap
  );

  let sub0 = poolFeeInsides[0].minus(position.getFeeGrowthInside0LastX128());
  if (sub0.lt(BigInt.fromI32(0))) sub0 = sub0.plus(MAX_UINT256);

  const fee0 = position.getTokensOwed0().plus(sub0.times(liq).rightShift(128));

  let sub1 = poolFeeInsides[1].minus(position.getFeeGrowthInside1LastX128());
  if (sub1.lt(BigInt.fromI32(0))) sub1 = sub1.plus(MAX_UINT256);
  const fee1 = position.getTokensOwed1().plus(sub1.times(liq).rightShift(128));

  return [fee0, fee1];
}

export class GlobalFeeGrowth {
  map0: Map<Address, BigInt>;
  map1: Map<Address, BigInt>;
  constructor() {
    this.map0 = new Map<Address, BigInt>();
    this.map1 = new Map<Address, BigInt>();
  }
}

function getFeeGrowthInside(
  poolContract: UniswapV3Pool,
  currentTick: i32,
  tickLower: i32,
  tickUpper: i32,
  growths: GlobalFeeGrowth
): BigInt[] {
  const tlInfo = poolContract.ticks(tickLower);
  const tuInfo = poolContract.ticks(tickUpper);

  const lowerFeeGrowthOutside0X128 = tlInfo.getFeeGrowthOutside0X128();
  const lowerFeeGrowthOutside1X128 = tlInfo.getFeeGrowthOutside1X128();
  const upperFeeGrowthOutside0X128 = tuInfo.getFeeGrowthOutside0X128();
  const upperFeeGrowthOutside1X128 = tuInfo.getFeeGrowthOutside1X128();

  let feeGrowthInside0X128: BigInt;
  let feeGrowthInside1X128: BigInt;

  if (currentTick < tickLower) {
    feeGrowthInside0X128 = lowerFeeGrowthOutside0X128.minus(
      upperFeeGrowthOutside0X128
    );
    feeGrowthInside1X128 = lowerFeeGrowthOutside1X128.minus(
      upperFeeGrowthOutside1X128
    );
  } else if (currentTick < tickUpper) {
    let growth0: BigInt;

    if (growths.map0.has(poolContract._address)) {
      growth0 = growths.map0.get(poolContract._address);
    } else {
      growth0 = poolContract.feeGrowthGlobal0X128();
      growths.map0.set(poolContract._address, growth0);
    }

    let growth1: BigInt;
    if (growths.map1.has(poolContract._address)) {
      growth1 = growths.map1.get(poolContract._address);
    } else {
      growth1 = poolContract.feeGrowthGlobal1X128();
      growths.map1.set(poolContract._address, growth1);
    }

    feeGrowthInside0X128 = growth0
      .minus(lowerFeeGrowthOutside0X128)
      .minus(upperFeeGrowthOutside0X128);
    feeGrowthInside1X128 = growth1
      .minus(lowerFeeGrowthOutside1X128)
      .minus(upperFeeGrowthOutside1X128);
  } else {
    feeGrowthInside0X128 = upperFeeGrowthOutside0X128.minus(
      lowerFeeGrowthOutside0X128
    );
    feeGrowthInside1X128 = upperFeeGrowthOutside1X128.minus(
      lowerFeeGrowthOutside1X128
    );
  }

  return [feeGrowthInside0X128, feeGrowthInside1X128];
}
