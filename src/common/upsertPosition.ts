import { Bytes, BigInt, Address } from "@graphprotocol/graph-ts";
import { Position } from "../../generated/schema";
import { getPositionId } from "./positionId";
import { arrayIncludes } from "./arrayHelper";
import { getHolders } from "./getHolders";

export function upsertPosition(
  protocol: string,
  investmentAddress: Address,
  owner: Address,
  tag: string,
  inputTokens: Address[],
  rewardTokens: Address[],
  inputAmounts: BigInt[],
  rewardAmounts: BigInt[]
): Position {
  const positionId = getPositionId(protocol, investmentAddress, owner, tag);
  const holders = getHolders(protocol, investmentAddress);

  let position = Position.load(positionId);

  if (!position) {
    position = new Position(positionId);
    position.investment = investmentAddress;
    position.owner = owner;
    position.tag = tag;
    position.inputTokens = inputTokens.map<Bytes>((addr) =>
      Bytes.fromHexString(addr.toHexString())
    );
    position.rewardTokens = rewardTokens.map<Bytes>((addr) =>
      Bytes.fromHexString(addr.toHexString())
    );
    position.initAmounts = inputAmounts.concat(rewardAmounts);
  }

  position.amounts = inputAmounts.concat(rewardAmounts);
  position.closed = !rewardAmounts.some((amt) => amt.gt(BigInt.zero()));

  position.save();

  if (!arrayIncludes(holders.holders, owner)) {
    holders.holders = holders.holders.concat([owner]);
  }
  holders.save();

  return position;
}
