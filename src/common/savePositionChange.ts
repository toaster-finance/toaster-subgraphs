import { BigInt, ethereum } from "@graphprotocol/graph-ts";
import { PositionChange } from "../../generated/schema";
import { PositionChangeAction, getAction } from "./PositionChangeAction.enum";
import { savePositionSnapshot } from "./savePositionSnapshot";
import { PositionParams } from "./helpers/positionHelper";
import { InvestmentHelper } from "./helpers/investmentHelper";

export function savePositionChange(
  event: ethereum.Event,
  action: PositionChangeAction,
  investment: InvestmentHelper,
  p: PositionParams,
  dInputs: BigInt[],
  dRewards: BigInt[]
): void {
  const position = savePositionSnapshot(event.block, investment, p);

  const pc = new PositionChange(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  pc.position = position.id;
  pc.blockNumber = event.block.number;
  pc.blockTimestamp = event.block.timestamp;
  pc.transactionHash = event.transaction.hash;
  pc.action = getAction(action);
  pc.dAmounts = dInputs.concat(dRewards);
  pc.afterAmounts = p.inputAmounts.concat(p.rewardAmounts);

  pc.save();
}
