import { Address, dataSource} from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { PoolDataProvider } from "../../../generated/Pool/PoolDataProvider";
import { getContextAddress } from "../../common/helpers/contextHelper";
/**
 * id: investment id  = "AaveV3{PoolAddress}{UnderlyingToken}"
 */
export class AaveV3Helper extends InvestmentHelper {
  static protocolName: string = dataSource.context().getString("protocolName");
  /**
   *
   * @param pool Aave V3 Pool Contract Address
   * @param tag Underlying Token Address
   */
  constructor(pool: Address, tag: string) {
    super(AaveV3Helper.protocolName, pool, tag);
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    const underlyingAddr = Address.fromBytes(Address.fromHexString(this.tag));
    return new InvestmentInfo([underlyingAddr], [],[this.getAtokenAddress(underlyingAddr).toHexString()]);// [underlyingTokenAddr], [ ], [aTokenAddr]
  }

  getAtokenAddress(underlyingAddr: Address): Address {
    const dataProviderAddr = getContextAddress("dataProvider");
    const poolDataProvider = PoolDataProvider.bind(dataProviderAddr);
    const aTokenAddress = poolDataProvider
      .getReserveTokensAddresses(underlyingAddr)
      .getATokenAddress();
    return aTokenAddress;
  }
}
