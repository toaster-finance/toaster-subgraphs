import { Bytes, dataSource } from "@graphprotocol/graph-ts";

// Position Determinator
function _posId(
  chain: string,
  protocol: string,
  investmentAddress: Bytes,
  owner: Bytes,
  tag: string
): Bytes {
  return Bytes.fromUTF8(
    `${chain}:${protocol}:${investmentAddress.toHexString()}:${owner.toHexString()}:${tag}`
  );
}

export function getPositionId(
  protocol: string,
  investmentAddress: Bytes,
  owner: Bytes,
  tag: string
): Bytes {
  return _posId(dataSource.network(), protocol, investmentAddress, owner, tag);
}
