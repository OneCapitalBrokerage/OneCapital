// Controllers/broker/WithdrawalController.js
// Broker Withdrawal Requests - Manage client withdrawal requests

import asyncHandler from 'express-async-handler';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import WithdrawalRequestModel from '../../Model/FundManagement/WithdrawalRequestModel.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';
import { resolveCurrentWeeklyBoundary } from '../../Utils/weeklySettlement.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (value) =>
  toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
    const boundary = resolveCurrentWeeklyBoundary({ transactions: fund.transactions || [], nowUtc });
    const netCash = (fund.transactions || [])
      .filter((t) => {
        const ts = t.timestamp ? new Date(t.timestamp) : null;
        return ts && ts >= boundary.boundaryStartUtc
          && (t.type === 'realized_profit' || t.type === 'realized_loss');
      })
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    netCashMap[fund.customer_id_str] = Number(netCash.toFixed(2));
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
  createWithdrawalRequest,
};
