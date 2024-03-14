import { Address, BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
import {
  BaseInvestment,
  InvestmentTokens,
  getInvestmentId,
} from "../../common/helpers/investmentHelper";
import {
  Burn,
  Mint,
  SyncSwapPool,
  SyncSwapPool__getReservesResult,
  Transfer,
} from "../../../generated/templates/SyncSwapPool/SyncSwapPool";
import { Investment } from "../../../generated/schema";
import { savePositionSnapshot } from "../../common/savePositionSnapshot";
import { PositionParams } from "../../common/helpers/positionHelper";
import { PositionType } from "../../common/PositionType.enum";
import { savePositionChange } from "../../common/savePositionChange";
import { PositionChangeAction } from "../../common/PositionChangeAction.enum";
import { filterLogs, logAt, logFindFirst } from "../../common/filterEventLogs";
import { hash2Address } from "../../common/helpers/hashHelper";

export const SYNCSWAP_PROTOCOL = "SyncSwap";

export class SyncSwapInvestment extends BaseInvestment {
  constructor(investmentAddress: Address) {
    super(SYNCSWAP_PROTOCOL, investmentAddress);
  }
  getTokens(investmentAddress: Address): InvestmentTokens {
    const pool = SyncSwapPool.bind(investmentAddress);
    return new InvestmentTokens([pool.token0(), pool.token1()], []);
  }
}

function lp2Amounts(
  reserves: SyncSwapPool__getReservesResult,
  lpAmount: BigInt,
  totalSupply: BigInt
): BigInt[] {
  return [
    reserves.value0.times(lpAmount).div(totalSupply),
    reserves.value1.times(lpAmount).div(totalSupply),
  ];
}

///////////////////////////////////////////
////////// Position Snapshots /////////////
///////////////////////////////////////////

export function handleBlock(block: ethereum.Block): void {
  const pool = SyncSwapPool.bind(dataSource.address());
  const investment = Investment.load(
    getInvestmentId(SYNCSWAP_PROTOCOL, pool._address)
  );

  if (!investment) throw new Error("handleBlock: Investment not found");
  const reserves = pool.getReserves();
  const totalSupply = pool.totalSupply();

  const positions = investment.positions.load();
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    const amounts = lp2Amounts(reserves, position.liquidity, totalSupply);
    savePositionSnapshot(
      block,
      new SyncSwapInvestment(pool._address),
      new PositionParams(
        Address.fromBytes(position.owner),
        "",
        PositionType.Invest,
        amounts,
        [],
        position.liquidity,
        []
      )
    );
  }
}

///////////////////////////////////////////
/////////// Position Changes //////////////
///////////////////////////////////////////

// Mint(address,uint256,uint256,uint256,address)
// ::Mint(address -> indexed sender,uint256,uint256,uint256,address -> indexed to)
const MINT_TOPIC =
  "0xa8137fff86647d8a402117b9c5dbda627f721d3773338fb9678c83e54ed39080";
// Burn(address,uint256,uint256,uint256,address)
const BURN_TOPIC =
  "0xd175a80c109434bb89948928ab2475a6647c94244cb70002197896423c883363";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function handleMint(event: Mint): void {
  if (event.params.liquidity.equals(BigInt.zero())) return;

  const pool = SyncSwapPool.bind(dataSource.address());
  const investment = new SyncSwapInvestment(pool._address);
  const reserves = pool.getReserves();
  const totalSupply = pool.totalSupply();

  const dbPosition = investment.findPosition(event.params.to, "");
  let receiverBalance = event.params.liquidity;
  if (dbPosition != null) {
    receiverBalance = dbPosition.liquidity.plus(event.params.liquidity);
  }

  savePositionChange(
    event,
    PositionChangeAction.Deposit,
    investment,
    new PositionParams(
      event.params.to,
      "",
      PositionType.Invest,
      lp2Amounts(reserves, receiverBalance, totalSupply),
      [],
      receiverBalance,
      []
    ),
    [event.params.amount0, event.params.amount1],
    []
  );
}

export function handleBurn(event: Burn): void {
  if (event.params.liquidity.equals(BigInt.zero())) return;

  const pool = SyncSwapPool.bind(event.address);
  const investment = new SyncSwapInvestment(pool._address);
  const reserves = pool.getReserves();
  const totalSupply = pool.totalSupply();

  const lpTransfers = filterLogs(event, TRANSFER_TOPIC);
  const lpToPool = logFindFirst(lpTransfers, event, (log, event) => {
    return (
      log.address.equals(event.address) &&
      hash2Address(log.topics[2]).equals(event.address)
    );
  });
  if (!lpToPool) throw new Error("handleBurn: lpToPool not found");

  const owner = hash2Address(lpToPool.topics[1]);
  let dbPosition = investment.findPosition(owner, "");

  if (dbPosition == null) {
    throw new Error(
      "handleBurn: Position not found, Owner: " + owner.toHexString()
    );
  }
  const liquidity = dbPosition.liquidity;
  const ownerBalance = liquidity.minus(event.params.liquidity);
  savePositionChange(
    event,
    PositionChangeAction.Withdraw,
    investment,
    new PositionParams(
      owner,
      "",
      PositionType.Invest,
      lp2Amounts(reserves, ownerBalance, totalSupply),
      [],
      ownerBalance,
      []
    ),
    [event.params.amount0.neg(), event.params.amount1.neg()],
    []
  );
}

export function handleTransfer(event: Transfer): void {
  if (event.params.value.equals(BigInt.zero())) return;

  const router = Address.fromHexString(
    dataSource.context().getString("router")
  );
  if (
    event.params.from.equals(Address.zero()) ||
    event.params.to.equals(Address.zero()) ||
    event.params.from.equals(router) ||
    event.params.to.equals(router)
  )
    return;

  const receipt = event.receipt;
  if (receipt == null) return;
  // Mint -> not in case
  const mintLogs = filterLogs(event, MINT_TOPIC);
  if (logAt(mintLogs, event.address) != -1) return;

  // Burn -> not in case
  const burnLogs = filterLogs(event, BURN_TOPIC);
  if (logAt(burnLogs, event.address) != -1) return;

  const pool = SyncSwapPool.bind(event.address);
  const reserves = pool.getReserves();
  const totalSupply = pool.totalSupply();

  const investment = new SyncSwapInvestment(pool._address);

  let senderBalance: BigInt;
  const dbSenderPosition = investment.findPosition(event.params.from, "");
  if (dbSenderPosition) {
    senderBalance = dbSenderPosition.liquidity.minus(event.params.value);
  } else {
    senderBalance = pool.balanceOf(event.params.from);
  }

  let receiverBalance = event.params.value;
  const dbReceiverPosition = investment.findPosition(event.params.to, "");
  if (dbReceiverPosition != null) {
    receiverBalance = dbReceiverPosition.liquidity.plus(event.params.value);
  }

  // Just Transfer
  const dInput = lp2Amounts(reserves, event.params.value, totalSupply);

  savePositionChange(
    event,
    PositionChangeAction.Send,
    investment,
    new PositionParams(
      event.params.from,
      "",
      PositionType.Invest,
      lp2Amounts(reserves, senderBalance, totalSupply),
      [],
      senderBalance,
      []
    ),
    [dInput[0].neg(), dInput[1].neg()], // dInput: BigInt[],
    []
  );

  savePositionChange(
    event,
    PositionChangeAction.Receive,
    investment,
    new PositionParams(
      event.params.to,
      "",
      PositionType.Invest,
      lp2Amounts(reserves, receiverBalance, totalSupply),
      [],
      receiverBalance,
      []
    ),
    dInput,
    []
  );
}
