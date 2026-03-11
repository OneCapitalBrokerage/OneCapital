const BROKERAGE_PERCENT = 0; // No runtime fallback; prefer stored broker-managed brokerage.
const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const hasNumber = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const hasNonNegativeNumber = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
};

/**
 * Calculate P&L and brokerage for an OPEN position (entry-only brokerage).
 */
export function calculateOpenPnL({
  side,
  avgPrice,
  ltp,
  qty,
  brokeragePercent = BROKERAGE_PERCENT,
  entryBrokerage,
  brokerageEntry,
}) {
  const safeSide = String(side || 'BUY').toUpperCase();
  const quantity = toNumber(qty);
  const entry = toNumber(avgPrice);
  const last = toNumber(ltp);

  const entryValue = entry * quantity;
  const currentValue = last * quantity;
  const rate = toNumber(brokeragePercent) / 100;

  const brokerageEntryResolved = hasNonNegativeNumber(entryBrokerage)
    ? toNumber(entryBrokerage)
    : hasNonNegativeNumber(brokerageEntry)
      ? toNumber(brokerageEntry)
      : entryValue * rate;

  const diffPerShare = safeSide === 'BUY' ? last - entry : entry - last;
  const grossPnl = diffPerShare * quantity;
  const netPnl = grossPnl - brokerageEntryResolved;
  const pct = entryValue ? (netPnl / entryValue) * 100 : 0;

  return { entryValue, currentValue, brokerageEntry: brokerageEntryResolved, grossPnl, netPnl, pct };
}

/**
 * Calculate P&L and brokerage for a CLOSED position (entry + exit brokerage).
 */
export function calculateClosedPnL({
  side,
  avgPrice,
  exitPrice,
  qty,
  brokeragePercent = BROKERAGE_PERCENT,
  entryBrokerage,
  exitBrokerage,
  totalBrokerage,
}) {
  const safeSide = String(side || 'BUY').toUpperCase();
  const quantity = toNumber(qty);
  const entry = toNumber(avgPrice);
  const exit = toNumber(exitPrice);

  const entryValue = entry * quantity;
  const exitValue = exit * quantity;
  const rate = toNumber(brokeragePercent) / 100;

  let brokerageEntryResolved = hasNonNegativeNumber(entryBrokerage) ? toNumber(entryBrokerage) : entryValue * rate;
  let brokerageExitResolved = hasNonNegativeNumber(exitBrokerage) ? toNumber(exitBrokerage) : exitValue * rate;
  let totalBrokerageResolved = brokerageEntryResolved + brokerageExitResolved;

  if (hasNumber(totalBrokerage)) {
    totalBrokerageResolved = toNumber(totalBrokerage);
    if (!hasNonNegativeNumber(entryBrokerage) && !hasNonNegativeNumber(exitBrokerage)) {
      brokerageEntryResolved = totalBrokerageResolved / 2;
      brokerageExitResolved = totalBrokerageResolved / 2;
    } else if (hasNonNegativeNumber(entryBrokerage) && !hasNonNegativeNumber(exitBrokerage)) {
      brokerageExitResolved = totalBrokerageResolved - brokerageEntryResolved;
    } else if (!hasNonNegativeNumber(entryBrokerage) && hasNonNegativeNumber(exitBrokerage)) {
      brokerageEntryResolved = totalBrokerageResolved - brokerageExitResolved;
    }
  }

  const diffPerShare = safeSide === 'BUY' ? exit - entry : entry - exit;
  const grossPnl = diffPerShare * quantity;
  const netPnl = grossPnl - totalBrokerageResolved;
  const pct = entryValue ? (netPnl / entryValue) * 100 : 0;

  return {
    entryValue,
    exitValue,
    brokerageEntry: brokerageEntryResolved,
    brokerageExit: brokerageExitResolved,
    totalBrokerage: totalBrokerageResolved,
    grossPnl,
    netPnl,
    pct,
  };
}

/**
 * Simple brokerage amount from turnover.
 */
export function calculateBrokerage(turnover, brokeragePercent = BROKERAGE_PERCENT) {
  return toNumber(turnover) * (toNumber(brokeragePercent) / 100);
}

/**
 * Shared P&L utility helpers (extracted from Orders.jsx / OrderDetailSheet.jsx)
 */
const readNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function getOrderBrokerage(order) {
  const breakdown = order?.brokerage_breakdown || {};
  return {
    entry: readNumber(breakdown?.entry?.amount),
    exit: readNumber(breakdown?.exit?.amount),
    total: readNumber(order?.brokerage ?? breakdown?.total),
  };
}

export function getEffectiveEntryPrice(order) {
  return toNumber(order?.effective_entry_price ?? order?.price, 0);
}

export function getEffectiveExitPrice(order, fallbackLtp = 0) {
  return toNumber(
    order?.effective_exit_price ??
      order?.closed_ltp ??
      order?.exit_price ??
      fallbackLtp ??
      getEffectiveEntryPrice(order),
    getEffectiveEntryPrice(order)
  );
}

export function canUseStoredRealizedPnl(order) {
  const hasPricingAudit =
    String(order?.settlement_status || '').toLowerCase() === 'settled' ||
    !!order?.brokerage_breakdown ||
    readNumber(order?.effective_exit_price) !== null ||
    readNumber(order?.raw_exit_price) !== null;
  return hasPricingAudit && readNumber(order?.realized_pnl) !== null;
}

export function resolveOrderPnl({ order, isClosed, ltp }) {
  const side = String(order?.side || 'BUY').toUpperCase();
  const qty = toNumber(order?.quantity, 0);
  const entryPrice = getEffectiveEntryPrice(order);
  const { entry: entryBrokerage, exit: exitBrokerage, total: totalBrokerage } = getOrderBrokerage(order);
  const openEntryBrokerage = hasNonNegativeNumber(entryBrokerage) ? entryBrokerage : totalBrokerage;

  if (!isClosed) {
    return calculateOpenPnL({
      side,
      avgPrice: entryPrice,
      ltp,
      qty,
      entryBrokerage: openEntryBrokerage,
    });
  }

  const exitPrice = getEffectiveExitPrice(order, ltp);
  const calculated = calculateClosedPnL({
    side, avgPrice: entryPrice, exitPrice, qty, entryBrokerage, exitBrokerage, totalBrokerage,
  });

  if (!canUseStoredRealizedPnl(order)) return calculated;

  const realizedPnl = readNumber(order?.realized_pnl);
  const grossPnl = side === 'SELL'
    ? (entryPrice - exitPrice) * qty
    : (exitPrice - entryPrice) * qty;
  const pct = entryPrice * qty ? (realizedPnl / (entryPrice * qty)) * 100 : 0;

  return { ...calculated, grossPnl, netPnl: realizedPnl, pct };
}

export default { calculateOpenPnL, calculateClosedPnL, calculateBrokerage, BROKERAGE_PERCENT, resolveOrderPnl, canUseStoredRealizedPnl, getEffectiveEntryPrice, getEffectiveExitPrice, getOrderBrokerage };
