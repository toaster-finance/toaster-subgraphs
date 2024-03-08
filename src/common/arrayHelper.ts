import { Address, Bytes } from "@graphprotocol/graph-ts";

export function hasAddress(arr: Bytes[], target: Address): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (Address.fromBytes(arr[i]).equals(target)) {
      return true;
    }
  }
  return false;
}
