import { Address } from "@graphprotocol/graph-ts";
import { LogData } from "../../../common/filterEventLogs";
import { bytes2Int } from "../../../common/helpers/bigintHelper";

export class PositionInfo {
  constructor(readonly tl: i32, readonly tu: i32, readonly pool: Address) {}
}

export function getPositionInfo(log: LogData): PositionInfo {
  const tickLower = bytes2Int(log.topics[2]).toI32();
  const tickUpper = bytes2Int(log.topics[3]).toI32();
  const pool = log.address;

  return new PositionInfo(tickLower, tickUpper, pool);
}
