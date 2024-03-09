import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { PositionType } from "../PositionType.enum";

export function getPositionId(
  investmentId: Bytes,
  owner: Address,
  tag: string
): Bytes {
  return investmentId.concat(
    Bytes.fromHexString(owner.toHexString()).concat(Bytes.fromUTF8(tag))
  );
}

export class PositionParams {
  constructor(
    readonly owner: Address,
    readonly tag: string,
    readonly type: PositionType,
    readonly inputAmounts: BigInt[],
    readonly rewardAmounts: BigInt[],
    readonly liquidity: BigInt,
    readonly meta: Bytes[]
  ) {}

  positionId(investmentId: Bytes): Bytes {
    return getPositionId(investmentId, this.owner, this.tag);
  }
}
