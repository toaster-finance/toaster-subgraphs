import { Address, BigInt, Bytes, crypto, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { AmbientHelper, getAmbientInvestmentId } from "./helper";
import { Investment } from "../../../generated/schema";
import { AmbientDex, CrocMicroBurnAmbient, CrocMicroBurnRange, CrocMicroMintAmbient, CrocMicroMintRange, CrocWarmCmd } from "../../../generated/Ambient/AmbientDex";

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
  //Q. 이거 hash로 바꿀려고 하는데 프론트에서 문제가 있나?
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


export class CrocWarmCmdData {
  readonly token0: Address;
  readonly token1: Address;
  readonly poolIdx: BigInt;
  readonly tl: i32;
  readonly tu: i32;
  readonly liquidity: BigInt;
  readonly amount0Delta: BigInt;
  readonly amount1Delta: BigInt;
  readonly ambientDex: AmbientDex;
  readonly helper: AmbientHelper;

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

//emit CrocEvents.CrocMicroBurnAmbient
//input: (abi.encode(price, seed, conc, seedGrowth, concGrowth,liq, poolHash),
//output: abi.encode(baseFlow, quoteFlow, seedOut));
export class CrocMicroAmbientData {
  readonly baseFlow: BigInt;
  readonly quoteFlow: BigInt;
  readonly helper: AmbientHelper;

  readonly principals: AmbientPrincipal;
  readonly rewards: AmbientReward;
  constructor(
    event: ethereum.Event,
    investmentAddress: Address
  ) {
    const input = event.parameters[0].value.toBytes();
    const output = event.parameters[1].value.toBytes();
    const input_d = ethereum
      .decode(
        "(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)",
        input
      )!
      .toTuple();
    const output_d = ethereum
      .decode("(int128,int128,uint128)", output)!
      .toTuple();

    this.baseFlow = output_d[0].toBigInt();
    this.quoteFlow = output_d[1].toBigInt();

    // get investment from poolHash
    const poolHash = input_d[6].toBytes();
    const id = getAmbientInvestmentId(poolHash, investmentAddress);
    const investment = Investment.load(id)!;
    // get helper from investment
    this.helper = AmbientHelper.getHelperFromInvestmentTag(
      investment.tag,
      investmentAddress
    );
    //get reward & principal info
    this.principals = this.helper.getPrincipalInfo(
      event.transaction.from,
      AmbientHelper.AMBIENT_POSITION
    );
    this.rewards = this.helper.getRewardInfo(
      event.transaction.from,
      AmbientHelper.AMBIENT_POSITION
    );
  }
}
// emit CrocEvents.CrocMicroMintRange
// input: (abi.encode(price, priceTick, seed, conc, seedGrowth concGrowth,tl,tu,liq,poolHash),
// output: abi.encode(baseFlow, quoteFlow, concOut, seedOut));

// emit CrocEvents.CrocMicroBurnRange
// input: (abi.encode(price, priceTick, seed, conc, seedGrowth, concGrowth,tl, tu, liq, poolHash),
// output: abi.encode(baseFlow, quoteFlow, concOut, seedOut));
export class CrocMicroRangeData {
  readonly tl: i32;
  readonly tu: i32;
  readonly baseFlow: BigInt;
  readonly quoteFlow: BigInt;
  readonly helper: AmbientHelper;

  readonly principals: AmbientPrincipal;
  readonly rewards: AmbientReward;
  constructor(
    event: ethereum.Event,
    investmentAddress: Address
  ) {
    const input = event.parameters[0].value.toBytes();
    const output = event.parameters[1].value.toBytes();
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
    const id = getAmbientInvestmentId(poolHash, investmentAddress);
    const investment = Investment.load(id)!;
    // get helper from investment
    this.helper = AmbientHelper.getHelperFromInvestmentTag(
      investment.tag,
      investmentAddress
    );
    //get reward & principal info
    this.principals = this.helper.getPrincipalInfo(
      event.transaction.from,
      this.helper.tickToPositionTag(this.tl, this.tu)
    );
    this.rewards = this.helper.getRewardInfo(
      event.transaction.from,
      this.helper.tickToPositionTag(this.tl, this.tu)
    );
  }
} 

