
import { AmbientQuery } from './../../../generated/Ambient/AmbientQuery';
import { Address, BigInt, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { getContextAddress } from '../../common/helpers/contextHelper';

export const AMBIENT_FINANCE = "ambient";

export class AmbientDetails {
  constructor(
    readonly token0: Address,
    readonly token1: Address,
    readonly poolIdx: string
  ) {
    if (token0.toHexString() > token1.toHexString()) throw new Error("token0 should be less than token1");
  }

  toTag(): string {
    return [this.token0.toHexString(), this.token1.toHexString(), this.poolIdx].join("_");
  }
}
export class AmbientSnapshot {
  constructor(readonly principal: AmbientPrincipal, readonly reward: AmbientReward) {}

}
export class AmbientPrincipal {
  constructor(readonly amount0: BigInt, readonly amount1: BigInt,readonly liquidity: BigInt) {}
}
export class AmbientReward {
  constructor(readonly amount0: BigInt, readonly amount1: BigInt) {}
}
export class AmbientHelper extends InvestmentHelper {
  constructor(investmentAddress: Address, readonly details: AmbientDetails) {
    super(AMBIENT_FINANCE, investmentAddress, details.toTag());
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_investmentAddress: Address): InvestmentInfo {
    const token0 = this.details.token0;
    const token1 = this.details.token1;
    return new InvestmentInfo(
      [token0, token1],
      [token0, token1],
      [this.details.poolIdx]
    );
  }
  getPrincipalInfo(owner: Address, tag: string): AmbientPrincipal {
    const query = AmbientQuery.bind(getContextAddress("ambientQuery"));
    const ticks = this.tagToTicks(tag);
    if(tag === "0_0"){
      const principals = query.queryAmbientTokens(
        owner,
        this.details.token0,
        this.details.token1,
        BigInt.fromString(this.details.poolIdx)
      );
      return new AmbientPrincipal(
        principals.getBaseQty(),
        principals.getQuoteQty(),
        principals.getLiq()
      ); //amount0,amount1,liquidity,
    } else {
      const principals = query.queryRangeTokens(
        owner,
        this.details.token0,
        this.details.token1,
        BigInt.fromString(this.details.poolIdx),
        ticks[0],
        ticks[1]
      );
      return new AmbientPrincipal(
        principals.getBaseQty(),
        principals.getQuoteQty(),
        principals.getLiq()
      ); //amount0,amount1,liquidity,
    }
    
  }
  getRewardInfo(owner: Address, tag: string): AmbientReward {
    const query = AmbientQuery.bind(getContextAddress("ambientQuery"));

    if(tag === "0_0"){
      return new AmbientReward(BigInt.zero(),BigInt.zero()); //amount0,amount1
    } else {
      const ticks = this.tagToTicks(tag);
      const rewards = query.queryConcRewards(
        owner,
        this.details.token0,
        this.details.token1,
        BigInt.fromString(this.details.poolIdx),
        ticks[0],
        ticks[1]
      );
      return new AmbientReward(rewards.getBaseRewards(),rewards.getQuoteRewards()); //amount0,amount1
    };

  }


  getPositionFromSnapshot(block: ethereum.Block, tag: string): AmbientSnapshot {
    const investment = this.getOrCreateInvestment(block);
    const positions = investment.positions.load();
    for (let i = 0; i <  positions.length; i++) {
      if (positions[i].tag == tag) {
        return new AmbientSnapshot(new AmbientPrincipal(positions[i].amounts[0], positions[i].amounts[1],positions[i].liquidity),new AmbientReward(positions[i].amounts[2], positions[i].amounts[3])); 
      }
    }
    return new AmbientSnapshot(new AmbientPrincipal(BigInt.fromI32(0), BigInt.fromI32(0),BigInt.fromI32(0)),new AmbientReward(BigInt.fromI32(0), BigInt.fromI32(0)));
  }
  tickToPositionTag(tickLower: i32, tickUpper: i32) : string {
    return tickLower.toString() + "_" + tickUpper.toString();
  }
  tagToTicks(tag: string): i32[] {
    return tag.split("_").map<i32>((x) => BigInt.fromString(x).toI32());
  }
}

