import {
  BigInt,
  DataSourceContext,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import { PoolCreated } from "../../../generated/SyncSwapStable/SyncSwapFactory";
import { SyncSwapPool } from "../../../generated/templates";
import { SYNCSWAP_PROTOCOL, SyncSwapInvestment } from ".";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import { Protocol } from "../../../generated/schema";

export function handlePoolCreated(event: PoolCreated): void {
  const context = new DataSourceContext();
  context.setString("router", dataSource.context().getString("router"));
  context.setI32("snapshotBatch", dataSource.context().getI32("snapshotBatch"));

  new SyncSwapInvestment(event.params.pool).getOrCreateInvestment(event.block);
  SyncSwapPool.createWithContext(event.params.pool, context);
}

export function handleOnce(block: ethereum.Block): void {
  const protocolId = getProtocolId(SYNCSWAP_PROTOCOL);
  const protocol = new Protocol(protocolId);
  protocol.name = SYNCSWAP_PROTOCOL;
  protocol.chain = dataSource.network();
  protocol.meta = [];
  protocol.blockNumber = block.number;
  protocol._batchIterator = BigInt.fromI32(1);
  protocol.save();
}
