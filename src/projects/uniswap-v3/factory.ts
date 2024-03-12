import { Bytes } from "@graphprotocol/graph-ts";
import { UNISWAP_V3_PROTOCOL } from ".";
import { PoolCreated } from "../../../generated/UniswapV3/UniswapV3Factory";
import { Investment } from "../../../generated/schema";
import {
  getInvestmentId,
  getProtocol,
} from "../../common/helpers/investmentHelper";

export function handlePoolCreated(event: PoolCreated): void {
  const investmentId = getInvestmentId(UNISWAP_V3_PROTOCOL, event.params.pool);
  const i = new Investment(investmentId);
  i.protocol = getProtocol(UNISWAP_V3_PROTOCOL).id;
  i.address = event.params.pool;
  i.inputTokens = [event.params.token0, event.params.token1];
  i.rewardTokens = [event.params.token0, event.params.token1];
  i.meta = [Bytes.fromI32(event.params.fee)];

  i.save();
}
