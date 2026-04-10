// Controllers/broker/WithdrawalController.js
// Broker Withdrawal Requests - Manage client withdrawal requests

import asyncHandler from 'express-async-handler';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import WithdrawalRequestModel from '../../Model/FundManagement/WithdrawalRequestModel.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';
import {
  getWeeklyRealizedFromOrders,
  reconcileMissingRealizedTransactions,
} from '../../services/fundPnlCanonicalService.js';

const MANUAL_WITHDRAWAL_METHODS = new Set([
  'upi',
  'imps',
  'neft',
  'rtgs',
  'bank_transfer',
  'internal',
  'other',
]);

const MANUAL_WITHDRAWAL_METHOD_LABELS = {
  upi: 'UPI',
  imps: 'IMPS',
  neft: 'NEFT',
  rtgs: 'RTGS',
  bank_transfer: 'Bank Transfer',
  internal: 'Internal',
  other: 'Other',
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (value) =>
  toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sanitizeText = (value, maxLen = 200) => String(value || '').trim().slice(0, maxLen);

const normalizeManualWithdrawalMethod = (value) => {
  const method = String(value || 'bank_transfer').trim().toLowerCase();
  if (MANUAL_WITHDRAWAL_METHODS.has(method)) return method;
  return 'bank_transfer';
};

const toIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getBrokerCustomerClauses = (brokerId, brokerIdStr) => {
  const clauses = [{ broker_id: brokerId }, { attached_broker_id: brokerId }];
  if (brokerIdStr) {
    clauses.push({ broker_id_str: brokerIdStr });
  }
  return clauses;
};

const getPendingWithdrawalsTotal = async ({ customerMongoId, brokerIdStr }) => {
  if (!customerMongoId) return 0;
  const rows = await WithdrawalRequestModel.aggregate([
    {
      $match: {
        customer_id: customerMongoId,
        broker_id_str: brokerIdStr,
        status: { $in: ['pending', 'processing'] },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return toNumber(rows[0]?.total);
};

const findOwnedCustomer = async (customerId, brokerId, brokerIdStr) =>
  CustomerModel.findOne({
    customer_id: customerId,
    $or: getBrokerCustomerClauses(brokerId, brokerIdStr),
  });

const findFundForCustomer = async ({ customer, brokerIdStr }) => {
  if (!customer) return null;

  let fund = await FundModel.findOne({
    customer_id_str: customer.customer_id,
    broker_id_str: brokerIdStr,
  });

  if (!fund) {
    fund = await FundModel.findOne({ customer_id: customer._id });
  }

  if (!fund) {
    fund = await FundModel.findOne({ customer_id_str: customer.customer_id });
  }

  return fund;
};

const buildManualWithdrawalNote = ({ method, reference, notes, paidAt }) => {
  const methodLabel = MANUAL_WITHDRAWAL_METHOD_LABELS[method] || MANUAL_WITHDRAWAL_METHOD_LABELS.other;
  const parts = [`Withdrawal entry (${methodLabel})`];
  if (reference) parts.push(`Ref: ${reference}`);
  if (paidAt) parts.push(`Paid at: ${paidAt.toISOString()}`);
  if (notes) parts.push(`Broker note: ${notes}`);
  return parts.join(' | ');
};

const isManualWithdrawalTransaction = (transaction = {}) => {
  if (String(transaction?.type || '').toLowerCase() !== 'withdrawal') return false;
  const notes = String(transaction?.notes || '').toLowerCase();
  return notes.includes('withdrawal entry');
};

const parseManualWithdrawalMethodFromNotes = (notes = '') => {
  const text = String(notes || '');
  const match = text.match(/withdrawal entry \(([^)]+)\)/i);
  if (!match?.[1]) {
    if (text.toLowerCase().includes('withdrawal approved')) return 'bank_transfer';
    return 'other';
  }
  const raw = String(match[1]).trim().toLowerCase();
  const methodKey = Object.entries(MANUAL_WITHDRAWAL_METHOD_LABELS)
    .find(([, label]) => label.toLowerCase() === raw)?.[0];
  return methodKey || 'other';
};

const mapManualWithdrawalResponse = ({ transaction, customer }) => {
  const method = parseManualWithdrawalMethodFromNotes(transaction?.notes || '');
  return {
    id: transaction?._id?.toString?.() || '',
    customerId: customer?.customer_id || '',
    customerName: customer?.name || '',
    amount: Math.abs(toNumber(transaction?.amount)),
    method,
    methodLabel: MANUAL_WITHDRAWAL_METHOD_LABELS[method] || MANUAL_WITHDRAWAL_METHOD_LABELS.other,
    paidAt: transaction?.timestamp || null,
    reference: String(transaction?.reference || '').trim(),
    notes: String(transaction?.notes || '').trim(),
    status: String(transaction?.status || 'completed').toLowerCase(),
  };
};

const computeWithdrawableNetCashForCustomer = async ({ customer, brokerIdStr, nowUtc = new Date() }) => {
  const fund = await findFundForCustomer({ customer, brokerIdStr });
  if (!fund) {
    return {
      fund: null,
      netCash: 0,
      pendingWithdrawals: 0,
      withdrawableNetCash: 0,
      weekBoundaryStart: null,
    };
  }

  const canonicalWeek = await getWeeklyRealizedFromOrders({
    fund,
    customerIdStr: customer.customer_id,
    brokerIdStr,
    nowUtc,
  });

  const reconciliation = reconcileMissingRealizedTransactions({
    fund,
    weekOrders: canonicalWeek.weekOrders,
    processedBy: null,
    dryRun: false,
  });

  if (reconciliation.missingCount > 0) {
    await fund.save();

    await writeAuditSuccess({
      req: null,
      type: 'transaction',
      eventType: 'FUND_REALIZED_LEDGER_BACKFILL',
      category: 'funds',
      message: `Backfilled ${reconciliation.missingCount} missing realized ledger entries for customer ${customer.customer_id} during withdrawable computation.`,
      target: {
        type: 'customer',
        id: customer._id,
        id_str: customer.customer_id,
      },
      entity: {
        type: 'fund',
        id: fund._id,
        ref: customer.customer_id,
      },
      broker: {
        broker_id_str: brokerIdStr,
      },
      customer: {
        customer_id: customer._id,
        customer_id_str: customer.customer_id,
      },
      amountDelta: reconciliation.missingPnlTotal,
      metadata: {
        missingCount: reconciliation.missingCount,
        missingPnlTotal: reconciliation.missingPnlTotal,
        missingOrderIds: reconciliation.missingOrders.map((order) => String(order._id)),
      },
      note: 'Automatic realized ledger reconciliation in canonical net-cash computation.',
      source: 'system',
    });
  }

  const realizedPnlThisWeek = canonicalWeek.realizedPnlThisWeek;

  const withdrawalTxThisWeek = (fund.transactions || [])
    .filter((t) => {
      const ts = t.timestamp ? new Date(t.timestamp) : null;
      return ts && ts >= canonicalWeek.boundaryStartUtc && t.type === 'withdrawal';
    })
    .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);

  const netCash = Number((realizedPnlThisWeek - withdrawalTxThisWeek).toFixed(2));
  const pendingWithdrawals = await getPendingWithdrawalsTotal({
    customerMongoId: customer?._id,
    brokerIdStr,
  });
  const withdrawableNetCash = Math.max(0, netCash - pendingWithdrawals);

  return {
    fund,
    netCash,
    pendingWithdrawals,
    withdrawableNetCash,
    weekBoundaryStart: canonicalWeek.boundaryStartUtc?.toISOString?.() || null,
  };
};

const getIstNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

const buildWithdrawalRequestRef = () => {
  const istNow = getIstNow();
  const year = istNow.getFullYear();
  const month = String(istNow.getMonth() + 1).padStart(2, '0');
  const day = String(istNow.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WD-${year}${month}${day}-${rand}`;
};

const buildStatusQuery = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized || normalized === 'all') return null;
  if (normalized === 'pending') return { $in: ['pending', 'processing'] };
  if (normalized === 'approved') return { $in: ['approved', 'completed'] };
  if (normalized === 'rejected') return { $in: ['rejected', 'failed', 'cancelled'] };
  return normalized;
};

const hydrateCustomerNames = async (withdrawals) => {
  const missingIds = withdrawals
    .filter((w) => w.customer_id_str)
    .map((w) => w.customer_id_str);

  if (missingIds.length === 0) return {};

  const customers = await CustomerModel.find({
    customer_id: { $in: missingIds },
  }).select('customer_id name');

  return customers.reduce((acc, customer) => {
    acc[customer.customer_id] = customer.name;
    return acc;
  }, {});
};

const mapWithdrawalResponse = (withdrawal, customerName = '') => ({
  id: withdrawal._id?.toString(),
  requestRef: withdrawal.request_ref || '',
  customerId: withdrawal.customer_id_str,
  clientId: withdrawal.customer_id_str,
  customerName: customerName || 'Unknown',
  clientName: customerName || 'Unknown',
  name: customerName || 'Unknown',
  amount: toNumber(withdrawal.amount),
  approvedAmount: toNumber(withdrawal.approved_amount),
  status: withdrawal.status,
  bankAccount: [
    withdrawal.bank_details?.bank_name,
    withdrawal.bank_details?.account_number_masked,
  ].filter(Boolean).join(' • '),
  bankDetails: withdrawal.bank_details || {},
  rejectionReason: withdrawal.rejection_reason || '',
  reviewedAt: withdrawal.reviewed_at || null,
  transferredAt: withdrawal.transferred_at || null,
  utrNumber: withdrawal.utr_number || '',
  createdAt: withdrawal.createdAt,
});

/**
 * @desc     Get withdrawal requests
 * @route    GET /api/broker/withdrawals
 * @access   Private (Broker only)
 */
const getWithdrawals = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { status = 'pending', page = 1, limit = 20 } = req.query;

  const query = { broker_id_str: brokerIdStr };
  const statusQuery = buildStatusQuery(status);
  if (statusQuery) {
    query.status = statusQuery;
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [withdrawals, total] = await Promise.all([
    WithdrawalRequestModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit),
    WithdrawalRequestModel.countDocuments(query),
  ]);

  const customerNameMap = await hydrateCustomerNames(withdrawals);

  // Batch-fetch fund records to compute boundary-filtered net cash per customer.
  const uniqueCustomerIds = [...new Set(withdrawals.map((w) => w.customer_id_str).filter(Boolean))];
  const funds = await FundModel.find({
    customer_id_str: { $in: uniqueCustomerIds },
    broker_id_str: brokerIdStr,
  }).select('customer_id_str transactions');

  const nowUtc = new Date();
  const netCashMap = {};
  for (const fund of funds) {
    // eslint-disable-next-line no-await-in-loop
    const canonicalWeek = await getWeeklyRealizedFromOrders({
      fund,
      customerIdStr: fund.customer_id_str,
      brokerIdStr,
      nowUtc,
    });
    netCashMap[fund.customer_id_str] = Number(canonicalWeek.realizedPnlThisWeek.toFixed(2));
  }

  const response = withdrawals.map((withdrawal) => ({
    ...mapWithdrawalResponse(withdrawal, customerNameMap[withdrawal.customer_id_str]),
    netCash: netCashMap[withdrawal.customer_id_str] ?? null,
  }));

  res.status(200).json({
    success: true,
    withdrawals: response,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc     Approve withdrawal request
 * @route    POST /api/broker/withdrawals/:id/approve
 * @access   Private (Broker only)
 */
const approveWithdrawal = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { transactionId } = req.body || {};

  const withdrawal = await WithdrawalRequestModel.findOne({ _id: id, broker_id_str: brokerIdStr });

  if (!withdrawal) {
    return res.status(404).json({
      success: false,
      message: 'Withdrawal request not found.',
    });
  }

  if (!['pending', 'processing'].includes(withdrawal.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot approve a ${withdrawal.status} request.`,
    });
  }

  const amount = toNumber(withdrawal.amount);
  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid withdrawal amount.',
    });
  }
  const now = new Date();
  const fundQuery = {
    customer_id_str: withdrawal.customer_id_str,
    broker_id_str: brokerIdStr,
  };

  const customer = await CustomerModel.findOne({
    customer_id: withdrawal.customer_id_str,
    $or: getBrokerCustomerClauses(brokerId, brokerIdStr),
  }).select('customer_id _id name');

  const fundForReconcile = await FundModel.findOne(fundQuery);
  if (customer && fundForReconcile) {
    const canonicalWeek = await getWeeklyRealizedFromOrders({
      fund: fundForReconcile,
      customerIdStr: customer.customer_id,
      brokerIdStr,
      nowUtc: now,
    });
    const reconciliation = reconcileMissingRealizedTransactions({
      fund: fundForReconcile,
      weekOrders: canonicalWeek.weekOrders,
      processedBy: brokerId,
      dryRun: false,
    });
    if (reconciliation.missingCount > 0) {
      await fundForReconcile.save();

      await writeAuditSuccess({
        req,
        type: 'transaction',
        eventType: 'FUND_REALIZED_LEDGER_BACKFILL',
        category: 'funds',
        message: `Backfilled ${reconciliation.missingCount} missing realized ledger entries for customer ${customer.customer_id} before withdrawal approval.`,
        target: {
          type: 'customer',
          id: customer._id,
          id_str: customer.customer_id,
        },
        entity: {
          type: 'fund',
          id: fundForReconcile._id,
          ref: customer.customer_id,
        },
        broker: {
          broker_id: brokerId,
          broker_id_str: brokerIdStr,
        },
        customer: {
          customer_id: customer._id,
          customer_id_str: customer.customer_id,
        },
        amountDelta: reconciliation.missingPnlTotal,
        metadata: {
          missingCount: reconciliation.missingCount,
          missingPnlTotal: reconciliation.missingPnlTotal,
          missingOrderIds: reconciliation.missingOrders.map((order) => String(order._id)),
        },
        note: 'Automatic realized ledger reconciliation before broker approval flow.',
      });
    }
  }

  // Record withdrawal in the fund ledger.
  // pnl_balance is a cumulative realized P&L counter managed by trade closes only —
  // withdrawals do not deduct from it. Withdrawable eligibility was already verified
  // against the boundary-filtered realizedPnlThisWeek when the customer made the request.
  const updatedFund = await FundModel.findOneAndUpdate(
    fundQuery,
    {
      $set: { last_calculated_at: now },
      $push: {
        transactions: {
          type: 'withdrawal',
          amount,
          notes: 'Withdrawal approved',
          reference: withdrawal.request_ref || withdrawal._id?.toString() || '',
          processedBy: brokerId,
          timestamp: now,
        },
      },
    },
    { new: true }
  );

  if (!updatedFund) {
    return res.status(404).json({
      success: false,
      message: 'Customer fund record not found.',
    });
  }

  withdrawal.status = 'approved';
  withdrawal.reviewed_by = brokerId;
  withdrawal.reviewed_at = now;
  withdrawal.transferred_at = now;
  withdrawal.approved_amount = amount;
  withdrawal.utr_number = transactionId || '';
  await withdrawal.save();
  const withdrawalRef = withdrawal.request_ref || withdrawal._id?.toString() || '';
  const approvalNoteParts = [`Approved amount: ${formatCurrency(amount)}.`];
  if (transactionId) {
    approvalNoteParts.push(`Transfer reference: ${transactionId}.`);
  }

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'WITHDRAWAL_APPROVE',
    category: 'funds',
    message: `Withdrawal request ${withdrawalRef} for customer ${withdrawal.customer_id_str} was approved by broker.`,
    target: {
      type: 'customer',
      id: withdrawal.customer_id,
      id_str: withdrawal.customer_id_str,
    },
    entity: {
      type: 'withdrawal_request',
      id: withdrawal._id,
      ref: withdrawalRef,
    },
    broker: {
      broker_id: brokerId,
      broker_id_str: brokerIdStr,
    },
    customer: {
      customer_id: withdrawal.customer_id,
      customer_id_str: withdrawal.customer_id_str,
    },
    amountDelta: -amount,
    note: approvalNoteParts.join(' '),
    metadata: {
      transactionId: transactionId || '',
      requestRef: withdrawalRef,
      status: withdrawal.status,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Withdrawal approved.',
    withdrawal: mapWithdrawalResponse(withdrawal),
  });
});

const isLegacyApprovedWithdrawalTransaction = (transaction = {}) => {
  if (String(transaction?.type || '').toLowerCase() !== 'withdrawal') return false;
  const notes = String(transaction?.notes || '').toLowerCase();
  return notes.includes('withdrawal approved');
};

/**
 * @desc     Reject withdrawal request
 * @route    POST /api/broker/withdrawals/:id/reject
 * @access   Private (Broker only)
 */
const rejectWithdrawal = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { reason } = req.body || {};

  const withdrawal = await WithdrawalRequestModel.findOne({ _id: id, broker_id_str: brokerIdStr });

  if (!withdrawal) {
    return res.status(404).json({
      success: false,
      message: 'Withdrawal request not found.',
    });
  }

  if (!['pending', 'processing'].includes(withdrawal.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot reject a ${withdrawal.status} request.`,
    });
  }

  const previousStatus = withdrawal.status;

  withdrawal.status = 'rejected';
  withdrawal.reviewed_by = brokerId;
  withdrawal.reviewed_at = new Date();
  withdrawal.rejection_reason = reason || '';
  await withdrawal.save();
  const withdrawalRef = withdrawal.request_ref || withdrawal._id?.toString() || '';
  const rejectionNote = reason
    ? `Reason: ${reason}.`
    : 'Rejected during broker review.';

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'WITHDRAWAL_REJECT',
    category: 'funds',
    message: `Withdrawal request ${withdrawalRef} for customer ${withdrawal.customer_id_str} was rejected by broker.`,
    target: {
      type: 'customer',
      id: withdrawal.customer_id,
      id_str: withdrawal.customer_id_str,
    },
    entity: {
      type: 'withdrawal_request',
      id: withdrawal._id,
      ref: withdrawalRef,
    },
    broker: {
      broker_id: brokerId,
      broker_id_str: brokerIdStr,
    },
    customer: {
      customer_id: withdrawal.customer_id,
      customer_id_str: withdrawal.customer_id_str,
    },
    note: rejectionNote,
    metadata: {
      previousStatus,
      newStatus: withdrawal.status,
      amount: toNumber(withdrawal.amount),
      requestRef: withdrawalRef,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Withdrawal rejected.',
    withdrawal: mapWithdrawalResponse(withdrawal),
  });
});

/**
 * @desc     Get withdrawal statistics
 * @route    GET /api/broker/withdrawals/stats
 * @access   Private (Broker only)
 */
const getWithdrawalStats = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;

  const withdrawals = await WithdrawalRequestModel.find({ broker_id_str: brokerIdStr }).select('amount status');

  const stats = {
    pending: { count: 0, amount: 0 },
    approved: { count: 0, amount: 0 },
    rejected: { count: 0, amount: 0 },
    total: withdrawals.length,
    totalAmount: 0,
  };

  for (const withdrawal of withdrawals) {
    const amount = toNumber(withdrawal.amount);
    stats.totalAmount += amount;
    if (withdrawal.status === 'pending' || withdrawal.status === 'processing') {
      stats.pending.count += 1;
      stats.pending.amount += amount;
    } else if (withdrawal.status === 'approved' || withdrawal.status === 'completed') {
      stats.approved.count += 1;
      stats.approved.amount += amount;
    } else if (withdrawal.status === 'rejected' || withdrawal.status === 'failed' || withdrawal.status === 'cancelled') {
      stats.rejected.count += 1;
      stats.rejected.amount += amount;
    }
  }

  res.status(200).json({
    success: true,
    stats,
  });
});

/**
 * @desc     Record manual withdrawal entry (external payout confirmation)
 * @route    POST /api/broker/clients/:id/manual-withdrawals
 * @access   Private (Broker only)
 */
const createManualWithdrawal = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const {
    amount,
    method,
    paidAt,
    reference,
    notes,
  } = req.body || {};

  const parsedAmount = toNumber(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Valid amount is required.',
    });
  }

  const normalizedMethod = normalizeManualWithdrawalMethod(method);
  const paidAtDate = paidAt ? toIsoDate(paidAt) : new Date();
  if (paidAt && !paidAtDate) {
    return res.status(400).json({
      success: false,
      message: 'Invalid paidAt date-time.',
    });
  }

  const sanitizedReference = sanitizeText(reference, 80);
  const sanitizedNotes = sanitizeText(notes, 240);

  const customer = await findOwnedCustomer(id, brokerId, brokerIdStr);
  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const wallet = await computeWithdrawableNetCashForCustomer({
    customer,
    brokerIdStr,
    nowUtc: paidAtDate || new Date(),
  });

  const { fund, netCash, pendingWithdrawals, withdrawableNetCash } = wallet;

  if (!fund) {
    return res.status(404).json({
      success: false,
      message: 'Customer fund record not found.',
    });
  }

  if (withdrawableNetCash <= 0) {
    return res.status(400).json({
      success: false,
      message: 'No withdrawable net cash available.',
      available: 0,
      netCash,
      pendingWithdrawals,
      requested: parsedAmount,
    });
  }

  if (parsedAmount > withdrawableNetCash) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient withdrawable net cash.',
      available: withdrawableNetCash,
      netCash,
      pendingWithdrawals,
      requested: parsedAmount,
    });
  }

  if (!fund.transactions) fund.transactions = [];

  const transaction = {
    type: 'withdrawal',
    amount: parsedAmount,
    notes: buildManualWithdrawalNote({
      method: normalizedMethod,
      reference: sanitizedReference,
      notes: sanitizedNotes,
      paidAt: paidAtDate,
    }),
    status: 'completed',
    reference: sanitizedReference,
    processedBy: brokerId,
    timestamp: paidAtDate,
  };

  fund.transactions.push(transaction);
  fund.last_calculated_at = new Date();
  await fund.save();

  const savedTx = fund.transactions[fund.transactions.length - 1] || transaction;

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'WITHDRAWAL_MANUAL_ENTRY_CREATE',
    category: 'funds',
    message: `Broker recorded manual withdrawal of ${formatCurrency(parsedAmount)} for customer ${customer.customer_id}.`,
    target: {
      type: 'customer',
      id: customer._id,
      id_str: customer.customer_id,
    },
    entity: {
      type: 'fund',
      id: fund._id,
      ref: customer.customer_id,
    },
    broker: {
      broker_id: brokerId,
      broker_id_str: brokerIdStr,
    },
    customer: {
      customer_id: customer._id,
      customer_id_str: customer.customer_id,
    },
    amountDelta: -parsedAmount,
    note: sanitizedNotes || `Manual withdrawal method: ${MANUAL_WITHDRAWAL_METHOD_LABELS[normalizedMethod]}.`,
    metadata: {
      method: normalizedMethod,
      methodLabel: MANUAL_WITHDRAWAL_METHOD_LABELS[normalizedMethod],
      paidAt: paidAtDate.toISOString(),
      reference: sanitizedReference,
      netCashBefore: netCash,
      pendingWithdrawals,
      withdrawableNetCashBefore: withdrawableNetCash,
      withdrawableNetCashAfter: Math.max(0, withdrawableNetCash - parsedAmount),
    },
  });

  res.status(201).json({
    success: true,
    message: 'Manual withdrawal recorded successfully.',
    withdrawal: {
      id: savedTx?._id?.toString?.() || '',
      customerId: customer.customer_id,
      customerName: customer.name,
      amount: parsedAmount,
      method: normalizedMethod,
      methodLabel: MANUAL_WITHDRAWAL_METHOD_LABELS[normalizedMethod],
      paidAt: paidAtDate.toISOString(),
      reference: sanitizedReference,
      notes: sanitizedNotes,
      status: 'completed',
    },
    wallet: {
      netCash,
      pendingWithdrawals,
      withdrawableNetCashBefore: withdrawableNetCash,
      withdrawableNetCashAfter: Math.max(0, withdrawableNetCash - parsedAmount),
    },
  });
});

/**
 * @desc     Get broker manual withdrawal history
 * @route    GET /api/broker/manual-withdrawals
 * @access   Private (Broker only)
 */
const getManualWithdrawals = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const {
    customerId,
    page = 1,
    limit = 20,
  } = req.query;

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

  let selectedCustomers = [];
  if (customerId) {
    const customer = await findOwnedCustomer(customerId, brokerId, brokerIdStr);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Client not found.',
      });
    }
    selectedCustomers = [customer];
  } else {
    selectedCustomers = await CustomerModel.find({
      $or: getBrokerCustomerClauses(brokerId, brokerIdStr),
    }).select('customer_id name _id');
  }

  const withdrawals = [];

  for (const customer of selectedCustomers) {
    // eslint-disable-next-line no-await-in-loop
    const fund = await findFundForCustomer({ customer, brokerIdStr });
    if (!fund?.transactions?.length) continue;

    const manualWithdrawals = fund.transactions
      .filter((transaction) => isManualWithdrawalTransaction(transaction) || isLegacyApprovedWithdrawalTransaction(transaction))
      .map((transaction) => mapManualWithdrawalResponse({ transaction, customer }));

    withdrawals.push(...manualWithdrawals);
  }

  withdrawals.sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0));

  const total = withdrawals.length;
  const skip = (parsedPage - 1) * parsedLimit;
  const paginated = withdrawals.slice(skip, skip + parsedLimit);

  res.status(200).json({
    success: true,
    withdrawals: paginated,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc     Get pending + approved withdrawal stats including manual entries
 * @route    GET /api/broker/manual-withdrawals/stats
 * @access   Private (Broker only)
 */
const getManualWithdrawalStats = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;

  const customers = await CustomerModel.find({
    $or: getBrokerCustomerClauses(brokerId, brokerIdStr),
  }).select('customer_id name _id');

  const rows = [];

  for (const customer of customers) {
    // eslint-disable-next-line no-await-in-loop
    const fund = await findFundForCustomer({ customer, brokerIdStr });
    if (!fund?.transactions?.length) continue;

    const entries = fund.transactions
      .filter((tx) => isManualWithdrawalTransaction(tx) || isLegacyApprovedWithdrawalTransaction(tx))
      .map((tx) => mapManualWithdrawalResponse({ transaction: tx, customer }));

    rows.push(...entries);
  }

  const totalAmount = rows.reduce((sum, row) => sum + toNumber(row.amount), 0);

  res.status(200).json({
    success: true,
    stats: {
      count: rows.length,
      totalAmount,
    },
  });
});

/**
 * @desc     Get withdrawable net cash summary for broker clients
 * @route    GET /api/broker/withdrawals/eligibility
 * @access   Private (Broker only)
 */
const getWithdrawalEligibility = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { customerId, search = '', limit = 100 } = req.query;

  const parsedLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 100));

  let customers = [];
  if (customerId) {
    const selected = await findOwnedCustomer(customerId, brokerId, brokerIdStr);
    if (!selected) {
      return res.status(404).json({
        success: false,
        message: 'Client not found.',
      });
    }
    customers = [selected];
  } else {
    const searchText = String(search || '').trim();
    const searchFilter = searchText
      ? {
        $or: [
          { customer_id: { $regex: searchText, $options: 'i' } },
          { name: { $regex: searchText, $options: 'i' } },
          { email: { $regex: searchText, $options: 'i' } },
          { phone: { $regex: searchText, $options: 'i' } },
        ],
      }
      : null;

    const query = searchFilter
      ? {
        $and: [
          { $or: getBrokerCustomerClauses(brokerId, brokerIdStr) },
          searchFilter,
        ],
      }
      : { $or: getBrokerCustomerClauses(brokerId, brokerIdStr) };

    customers = await CustomerModel.find(query)
      .select('customer_id name')
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .lean();
  }

  const rows = [];
  for (const customer of customers) {
    // eslint-disable-next-line no-await-in-loop
    const wallet = await computeWithdrawableNetCashForCustomer({ customer, brokerIdStr, nowUtc: new Date() });
    rows.push({
      customerId: customer.customer_id,
      customerName: customer.name || '',
      withdrawableNetCash: wallet.withdrawableNetCash,
      netCash: wallet.netCash,
      pendingWithdrawals: wallet.pendingWithdrawals,
      weekBoundaryStart: wallet.weekBoundaryStart,
    });
  }

  res.status(200).json({
    success: true,
    clients: rows,
    count: rows.length,
  });
});

// Helper function to create withdrawal request (called from customer side)
const createWithdrawalRequest = async (customerId, brokerId, amount, bankAccount, options = {}) => {
  const parsedAmount = toNumber(amount);
  if (parsedAmount <= 0) {
    throw new Error('Invalid withdrawal amount');
  }
  if (!options?.customerMongoId || !options?.brokerMongoId) {
    throw new Error('Customer and broker context is required for withdrawal request');
  }
  if (!bankAccount?.id) {
    throw new Error('Bank account is required for withdrawal request');
  }

  let requestRef = '';
  for (let i = 0; i < 3; i += 1) {
    const candidate = buildWithdrawalRequestRef();
    // Keep request refs practically unique and stable for customer tracking.
    // This avoids exposing Mongo ObjectId as the primary request reference.
    // eslint-disable-next-line no-await-in-loop
    const exists = await WithdrawalRequestModel.exists({ request_ref: candidate });
    if (!exists) {
      requestRef = candidate;
      break;
    }
  }
  if (!requestRef) {
    requestRef = `${buildWithdrawalRequestRef()}-${Date.now().toString().slice(-4)}`;
  }

  const withdrawal = await WithdrawalRequestModel.create({
    customer_id: options.customerMongoId,
    customer_id_str: customerId,
    broker_id: options.brokerMongoId,
    broker_id_str: brokerId,
    amount: parsedAmount,
    bank_account_id: bankAccount.id,
    bank_details: {
      bank_name: bankAccount.bankName || '',
      account_number_masked: bankAccount.accountNumberMasked || '',
      ifsc_code: bankAccount.ifsc || '',
    },
    request_ref: requestRef,
    status: 'pending',
    is_high_value: parsedAmount >= 100000,
  });

  await writeAuditSuccess({
    type: 'transaction',
    eventType: 'WITHDRAWAL_REQUEST_CREATE',
    category: 'funds',
    message: `Withdrawal request ${withdrawal.request_ref || withdrawal._id?.toString()} was submitted by customer ${customerId}.`,
    source: 'api',
    actor: {
      type: 'customer',
      id: options.customerMongoId,
      id_str: customerId,
      role: 'customer',
    },
    target: {
      type: 'customer',
      id: options.customerMongoId,
      id_str: customerId,
    },
    entity: {
      type: 'withdrawal_request',
      id: withdrawal._id,
      ref: withdrawal.request_ref || withdrawal._id?.toString(),
    },
    broker: {
      broker_id: options.brokerMongoId,
      broker_id_str: brokerId,
    },
    customer: {
      customer_id: options.customerMongoId,
      customer_id_str: customerId,
    },
    amountDelta: -parsedAmount,
    note: `Requested amount: ${formatCurrency(parsedAmount)}. Submitted for broker approval.`,
    metadata: {
      status: withdrawal.status,
      requestRef: withdrawal.request_ref || '',
    },
  });

  return mapWithdrawalResponse(withdrawal, options.customerName);
};

export {
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getWithdrawalStats,
  createManualWithdrawal,
  getManualWithdrawals,
  getManualWithdrawalStats,
  getWithdrawalEligibility,
  createWithdrawalRequest,
};
