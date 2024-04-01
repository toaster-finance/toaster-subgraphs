import { Address, BigInt, dataSource, ethereum, log } from "@graphprotocol/graph-ts";
import { AmbientDex, CrocWarmCmd } from "../../../generated/Ambient/AmbientDex";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";

export function handleUserCmd(event: CrocWarmCmd): void {
  const decoded = ethereum.decode(
    "(uint8,address,address,uint256,int24,int24,uint128,uint128,uint128,uint8,address)",
    event.params.input
  );

  if (decoded == null) {
    throw new Error("Failed to decode log data");
  }
  const res = decoded.toTuple();

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
  savePositionChange(
    event,
    amount0 > new BigInt(0) && amount1 > new BigInt(0)
      ? PositionChangeAction.Deposit
      : PositionChangeAction.Withdraw,
    new AmbientDexHepl
  );
}

// export function handleBlock(block: ethereum.Block): void {
//   const pool = AmbientDex.bind(dataSource.address());
  

//   const init = i32(parseInt(l.investment.meta[0]));
//   const batch = dataSource.context().getI32("snapshotBatch");
//   const positions = l.investment.positions.load();

//   for (let i = init; i < positions.length; i += batch) {
//     const position = positions[i];
//     if (position.closed) continue;
//     savePositionSnapshot(
//       block,
//       new SyncSwapHelper(pool._address),
//       new PositionParams(
//         Address.fromBytes(position.owner),
//         "",
//         PositionType.Invest,
//         lp2Amounts(l.reserve0, l.reserve1, position.liquidity, l.totalSupply),
//         [],
//         position.liquidity,
//         []
//       )
//     );
//   }

//   l.investment.meta[0] = ((init + 1) % batch).toString();
//   l.investment.save();
// }