import {
  Address,
  Bytes,
  dataSource,
  DataSourceContext,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { PoolDataProvider } from "../../../generated/Pool/PoolDataProvider";
import { getContextAddress } from "../../common/helpers/contextHelper";
import { Investment } from "../../../generated/schema";
import { aToken } from "../../../generated/templates";
import { PoolAddressProvider } from "../../../generated/Pool/PoolAddressProvider";

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
  constructor(pool: Address, underlying: Address) {
    super(AaveV3Helper.protocolName, pool, underlying.toHexString());
  }
  getProtocolMeta(): string[] {
    return [];
  }
  getInfo(_invest: Address): InvestmentInfo {
    const underlyingAddr = Address.fromBytes(Address.fromHexString(this.tag));
    return new InvestmentInfo(
      [underlyingAddr],
      [],
      [this.getAtoken(underlyingAddr).toHexString()]
    ); // [underlyingTokenAddr], [ ], [aTokenAddr]
  }

  getOrCreateInvestment(block: ethereum.Block): Investment {
    let investment = Investment.load(this.id);
    if (!investment) {
      const protocol = this.getProtocol(block);
      const info = this.getInfo(this.investmentAddress);
      investment = new Investment(this.id);
      investment.protocol = protocol.id;
      investment.address = this.investmentAddress;
      investment.inputTokens = info.inputTokens.map<Bytes>((addr) =>
        Bytes.fromHexString(addr.toHexString())
      );
      investment.rewardTokens = info.rewardTokens.map<Bytes>((addr) =>
        Bytes.fromHexString(addr.toHexString())
      );
      investment.tag = this.tag;
      investment.meta = info.meta;
      investment.blockNumber = block.number;
      investment.blockTimestamp = block.timestamp;
      investment.save();

      // Create Template
      this.createATokenTemplate(
        Address.fromBytes(Bytes.fromHexString(this.tag))
      );
    }

    return investment;
  }

  getAtoken(underlyingAddr: Address): Address {
    let poolDataProvider = PoolDataProvider.bind(
      getContextAddress("dataProvider")
    );
    const try_aTokenAddress =
      poolDataProvider.try_getReserveTokensAddresses(underlyingAddr);

    let aTokenAddress: Address;
    if (try_aTokenAddress.reverted) {
      const addrProvider = PoolAddressProvider.bind(
        getContextAddress("poolAddressProvider")
      );
      poolDataProvider = PoolDataProvider.bind(
        addrProvider.getPoolDataProvider()
      );
      console.error(
        "addrProvider " +
          addrProvider.getPoolDataProvider().toHexString() +
          " " +
          underlyingAddr.toHexString()
      );
      aTokenAddress = poolDataProvider
        .getReserveTokensAddresses(underlyingAddr)
        .getATokenAddress();
    } else {
      aTokenAddress = try_aTokenAddress.value.getATokenAddress();
    }

    return aTokenAddress;
  }

  // create atoken template
  createATokenTemplate(underlying: Address): void {
    const aTokenAddress = this.getAtoken(underlying);
    const aTokenContext = new DataSourceContext();

    const ctx = dataSource.context();
    aTokenContext.setString("protocolName", ctx.getString("protocolName"));
    aTokenContext.setI32("graphId", ctx.getI32("graphId"));
    aTokenContext.setI32("totalGraphs", ctx.getI32("totalGraphs"));

    aTokenContext.setString("underlying", underlying.toHexString());
    aTokenContext.setString(
      "dataProvider",
      getContextAddress("dataProvider").toHexString()
    );
    aTokenContext.setString(
      "WETHGateway",
      getContextAddress("WETHGateway").toHexString()
    );

    aToken.createWithContext(aTokenAddress, aTokenContext);
  }
}
