import { Address, ethereum } from "@graphprotocol/graph-ts";
import { LogData, filterAndDecodeLogs } from "../../common/filterEventLogs";
import { str2Int } from "../../common/helpers/bigintHelper";

export class PositionInfo {
  constructor(readonly tl: i32, readonly tu: i32, readonly pool: Address) {}
}

export function getLog<E extends ethereum.Event>(
  event: E,
  topic: string,
  abi: string,
  isTargetLog: (log: LogData, event: E) => boolean
): LogData | null {
  const logs = filterAndDecodeLogs(event, topic, abi);
  let targetLogIdx = 0;
  for (; targetLogIdx < logs.length; targetLogIdx++) {
    if (isTargetLog(logs[targetLogIdx], event)) break;
  }

  return targetLogIdx == logs.length ? null : logs[targetLogIdx];
}

export function getPositionInfo(log: LogData): PositionInfo {
  const tickLower = str2Int(log.topics[2].toHexString()).toI32();
  const tickUpper = str2Int(log.topics[3].toHexString()).toI32();
  const pool = log.address;

  return new PositionInfo(tickLower, tickUpper, pool);
}
