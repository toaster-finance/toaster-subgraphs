import { Bytes, BigInt, Address } from "@graphprotocol/graph-ts";
import { Holders, Position } from "../../generated/schema";
import { getPositionId } from "./positionId";
import { hasAddress } from "./arrayHelper";
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
  const holders = getHolders(protocol);

  let position = Position.load(positionId);

  if (!position) {
    position = new Position(positionId);
    position.investment = investmentAddress;
    position.owner = owner;
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

  if (!hasAddress(holders.holders, owner)) {
    holders.holders.push(owner);
  }
  holders.save();

  return position;
}
