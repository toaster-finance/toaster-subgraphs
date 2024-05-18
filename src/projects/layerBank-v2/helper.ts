import { lToken } from "./../../../generated/Core/lToken";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { Address, BigInt } from "@graphprotocol/graph-ts";

/**
 * id: investment id  = "LayerBankV2{lTokenAddress}{UnderlyingToken}"
 */
export class LayerBankV2Helper extends InvestmentHelper {
  static protocolName :string = "LayerBankV2";
  /**
   *
   * @param lToken LayerBankV2 V2 lToken Contract Address
   * @param tag ""
   */
  constructor(
    lToken: Address,
    readonly core: Address
  ) {
    super(LayerBankV2Helper.protocolName, lToken, "");
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    const underlying = this.getUnderlyingToken();
    return new InvestmentInfo([underlying], [], []);
  }

  getUnderlyingToken(): Address {
    const callResult = lToken.bind(this.investmentAddress).try_underlying();
    const lTokenAddress = callResult.reverted
      ? Address.zero()
      : callResult.value;
    return lTokenAddress;
  }

  getUnderlyingAmount(owner: Address): BigInt {
    const callResult = lToken.bind(this.investmentAddress).try_underlyingBalanceOf(owner)
    return callResult.reverted ? BigInt.fromI32(0) : callResult.value;
  }
  getBorrowedAmount(owner: Address): BigInt {
    return lToken.bind(this.investmentAddress).borrowBalanceOf(owner);
  }
}
