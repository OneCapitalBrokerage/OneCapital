const EPSILON = 1e-9;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const nearlyEqual = (a, b) => Math.abs(toNumber(a) - toNumber(b)) <= EPSILON;

const snapshotFundBalanceAxes = (fund) => ({
  depositedCash: toNumber(fund?.net_available_balance ?? fund?.available_balance),
  pnlBalance: toNumber(fund?.pnl_balance),
});

const assertDepositOnlyMutation = ({ before, after, context = 'funds' }) => {
  if (!nearlyEqual(before?.pnlBalance, after?.pnlBalance)) {
    throw new Error(
      `[${context}] Invariant violation: deposit mutation attempted to change pnl_balance `
      + `(before=${toNumber(before?.pnlBalance)}, after=${toNumber(after?.pnlBalance)})`
    );
  }
};

const assertPnlOnlyMutation = ({ before, after, context = 'funds' }) => {
  if (!nearlyEqual(before?.depositedCash, after?.depositedCash)) {
    throw new Error(
      `[${context}] Invariant violation: pnl mutation attempted to change deposited cash `
      + `(before=${toNumber(before?.depositedCash)}, after=${toNumber(after?.depositedCash)})`
    );
  }
};

export {
  snapshotFundBalanceAxes,
  assertDepositOnlyMutation,
  assertPnlOnlyMutation,
};
