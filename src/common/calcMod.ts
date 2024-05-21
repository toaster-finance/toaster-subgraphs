import { Bytes } from "@graphprotocol/graph-ts";

//@dev for non numberic types, we can use this function to calculate the mod
//@dev cond: should be safe on mod < 2^64 
export function calcMod(bytes: Bytes, mod: i32): i32 {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    result = (result * 256 + (bytes[i] as i32)) % mod;
  }
  return result;
}