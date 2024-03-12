import { Address, Bytes, dataSource } from "@graphprotocol/graph-ts";
import { PoolCreated } from "../../../generated/UniswapV3/UniswapV3Factory";
import { Investment } from "../../../generated/schema";
import {
  getInvestmentId,
  getProtocol,
} from "../../common/helpers/investmentHelper";
import { PANCAKESWAP_V3_PROTOCOL } from ".";

export function handlePoolCreated(event: PoolCreated): void {
  const investmentId = getInvestmentId(
    PANCAKESWAP_V3_PROTOCOL,
    event.params.pool
  );
  const i = new Investment(investmentId);

  const CAKE = Address.fromBytes(
    Bytes.fromHexString(dataSource.context().getString("CAKE"))
  );

  i.protocol = getProtocol(PANCAKESWAP_V3_PROTOCOL).id;
  i.address = event.params.pool;
  i.inputTokens = [event.params.token0, event.params.token1];
  i.rewardTokens = [event.params.token0, event.params.token1, CAKE];
  i.meta = [Bytes.fromI32(event.params.fee)];

  i.save();
}
