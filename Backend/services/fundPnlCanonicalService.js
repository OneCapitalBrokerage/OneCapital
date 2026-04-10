import OrderModel from '../Model/Trading/OrdersModel.js';
import { resolveCurrentWeeklyBoundary } from '../Utils/weeklySettlement.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getOrderCloseDate = (order) =>
  toDate(order?.closed_at)
  || toDate(order?.exit_at)
  || toDate(order?.updatedAt)
  || null;

const isSettledClosedOrder = (order) => {
  const status = String(order?.status || order?.order_status || '').toUpperCase();
  const settled = String(order?.settlement_status || '').toLowerCase();
  return ['CLOSED', 'EXPIRED'].includes(status) && settled === 'settled';
};

const buildFundRealizedReferenceSet = (fund) => {
  const references = new Set();
  const rows = Array.isArray(fund?.transactions) ? fund.transactions : [];

  rows.forEach((tx) => {
    const type = String(tx?.type || '').toLowerCase();
    if (type !== 'realized_profit' && type !== 'realized_loss') return;
    const ref = String(tx?.reference || '').trim();
    if (ref) references.add(ref);
  });

  return references;
};

const getWeeklyRealizedFromOrders = async ({
  fund,
  customerIdStr,
  brokerIdStr,
  nowUtc = new Date(),
}) => {
  const boundary = resolveCurrentWeeklyBoundary({
    transactions: fund?.transactions || [],
    nowUtc,
  });

  const orders = await OrderModel.find({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    settlement_status: 'settled',
    $or: [
      { status: { $in: ['CLOSED', 'EXPIRED'] } },
      { order_status: { $in: ['CLOSED', 'EXPIRED'] } },
    ],
    $and: [
      {
        $or: [
          { closed_at: { $gte: boundary.boundaryStartUtc } },
          { exit_at: { $gte: boundary.boundaryStartUtc } },
          {
            $and: [
              {
                $or: [
                  { closed_at: { $exists: false } },
                  { closed_at: null },
                ],
              },
              {
                $or: [
                  { exit_at: { $exists: false } },
                  { exit_at: null },
                ],
              },
              { updatedAt: { $gte: boundary.boundaryStartUtc } },
            ],
          },
        ],
      },
    ],
  })
    .select('_id status order_status settlement_status realized_pnl closed_at exit_at updatedAt symbol side quantity')
    .lean();

  const weekOrders = orders.filter((order) => {
    if (!isSettledClosedOrder(order)) return false;
    const closedAt = getOrderCloseDate(order);
    if (!closedAt) return false;
    return closedAt >= boundary.boundaryStartUtc;
  });

  const realizedPnlThisWeek = Number(
    weekOrders.reduce((sum, order) => sum + toNumber(order?.realized_pnl), 0).toFixed(2)
  );

  return {
    realizedPnlThisWeek,
    boundaryStartUtc: boundary.boundaryStartUtc,
    boundaryType: boundary.boundaryType,
    weekStartUtc: boundary.weekStartUtc,
    weekEndUtc: boundary.weekEndUtc,
    latestSettlement: boundary.latestSettlement || null,
    weekOrders,
  };
};

const reconcileMissingRealizedTransactions = ({
  fund,
  weekOrders = [],
  processedBy,
  dryRun = false,
}) => {
  const existingRefs = buildFundRealizedReferenceSet(fund);
  const missingOrders = [];

  weekOrders.forEach((order) => {
    const ref = String(order?._id || '').trim();
    if (!ref || existingRefs.has(ref)) return;
    missingOrders.push(order);
  });

  if (!dryRun && missingOrders.length > 0) {
    if (!Array.isArray(fund.transactions)) {
      fund.transactions = [];
    }

    missingOrders.forEach((order) => {
      const pnl = toNumber(order.realized_pnl);
      const txType = pnl >= 0 ? 'realized_profit' : 'realized_loss';
      const qty = toNumber(order.quantity);
      const side = String(order.side || '').toUpperCase();
      const symbol = String(order.symbol || '').trim() || 'ORDER';
      const closeDate = getOrderCloseDate(order) || new Date();

      fund.transactions.push({
        type: txType,
        amount: pnl,
        notes: `${side} ${symbol} ${qty}qty | Backfilled realized P&L ledger entry from settled order reconciliation`,
        status: 'completed',
        reference: String(order._id),
        processedBy,
        timestamp: closeDate,
      });
    });

    fund.last_calculated_at = new Date();
  }

  return {
    missingOrders,
    missingCount: missingOrders.length,
    missingPnlTotal: Number(
      missingOrders.reduce((sum, order) => sum + toNumber(order.realized_pnl), 0).toFixed(2)
    ),
  };
};

export {
  buildFundRealizedReferenceSet,
  getOrderCloseDate,
  getWeeklyRealizedFromOrders,
  reconcileMissingRealizedTransactions,
};
