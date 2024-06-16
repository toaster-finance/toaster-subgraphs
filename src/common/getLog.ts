import { ethereum } from "@graphprotocol/graph-ts";
import { LogData, filterAndDecodeLogs } from "./filterEventLogs";

export function getLog<E extends ethereum.Event>(
  event: E,
  topic: string,
  dataAbi: string,
  isTargetLog: (log: LogData, event: E) => boolean
): LogData | null {
  const logs = filterAndDecodeLogs(event, topic, dataAbi);
  let targetLogIdx = 0;
  for (; targetLogIdx < logs.length; targetLogIdx++) {
    if (isTargetLog(logs[targetLogIdx], event)) break;
  }

  return targetLogIdx == logs.length ? null : logs[targetLogIdx];
}
