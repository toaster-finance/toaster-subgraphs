export enum PositionChangeAction {
  Deposit,
  Withdraw,
  Harvest,
  Borrow,
  Repay,
  Liquidate,
  Send,
  Receive,
  Stake,
  Unstake
}

const actions = [
  "Deposit",
  "Withdraw",
  "Harvest",
  "Borrow",
  "Repay",
  "Liquidate",
  "Send",
  "Receive",
  "Stake",
  "Unstake"
];
export function getAction(actionId: PositionChangeAction): string {
  return actions[actionId];
}
