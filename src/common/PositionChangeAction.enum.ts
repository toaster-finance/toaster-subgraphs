export enum PositionChangeAction {
  Deposit,
  Withdraw,
  Harvest,
  Borrow,
  Repay,
  Liquidate,
  LiquidateReward,
  Send,
  Receive,
  Stake,
  Unstake,
  Compound,
}

const actions = [
  "Deposit",
  "Withdraw",
  "Harvest",
  "Borrow",
  "Repay",
  "Liquidate",
  "LiquidateReward",
  "Send",
  "Receive",
  "Stake",
  "Unstake",
  "Compound"
];
export function getAction(actionId: PositionChangeAction): string {
  return actions[actionId];
}
