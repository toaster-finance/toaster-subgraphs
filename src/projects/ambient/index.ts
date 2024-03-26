import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import { CrocWarmCmd } from "../../../generated/Ambient/AmbientDex";

export function handleUserCmd(event: CrocWarmCmd): void {
  const decoded = ethereum.decode(
    "(uint8,address,address,uint256,int24,int24,uint128,uint128,uint128,uint8,address)",
    event.params.input
  );

  if (decoded == null) {
    throw new Error("Failed to decode log data");
  }
  const res = decoded.toTuple();

  //   let token0 = res[1].toAddress();
  //   let token1 = res[2].toAddress();
  let token0: Address;
  let token1: Address;
  let amount0: BigInt;
  let amount1: BigInt;
  if (
    res[1].toAddress().toHexString().toLowerCase() <
    res[2].toAddress().toHexString().toLowerCase()
  ) {
    token0 = res[1].toAddress();
    token1 = res[2].toAddress();
    amount0 = event.params.baseFlow;
    amount1 = event.params.quoteFlow;
  } else {
    token0 = res[2].toAddress();
    token1 = res[1].toAddress();
    amount0 = event.params.quoteFlow;
    amount1 = event.params.baseFlow;
  }

//   log.info(
//     "Transaction Hash: " +
//       event.transaction.hash.toHexString() +
//       "\n" +
//       event.params.baseFlow.toString() +
//       ", " +
//       event.params.quoteFlow.toString() +
//       ", " +
//       res[0].toI32().toString() +
//       ", " +
//       res[1].toAddress().toHexString() +
//       ", " +
//       res[2].toAddress().toHexString() +
//       ", " +
//       res[3].toBigInt().toString() +
//       ", " +
//       res[4].toI32().toString() +
//       ", " +
//       res[5].toI32().toString() +
//       ", " +
//       res[6].toBigInt().toString() +
//       ", " +
//       res[7].toBigInt().toString() +
//       ", " +
//       res[8].toBigInt().toString() +
//       ", " +
//       res[9].toI32().toString() +
//       ", " +
//       res[10].toAddress().toHexString(),
//     []
//   );
}
