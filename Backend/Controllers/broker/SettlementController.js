import asyncHandler from 'express-async-handler';
import FundModel from '../../Model/FundManagement/FundModel.js';
import {
  getSettlementWindowRangeFromDate,
  isWithinWeekendSettlementWindow,
  parseSettlementMetadataFromNotes,
} from '../../Utils/weeklySettlement.js';
import { runWeeklySettlementForBroker } from '../../services/weeklySettlementService.js';

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
};

const getBrokerContext = (req) => ({
  brokerId: req.user?._id,
  brokerIdStr: req.user?.login_id || req.user?.stringBrokerId || req.user?.broker_id || '',
});

const weekendWindowPayload = (date = new Date()) => {
  const { windowStartUtc, windowEndUtc } = getSettlementWindowRangeFromDate(date);
  return {
    windowStart: windowStartUtc.toISOString(),
    windowEnd: windowEndUtc.toISOString(),
    timezone: 'Asia/Kolkata',
  };
};

const rejectClosedSettlementWindow = (res, date = new Date()) =>
  res.status(403).json({
    success: false,
    code: 'SETTLEMENT_WINDOW_CLOSED',
    message: 'Manual settlement is available only on Saturday and Sunday (IST).',
    settlementWindow: weekendWindowPayload(date),
  });

/**
 * @desc     Run weekly settlement manually for broker clients
 * @route    POST /api/broker/settlement/weekly/run
 * @access   Private (Broker only)
 */
const runWeeklySettlement = asyncHandler(async (req, res) => {
  const { brokerId, brokerIdStr } = getBrokerContext(req);
  if (!brokerIdStr) {
    return res.status(400).json({
      success: false,
      message: 'Broker identifier missing for settlement.',
    });
  }

  const { effectiveAt, note = '', force = false } = req.body || {};
  const requestNow = new Date();
  if (!isWithinWeekendSettlementWindow(requestNow)) {
    return rejectClosedSettlementWindow(res, requestNow);
  }

  const effectiveDate = effectiveAt || requestNow;
  if (!isWithinWeekendSettlementWindow(effectiveDate)) {
    return res.status(400).json({
      success: false,
      code: 'SETTLEMENT_WINDOW_CLOSED',
      message: 'Settlement effectiveAt must fall on Saturday or Sunday (IST).',
      settlementWindow: weekendWindowPayload(requestNow),
    });
  }

  const summary = await runWeeklySettlementForBroker({
    brokerId,
    brokerIdStr,
    mode: 'manual',
    effectiveAt: effectiveDate,
    note,
    force: Boolean(force),
    req,
  });

  res.status(200).json({
    success: true,
    code: summary.created > 0 ? 'SETTLEMENT_COMPLETED' : 'SETTLEMENT_ALREADY_COMPLETED_FOR_CYCLE',
    message: summary.created > 0
      ? 'Weekly settlement completed.'
      : 'All eligible clients are already settled for the current weekend cycle.',
    settlement: summary,
  });
});

/**
 * @desc     Get weekly settlement history grouped by settlement run reference
 * @route    GET /api/broker/settlement/weekly/history
 * @access   Private (Broker only)
 */
const getWeeklySettlementHistory = asyncHandler(async (req, res) => {
  const { brokerIdStr } = getBrokerContext(req);
  if (!brokerIdStr) {
    return res.status(400).json({
      success: false,
      message: 'Broker identifier missing for settlement history.',
    });
  }

  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const basePipeline = [
    { $match: { broker_id_str: brokerIdStr } },
    { $unwind: '$transactions' },
    {
      $match: {
        'transactions.type': 'weekly_settlement',
        'transactions.reference': { $exists: true, $ne: '' },
      },
    },
    {
      $project: {
        customer_id_str: 1,
        reference: '$transactions.reference',
        amount: '$transactions.amount',
        timestamp: '$transactions.timestamp',
        notes: '$transactions.notes',
      },
    },
  ];

  const [rows, countRows] = await Promise.all([
    FundModel.aggregate([
      ...basePipeline,
      {
        $group: {
          _id: '$reference',
          settledAt: { $max: '$timestamp' },
          totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
          customersAffected: { $sum: 1 },
          customers: { $addToSet: '$customer_id_str' },
          notes: { $first: '$notes' },
        },
      },
      { $sort: { settledAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]),
    FundModel.aggregate([
      ...basePipeline,
      { $group: { _id: '$reference' } },
      { $count: 'total' },
    ]),
  ]);

  const total = Number(countRows?.[0]?.total || 0);

  const history = rows.map((row) => {
    const metadata = parseSettlementMetadataFromNotes(row.notes) || {};
    return {
      runRef: row._id,
      settledAt: row.settledAt,
      mode: metadata.mode || 'manual',
      weekStart: metadata.weekStart || null,
      weekEnd: metadata.weekEnd || null,
      cycleStart: metadata.cycleStart || null,
      cycleEnd: metadata.cycleEnd || null,
      note: metadata.note || '',
      customersAffected: Number(row.customersAffected || 0),
      totalAmount: Number(row.totalAmount || 0),
      customersPreview: Array.isArray(row.customers) ? row.customers.slice(0, 5) : [],
    };
  });

  res.status(200).json({
    success: true,
    history,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc     Run weekly settlement for a single customer
 * @route    POST /api/broker/settlement/customer/:customerIdStr/run
 * @access   Private (Broker only)
 */
const runCustomerSettlement = asyncHandler(async (req, res) => {
  const { brokerId, brokerIdStr } = getBrokerContext(req);
  if (!brokerIdStr) {
    return res.status(400).json({
      success: false,
      message: 'Broker identifier missing for settlement.',
    });
  }

  const { customerIdStr } = req.params;
  if (!customerIdStr) {
    return res.status(400).json({
      success: false,
      message: 'Customer ID is required for per-customer settlement.',
    });
  }

  const requestNow = new Date();
  if (!isWithinWeekendSettlementWindow(requestNow)) {
    return rejectClosedSettlementWindow(res, requestNow);
  }

  const fund = await FundModel.findOne({
    broker_id_str: brokerIdStr,
    customer_id_str: customerIdStr,
  }).select('_id');

  if (!fund) {
    return res.status(404).json({
      success: false,
      message: 'No fund record found for this customer under your broker account.',
    });
  }

  const { effectiveAt, note = '', force = false } = req.body || {};
  const effectiveDate = effectiveAt || requestNow;
  if (!isWithinWeekendSettlementWindow(effectiveDate)) {
    return res.status(400).json({
      success: false,
      code: 'SETTLEMENT_WINDOW_CLOSED',
      message: 'Settlement effectiveAt must fall on Saturday or Sunday (IST).',
      settlementWindow: weekendWindowPayload(requestNow),
    });
  }

  const summary = await runWeeklySettlementForBroker({
    brokerId,
    brokerIdStr,
    customerIdStr,
    mode: 'manual',
    effectiveAt: effectiveDate,
    note: note || `Manual per-customer settlement for ${customerIdStr}`,
    force: Boolean(force),
    req,
  });

  res.status(200).json({
    success: true,
    code: summary.created > 0 ? 'SETTLEMENT_COMPLETED' : 'SETTLEMENT_ALREADY_COMPLETED_FOR_CYCLE',
    message: summary.created > 0
      ? `Settlement completed for ${customerIdStr}.`
      : `This client is already settled for the current weekend cycle.`,
    settlement: summary,
  });
});

export {
  runWeeklySettlement,
  runCustomerSettlement,
  getWeeklySettlementHistory,
};
