import { Address, Bytes } from "@graphprotocol/graph-ts";

export function arrayIncludes(array: Bytes[], value: Address): boolean {
  for (let i = 0; i < array.length; i++) {
    if (
      array[i].toHexString().toLowerCase() == value.toHexString().toLowerCase()
    )
      return true;
  }

  return false;
}
