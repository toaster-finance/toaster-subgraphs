import {
  Address,
  BigInt,
  Bytes,
  crypto,
  dataSource,
  ethereum,
  log,
} from "@graphprotocol/graph-ts";
import { AmbientHelper } from "./helper";
import { Investment } from "../../../generated/schema";
import {
  AmbientDex,
  CrocMicroBurnAmbient,
  CrocMicroBurnRange,
  CrocMicroMintAmbient,
  CrocMicroMintRange,
  CrocWarmCmd,
} from "../../../generated/Ambient/AmbientDex";
export enum AmbientInvestment {
  NOT_FOUND,
  FOUND,
}
export class AmbientSnapshot {
  constructor(
    readonly principal: AmbientPrincipal,
    readonly reward: AmbientReward
  ) {}
}
export class AmbientPrincipal {
  constructor(
    readonly amount0: BigInt,
    readonly amount1: BigInt,
    readonly liquidity: BigInt
  ) {}
}
export class AmbientReward {
  constructor(readonly amount0: BigInt, readonly amount1: BigInt) {}
}

export class AmbientDetails {
  constructor(
    readonly token0: Address,
    readonly token1: Address,
    readonly poolIdx: string
  ) {
    if (token0.toHexString() > token1.toHexString())
      throw new Error("token0 should be less than token1");
  }
  toTag(): string {
    return [
      this.token0.toHexString(),
      this.token1.toHexString(),
      this.poolIdx,
    ].join("_");
  }
  getPoolHash(): Bytes {
    const tupleArray: Array<ethereum.Value> = [
      ethereum.Value.fromAddress(this.token0),
      ethereum.Value.fromAddress(this.token1),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString(this.poolIdx)),
    ];
    const encoded = ethereum.encode(
      ethereum.Value.fromTuple(changetype<ethereum.Tuple>(tupleArray))
    )!;
    return changetype<Bytes>(crypto.keccak256(encoded));
  }
}

export class WarmCmdEventData {
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

// emit CrocEvents.CrocMicroMintAmbient
// input: abi.encode(price, seed, conc, seedGrowth, concGrowth,liq, poolHash),
// output: abi.encode(baseFlow, quoteFlow, seedOut));
export class MicroMintAmbientEventData {
  baseFlow: BigInt;
  quoteFlow: BigInt;
  helper: AmbientHelper;
  principals: AmbientPrincipal;
  rewards: AmbientReward;
  constructor(event: CrocMicroMintAmbient, investmentAddress: Address) {
    const input = event.params.input;
    const output = event.params.output;
    const input_d = ethereum
      .decode("(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)", input)!
      .toTuple();
    const output_d = ethereum
      .decode("(int128,int128,uint128)", output)!
      .toTuple();

    this.baseFlow = output_d[0].toBigInt();
    this.quoteFlow = output_d[1].toBigInt();
    const liq = input_d[5].toBigInt();
    // get investment from poolHash
    const poolHash = input_d[6].toBytes();
    const id = AmbientHelper.getAmbientInvestmentId(
      poolHash,
      investmentAddress
    );
    const investment = Investment.load(id);
    if (!investment) throw new Error("Investment not found");
    // get helper from investment
    this.helper = AmbientHelper.getHelperFromInvestmentTag(
      investment.tag,
      investmentAddress
    );
    const crocSwapDex = dataSource.address();
    if (!event.transaction.to) throw new Error("Unreachable error");
    const owner = event.transaction.to!.equals(crocSwapDex)
    ? event.transaction.from
    : event.transaction.to;
    
    const position = this.helper.findPosition(
      owner!,
      AmbientHelper.AMBIENT_POSITION
    );
    if (position) {
      //get reward & principal info
      this.principals = this.helper.getPrincipalInfo(
        owner!,
        AmbientHelper.AMBIENT_POSITION
      );
      this.rewards = this.helper.getRewardInfo(
        owner!,
        AmbientHelper.AMBIENT_POSITION
      );
    } else {
      this.principals = new AmbientPrincipal(
        this.baseFlow,
        this.quoteFlow,
        liq
      );
      this.rewards = new AmbientReward(BigInt.fromI32(0), BigInt.fromI32(0));
    }
  }
}
//emit CrocEvents.CrocMicroBurnAmbient
//input: (abi.encode(price, seed, conc, seedGrowth, concGrowth,liq, poolHash),
//output: abi.encode(baseFlow, quoteFlow, seedOut));
export class MicroBurnAmbientEventData {
  baseFlow: BigInt;
  quoteFlow: BigInt;
  helper: AmbientHelper;
  principals: AmbientPrincipal;
  rewards: AmbientReward;
  constructor(event: CrocMicroBurnAmbient, investmentAddress: Address) {
    const input = event.params.input;
    const output = event.params.output;
    const input_d = ethereum
      .decode("(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)", input)!
      .toTuple();
    const output_d = ethereum
      .decode("(int128,int128,uint128)", output)!
      .toTuple();

    this.baseFlow = output_d[0].toBigInt();
    this.quoteFlow = output_d[1].toBigInt();
    // get investment from poolHash
    const poolHash = input_d[6].toBytes();
    const id = AmbientHelper.getAmbientInvestmentId(
      poolHash,
      investmentAddress
    );

    const investment = Investment.load(id);
    if (!investment) throw new Error("Investment not found");
    // get helper from investment
    this.helper = AmbientHelper.getHelperFromInvestmentTag(
      investment.tag,
      investmentAddress
    );
    const crocSwapDex = dataSource.address();
    if (!event.transaction.to) throw new Error("Unreachable error");
    const owner = event.transaction.to!.equals(crocSwapDex)
      ? event.transaction.from
      : event.transaction.to;
    
    const position = this.helper.findPosition(
      owner!,
      AmbientHelper.AMBIENT_POSITION
    );
    if (!position) log.warning("Owner = {}", [owner!.toHexString()]);
    //get reward & principal info
    this.principals = this.helper.getPrincipalInfo(
      owner!,
      AmbientHelper.AMBIENT_POSITION
    );
    this.rewards = new AmbientReward(BigInt.fromI32(0), BigInt.fromI32(0));
  }
}
// emit CrocEvents.CrocMicroMintRange
// input: (abi.encode(price, priceTick, seed, conc, seedGrowth concGrowth,tl,tu,liq,poolHash),
// output: abi.encode(baseFlow, quoteFlow, concOut, seedOut));

export class MicroMintRangeEventData {
  tl: i32;
  tu: i32;
  baseFlow: BigInt;
  quoteFlow: BigInt;
  helper: AmbientHelper;
  principals: AmbientPrincipal;
  rewards: AmbientReward;
  constructor(event: CrocMicroMintRange, investmentAddress: Address) {
    const input = event.params.input;
    const output = event.params.output;
    const input_d = ethereum
      .decode(
        "(uint128,uint128,uint128,uint128,uint64,uint64,int24,int24,uint128,bytes32)",
        input
      )!
      .toTuple();
    const output_d = ethereum
      .decode("(int128,int128,uint128,uint128)", output)!
      .toTuple();
    this.tl = input_d[6].toI32();
    this.tu = input_d[7].toI32();
    this.baseFlow = output_d[0].toBigInt();
    this.quoteFlow = output_d[1].toBigInt();
    const liq = input_d[8].toBigInt();

    // get investment from poolHash
    const poolHash = input_d[9].toBytes();
    const id = AmbientHelper.getAmbientInvestmentId(
      poolHash,
      investmentAddress
    );
    const investment = Investment.load(id);
    if (!investment) throw new Error("Investment not found");
    // get helper from investment
    this.helper = AmbientHelper.getHelperFromInvestmentTag(
      investment.tag,
      investmentAddress
    );
    const crocSwapDex = dataSource.address();
    if (!event.transaction.to) throw new Error("Unreachable error");
    const owner = event.transaction.to!.equals(crocSwapDex)
      ? event.transaction.from
      : event.transaction.to;

    const posTag = this.helper.tickToPositionTag(this.tl, this.tu);
    const position = this.helper.findPosition(owner!, posTag);
    if (position) {
      //get reward & principal info
      this.principals = this.helper.getPrincipalInfo(owner!, posTag);
      this.rewards = this.helper.getRewardInfo(owner!, posTag);
    } else {
      this.principals = new AmbientPrincipal(
        this.baseFlow,
        this.quoteFlow,
        liq
      );
      this.rewards = new AmbientReward(BigInt.fromI32(0), BigInt.fromI32(0));
    }
  }
}
// emit CrocEvents.CrocMicroBurnRange
// input: (abi.encode(price, priceTick, seed, conc, seedGrowth, concGrowth,tl, tu, liq, poolHash),
// output: abi.encode(baseFlow, quoteFlow, concOut, seedOut));
export class MicroBurnRangeEventData {
  tl: i32;
  tu: i32;
  baseFlow: BigInt;
  quoteFlow: BigInt;
  helper: AmbientHelper;
  principals: AmbientPrincipal;
  rewards: AmbientReward;
  constructor(event: CrocMicroBurnRange, investmentAddress: Address) {
    const input = event.params.input;
    const output = event.params.output;
    const input_d = ethereum
      .decode(
        "(uint128,uint128,uint128,uint128,uint64,uint64,int24,int24,uint128,bytes32)",
        input
      )!
      .toTuple();
    const output_d = ethereum
      .decode("(int128,int128,uint128,uint128)", output)!
      .toTuple();
    this.tl = input_d[6].toI32();
    this.tu = input_d[7].toI32();
    this.baseFlow = output_d[0].toBigInt();
    this.quoteFlow = output_d[1].toBigInt();

    // get investment from poolHash
    const poolHash = input_d[9].toBytes();
    const id = AmbientHelper.getAmbientInvestmentId(
      poolHash,
      investmentAddress
    );
    const investment = Investment.load(id);
    if (!investment) throw new Error("Investment not found");
    // get helper from investment
    this.helper = AmbientHelper.getHelperFromInvestmentTag(
      investment.tag,
      investmentAddress
    );
    const posTag = this.helper.tickToPositionTag(this.tl, this.tu);
    const crocSwapDex = dataSource.address();
    if (!event.transaction.to) throw new Error("Unreachable error");
    const owner =
      event.transaction.to!.equals(crocSwapDex)
        ? event.transaction.from
        : event.transaction.to;
    const position = this.helper.findPosition(owner!, posTag);
    if (!position) log.warning("Owner = {}", [owner!.toHexString()]);
      
    
    //get reward & principal info
    this.principals = this.helper.getPrincipalInfo(owner!, posTag);

    this.rewards = new AmbientReward(BigInt.fromI32(0), BigInt.fromI32(0));
  }
}