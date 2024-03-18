import { ByteArray, Bytes } from "@graphprotocol/graph-ts";
import { UNISWAP_V3_PROTOCOL, getOrCreateProtocol } from ".";
import { PoolCreated } from "../../../generated/UniswapV3/UniswapV3Factory";
import { Investment } from "../../../generated/schema";
import { getInvestmentId } from "../../common/helpers/investmentHelper";
import { UniswapV3Pool } from "../../../generated/templates";
import { UniswapV3Pool as UniswapV3PoolContract } from "../../../generated/UniswapV3/UniswapV3Pool";

export function handlePoolCreated(event: PoolCreated): void {
  const investmentId = getInvestmentId(UNISWAP_V3_PROTOCOL, event.params.pool);
  const i = new Investment(investmentId);
  const protocol = getOrCreateProtocol(event.block);

  UniswapV3Pool.create(event.params.pool);

  i.protocol = protocol.id;
  i.address = event.params.pool;
  i.inputTokens = [event.params.token0, event.params.token1];
  i.rewardTokens = [event.params.token0, event.params.token1];

  const pool = UniswapV3PoolContract.bind(event.params.pool);
  const slot0 = pool.slot0();
  i.meta = [
    Bytes.fromI32(pool.fee()),
    Bytes.fromI32(slot0.getTick()),
    Bytes.fromByteArray(ByteArray.fromBigInt(slot0.getSqrtPriceX96())),
  ]
  i.blockNumber = event.block.number;
  i.blockTimestamp = event.block.timestamp;

  i.save();
}
