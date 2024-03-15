import { BigInt, Bytes, ByteArray } from "@graphprotocol/graph-ts";

export const str2Uint = (str: string): BigInt => {
  return BigInt.fromUnsignedBytes(
    ByteArray.fromHexString(str).reverse() as ByteArray
  );
};

export const str2Int = (str: string): BigInt => {
  return BigInt.fromSignedBytes(
    ByteArray.fromHexString(str).reverse() as Bytes
  );
};

export const bytes2Int = (b: Bytes): BigInt => {
  return str2Int(b.toHexString());
};
