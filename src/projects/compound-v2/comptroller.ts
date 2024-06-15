import { Investment } from "./../../../generated/schema";
import { BigInt, DataSourceContext, dataSource } from "@graphprotocol/graph-ts";
import {
  DistributedBorrowerComp,
  DistributedSupplierComp,
  MarketEntered,
} from "./../../../generated/Comptroller/Comptroller";
import { CompoundV2Helper } from "./helper";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { matchAddress } from "../../common/matchAddress";
import { cToken as cTokenTemplate } from "../../../generated/templates";

export function handleMarketEntered(event: MarketEntered): void {
  const comptroller = dataSource.address();
  const cTokenAddr = event.params.cToken;
  const compAddr = getContextAddress("COMP");
  const helper = new CompoundV2Helper(cTokenAddr);
  const investment = Investment.load(helper.id);
  if (investment) return;
  helper.getOrCreateInvestment(event.block);
  const cTokenContext = new DataSourceContext();
  cTokenContext.setString("Comptroller", comptroller.toHexString());
  cTokenContext.setString("COMP", compAddr.toHexString());
  cTokenContext.setI32(
    "totalGraphs",
    dataSource.context().getI32("totalGraphs")
  );
  cTokenContext.setI32(
    "snapshotBatch",
    dataSource.context().getI32("snapshotBatch")
  );
  cTokenContext.setI32(
    "startSnapshotBlock",
    dataSource.context().getI32("startSnapshotBlock")
  );
  cTokenContext.setI32("graphId", dataSource.context().getI32("graphId"));
  cTokenTemplate.createWithContext(cTokenAddr, cTokenContext);
}

//Q? COMP Token 을 어떻게 표시하지?
export function handleDistributedBorrower(
  event: DistributedBorrowerComp
): void {
  const rewardAmount = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.borrower;
  if (!matchAddress(owner)) return;

  const helper = new CompoundV2Helper(cTokenAddr);
  savePositionChange(
    event,
    PositionChangeAction.Harvest, // receive reward COMP token
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [],
      [],
      BigInt.zero(),
      []
    ),
    [],
    [rewardAmount]
  );
}

export function handleDistributedSupplier(
  event: DistributedSupplierComp
): void {
  const rewardAmount = event.params.compDelta;
  const cTokenAddr = event.params.cToken;
  const owner = event.params.supplier;
  if (!matchAddress(owner)) return;
  const helper = new CompoundV2Helper(cTokenAddr);

  savePositionChange(
    event,
    PositionChangeAction.Harvest, // receive reward COMP token
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [],
      [],
      BigInt.zero(),
      []
    ),
    [],
    [rewardAmount]
  );
}
