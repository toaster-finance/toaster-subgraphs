import { Bytes, ethereum } from "@graphprotocol/graph-ts";

class LogData {
  topics: Bytes[];
  data: ethereum.Tuple;

  constructor(topics: Bytes[], data: ethereum.Tuple) {
    this.topics = topics;
    this.data = data;
  }
}

export function getEventLogData(
  event: ethereum.Event,
  topic: string,
  abi: string
): LogData | null {
  const receipt = event.receipt;
  // if (receipt == null) return null;
  if (receipt == null) throw new Error("Receipt is null");

  const index = findIndexForTopic(receipt.logs, topic);
  if (index == -1) {
    return null;
  }

  const log = receipt.logs[index];
  const decoded = ethereum.decode(abi, log.data);
  if (decoded == null) {
    return null;
  }

  return new LogData(log.topics, decoded.toTuple());
}

export function findIndexForTopic(logs: ethereum.Log[], topic: string): i32 {
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].topics[0].equals(Bytes.fromHexString(topic))) {
      return i;
    }
  }
  return -1;
}
