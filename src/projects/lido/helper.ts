import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Investment, Position } from "../../../generated/schema";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";

class BalanceState {
  // stETH Balance, in process of withdrawal request
  constructor(readonly bal: BigInt, readonly inRequest: BigInt) {}
}

class Totals {
  constructor(readonly eth: BigInt, readonly shares: BigInt) {}
}

export class RewardInfo {
  constructor(
    readonly eb: BigInt,
    readonly ea: BigInt,
    readonly sb: BigInt,
    readonly sa: BigInt
  ) {}
}

export const LIDO_PROTOCOL = "Lido";
export class LidoHelper extends InvestmentHelper {
  readonly ETH: Address = Address.zero();
  readonly WITHDRAWAL_NFT: Address = Address.fromBytes(
    Address.fromHexString("0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1")
  );

  constructor() {
    super(
      LIDO_PROTOCOL,
      Address.fromBytes(
        Address.fromHexString("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84")
      ),
      ""
    );
  }

  positionParams(
    owner: Address,
    afterETHBalance: BigInt,
    amtInWithdrawRequest: BigInt
  ): PositionParams {
    afterETHBalance = afterETHBalance.lt(BigInt.zero())
      ? BigInt.zero()
      : afterETHBalance;
    return new PositionParams(
      owner,
      "",
      PositionType.Invest,
      [afterETHBalance],
      [],
      afterETHBalance,
      [amtInWithdrawRequest.toString()]
    );
  }

  getInfo(_investmentAddress: Address): InvestmentInfo {
    return new InvestmentInfo([this.ETH], [], ["0", "0"]);
  }
  getProtocolMeta(): string[] {
    return []; // totalShare
  }

  amountInWithdrawRequest(position: Position): BigInt {
    return BigInt.fromString(position.meta[0]);
  }

  findPrevState(owner: Address): BalanceState {
    const dbPosition = this.findPosition(owner, "");

    let userBalance = BigInt.zero();
    let amtInWithdrawRequest = BigInt.zero();
    if (dbPosition) {
      userBalance = dbPosition.liquidity;
      amtInWithdrawRequest = this.amountInWithdrawRequest(dbPosition);
    }

    return new BalanceState(userBalance, amtInWithdrawRequest);
  }

  // totalETH, totalShares
  getTotalEthAndShares(i: Investment): Totals {
    return new Totals(
      BigInt.fromString(i.meta[0]),
      BigInt.fromString(i.meta[1])
    );
  }

  setTotalEthAndShares(
    i: Investment,
    totalETH: BigInt,
    totalShare: BigInt
  ): void {
    i.meta = [totalETH.toString(), totalShare.toString()];
    i.save();
  }

  /**
   * Reward process
   *
   * [Before reward] EB / SB = balance / reportShare
   * [After reward] EA / SA = (balance+reward) / reportShare
   *
   * known = EB, SB, EA, SA, balance
   * unknown = reward, reportShare
   *
   * reportShare = balance * SB / EB
   * (EA / SA) * reportShare = (balance+reward)
   * -> balance * (EA / SA) * SB / EB = (balance+reward)
   * -> balance * EA * SB / (EB * SA) = (balance+reward)
   *
   * reward = balance * (EA * SB - EB * SA) / (EB * SA)
   */
  calcReward(stBalance: BigInt, r: RewardInfo): BigInt {
    const reward = stBalance
      .times(r.ea.times(r.sb).minus(r.eb.times(r.sa)))
      .div(r.eb.times(r.sa));
    return reward;
  }
}
