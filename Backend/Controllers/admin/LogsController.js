// Controllers/admin/LogsController.js
// Admin System Logs - persistent audit-backed logs

import asyncHandler from 'express-async-handler';
import AuditEventModel from '../../Model/System/AuditEventModel.js';
import AuditAlertModel from '../../Model/System/AuditAlertModel.js';

const LOG_TYPES = {
  SECURITY: 'security',
  TRANSACTION: 'transaction',
  DATA: 'data',
  SYSTEM: 'system',
  ERROR: 'error',
  AUDIT: 'audit',
};

const parsePage = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const parseLimit = (value, fallback = 50) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 500);
};

const parseDate = (value, endOfDay = false) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    if (endOfDay) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
  }
  return d;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const escapeRegex = (value) => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const toTitleCase = (value) =>
  String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const humanizeToken = (value) => toTitleCase(String(value || '').replace(/[_-]+/g, ' ').trim());

const ACTION_LABELS = {
  FUND_MANUAL_ADD: 'Manual Funds Added',
  FUND_MANUAL_EDIT: 'Manual Funds Updated',
  MARGIN_LIMIT_UPDATE: 'Margin Limits Updated',
  OPTION_LIMIT_PERCENT_UPDATE: 'Option Limit Updated',
  MARGIN_LOCK_DELIVERY: 'Delivery Margin Locked',
  MARGIN_RESET_MIDNIGHT_INTRADAY: 'Midnight Intraday Reset',
  PAYMENT_REQUEST_CREATE: 'Add Funds Request Created',
  PAYMENT_PROOF_SUBMIT: 'Payment Proof Submitted',
  PAYMENT_VERIFY: 'Add Funds Verified',
  PAYMENT_REJECT: 'Add Funds Rejected',
  PAYMENT_DELETE: 'Add Funds Deleted',
  WEEKLY_SETTLEMENT_RUN: 'Weekly Settlement Completed',
  WEEKLY_SETTLEMENT_PARTIAL_FAILURE: 'Weekly Settlement Partial Failure',
  AUTO_WEEKLY_SETTLEMENT_CRON: 'Auto Weekly Settlement Cron',
  WITHDRAWAL_REQUEST_CREATE: 'Withdrawal Requested',
  WITHDRAWAL_APPROVE: 'Withdrawal Approved',
  WITHDRAWAL_REJECT: 'Withdrawal Rejected',
};

const getActionLabel = (eventType) => ACTION_LABELS[eventType] || humanizeToken(eventType || 'audit_event');

const getPerformedBy = (entry) => humanizeToken(entry?.actor_type || entry?.source || 'system');

const getReference = (entry) =>
  entry?.metadata?.runRef
  || entry?.metadata?.requestRef
  || entry?.metadata?.transactionRef
  || entry?.metadata?.orderId
  || entry?.entity_ref
  || '';

const buildBaseQuery = ({
  type,
  search,
  startDate,
  endDate,
  category,
  eventType,
  status,
  brokerId,
  customerId,
  actorId,
  source,
  minAmountDelta,
  maxAmountDelta,
}) => {
  const query = {};

  if (type && type !== 'all') {
    query.type = String(type).toLowerCase();
  }

  if (category && category !== 'all') {
    query.category = String(category).trim().toLowerCase();
  }

  if (status && status !== 'all') {
    query.status = String(status).trim().toLowerCase();
  }

  if (source && source !== 'all') {
    query.source = String(source).trim().toLowerCase();
  }

  if (eventType) {
    const normalizedEvent = String(eventType).trim().toUpperCase();
    if (normalizedEvent.includes('*')) {
      const regexPattern = `^${escapeRegex(normalizedEvent).replace(/\\\*/g, '.*')}$`;
      query.event_type = { $regex: regexPattern, $options: 'i' };
    } else {
      query.event_type = normalizedEvent;
    }
  }

  if (brokerId) {
    query.broker_id_str = { $regex: `^${escapeRegex(String(brokerId).trim())}$`, $options: 'i' };
  }

  if (customerId) {
    query.customer_id_str = { $regex: `^${escapeRegex(String(customerId).trim())}$`, $options: 'i' };
  }

  if (actorId) {
    query.actor_id_str = { $regex: `^${escapeRegex(String(actorId).trim())}$`, $options: 'i' };
  }

  const minAmount = parseNumber(minAmountDelta);
  const maxAmount = parseNumber(maxAmountDelta);
  if (minAmount !== null || maxAmount !== null) {
    query.amount_delta = {};
    if (minAmount !== null) query.amount_delta.$gte = minAmount;
    if (maxAmount !== null) query.amount_delta.$lte = maxAmount;
  }

  if (search) {
    const pattern = String(search).trim();
    query.$or = [
      { message: { $regex: pattern, $options: 'i' } },
      { event_type: { $regex: pattern, $options: 'i' } },
      { actor_id_str: { $regex: pattern, $options: 'i' } },
      { target_id_str: { $regex: pattern, $options: 'i' } },
      { broker_id_str: { $regex: pattern, $options: 'i' } },
      { customer_id_str: { $regex: pattern, $options: 'i' } },
      { request_id: { $regex: pattern, $options: 'i' } },
    ];
  }

  const from = parseDate(startDate, false);
  const to = parseDate(endDate, true);
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = from;
    if (to) query.createdAt.$lte = to;
  }

  return query;
};

const mapLogResponse = (entry) => ({
  id: entry?.event_id || entry?._id?.toString?.() || '',
  type: entry?.type || LOG_TYPES.AUDIT,
  message: entry?.message || 'System event',
  metadata: entry?.metadata || {},
  timestamp: entry?.createdAt || entry?.timestamp || new Date(),
  severity: entry?.severity || 'info',
  eventType: entry?.event_type || '',
  actionLabel: getActionLabel(entry?.event_type || ''),
  category: entry?.category || '',
  status: entry?.status || '',
  source: entry?.source || '',
  performedBy: getPerformedBy(entry),
  reference: getReference(entry),
  brokerId: entry?.broker_id_str || '',
  customerId: entry?.customer_id_str || '',
  amountDelta: Number(entry?.amount_delta || 0),
  note: entry?.note || '',
  requestId: entry?.request_id || '',
  fundBefore: entry?.fund_before || {},
  fundAfter: entry?.fund_after || {},
});

const fetchLogs = async ({ query, page, limit, sortOrder = 'desc' }) => {
  const sort = sortOrder === 'asc' ? { createdAt: 1 } : { createdAt: -1 };
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    AuditEventModel.find(query).sort(sort).skip(skip).limit(limit).lean(),
    AuditEventModel.countDocuments(query),
  ]);

  return {
    rows: rows.map(mapLogResponse),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
};

// Legacy helper retained for compatibility with possible call-sites.
// Persists directly to AuditEvent collection.
const addLogEntry = (type, message, metadata = {}) => {
  const normalizedType = String(type || LOG_TYPES.AUDIT).toLowerCase();
  const entry = {
    id: `LOG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: normalizedType,
    message,
    metadata,
    timestamp: new Date(),
  };

  AuditEventModel.create({
    type: normalizedType,
    severity: 'info',
    message: String(message || ''),
    metadata: metadata || {},
    event_type: `LEGACY_${normalizedType.toUpperCase()}_LOG`,
    category: 'audit',
    status: 'success',
    source: 'system',
    timestamp: new Date(),
  }).catch((error) => {
    console.error('[LogsController] Failed to persist legacy log entry:', error?.message || error);
  });

  return entry;
};

/**
 * @desc     Get all system logs
 * @route    GET /api/admin/logs
 * @access   Private (Admin only)
 */
const getAllLogs = asyncHandler(async (req, res) => {
  const {
    type,
    search,
    startDate,
    endDate,
    category,
    eventType,
    status,
    brokerId,
    customerId,
    actorId,
    source,
    minAmountDelta,
    maxAmountDelta,
    sortOrder = 'desc',
  } = req.query;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 50);

  const query = buildBaseQuery({
    type,
    search,
    startDate,
    endDate,
    category,
    eventType,
    status,
    brokerId,
    customerId,
    actorId,
    source,
    minAmountDelta,
    maxAmountDelta,
  });
  const result = await fetchLogs({ query, page, limit, sortOrder });

  res.status(200).json({
    success: true,
    logs: result.rows,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

/**
 * @desc     Get security logs
 * @route    GET /api/admin/logs/security
 * @access   Private (Admin only)
 */
const getSecurityLogs = asyncHandler(async (req, res) => {
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 50);
  const result = await fetchLogs({
    query: { type: LOG_TYPES.SECURITY },
    page,
    limit,
    sortOrder: 'desc',
  });

  res.status(200).json({
    success: true,
    logs: result.rows,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

/**
 * @desc     Get transaction logs
 * @route    GET /api/admin/logs/transactions
 * @access   Private (Admin only)
 */
const getTransactionLogs = asyncHandler(async (req, res) => {
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 50);
  const result = await fetchLogs({
    query: { type: LOG_TYPES.TRANSACTION },
    page,
    limit,
    sortOrder: 'desc',
  });

  res.status(200).json({
    success: true,
    logs: result.rows,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

/**
 * @desc     Get data access logs
 * @route    GET /api/admin/logs/data
 * @access   Private (Admin only)
 */
const getDataLogs = asyncHandler(async (req, res) => {
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 50);
  const result = await fetchLogs({
    query: { type: LOG_TYPES.DATA },
    page,
    limit,
    sortOrder: 'desc',
  });

  res.status(200).json({
    success: true,
    logs: result.rows,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

/**
 * @desc     Get system logs
 * @route    GET /api/admin/logs/system
 * @access   Private (Admin only)
 */
const getSystemLogs = asyncHandler(async (req, res) => {
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 50);
  const result = await fetchLogs({
    query: { type: { $in: [LOG_TYPES.SYSTEM, LOG_TYPES.ERROR] } },
    page,
    limit,
    sortOrder: 'desc',
  });

  res.status(200).json({
    success: true,
    logs: result.rows,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
});

/**
 * @desc     Clear logs from database
 * @route    DELETE /api/admin/logs
 * @access   Private (Admin only)
 *
 * Body params:
 *   scope  - 'all' | 'events' | 'alerts'  (default: 'all')
 *   period - 'all' | 'last_week'           (default: 'all')
 *            'last_week' deletes only records older than 7 days
 */
const clearLogs = asyncHandler(async (req, res) => {
  const scope = String(req.body?.scope || req.query?.scope || 'all').trim().toLowerCase();
  const period = String(req.body?.period || req.query?.period || 'all').trim().toLowerCase();

  if (!['all', 'events', 'alerts'].includes(scope)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid scope. Allowed: all, events, alerts.',
    });
  }

  if (!['all', 'last_week'].includes(period)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid period. Allowed: all, last_week.',
    });
  }

  // Build date filter: 'last_week' removes records older than 7 days
  const dateFilter = period === 'last_week'
    ? { createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    : {};

  let deletedEvents = 0;
  let deletedAlerts = 0;

  if (scope === 'all' || scope === 'events') {
    const eventDeleteResult = await AuditEventModel.deleteMany(dateFilter);
    deletedEvents = Number(eventDeleteResult?.deletedCount || 0);
  }

  if (scope === 'all' || scope === 'alerts') {
    const alertDeleteResult = await AuditAlertModel.deleteMany(dateFilter);
    deletedAlerts = Number(alertDeleteResult?.deletedCount || 0);
  }

  const periodLabel = period === 'last_week' ? 'older than 7 days' : 'all records';
  res.status(200).json({
    success: true,
    message: `Logs cleared successfully (${periodLabel}).`,
    deleted: {
      events: deletedEvents,
      alerts: deletedAlerts,
      total: deletedEvents + deletedAlerts,
    },
    scope,
    period,
  });
});

/**
 * @desc     Export logs as CSV/JSON
 * @route    GET /api/admin/logs/export
 * @access   Private (Admin only)
 */
const exportLogs = asyncHandler(async (req, res) => {
  const {
    type,
    format = 'json',
    startDate,
    endDate,
    category,
    eventType,
    status,
    brokerId,
    customerId,
    actorId,
    source,
    minAmountDelta,
    maxAmountDelta,
  } = req.query;

  const query = buildBaseQuery({
    type,
    search: '',
    startDate,
    endDate,
    category,
    eventType,
    status,
    brokerId,
    customerId,
    actorId,
    source,
    minAmountDelta,
    maxAmountDelta,
  });
  const rows = await AuditEventModel.find(query)
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  const mappedRows = rows.map(mapLogResponse);

  if (format === 'csv') {
    const headers = [
      'ID',
      'Type',
      'Severity',
      'EventType',
      'Status',
      'Message',
      'Timestamp',
      'RequestId',
      'Metadata',
    ];

    const csvRows = mappedRows.map((log) => [
      log.id,
      log.type,
      log.severity,
      log.eventType,
      log.status,
      `"${String(log.message || '').replace(/"/g, '""')}"`,
      new Date(log.timestamp).toISOString(),
      log.requestId || '',
      `"${JSON.stringify(log.metadata || {}).replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(','), ...csvRows.map((row) => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=logs_${Date.now()}.csv`);
    return res.send(csv);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=logs_${Date.now()}.json`);
  res.json({
    exportedAt: new Date(),
    totalLogs: mappedRows.length,
    logs: mappedRows,
  });
});

export {
  getAllLogs,
  getSecurityLogs,
  getTransactionLogs,
  getDataLogs,
  getSystemLogs,
  clearLogs,
  exportLogs,
  addLogEntry,
  LOG_TYPES,
};
