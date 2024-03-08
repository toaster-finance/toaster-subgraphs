import { Address, BigInt, DataSourceContext, dataSource } from "@graphprotocol/graph-ts";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { findIndexForTopic } from "../../common/getEventLogData";
import {
  SyncSwapPool,
  Transfer,
  SyncSwapPool__getReservesResult,
  Mint,
  Burn,
} from "../../../generated/templates/SyncSwapPool/SyncSwapPool";

const SYNCSWAP_PROTOCOL = "SyncSwap";
// Mint(address,uint256,uint256,uint256,address)
// Mint(address -> indexed sender,uint256,uint256,uint256,address -> indexed to)
const MINT_TOPIC =
  "0xa8137fff86647d8a402117b9c5dbda627f721d3773338fb9678c83e54ed39080";
// Burn(address,uint256,uint256,uint256,address)
const BURN_TOPIC =
  "0xd175a80c109434bb89948928ab2475a6647c94244cb70002197896423c883363";

// export function snapshot(block: ethereum.Block) {}

function lp2Amounts(
  reserves: SyncSwapPool__getReservesResult,
  lpAmount: BigInt,
  totalSupply: BigInt
): BigInt[] {
  return [
    reserves.value0.times(lpAmount).div(totalSupply),
    reserves.value1.times(lpAmount).div(totalSupply),
  ];
}

export function handleMint(event: Mint): void {
  const pool = SyncSwapPool.bind(event.address);
  const reserves = pool.getReserves();
  const totalSupply = pool.totalSupply();
  const token0 = pool.token0();
  const token1 = pool.token1();
  const inputTokens = [token0, token1];
  const receiverBalance = pool.balanceOf(event.params.to);
  savePositionChange(
    event, // event: ethereum.Event,
    SYNCSWAP_PROTOCOL, // protocol: string,
    pool._address, // investmentAddress: Address,
    event.params.to, // owner: Address,
    PositionChangeAction.Deposit, // action: PositionChangeAction,
    "", // tag: string,
    inputTokens, // inputTokens: Address[],
    [], // rewardTokens: Address[],
    [event.params.amount0, event.params.amount1], // dInput: BigInt[],
    [], // dReward: BigInt[],
    lp2Amounts(reserves, receiverBalance, totalSupply), // inputAmounts: BigInt[],
    [] // rewardAmounts: BigInt[]
  );
}

export function handleBurn(event: Burn): void {
  const pool = SyncSwapPool.bind(event.address);
  const reserves = pool.getReserves();
  const totalSupply = pool.totalSupply();
  const token0 = pool.token0();
  const token1 = pool.token1();
  const inputTokens = [token0, token1];
  const senderBalance = pool.balanceOf(event.params.sender);
  savePositionChange(
    event, // event: ethereum.Event,
    SYNCSWAP_PROTOCOL, // protocol: string,
    pool._address, // investmentAddress: Address,
    event.params.sender, // owner: Address,
    PositionChangeAction.Withdraw, // action: PositionChangeAction,
    "", // tag: string,
    inputTokens, // inputTokens: Address[],
    [], // rewardTokens: Address[],
    [event.params.amount0.neg(), event.params.amount1.neg()], // dInput: BigInt[],
    [], // dReward: BigInt[],
    lp2Amounts(reserves, senderBalance, totalSupply), // inputAmounts: BigInt[],
    [] // rewardAmounts: BigInt[]
  );
}

export function handleTransfer(event: Transfer): void {
  const pool = SyncSwapPool.bind(event.address);
  const reserves = pool.getReserves();
  const totalSupply = pool.totalSupply();
  const token0 = pool.token0();
  const token1 = pool.token1();
  const inputTokens = [token0, token1];

  const router = Address.fromHexString(dataSource.context().getString("router"));
  if (
    event.params.from.equals(Address.zero()) ||
    event.params.to.equals(Address.zero()) ||
    event.params.from.equals(router) ||
    event.params.to.equals(router)
  )
    return;

  const receipt = event.receipt;
  if (receipt == null) return;
  // Mint -> not in case
  const mintLogIndex = findIndexForTopic(receipt.logs, MINT_TOPIC);
  if (mintLogIndex == -1) return;
  // Burn -> not in case
  const burnLogIndex = findIndexForTopic(receipt.logs, BURN_TOPIC);
  if (burnLogIndex == -1) return;

  // Just Transfer
  const dInput = lp2Amounts(reserves, event.params.value, totalSupply);

  savePositionChange(
    event, // event: ethereum.Event,
    SYNCSWAP_PROTOCOL, // protocol: string,
    pool._address, // investmentAddress: Address,
    event.params.from, // owner: Address,
    PositionChangeAction.Send, // action: PositionChangeAction,
    "", // tag: string,
    inputTokens, // inputTokens: Address[],
    [], // rewardTokens: Address[],
    [dInput[0].neg(), dInput[1].neg()], // dInput: BigInt[],
    [], // dReward: BigInt[],
    lp2Amounts(reserves, pool.balanceOf(event.params.from), totalSupply), // inputAmounts: BigInt[],
    [] // rewardAmounts: BigInt[]
  );
  savePositionChange(
    event, // event: ethereum.Event,
    SYNCSWAP_PROTOCOL, // protocol: string,
    pool._address, // investmentAddress: Address,
    event.params.to, // owner: Address,
    PositionChangeAction.Receive, // action: PositionChangeAction,
    "", // tag: string,
    inputTokens, // inputTokens: Address[],
    [], // rewardTokens: Address[],
    dInput, // dInput: BigInt[],
    [], // dReward: BigInt[],
    lp2Amounts(reserves, pool.balanceOf(event.params.to), totalSupply), // inputAmounts: BigInt[],
    [] // rewardAmounts: BigInt[]
  );
}
