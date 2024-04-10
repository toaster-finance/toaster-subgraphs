import { Protocol } from "./../../../generated/schema";
import {
  Address,
  BigInt,
  dataSource,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  AmbientDex,
  CrocColdCmd,
  CrocWarmCmd,
} from "../../../generated/Ambient/AmbientDex";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { AMBIENT_FINANCE, AmbientDetails, AmbientHelper } from "./helper";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { getProtocolId } from "../../common/helpers/investmentHelper";

export function handleWarmCmd(event: CrocWarmCmd): void {
  const inputs = event.params.input;
  const code = inputs[31];
  const ambientCode = decodeWarmPathCode(code);
  if (ambientCode == AmbientCode.Error) return;
  const params = ethereum
    .decode(
      "(uint8,address,address,uint256,int24,int24,uint128,uint128,uint128,uint8,address)",
      inputs
    )!
    .toTuple();
  const extract = new UserCmdData(event, params);
  extract.helper.getOrCreateInvestment(event.block);
  const principals = extract.helper.getPrincipalInfo(event.transaction.from, extract.helper.tickToPositionTag(extract.tl, extract.tu));
  const rewards = extract.helper.getRewardInfo(event.transaction.from, extract.helper.tickToPositionTag(extract.tl, extract.tu));
  let changeAction: PositionChangeAction = PositionChangeAction.Deposit;
  let inputAmountDelta: BigInt[] = [];
  let rewardAmountDelta: BigInt[] = [];
  let tag: string = "";
  // (uint8 code, address base, address quote, uint256 poolIdx,int24 bidTick, int24 askTick, uint128 liq,uint128 limitLower, uint128 limitHigher,uint8 reserveFlags, address lpConduit)
  switch (ambientCode) {
    case AmbientCode.MintRange:
      changeAction = PositionChangeAction.Deposit;
      inputAmountDelta = [extract.amount0Delta, extract.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = extract.helper.tickToPositionTag(extract.tl, extract.tu);
      break;
    case AmbientCode.BurnRange:
      changeAction = PositionChangeAction.Withdraw;
      inputAmountDelta = [extract.amount0Delta, extract.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = extract.helper.tickToPositionTag(extract.tl, extract.tu);
      break;
    case AmbientCode.MintAmbient:
      changeAction = PositionChangeAction.Deposit;
      inputAmountDelta = [extract.amount0Delta, extract.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = "0_0";//ambient
      break;
    case AmbientCode.BurnAmbient:
      changeAction = PositionChangeAction.Withdraw;
      inputAmountDelta = [extract.amount0Delta, extract.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = "0_0";//ambient
      break;
    case AmbientCode.Harvest:
      changeAction = PositionChangeAction.Harvest;
      inputAmountDelta = [BigInt.zero(), BigInt.zero()];
      rewardAmountDelta = [extract.amount0Delta, extract.amount1Delta];
      tag =
        extract.tl === 0 && extract.tu === 0
          ? extract.helper.tickToPositionTag(extract.tl, extract.tu)
          : "0_0";//ambient
      break;
    default:
      break;
  }
  if(inputAmountDelta[0] === BigInt.zero() && inputAmountDelta[1] === BigInt.zero() && rewardAmountDelta[0] === BigInt.zero() && rewardAmountDelta[1] === BigInt.zero()) return;
  if (tag) {
    savePositionChange(
      event,
      changeAction,
      extract.helper,
      new PositionParams(
        event.transaction.from,
        extract.helper.tickToPositionTag(extract.tl, extract.tu), // tag
        PositionType.Invest, // type
        [principals.amount0, principals.amount1], // inputAmounts
        [rewards.amount0, rewards.amount1], // rewardAmounts
        principals.liquidity, // liquidity
        []
      ),
      inputAmountDelta, // inputAmountsDelta
      rewardAmountDelta // rewardAmountsDelta
    );
  }
}
export function handleColdCmd(
  event: CrocColdCmd
): void {
  const initPoolCode = 71;
  const inputs = event.params.input;  
  const cmdCode = inputs[31];
  if (cmdCode === initPoolCode) {
    const params = ethereum
      .decode("(uint8,address,address,uint256,uint128)", inputs)!
      .toTuple();
    const base = params[1].toAddress();
    const quote = params[2].toAddress();
    const poolIdx = params[3].toBigInt();
    const helper = new AmbientHelper(
      dataSource.address(),
      new AmbientDetails(base, quote, poolIdx.toString())
    );
    // create investment for the new pool
    helper.getOrCreateInvestment(event.block);
  }
}
export function handleBlock(block: ethereum.Block): void {
  const protocol = Protocol.load(getProtocolId(AMBIENT_FINANCE));
  if (!protocol) return;

  const investments = protocol.investments.load();
  const batch = dataSource.context().getI32("snapshotBatch");
  const pool = AmbientDex.bind(dataSource.address());
  const protocolInit = protocol._batchIterator.toI32();
  
  for (let i = protocolInit; i < investments.length; i+= batch) {
    const investment = investments[i];
    const token0 = investment.inputTokens[0].toHexString();
    const token1 = investment.inputTokens[1].toHexString();
    const helper = new AmbientHelper(
      pool._address,
      new AmbientDetails(
        Address.fromString(token0),
        Address.fromString(token1),
        investment.meta[0]
      )
    );
    // ?? 만약 투자처 하나도 20분을 넘으면 어카지??
    const positions = investment.positions.load();
    for (let i = 0; i < positions.length; i += 1) {
      const position = positions[i];
      if (position.closed) continue;
      // const ticks = helper.tagToTicks(position.tag);
      const principals = helper.getPrincipalInfo(
        Address.fromBytes(position.owner),
        position.tag
      );
      const rewards = helper.getRewardInfo(
        Address.fromBytes(position.owner),
        position.tag
      );
      savePositionSnapshot(
        block,
        helper,
        new PositionParams(
          Address.fromBytes(position.owner),
          position.tag,
          PositionType.Invest,
          [principals.amount0, principals.amount1],
          [rewards.amount0, rewards.amount1],
          principals.liquidity,
          []
        )
      );
      position.save();
    }
  }
  protocol._batchIterator = BigInt.fromI32((protocolInit + 1) % batch);
  protocol.save();
}
class UserCmdData {
  token0: Address;
  token1: Address;
  poolIdx: BigInt;
  tl: i32;
  tu: i32;
  liquidity: BigInt;
  amount0Delta: BigInt;
  amount1Delta: BigInt;
  ambientDex: AmbientDex;
  helper: AmbientHelper;

  constructor(event: CrocWarmCmd, params: ethereum.Tuple) {
    this.token0 = params[1].toAddress();
    this.token1 = params[2].toAddress();
    this.poolIdx = params[3].toBigInt();
    this.tl = params[4].toI32();
    this.tu = params[5].toI32();
    this.liquidity = params[6].toBigInt();
    this.amount0Delta = event.params.baseFlow; // + : add baseFlow to the pool , - : remove baseFlow from the pool
    this.amount1Delta = event.params.quoteFlow;
    this.ambientDex = AmbientDex.bind(dataSource.address());
    this.helper = new AmbientHelper(
      this.ambientDex._address,
      new AmbientDetails(this.token0, this.token1, this.poolIdx.toString())
    );
  }
}
enum AmbientCode {
  MintRange = 1,
  BurnRange = 2,
  MintAmbient = 3,
  BurnAmbient = 4,
  Harvest = 5,
  Error = -1,
}
export function decodeWarmPathCode(code: i32): AmbientCode {
  switch (code) {
    case 1:
    case 11:
    case 12:
      return AmbientCode.MintRange;
    case 2:
    case 21:
    case 22:
      return AmbientCode.BurnRange;
    case 3:
    case 31:
    case 32:
      return AmbientCode.MintAmbient;
    case 4:
    case 41:
    case 42:
      return AmbientCode.BurnAmbient;
    case 5:
      return AmbientCode.Harvest;
    default:
      return AmbientCode.Error;
  }
}
