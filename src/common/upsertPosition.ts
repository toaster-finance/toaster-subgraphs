import { ethereum } from "@graphprotocol/graph-ts";
import { Holder, Position } from "../../generated/schema";
import { getHolderId } from "./helpers/holderHelper";
import { getPosType } from "./PositionType.enum";
import { PositionParams } from "./helpers/positionHelper";
import { BaseInvestment } from "./helpers/investmentHelper";

export function upsertPosition(
  block: ethereum.Block,
  invest: BaseInvestment,
  p: PositionParams
): Position {
  const investment = invest.getOrCreateInvestment();
  const positionId = p.positionId(investment.id);

  let position = Position.load(positionId);

  if (!position) {
    position = new Position(positionId);
    position.investment = investment.id;
    position.owner = p.owner;
    position.tag = p.tag;
    position.type = getPosType(p.type);
    position.initAmounts = p.inputAmounts.concat(p.rewardAmounts);
  }
  
  position.amounts = p.inputAmounts.concat(p.rewardAmounts);
  position.liquidity = p.liquidity;
  position.meta = p.meta;
  position.save();

  const holderId = getHolderId(investment.id, p.owner);
  let holder = Holder.load(holderId);
  if (!holder) {
    holder = new Holder(holderId);
    holder.investment = investment.id;
    holder.address = p.owner;
    holder.createdAt = block.timestamp;
    holder.createdAtBlock = block.number;
  }

  holder.save();

  return position;
}
