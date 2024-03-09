import { Bytes, ethereum } from "@graphprotocol/graph-ts";
import { upsertPosition } from "./upsertPosition";
import { Position, PositionSnapshot } from "../../generated/schema";
import { PositionParams } from "./helpers/positionHelper";
import { BaseInvestment } from "./helpers/investmentHelper";

export function savePositionSnapshot(
  block: ethereum.Block,
  investment: BaseInvestment,
  p: PositionParams
): Position {
  const position = upsertPosition(block, investment, p);

  const snapshot = new PositionSnapshot(
    position.id
      .concat(Bytes.fromUTF8(":"))
      .concat(Bytes.fromByteArray(Bytes.fromBigInt(block.number)))
  );
  snapshot.position = position.id;
  snapshot.amounts = p.inputAmounts.concat(p.rewardAmounts);
  snapshot.blockNumber = block.number;
  snapshot.blockTimestamp = block.timestamp;

  snapshot.save();

  return position;
}
