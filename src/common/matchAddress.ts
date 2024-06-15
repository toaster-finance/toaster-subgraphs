import { Address, dataSource, log } from "@graphprotocol/graph-ts";
import { calcGraphId } from "./calcGraphId";
/**
 * Filter address by divide number
 * @dev totalGraphNum divide number of the graph, if totalGraphNum is 0, return false
 * @dev graphId current graph id
 * @returns if true , owner address is under the conditions
 */
export function matchAddress(owner: Address): boolean {
  const graphId = dataSource.context().getI32("graphId");
  const totalGraphs = dataSource.context().getI32("totalGraphs");
  if (!totalGraphs) return false;
  if (!graphId) return false;
  const userGraphId = calcGraphId(owner);
  return graphId === userGraphId;
}
