import { ByteArray, Bytes } from "@graphprotocol/graph-ts";
import { UNISWAP_V3_PROTOCOL } from ".";
import { Swap } from "../../../generated/UniswapV3/UniswapV3Pool";
import { Investment } from "../../../generated/schema";
import { getInvestmentId } from "../../common/helpers/investmentHelper";

export function handleSwap(event: Swap):void {
  const investmentId = getInvestmentId(UNISWAP_V3_PROTOCOL, event.address);
  const investment = Investment.load(investmentId);
  if (investment == null) return;

  // fee, tick, getSqrtPriceX96
  investment.meta = [
    investment.meta[0],
    Bytes.fromI32(event.params.tick),
    Bytes.fromByteArray(ByteArray.fromBigInt(event.params.sqrtPriceX96)),
  ];
  investment.save();
}
