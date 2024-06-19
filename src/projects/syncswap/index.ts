import { Address, BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
import {
  Burn,
  Mint,
  Sync,
  SyncSwapPool,
  Transfer,
} from "../../../generated/templates/SyncSwapPool/SyncSwapPool";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { filterLogs, logAt, logFindFirst } from "../../common/filterEventLogs";
import { hash2Address } from "../../common/helpers/hashHelper";
import { SyncSwapHelper } from "./helper";
import { matchAddress } from "../../common/matchAddress";

function lp2Amounts(
  reserve0: BigInt,
  reserve1: BigInt,
  lpAmount: BigInt,
  totalSupply: BigInt
): BigInt[] {
  if (totalSupply.equals(BigInt.zero())) return [BigInt.zero(), BigInt.zero()];
  return [
    reserve0.times(lpAmount).div(totalSupply),
    reserve1.times(lpAmount).div(totalSupply),
  ];
}

///////////////////////////////////////////
////////// Position Snapshots /////////////
///////////////////////////////////////////

export function handleBlock(block: ethereum.Block): void {
  const pool = SyncSwapPool.bind(dataSource.address());
  const totalSupply = pool.totalSupply();
  const l = new SyncSwapHelper(pool._address).getLiquidityInfo(block);

  const init = i32(parseInt(l.investment.meta[0]));
  const batch = dataSource.context().getI32("snapshotBatch");
  const positions = l.investment.positions.load();

  for (let i = init; i < positions.length; i += batch) {
    const position = positions[i];
    if (position.closed) continue;
    savePositionSnapshot(
      block,
      new SyncSwapHelper(pool._address),
      new PositionParams(
        Address.fromBytes(position.owner),
        "",
        PositionType.Invest,
        lp2Amounts(l.reserve0, l.reserve1, position.liquidity, totalSupply),
        [],
        position.liquidity,
        []
      )
    );
  }

  l.investment.meta = [
    ((init + 1) % batch).toString(),
    l.investment.meta[1],
    l.investment.meta[2],
  ];
  l.investment.save();
}

///////////////////////////////////////////
/////////// Position Changes //////////////
///////////////////////////////////////////

// Mint(address,uint256,uint256,uint256,address)
// ::Mint(address -> indexed sender,uint256,uint256,uint256,address -> indexed to)
const MINT_TOPIC =
  "0xa8137fff86647d8a402117b9c5dbda627f721d3773338fb9678c83e54ed39080";
// Burn(address,uint256,uint256,uint256,address)
const BURN_TOPIC =
  "0xd175a80c109434bb89948928ab2475a6647c94244cb70002197896423c883363";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// assert `Sync` event is emitted before `Mint` event => reserves are updated
export function handleMint(event: Mint): void {
  if (event.params.liquidity.equals(BigInt.zero())) return;
  const owner = event.params.to;
  if (!matchAddress(owner)) return;

  const pool = SyncSwapPool.bind(dataSource.address());
  const helper = new SyncSwapHelper(pool._address);
  const l = helper.getLiquidityInfo(event.block);

  // 최초블록부터 트래킹한 경우, dbPosition이 없으면 처음 투자하는 것
  const dbPosition = helper.findPosition(owner, "");
  let ownerBalance = event.params.liquidity;
  if (dbPosition != null) {
    ownerBalance = dbPosition.liquidity.plus(event.params.liquidity);
  }

  const totalSupply = pool.totalSupply();
  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      lp2Amounts(
        l.reserve0.plus(event.params.amount0),
        l.reserve1.plus(event.params.amount1),
        ownerBalance,
        totalSupply
      ),
      [],
      ownerBalance,
      []
    ),
    [event.params.amount0, event.params.amount1],
    []
  );
}

// assert `Burn` event is emitted before `Mint` event => reserves are updated
export function handleBurn(event: Burn): void {
  if (event.params.liquidity.equals(BigInt.zero())) return;

  const pool = SyncSwapPool.bind(event.address);
  const helper = new SyncSwapHelper(pool._address);
  const l = helper.getLiquidityInfo(event.block);

  const lpTransfers = filterLogs(event, TRANSFER_TOPIC);
  const lpToPool = logFindFirst(lpTransfers, event, (log, event) => {
    return (
      log.address.equals(event.address) &&
      hash2Address(log.topics[2]).equals(event.address)
    );
  });
  if (!lpToPool) throw new Error("handleBurn: lpToPool not found");

  const owner = hash2Address(lpToPool.topics[1]);
  if (!matchAddress(owner)) return;
  let ownerBalance: BigInt;
  let dbPosition = helper.findPosition(owner, "");
  if (dbPosition) {
    const liquidity = dbPosition.liquidity;
    ownerBalance = liquidity.minus(event.params.liquidity);
  } else {
    ownerBalance = pool.balanceOf(owner);
  }

  const totalSupply = pool.totalSupply();
  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    helper,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      lp2Amounts(
        l.reserve0.minus(event.params.amount0),
        l.reserve1.minus(event.params.amount1),
        ownerBalance,
        totalSupply
      ),
      [],
      ownerBalance,
      []
    ),
    [event.params.amount0.neg(), event.params.amount1.neg()],
    []
  );
}

export function handleTransfer(event: Transfer): void {
  if (event.params.value.equals(BigInt.zero())) return;

  const router = Address.fromHexString(
    dataSource.context().getString("router")
  );
  if (
    event.params.from.equals(Address.zero()) ||
    event.params.to.equals(Address.zero()) ||
    event.params.from.equals(router) ||
    event.params.to.equals(router) ||
    (!matchAddress(event.params.from) && !matchAddress(event.params.to))
  )
    return;
  const receipt = event.receipt;
  if (receipt == null) return;
  // Mint -> not in case
  const mintLogs = filterLogs(event, MINT_TOPIC);
  if (logAt(mintLogs, event.address) != -1) return;

  // Burn -> not in case
  const burnLogs = filterLogs(event, BURN_TOPIC);
  if (logAt(burnLogs, event.address) != -1) return;

  const pool = SyncSwapPool.bind(dataSource.address());
  const helper = new SyncSwapHelper(pool._address);
  const l = helper.getLiquidityInfo(event.block);

  let senderBalance: BigInt;
  const dbSenderPosition = helper.findPosition(event.params.from, "");
  if (dbSenderPosition) {
    senderBalance = dbSenderPosition.liquidity.minus(event.params.value);
  } else {
    senderBalance = pool.balanceOf(event.params.from);
  }

  let receiverBalance = event.params.value;
  const dbReceiverPosition = helper.findPosition(event.params.to, "");
  if (dbReceiverPosition != null) {
    receiverBalance = dbReceiverPosition.liquidity.plus(event.params.value);
  }

  // Just Transfer
  const totalSupply = pool.totalSupply();
  const dInput = lp2Amounts(
    l.reserve0,
    l.reserve1,
    event.params.value,
    totalSupply
  );
  if (matchAddress(event.params.from))
    savePositionChange(
      event,
      PositionChangeAction.Send,
      helper,
      new PositionParams(
        event.params.from,
        "",
        PositionType.Invest,
        lp2Amounts(l.reserve0, l.reserve1, senderBalance, totalSupply),
        [],
        senderBalance,
        []
      ),
      [dInput[0].neg(), dInput[1].neg()], // dInput: BigInt[],
      []
    );

  if (matchAddress(event.params.to))
    savePositionChange(
      event,
      PositionChangeAction.Receive,
      helper,
      new PositionParams(
        event.params.to,
        "",
        PositionType.Invest,
        lp2Amounts(l.reserve0, l.reserve1, receiverBalance, totalSupply),
        [],
        receiverBalance,
        []
      ),
      dInput,
      []
    );
}

export function handleSync(event: Sync): void {
  const i = new SyncSwapHelper(event.address).getOrCreateInvestment(
    event.block
  );
  i.meta[1] = event.params.reserve0.toString();
  i.meta[2] = event.params.reserve1.toString();

  i.meta = [
    i.meta[0],
    event.params.reserve0.toString(),
    event.params.reserve1.toString(),
  ];
  i.save();
}
