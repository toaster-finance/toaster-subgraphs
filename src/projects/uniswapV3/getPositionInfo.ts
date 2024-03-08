import { Address, BigInt, ByteArray } from "@graphprotocol/graph-ts";
import {
  UniswapV3PositionManager,
  UniswapV3PositionManager__positionsResult,
} from "../../../generated/UniswapV3/UniswapV3PositionManager";
import { UniswapV3Pool } from "../../../generated/UniswapV3/UniswapV3Pool";
import { UniswapV3Factory } from "../../../generated/UniswapV3/UniswapV3Factory";
import { computeTokenId, feesOf, principalOf } from "./positionAmount";

class PositionInfo {
  pool: UniswapV3Pool;
  tokens: Address[];
  principal: BigInt[];
  fees: BigInt[];

  constructor(
    pool: UniswapV3Pool,
    tokens: Address[],
    principal: BigInt[],
    fees: BigInt[]
  ) {
    this.pool = pool;
    this.tokens = tokens;
    this.principal = principal;
    this.fees = fees;
  }
}

export function getPositionInfo(
  position: UniswapV3PositionManager__positionsResult,
  pm: UniswapV3PositionManager,
  factory: Address
): PositionInfo {
  const tl = position.getTickLower();
  const tu = position.getTickUpper();
  const liq = position.getLiquidity();

  const poolPosId = computeTokenId(pm._address, tl, tu);

  const tokens = [position.getToken0(), position.getToken1()];
  const pool = UniswapV3Pool.bind(
    UniswapV3Factory.bind(factory).getPool(
      tokens[0],
      tokens[1],
      position.getFee()
    )
  );
  const poolPos = pool.positions(poolPosId);
  const sqrtPriceX96 = pool.slot0().getSqrtPriceX96();
  const principal = principalOf(tl, tu, liq, sqrtPriceX96);
  const fees = feesOf(position, poolPos);

  const p = new PositionInfo(pool, tokens, principal, fees);
  return p;
}
