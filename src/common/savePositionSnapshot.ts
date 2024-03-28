import { Bytes, ethereum } from "@graphprotocol/graph-ts";
import { upsertPosition } from "./upsertPosition";
import { Position, PositionSnapshot } from "../../generated/schema";
import { PositionParams } from "./helpers/positionHelper";
import { InvestmentHelper } from "./helpers/investmentHelper";

export function savePositionSnapshot(
  block: ethereum.Block,
  investment: InvestmentHelper,
  p: PositionParams
): Position {
  const position = upsertPosition(block, investment, p);
  const snapshot = new PositionSnapshot(
    position.id
      .concat(Bytes.fromHexString(block.number.toHexString().padStart(32, "0")))
  );
  snapshot.position = position.id;
  snapshot.amounts = p.inputAmounts.concat(p.rewardAmounts);
  snapshot.blockNumber = block.number;
  snapshot.blockTimestamp = block.timestamp;

  snapshot.save();

  return position;
}
