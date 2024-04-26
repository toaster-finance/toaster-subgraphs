import { PoolCreated } from "../../../generated/UniswapV3/UniswapV3Factory";
import { Investment } from "../../../generated/schema";
import { getInvestmentId } from "../../common/helpers/investmentHelper";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { UniswapV3Pool as UniswapV3PoolContract } from "../../../generated/UniswapV3/UniswapV3Pool";
import { PANCAKESWAP_V3_PROTOCOL, PancakeSwapV3Helper } from "./helper";

export function handlePoolCreated(event: PoolCreated): void {
  const helper = new PancakeSwapV3Helper(event.params.pool);
  const protocol = helper.getProtocol(event.block);

  const investmentId = getInvestmentId(
    PANCAKESWAP_V3_PROTOCOL,
    event.params.pool
  );
  const i = new Investment(investmentId);

  i.protocol = protocol.id;
  i.address = event.params.pool;
  i.tag = "";
  i.inputTokens = [event.params.token0, event.params.token1];
  i.rewardTokens = [
    event.params.token0,
    event.params.token1,
    getContextAddress("CAKE"),
  ];

  const pool = UniswapV3PoolContract.bind(event.params.pool);
  i.meta = [pool.fee().toString()];

  i.blockNumber = event.block.number;
  i.blockTimestamp = event.block.timestamp;

  i.save();
}
