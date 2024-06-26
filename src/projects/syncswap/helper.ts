import {
  Address,
  BigInt,
  Bytes,
  DataSourceContext,
  dataSource,
  ethereum,
  log,
} from "@graphprotocol/graph-ts";
import {
  InvestmentHelper,
  InvestmentInfo,
} from "../../common/helpers/investmentHelper";
import { SyncSwapPool } from "../../../generated/templates/SyncSwapPool/SyncSwapPool";
import { SyncSwapPool as SyncSwapPoolTemplate } from "../../../generated/templates";
import { Investment } from "../../../generated/schema";

export const SYNCSWAP_PROTOCOL = "SyncSwap";

export class SyncSwapHelper extends InvestmentHelper {
  constructor(investmentAddress: Address) {
    super(SYNCSWAP_PROTOCOL, investmentAddress, "");
  }
  getProtocolMeta(): string[] {
    return [];
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
      const graphId = dataSource.context().getI32("graphId");
      const totalGraphs = dataSource.context().getI32("totalGraphs");
      log.error("graphId: {}, totalGraphs: {}", [
        graphId.toString(),
        totalGraphs.toString(),
      ]);
      // Create Template
      const context = new DataSourceContext();
      context.setString("router1", dataSource.context().getString("router1"));
      context.setString("router2", dataSource.context().getString("router2"));
      context.setI32(
        "snapshotBatch",
        dataSource.context().getI32("snapshotBatch")
      );

      context.setI32("graphId", graphId);
      context.setI32("totalGraphs", totalGraphs);

      SyncSwapPoolTemplate.createWithContext(this.investmentAddress, context);
    }

    return investment;
  }

  getInfo(investmentAddress: Address): InvestmentInfo {
    const pool = SyncSwapPool.bind(investmentAddress);
    const reserves = pool.getReserves();
    return new InvestmentInfo(
      [pool.token0(), pool.token1()],
      [],
      [
        "1", // batch iterator
        reserves.get_reserve0().toString(),
        reserves.get_reserve1().toString(),
      ]
    );
  }

  getLiquidityInfo(block: ethereum.Block): LiquidityInfo {
    const investment = this.getOrCreateInvestment(block);
    return new LiquidityInfo(
      investment,
      BigInt.fromString(investment.meta[1]),
      BigInt.fromString(investment.meta[2])
    );
  }
}

class LiquidityInfo {
  constructor(
    readonly investment: Investment,
    readonly reserve0: BigInt,
    readonly reserve1: BigInt
  ) {}
}
