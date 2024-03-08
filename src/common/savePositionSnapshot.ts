import { Bytes, BigInt, Address, ethereum } from "@graphprotocol/graph-ts";
import { upsertPosition } from "./upsertPosition";
import { PositionSnapshot } from "../../generated/schema";

export function savePositionSnapshot(
  block: ethereum.Block,
  protocol: string,
  investmentAddress: Address,
  owner: Address,
  tag: string,
  inputTokens: Address[],
  rewardTokens: Address[],
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

  const snapshot = new PositionSnapshot(
    position.id
      .concat(Bytes.fromUTF8(":"))
      .concat(Bytes.fromByteArray(Bytes.fromBigInt(block.number)))
  );
  snapshot.position = position.id;
  snapshot.amounts = inputAmounts.concat(rewardAmounts);
  snapshot.blockNumber = block.number;
  snapshot.blockTimestamp = block.timestamp;

  snapshot.save();
}
