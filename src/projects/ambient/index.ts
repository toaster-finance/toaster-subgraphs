import { Position, Protocol } from "./../../../generated/schema";
import {
  Address,
  BigInt,
  dataSource,
  ethereum,
  log,
} from "@graphprotocol/graph-ts";
import {
  AmbientDex,
  CrocColdCmd,
  CrocMicroBurnAmbient,
  CrocMicroBurnRange,
  CrocMicroMintAmbient,
  CrocMicroMintRange,
  CrocWarmCmd,
} from "../../../generated/Ambient/AmbientDex";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { AMBIENT_FINANCE, AmbientHelper } from "./helper";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { getProtocolId } from "../../common/helpers/investmentHelper";
import {
  AmbientDetails,
  AmbientPrincipal,
  AmbientReward,
  MicroBurnAmbientEventData,
  MicroBurnRangeEventData,
  MicroMintAmbientEventData,
  MicroMintRangeEventData,
  WarmCmdEventData,
} from "./type";
import { matchAddress } from "../../common/matchAddress";
//docs.ambient.finance/developers/dex-contract-interface/knockout-lp-calls

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
  const data = new WarmCmdEventData(event, params);
  const positionTag = data.helper.tickToPositionTag(data.tl, data.tu);

  const owner = findOwner(event);
  if (!matchAddress(owner)) return;

  const positionId = data.helper.getInvestPositionId(owner, positionTag);
  const position = Position.load(positionId);
  let principals: AmbientPrincipal;
  let rewards: AmbientReward;
  let changeAction: PositionChangeAction = PositionChangeAction.Deposit;
  let inputAmountDelta: BigInt[] = [];
  let rewardAmountDelta: BigInt[] = [];
  let tag: string = "";

  // (uint8 code, address base, address quote, uint256 poolIdx,int24 bidTick, int24 askTick, uint128 liq,uint128 limitLower, uint128 limitHigher,uint8 reserveFlags, address lpConduit)
  switch (ambientCode) {
    case AmbientCode.MintRange:
      changeAction = PositionChangeAction.Deposit;
      inputAmountDelta = [data.amount0Delta, data.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = data.helper.tickToPositionTag(data.tl, data.tu);
      if (position) {
        principals = data.helper.getPrincipalInfo(
          event.transaction.from,
          positionTag
        );
        rewards = data.helper.getRewardInfo(
          event.transaction.from,
          positionTag
        );
      } else {
        principals = new AmbientPrincipal(
          data.amount0Delta,
          data.amount1Delta,
          data.liquidity
        );
        rewards = new AmbientReward(BigInt.zero(), BigInt.zero());
      }
      break;
    case AmbientCode.BurnRange:
      changeAction = PositionChangeAction.Withdraw;
      inputAmountDelta = [data.amount0Delta, data.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = data.helper.tickToPositionTag(data.tl, data.tu);
      if (!position) {
        log.warning("Unreachable: Invalid Position", [
          event.transaction.hash.toHexString(),
        ]);
        return;
      }

      principals = data.helper.getPrincipalInfo(
        event.transaction.from,
        positionTag
      );
      rewards = new AmbientReward(BigInt.zero(), BigInt.zero());

      break;
    case AmbientCode.MintAmbient:
      changeAction = PositionChangeAction.Deposit;
      inputAmountDelta = [data.amount0Delta, data.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = AmbientHelper.AMBIENT_POSITION; //ambient

      if (position) {
        principals = data.helper.getPrincipalInfo(
          event.transaction.from,
          positionTag
        );
        rewards = data.helper.getRewardInfo(
          event.transaction.from,
          positionTag
        );
      } else {
        principals = new AmbientPrincipal(
          data.amount0Delta,
          data.amount1Delta,
          data.liquidity
        );
        rewards = new AmbientReward(BigInt.zero(), BigInt.zero());
      }
      break;
    case AmbientCode.BurnAmbient:
      changeAction = PositionChangeAction.Withdraw;
      inputAmountDelta = [data.amount0Delta, data.amount1Delta];
      rewardAmountDelta = [BigInt.zero(), BigInt.zero()];
      tag = AmbientHelper.AMBIENT_POSITION; //ambient
      if (!position) {
        log.warning("Unreachable: Invalid Position tx: {}", [
          event.transaction.hash.toHexString(),
        ]);
        return;
      }

      principals = data.helper.getPrincipalInfo(
        event.transaction.from,
        positionTag
      );
      rewards = new AmbientReward(BigInt.zero(), BigInt.zero());
      break;
    case AmbientCode.Harvest:
      changeAction = PositionChangeAction.Harvest;
      inputAmountDelta = [BigInt.zero(), BigInt.zero()];
      rewardAmountDelta = [data.amount0Delta, data.amount1Delta];
      tag = data.helper.tickToPositionTag(data.tl, data.tu);
      if (!position) {
        log.warning("Unreachable: Invalid Position tx: {}", [
          event.transaction.hash.toHexString(),
        ]);
        return;
      }
      principals = data.helper.getPrincipalInfo(
        event.transaction.from,
        positionTag
      );
      rewards = data.helper.getRewardInfo(event.transaction.from, positionTag);
      break;
    default:
      log.warning("Unreachable: Invalid Position tx: {}", [
        event.transaction.hash.toHexString(),
      ]);
      return;
  }
  savePositionChange(
    event,
    changeAction,
    data.helper,
    new PositionParams(
      owner,
      data.helper.tickToPositionTag(data.tl, data.tu), // tag
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
// emit CrocEvents.CrocMicroMintRange(abi.encode(price, priceTick, seed, conc, seedGrowth, concGrowth,tl, tu, liq, poolHash), abi.encode(baseFlow, quoteFlow, concOut, seedOut));
export function handleMicroMintRange(event: CrocMicroMintRange): void {
  const invetmentAddress = dataSource.address();
  const data = new MicroMintRangeEventData(event, invetmentAddress);

  const owner = findOwner(event);
  if (!matchAddress(owner)) return;

  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    data.helper,
    new PositionParams(
      owner,
      data.helper.tickToPositionTag(data.tl, data.tu), // tag
      PositionType.Invest, // type
      [data.principals.amount0, data.principals.amount1], // inputAmounts
      [data.rewards.amount0, data.rewards.amount1], // rewardAmounts
      data.principals.liquidity, // liquidity
      []
    ),
    [data.baseFlow, data.quoteFlow], // inputAmountsDelta
    [BigInt.zero(), BigInt.zero()] // rewardAmountsDelta
  );
}

export function handleMicroBurnRange(event: CrocMicroBurnRange): void {
  const invetmentAddress = dataSource.address();
  const data = new MicroBurnRangeEventData(event, invetmentAddress);

  const owner = findOwner(event);
  if (!matchAddress(owner)) return;
  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    data.helper,
    new PositionParams(
      owner,
      data.helper.tickToPositionTag(data.tl, data.tu), // tag
      PositionType.Invest, // type
      [data.principals.amount0, data.principals.amount1], // inputAmounts
      [data.rewards.amount0, data.rewards.amount1], // rewardAmounts
      data.principals.liquidity, // liquidity
      []
    ),
    [data.baseFlow, data.quoteFlow], // inputAmountsDelta
    [BigInt.zero(), BigInt.zero()] // rewardAmountsDelta
  );
}
// emit CrocEvents.CrocMicroMintAmbient(abi.encode(price, seed, conc, seedGrowth, concGrowth,liq, poolHash), abi.encode(baseFlow, quoteFlow, seedOut));
export function handleMicroMintAmbient(event: CrocMicroMintAmbient): void {
  const invetmentAddress = dataSource.address();
  const data = new MicroMintAmbientEventData(event, invetmentAddress);

  const owner = findOwner(event);
  if (!matchAddress(owner)) return;
  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    data.helper,
    new PositionParams(
      owner,
      AmbientHelper.AMBIENT_POSITION, // tag
      PositionType.Invest, // type
      [data.principals.amount0, data.principals.amount1], // inputAmounts
      [data.rewards.amount0, data.rewards.amount1], // rewardAmounts
      data.principals.liquidity, // liquidity
      []
    ),
    [data.baseFlow, data.quoteFlow], // inputAmountsDelta
    [BigInt.zero(), BigInt.zero()] // rewardAmountsDelta
  );
}
export function handleMicroBurnAmbient(event: CrocMicroBurnAmbient): void {
  const invetmentAddress = dataSource.address();
  const data = new MicroBurnAmbientEventData(event, invetmentAddress);

  const owner = findOwner(event);
  if (!matchAddress(owner)) return;

  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    data.helper,
    new PositionParams(
      owner,
      AmbientHelper.AMBIENT_POSITION, // tag
      PositionType.Invest, // type
      [data.principals.amount0, data.principals.amount1], // inputAmounts
      [data.rewards.amount0, data.rewards.amount1], // rewardAmounts
      data.principals.liquidity, // liquidity
      []
    ),
    [data.baseFlow, data.quoteFlow], // inputAmountsDelta
    [BigInt.zero(), BigInt.zero()] // rewardAmountsDelta
  );
}
export function handleColdCmd(event: CrocColdCmd): void {
  const initPoolCode = 71;
  const inputs = event.params.input;
  const cmdCode = inputs[31];
  if (cmdCode == initPoolCode) {
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
  const startSnapshotBlock = dataSource.context().getI32("startSnapshotBlock");
  if (block.number < BigInt.fromI32(startSnapshotBlock)) return;
  const pool = AmbientDex.bind(dataSource.address());
  const protocolInit = protocol._batchIterator.toI32();
  for (let i = protocolInit; i < investments.length; i += batch) {
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

    const positions = investment.positions.load();
    for (let j = 0; j < positions.length; j += 1) {
      const position = positions[j];
      if (position.closed) continue;
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
    }
  }
  protocol._batchIterator = BigInt.fromI32((protocolInit + 1) % batch);
  protocol.save();
}

enum AmbientCode {
  MintRange = 1,
  BurnRange = 2,
  MintAmbient = 3,
  BurnAmbient = 4,
  Harvest = 5,
  Error = -1,
}
//https://docs.ambient.finance/developers/dex-contract-interface/flat-lp-calls
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

function findOwner(event: ethereum.Event): Address {
  const to = event.transaction.to;
  if (!to) throw new Error("Unreachable error");

  const crocSwapDex = dataSource.address();
  return to.equals(crocSwapDex) ? event.transaction.from : to;
}

// export function handleCrocKnockout(event: CrocKnockoutCmd): void {
//   const inputs = event.params.input;
//   const code = inputs[31];
//   const isMint = code == 91;
//   const isBurn = code == 92;

//   let params: ethereum.Tuple =
//     isMint || isBurn
//       ? ethereum
//           .decode(
//             "(uint8,address,address,uint256,int24,int24,bool,uint8,uint256,uint256,uint128,bool)",
//             inputs
//           )!
//           .toTuple()
//       : ethereum
//           .decode(
//             "(uint8,address,address,uint256,int24,int24,bool,uint8,uint256,uint256,uint32)",
//             inputs
//           )!
//           .toTuple();
//   const base = params[1].toAddress();
//   const quote = params[2].toAddress();
//   const poolIdx = params[3].toBigInt();
//   const details = new AmbientDetails(base, quote, poolIdx.toString());
//   const bidTick = params[4].toI32();
//   const askTick = params[5].toI32();
//   const helper = new AmbientHelper(dataSource.address(), details);
//   const posTag = helper.tickToPositionTag(bidTick, askTick) + "_" + "knock";
//   savePositionChange(
//     event,
//     isMint
//       ? PositionChangeAction.Deposit
//       : isBurn
//       ? PositionChangeAction.Withdraw
//       : PositionChangeAction.Harvest,
//     helper,
//     new PositionParams(
//       event.transaction.from,
//       posTag, // tag
//       PositionType.Invest, // type
//       [BigInt.zero(), BigInt.zero()], // inputAmounts
//       [BigInt.zero(), BigInt.zero()], // rewardAmounts
//       BigInt.zero(), // liquidity
//       []
//     ),
//     [BigInt.zero(), BigInt.zero()], // inputAmountsDelta
//     [BigInt.zero(), BigInt.zero()] // rewardAmountsDelta
//   );
// }
