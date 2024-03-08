import { DataSourceContext, dataSource } from "@graphprotocol/graph-ts";
import { PoolCreated } from "../../../generated/SyncSwapStable/SyncSwapFactory";
import { SyncSwapPool } from "../../../generated/templates";

export function handlePoolCreated(event: PoolCreated): void {
  const context = new DataSourceContext();
  context.setString("router", dataSource.context().getString("router"));
  SyncSwapPool.createWithContext(event.params.pool, context);
}
