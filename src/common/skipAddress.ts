import { Address, BigInt, dataSource } from "@graphprotocol/graph-ts";
import { calcMod } from "./calcMod";
/**
 * Filter address by divide number
 * @dev totalGraphNum divide number of the graph, if totalGraphNum is 0, return false
 * @dev graphId current graph id
 * @returns if true , skip the address
 */
export function skipAddress(owner: Address): boolean {
  const graphId = dataSource.context().getI32("graphId");
  const totalGraphs = dataSource.context().getI32("totalGraphs");
  if (!totalGraphs) return false;
  if (!graphId) return false;
  return (
    graphId - 1 !== calcMod(owner, totalGraphs)
  );
}
