import { DataSourceContext, dataSource } from "@graphprotocol/graph-ts";
import { PoolCreated } from "../../../generated/SyncSwapStable/SyncSwapFactory";
import { SyncSwapPool } from "../../../generated/templates";
import { SyncSwapInvestment } from ".";

export function handlePoolCreated(event: PoolCreated): void {
  const context = new DataSourceContext();
  context.setString("router", dataSource.context().getString("router"));
  new SyncSwapInvestment(event.params.pool).getOrCreateInvestment()
  SyncSwapPool.createWithContext(event.params.pool, context);
}
