import { assert, beforeEach, describe, log, test } from "matchstick-as";
import { Address, Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import { matchAddress } from "../src/common/matchAddress";
import { calcGraphId } from "../src/common/calcGraphId";


const TEST_ADDRESS = "0xf768a8FD04c16193aCd2F613b8374C1D7e521509";
describe("Test Common Utils", () => {
  beforeEach(() => {
    let dataContext = new DataSourceContext();
    dataContext.setI32("graphId", 9);
    dataContext.setI32("totalGraphs", 16);
  });
  test("calcMod",() => {
    const mod = calcGraphId(Bytes.fromHexString(TEST_ADDRESS));
    log.info("mod: {}", [mod.toString()]);
    assert.i32Equals(mod, 9, "calcMod is not working as expected");
  });
  test("matchAddress", () => {
    const isSkip = matchAddress(Address.fromString(TEST_ADDRESS));
    assert.assertTrue(!isSkip, "skipAddress is not working as expected");
  
  });
  
})

