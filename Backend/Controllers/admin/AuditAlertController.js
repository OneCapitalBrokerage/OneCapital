import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import AuditAlertModel from '../../Model/System/AuditAlertModel.js';

const parsePage = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const parseLimit = (value, fallback = 50) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 200);
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

const toTitleCase = (value) =>
  String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const humanizeToken = (value) => toTitleCase(String(value || '').replace(/[_-]+/g, ' ').trim());

const getPerformedBy = (alert) => humanizeToken(alert?.actor_type || 'system');

const getReference = (alert) => alert?.entity_ref || alert?.latest_event_ref || '';

const buildAlertQuery = ({
  status,
  severity,
  ruleKey,
  brokerId,
  customerId,
  search,
  startDate,
  endDate,
}) => {
  const query = {};

  if (status && status !== 'all') query.status = String(status).toLowerCase();
  if (severity && severity !== 'all') query.severity = String(severity).toLowerCase();
  if (ruleKey) query.rule_key = String(ruleKey).trim();
  if (brokerId) query.broker_id_str = String(brokerId).trim();
  if (customerId) query.customer_id_str = String(customerId).trim();

  if (search) {
    const pattern = String(search).trim();
    query.$or = [
      { title: { $regex: pattern, $options: 'i' } },
      { message: { $regex: pattern, $options: 'i' } },
      { rule_key: { $regex: pattern, $options: 'i' } },
      { broker_id_str: { $regex: pattern, $options: 'i' } },
      { customer_id_str: { $regex: pattern, $options: 'i' } },
      { actor_id_str: { $regex: pattern, $options: 'i' } },
      { event_type: { $regex: pattern, $options: 'i' } },
    ];
  }

  const from = parseDate(startDate);
  const to = parseDate(endDate, true);
  if (from || to) {
    query.last_seen_at = {};
    if (from) query.last_seen_at.$gte = from;
    if (to) query.last_seen_at.$lte = to;
  }

  return query;
};

const mapAlertResponse = (alert) => ({
  id: alert.alert_id || alert._id?.toString?.() || '',
  ruleKey: alert.rule_key || '',
  severity: alert.severity || 'medium',
  status: alert.status || 'open',
  title: alert.title || '',
  message: alert.message || '',
  eventType: alert.event_type || '',
  performedBy: getPerformedBy(alert),
  brokerId: alert.broker_id_str || '',
  customerId: alert.customer_id_str || '',
  entityType: alert.entity_type || '',
  entityRef: alert.entity_ref || '',
  reference: getReference(alert),
  latestEventRef: alert.latest_event_ref || '',
  requestId: alert.request_id || '',
  amountDelta: Number(alert.amount_delta || 0),
  amountAbs: Number(alert.amount_abs || 0),
  occurrenceCount: Number(alert.occurrence_count || 1),
  tags: alert.tags || [],
  context: alert.context || {},
  firstSeenAt: alert.first_seen_at || alert.createdAt || null,
  lastSeenAt: alert.last_seen_at || alert.updatedAt || null,
  resolutionNote: alert.resolution_note || '',
  resolvedBy: alert.resolved_by_str || '',
  resolvedAt: alert.resolved_at || null,
});

/**
 * @desc     Get admin audit alerts (funds/margin anti-cheat)
 * @route    GET /api/admin/logs/alerts
 * @access   Private (Admin only)
 */
const getAuditAlerts = asyncHandler(async (req, res) => {
  const {
    status = 'open',
    severity = 'all',
    ruleKey,
    brokerId,
    customerId,
    search,
    startDate,
    endDate,
    sortOrder = 'desc',
  } = req.query;

  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 50);
  const skip = (page - 1) * limit;

  const query = buildAlertQuery({
    status,
    severity,
    ruleKey,
    brokerId,
    customerId,
    search,
    startDate,
    endDate,
  });

  const sort = sortOrder === 'asc'
    ? { last_seen_at: 1, createdAt: 1 }
    : { severity: -1, last_seen_at: -1, createdAt: -1 };

  const [rows, total] = await Promise.all([
    AuditAlertModel.find(query).sort(sort).skip(skip).limit(limit).lean(),
    AuditAlertModel.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    alerts: rows.map(mapAlertResponse),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc     Get audit alert summary stats
 * @route    GET /api/admin/logs/alerts/stats
 * @access   Private (Admin only)
 */
const getAuditAlertStats = asyncHandler(async (_req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalOpen,
    totalAcknowledged,
    totalResolved,
    totalIgnored,
    totalCriticalOpen,
    newLast24h,
    topRules,
  ] = await Promise.all([
    AuditAlertModel.countDocuments({ status: 'open' }),
    AuditAlertModel.countDocuments({ status: 'acknowledged' }),
    AuditAlertModel.countDocuments({ status: 'resolved' }),
    AuditAlertModel.countDocuments({ status: 'ignored' }),
    AuditAlertModel.countDocuments({ status: 'open', severity: 'critical' }),
    AuditAlertModel.countDocuments({ createdAt: { $gte: since24h } }),
    AuditAlertModel.aggregate([
      { $match: { status: { $in: ['open', 'acknowledged'] } } },
      { $group: { _id: '$rule_key', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
  ]);

  res.status(200).json({
    success: true,
    stats: {
      open: totalOpen,
      acknowledged: totalAcknowledged,
      resolved: totalResolved,
      ignored: totalIgnored,
      criticalOpen: totalCriticalOpen,
      newLast24h,
      topRules: topRules.map((r) => ({ ruleKey: r._id, count: r.count })),
    },
  });
});

/**
 * @desc     Update audit alert status
 * @route    PATCH /api/admin/logs/alerts/:id/status
 * @access   Private (Admin only)
 */
const updateAuditAlertStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, note = '' } = req.body || {};

  const nextStatus = String(status || '').trim().toLowerCase();
  const allowed = ['open', 'acknowledged', 'resolved', 'ignored'];
  if (!allowed.includes(nextStatus)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Allowed: ${allowed.join(', ')}`,
    });
  }

  const lookup = [{ alert_id: id }];
  if (mongoose.Types.ObjectId.isValid(id)) {
    lookup.unshift({ _id: id });
  }

  const alert = await AuditAlertModel.findOne({ $or: lookup });

  if (!alert) {
    return res.status(404).json({
      success: false,
      message: 'Alert not found.',
    });
  }

  alert.status = nextStatus;
  alert.resolution_note = String(note || '');

  if (nextStatus === 'resolved' || nextStatus === 'ignored') {
    alert.resolved_at = new Date();
    alert.resolved_by = req.user?._id;
    alert.resolved_by_str = req.user?.admin_id || req.user?.login_id || req.user?.role || '';
  } else {
    alert.resolved_at = undefined;
    alert.resolved_by = undefined;
    alert.resolved_by_str = '';
  }

  await alert.save();

  res.status(200).json({
    success: true,
    message: 'Alert status updated.',
    alert: mapAlertResponse(alert),
  });
});

export {
  getAuditAlerts,
  getAuditAlertStats,
  updateAuditAlertStatus,
};
