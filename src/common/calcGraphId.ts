import { Bytes } from "@graphprotocol/graph-ts";

//@dev for non numberic types, we can use this function to calculate the mod
//@dev cond: should be safe on mod 16
export function calcGraphId(bytes: Bytes): i32 {
  return 1 + (bytes[bytes.length - 1] % 16);
}
// @dev Calculate batchId by owner address
export function calcBatchIdFromAddr(bytes: Bytes, batchSize: i32): i32 {
  return bytes[0] % batchSize;
}
