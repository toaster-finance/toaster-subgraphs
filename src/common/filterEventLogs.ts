import { Address, Bytes, ethereum } from "@graphprotocol/graph-ts";
export class LogData {
  constructor(
    readonly address: Address,
    readonly topics: Bytes[],
    readonly data: ethereum.Tuple
  ) {}
}

export function filterLogs(
  event: ethereum.Event,
  topic: string
): ethereum.Log[] {
  const logs: ethereum.Log[] = [];
  const receipt = event.receipt;
  if (receipt == null)
    throw new Error(event.transaction.hash.toHexString() + ": Receipt is null");

  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    if (log.topics[0].equals(Bytes.fromHexString(topic))) {
      logs.push(log);
    }
  }
  return logs;
}

export function filterAndDecodeLogs(
  event: ethereum.Event,
  topic: string,
  abi: string // abi of event.receipt.log.data (except indexed parameters)
): LogData[] {
  const logs = filterLogs(event, topic);
  const logData: LogData[] = [];
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const decoded = ethereum.decode(abi, log.data);
    if (decoded != null) {
      logData.push(new LogData(log.address, log.topics, decoded.toTuple()));
    }
  }

  return logData;
}

export function logFrom(logs: ethereum.Log[], address: Address): i32 {
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].address.equals(address)) {
      return i;
    }
  }
  return -1;
}
