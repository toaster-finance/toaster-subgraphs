import { Address, Bytes } from "@graphprotocol/graph-ts";
import { Holders } from "../../generated/schema";

export function getHolders(protocol: string, investment: Address): Holders {
  const holdersId = Bytes.fromUTF8(protocol).concat(investment);
  let holders = Holders.load(holdersId);
  if (!holders) {
    holders = new Holders(holdersId);
    holders.holders = [];
  }

  return holders as Holders;
}
