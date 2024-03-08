import { Bytes } from "@graphprotocol/graph-ts";
import { Holders } from "../../generated/schema";

export function getHolders(protocol: string): Holders {
  let holders = Holders.load(Bytes.fromUTF8(protocol));
  if (!holders) {
    holders = new Holders(Bytes.fromUTF8(protocol));
  }

  return holders as Holders;
}
