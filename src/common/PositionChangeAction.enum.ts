export enum PositionChangeAction {
  Deposit,
  Withdraw,
  Harvest,
  Borrow,
  Repay,
  Liquidate,
  Send,
  Receive,
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
];
export function getAction(actionId: PositionChangeAction): string {
  return actions[actionId];
}
