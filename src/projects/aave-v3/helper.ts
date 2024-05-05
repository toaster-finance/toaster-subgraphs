import { Address, dataSource } from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
  getInvestmentId,
} from "../../common/helpers/investmentHelper";
import { Investment } from "../../../generated/schema";
import { PoolDataProvider } from "../../../generated/Pool/PoolDataProvider";
/**
 * id: investment id  = "AaveV3{PoolAddress}{UnderlyingToken}"
 */
export class AaveV3Helper extends InvestmentHelper {
  /**
   *
   * @param pool Aave V3 Pool Contract Address
   * @param tag Underlying Token Address
   */
  constructor(pool: Address, tag: string) {
    super("AaveV3", pool, tag);
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    return new InvestmentInfo([Address.fromBytes(Address.fromHexString(this.tag))], []);
  }

  getAtokenAddress(underlying: Address, dataProviderAddress:Address): Address {
    const id = getInvestmentId("AaveV3", this.investmentAddress, this.tag);
    const investment = Investment.load(id);
    if (investment) return Address.fromHexString(investment.meta[0]);
    const poolDataProvider = PoolDataProvider.bind(dataProviderAddress);
    const aTokenAddress = poolDataProvider
      .getReserveTokensAddresses(underlying)
      .getATokenAddress();
    return aTokenAddress;
  }
}
