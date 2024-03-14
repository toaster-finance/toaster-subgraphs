import { Bytes } from "@graphprotocol/graph-ts";
import { PoolCreated } from "../../../generated/UniswapV3/UniswapV3Factory";
import { Investment } from "../../../generated/schema";
import { getInvestmentId } from "../../common/helpers/investmentHelper";
import { PANCAKESWAP_V3_PROTOCOL, getOrCreateProtocol } from ".";
import { getContextAddress } from "../../common/helpers/contextHelper";

export function handlePoolCreated(event: PoolCreated): void {
  const investmentId = getInvestmentId(
    PANCAKESWAP_V3_PROTOCOL,
    event.params.pool
  );
  const i = new Investment(investmentId);
  const protocol = getOrCreateProtocol();

  i.protocol = protocol.id;
  i.address = event.params.pool;
  i.inputTokens = [event.params.token0, event.params.token1];
  i.rewardTokens = [
    event.params.token0,
    event.params.token1,
    getContextAddress("CAKE"),
  ];
  i.meta = [Bytes.fromI32(event.params.fee)];

  i.save();
}
