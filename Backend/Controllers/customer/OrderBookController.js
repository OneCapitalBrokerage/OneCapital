// Controllers/customer/OrderBookController.js
// Customer Order Book - Sectioned and bucketed order listing

import asyncHandler from 'express-async-handler';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import OrderAttemptModel from '../../Model/Trading/OrderAttemptModel.js';

const EXECUTED_BUCKET_STATUSES = new Set(['OPEN', 'EXECUTED', 'CLOSED']);
const CANCELLED_REJECTED_BUCKET_STATUSES = new Set(['CANCELLED', 'REJECTED']);
const EXITABLE_STATUSES = new Set(['OPEN', 'EXECUTED', 'PARTIALLY_FILLED', 'HOLD']);
const TERMINAL_STATUSES = new Set(['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED']);
const ATTEMPT_STATUS_KEY = 'FAILED_ATTEMPT';

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
};

const toUpper = (value) => String(value || '').trim().toUpperCase();
const toSortTime = (value) => {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

const normalizeBucket = (bucket) => {
  const raw = String(bucket || 'all').trim().toLowerCase();
  if (raw === 'executed') return 'executed';
  if (raw === 'cancelled_rejected' || raw === 'cancelled-rejected' || raw === 'cancelled_or_rejected') {
    return 'cancelled_rejected';
  }
  return 'all';
};

const getSectionQuery = (section) => {
  const value = String(section || 'intraday').trim().toLowerCase();
  if (value === 'cnc') {
    return { section: 'cnc', productQuery: { $in: ['CNC', 'NRML'] } };
  }
  return { section: 'intraday', productQuery: 'MIS' };
};

const getBucketStatusQuery = (bucket) => {
  if (bucket === 'executed') {
    return { $in: Array.from(EXECUTED_BUCKET_STATUSES) };
  }
  if (bucket === 'cancelled_rejected') {
    return { $in: Array.from(CANCELLED_REJECTED_BUCKET_STATUSES) };
  }
  return null;
};

const getDisplayState = (order, status) => {
  if (status === 'PENDING' && order.requires_approval && order.approval_status === 'pending') {
    return 'PENDING_APPROVAL';
  }
  if (status === 'REJECTED' && order.approval_status === 'rejected') {
    return 'REJECTED_BY_BROKER';
  }
  return status || 'UNKNOWN';
};

const getStatusReason = (order, status) => {
  if (status === 'REJECTED') {
    return order.rejection_reason || 'Rejected by broker';
  }
  if (status === 'CANCELLED') {
    return order.cancel_reason || order.meta?.cancel_reason || 'Cancelled by user';
  }
  if (status === 'EXPIRED') {
    return 'Order validity expired';
  }
  if (status === 'CLOSED' && order.exit_reason) {
    const reasonMap = {
      manual: 'Exited manually',
      stop_loss: 'Stop loss triggered',
      target: 'Target achieved',
      expiry: 'Closed on expiry',
      square_off: 'Square-off executed',
    };
    return reasonMap[order.exit_reason] || `Closed (${order.exit_reason})`;
  }
  if (status === 'PENDING' && order.requires_approval && order.approval_status === 'pending') {
    return 'Awaiting broker approval';
  }
  return null;
};

const sumByStatuses = (statusMap, statuses) => {
  let sum = 0;
  statuses.forEach((s) => {
    sum += Number(statusMap.get(s) || 0);
  });
  return sum;
};

const getDateQuery = (from, to) => {
  if (!from && !to) return null;
  const dateQuery = {};
  if (from) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    if (!Number.isNaN(fromDate.getTime())) dateQuery.$gte = fromDate;
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    if (!Number.isNaN(toDate.getTime())) dateQuery.$lte = toDate;
  }
  return Object.keys(dateQuery).length > 0 ? dateQuery : null;
};

const mapOrderItem = (order) => {
  const status = toUpper(order.status || order.order_status);
  const display_state = getDisplayState(order, status);
  const status_reason = getStatusReason(order, status);
  const isPendingApproval = status === 'PENDING' && !!order.requires_approval && String(order.approval_status || '') === 'pending';
  const can_modify = !!order._id && !TERMINAL_STATUSES.has(status) && !isPendingApproval;
  const can_exit = !!order._id && EXITABLE_STATUSES.has(status) && !isPendingApproval;

  return {
    id: order._id,
    orderId: order.order_id || order.broker_order_id || order.exchange_order_id || String(order._id),
    symbol: order.symbol,
    exchange: order.exchange,
    segment: order.segment,
    instrument_token: order.instrument_token,

    side: order.side,
    product: order.product,
    quantity: Number(order.quantity || 0),
    filled_qty: Number(order.filled_qty || 0),
    pending_qty: Number(order.pending_qty || 0),
    lots: Number(order.lots || 0),
    lot_size: Number(order.lot_size || 0),

    ltp: Number(order.ltp ?? order.last_price ?? order.effective_entry_price ?? order.price ?? 0),
    price: Number(order.price || 0),
    raw_entry_price: Number(order.raw_entry_price || 0),
    effective_entry_price: Number(order.effective_entry_price || order.price || 0),
    raw_exit_price: Number(order.raw_exit_price || 0),
    effective_exit_price: Number(order.effective_exit_price || order.closed_ltp || order.exit_price || 0),
    brokerage: Number(order.brokerage || 0),
    brokerage_breakdown: order.brokerage_breakdown || null,
    realized_pnl: Number(order.realized_pnl || 0),

    status,
    order_status: toUpper(order.order_status || order.status),
    approval_status: order.approval_status || null,
    requires_approval: !!order.requires_approval,
    rejection_reason: order.rejection_reason || null,
    exit_reason: order.exit_reason || null,
    settlement_status: order.settlement_status || null,
    display_state,
    status_reason,
    source: 'order',

    placed_at: order.placed_at || order.createdAt || null,
    executed_at: order.executed_at || null,
    closed_at: order.closed_at || order.exit_at || null,
    cancelled_at: order.cancelled_at || null,
    rejected_at: order.rejected_at || null,
    validity_mode: order.validity_mode || null,
    validity_started_at: order.validity_started_at || null,
    validity_expires_at: order.validity_expires_at || null,
    validity_extended_count: Number(order.validity_extended_count || 0),

    can_modify,
    can_exit,
    can_view_detail: true,
  };
};

const mapAttemptItem = (attempt) => {
  const ts = attempt.createdAt || attempt.updatedAt || null;
  return {
    id: attempt._id,
    orderId: `ATTEMPT-${String(attempt._id)}`,
    symbol: attempt.symbol || 'UNKNOWN',
    exchange: attempt.exchange || null,
    segment: attempt.segment || null,
    instrument_token: attempt.instrument_token || null,

    side: toUpper(attempt.side || 'BUY'),
    product: toUpper(attempt.product || 'MIS'),
    quantity: Number(attempt.quantity || 0),
    filled_qty: 0,
    pending_qty: Number(attempt.quantity || 0),
    lots: Number(attempt.lots || 0),
    lot_size: Number(attempt.lot_size || 0),

    ltp: Number(attempt.price || 0),
    price: Number(attempt.price || 0),
    raw_entry_price: Number(attempt.raw_entry_price || attempt.price || 0),
    effective_entry_price: Number(attempt.price || 0),
    raw_exit_price: 0,
    effective_exit_price: 0,
    brokerage: 0,
    brokerage_breakdown: null,
    realized_pnl: 0,

    status: 'REJECTED',
    order_status: 'REJECTED',
    approval_status: null,
    requires_approval: false,
    rejection_reason: attempt.failure_reason || 'Order attempt failed',
    exit_reason: null,
    settlement_status: null,
    display_state: ATTEMPT_STATUS_KEY,
    status_reason: attempt.failure_reason || 'Order attempt failed',
    source: 'attempt',
    failure_code: attempt.failure_code || null,
    http_status: Number(attempt.http_status || 0),

    placed_at: ts,
    executed_at: null,
    closed_at: null,
    cancelled_at: null,
    rejected_at: ts,
    validity_mode: null,
    validity_started_at: null,
    validity_expires_at: null,
    validity_extended_count: 0,

    can_modify: false,
    can_exit: false,
    can_view_detail: false,
  };
};

const mergeRowsBySort = ({ orders, attempts, sort = 'placed_at_desc' }) => {
  const direction = sort === 'placed_at_asc' ? 1 : -1;
  return [...orders, ...attempts].sort((a, b) => {
    const aTs = toSortTime(a.placed_at || a.rejected_at || a.createdAt);
    const bTs = toSortTime(b.placed_at || b.rejected_at || b.createdAt);
    if (aTs === bTs) return String(a.id).localeCompare(String(b.id)) * direction;
    return (aTs - bTs) * direction;
  });
};

/**
 * @desc     Get customer order book
 * @route    GET /api/customer/order-book
 * @access   Private (Customer only)
 */
const getOrderBook = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;

  const { section: rawSection = 'intraday', bucket: rawBucket = 'all', search, from, to, sort = 'placed_at_desc' } = req.query;
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, 50), 200);
  const skip = (page - 1) * limit;

  const { section, productQuery } = getSectionQuery(rawSection);
  const bucket = normalizeBucket(rawBucket);
  const includeAttempts = bucket !== 'executed';

  const orderBaseQuery = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    product: productQuery,
  };
  const attemptBaseQuery = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    product: productQuery,
  };

  if (search) {
    const symbolRegex = { $regex: String(search).trim(), $options: 'i' };
    orderBaseQuery.symbol = symbolRegex;
    attemptBaseQuery.symbol = symbolRegex;
  }

  const dateQuery = getDateQuery(from, to);
  if (dateQuery) {
    orderBaseQuery.createdAt = dateQuery;
    attemptBaseQuery.createdAt = dateQuery;
  }

  const listQuery = { ...orderBaseQuery };
  const bucketStatusQuery = getBucketStatusQuery(bucket);
  if (bucketStatusQuery) {
    listQuery.status = bucketStatusQuery;
  }

  const sortQuery = sort === 'placed_at_asc'
    ? { placed_at: 1, createdAt: 1 }
    : { placed_at: -1, createdAt: -1 };
  const attemptSortQuery = sort === 'placed_at_asc'
    ? { createdAt: 1 }
    : { createdAt: -1 };

  const windowSize = skip + limit;
  const attemptListQuery = includeAttempts ? { ...attemptBaseQuery } : null;

  const [orders, attempts, orderTotal, attemptTotal, statusCounts, attemptBaseCount] = await Promise.all([
    includeAttempts
      ? OrderModel.find(listQuery).sort(sortQuery).limit(windowSize).lean()
      : OrderModel.find(listQuery).sort(sortQuery).skip(skip).limit(limit).lean(),
    includeAttempts
      ? OrderAttemptModel.find(attemptListQuery).sort(attemptSortQuery).limit(windowSize).lean()
      : Promise.resolve([]),
    OrderModel.countDocuments(listQuery),
    includeAttempts
      ? OrderAttemptModel.countDocuments(attemptListQuery)
      : Promise.resolve(0),
    OrderModel.aggregate([
      { $match: orderBaseQuery },
      { $group: { _id: { $ifNull: ['$status', '$order_status'] }, count: { $sum: 1 } } },
    ]),
    OrderAttemptModel.countDocuments(attemptBaseQuery),
  ]);

  const orderStatusCountMap = new Map();
  statusCounts.forEach((item) => {
    orderStatusCountMap.set(toUpper(item._id), Number(item.count || 0));
  });
  const attemptCount = Number(attemptBaseCount || 0);
  const orderAllCount = Array.from(orderStatusCountMap.values()).reduce((sum, n) => sum + n, 0);
  const orderExecutedCount = sumByStatuses(orderStatusCountMap, EXECUTED_BUCKET_STATUSES);
  const orderCancelledRejectedCount = sumByStatuses(orderStatusCountMap, CANCELLED_REJECTED_BUCKET_STATUSES);

  const statusCountMap = new Map(orderStatusCountMap);
  if (attemptCount > 0) {
    statusCountMap.set(ATTEMPT_STATUS_KEY, attemptCount);
  }

  const summary = {
    section,
    counts: {
      all: orderAllCount + attemptCount,
      executed: orderExecutedCount,
      cancelled_rejected: orderCancelledRejectedCount + attemptCount,
    },
    statusCounts: Object.fromEntries(Array.from(statusCountMap.entries())),
  };

  const orderItems = orders.map(mapOrderItem);
  const attemptItems = attempts.map(mapAttemptItem);
  const items = includeAttempts
    ? mergeRowsBySort({ orders: orderItems, attempts: attemptItems, sort }).slice(skip, skip + limit)
    : orderItems;
  const total = Number(orderTotal || 0) + Number(attemptTotal || 0);

  res.status(200).json({
    success: true,
    filters: {
      section,
      bucket,
      search: search || '',
      from: from || null,
      to: to || null,
      sort,
    },
    summary,
    items,
    pagination: {
      page,
      limit,
      total: includeAttempts ? total : Number(orderTotal || 0),
      pages: Math.ceil(total / limit),
    },
  });
});

export {
  getOrderBook,
};
