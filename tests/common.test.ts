import { assert, beforeAll, beforeEach, describe, log, test } from "matchstick-as";
import { Address, Bytes, DataSourceContext, dataSource } from "@graphprotocol/graph-ts";
import { matchAddress } from "../src/common/matchAddress";
import { calcGraphId } from "../src/common/calcGraphId";


const TEST_ADDRESS = "0xf768a8FD04c16193aCd2F613b8374C1D7e521509";
describe("Test Common Utils", () => {
  beforeEach(() => {
    dataSource.context().setI32("graphId", 10);
    dataSource.context().setI32("totalGraphs", 16);
  });
  test("calcMod",() => {
    const mod = calcGraphId(Bytes.fromHexString(TEST_ADDRESS));
    // log.critical("mod: {}, {}", [mod.toString(), dataSource.context().getI32("graphId").toString()]);
    assert.i32Equals(mod, dataSource.context().getI32("graphId"), "calcMod is not working as expected");
  });
  test("matchAddress", () => {
    const isMatch = matchAddress(Address.fromString(TEST_ADDRESS));
    // log.info("isMatch: {}", [isMatch.toString()]);
    assert.assertTrue(!isMatch, "skipAddress is not working as expected");
  
  });
  
})

