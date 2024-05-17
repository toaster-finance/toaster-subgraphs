import { lToken } from "./../../../generated/Core/lToken";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Address, BigInt } from "@graphprotocol/graph-ts";

/**
 * id: investment id  = "LayerBankV2{cTokenAddress}{UnderlyingToken}"
 */
export class LayerBankV2Helper extends InvestmentHelper {
  static protocolName = "LayerBankV2";
  /**
   *
   * @param cToken LayerBankV2 V2 cToken Contract Address
   * @param tag ""
   */
  constructor(
    cToken: Address,
    tag: string,
    readonly comptroller: Address,
    readonly compAddr: Address
  ) {
    super(LayerBankV2Helper.protocolName, cToken, tag);
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    const underlying = this.getUnderlyingToken();
    return new InvestmentInfo([underlying], [this.compAddr], []);
  }

  getUnderlyingToken(): Address {
    const callResult = lToken.bind(this.investmentAddress).try_underlying();
    const cTokenAddress = callResult.reverted
      ? Address.zero()
      : callResult.value;
    return cTokenAddress;
  }

  getUnderlyingAmount(owner: Address): BigInt {
    return lToken.bind(this.investmentAddress).underlyingBalanceOf(owner);
  }
  getBorrowedAmount(owner: Address): BigInt {
    return lToken.bind(this.investmentAddress).borrowBalanceOf(owner);
  }
}
