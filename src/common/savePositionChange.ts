import { BigInt, Address, ethereum, Bytes } from "@graphprotocol/graph-ts";
import { PositionChange, PositionSnapshot } from "../../generated/schema";
import { PositionChangeAction, getAction } from "./PositionChangeAction.enum";
import { upsertPosition } from "./upsertPosition";

export function savePositionChange(
  event: ethereum.Event,
  protocol: string,
  investmentAddress: Address,
  owner: Address,
  action: PositionChangeAction,
  tag: string,
  inputTokens: Address[],
  rewardTokens: Address[],
  dInput: BigInt[],
  dReward: BigInt[],
  inputAmounts: BigInt[],
  rewardAmounts: BigInt[]
): void {
  const position = upsertPosition(
    protocol,
    investmentAddress,
    owner,
    tag,
    inputTokens,
    rewardTokens,
    inputAmounts,
    rewardAmounts
  );

  const pc = new PositionChange(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  pc.position = position.id;
  pc.blockNumber = event.block.number;
  pc.blockTimestamp = event.block.timestamp;
  pc.transactionHash = event.transaction.hash;
  pc.action = getAction(action);
  pc.dAmounts = dInput.concat(dReward);
  pc.afterAmounts = inputAmounts.concat(rewardAmounts);

  const snapshot = new PositionSnapshot(
    position.id
      .concat(Bytes.fromUTF8(":"))
      .concat(Bytes.fromByteArray(Bytes.fromBigInt(event.block.number)))
  );
  snapshot.position = position.id;
  snapshot.amounts = inputAmounts.concat(rewardAmounts);
  snapshot.blockNumber = event.block.number;
  snapshot.blockTimestamp = event.block.timestamp;

  snapshot.save();
  pc.save();
}
