// Controllers/customer/FundController.js
// Customer Fund Management - balance, add-fund requests, withdrawals, payment records

import asyncHandler from 'express-async-handler';
import { v2 as cloudinary } from 'cloudinary';
import BankAccountModel from '../../Model/Auth/BankAccountModel.js';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import PaymentProofModel from '../../Model/FundManagement/PaymentProofModel.js';
import WithdrawalRequestModel from '../../Model/FundManagement/WithdrawalRequestModel.js';
import {
  getFundTransactionDate,
  mapFundTransactionForCustomer,
  matchesFundTransactionCategory,
  sanitizeFundTransactionCategory,
} from '../../Utils/fundTransactionMapper.js';
import { resolveCurrentWeeklyBoundary } from '../../Utils/weeklySettlement.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';
import { createPaymentRequest } from '../broker/PaymentController.js';
import { createWithdrawalRequest } from '../broker/WithdrawalController.js';
import { applyGlitchOverlay } from '../../services/glitchOverlay.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (value) =>
  toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const PENDING_WITHDRAWAL_STATUSES = ['pending', 'processing'];
const APPROVED_WITHDRAWAL_STATUSES = ['approved', 'completed'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SUPPORTED_PAYMENT_METHODS = ['upi', 'imps', 'neft', 'rtgs', 'bank_transfer'];

const getIstNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

const isSaturdayIst = () => getIstNow().getDay() === 6;

const getCurrentSaturdayWeekRangeUtc = (nowUtc = new Date()) => {
  // Shift to IST clock-space so weekday/date boundaries are calculated in IST.
  const nowIstClock = new Date(nowUtc.getTime() + IST_OFFSET_MS);
  const istWeekday = nowIstClock.getUTCDay(); // 0=Sun ... 6=Sat (in IST clock-space)
  const daysSinceSaturday = (istWeekday + 1) % 7;

  const weekStartIstClock = new Date(nowIstClock);
  weekStartIstClock.setUTCHours(0, 0, 0, 0);
  weekStartIstClock.setUTCDate(weekStartIstClock.getUTCDate() - daysSinceSaturday);

  const weekEndIstClock = new Date(weekStartIstClock);
  weekEndIstClock.setUTCDate(weekEndIstClock.getUTCDate() + 7);

  return {
    startUtc: new Date(weekStartIstClock.getTime() - IST_OFFSET_MS),
    endUtc: new Date(weekEndIstClock.getTime() - IST_OFFSET_MS),
  };
};

const getPendingWithdrawalsTotal = async ({ customerMongoId, brokerIdStr }) => {
  if (!customerMongoId) return 0;
  const query = {
    customer_id: customerMongoId,
    status: { $in: PENDING_WITHDRAWAL_STATUSES },
  };
  if (brokerIdStr) query.broker_id_str = brokerIdStr;

  const rows = await WithdrawalRequestModel.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return toNumber(rows[0]?.total);
};

const mapPaymentRequest = (request) => ({
  id: request._id?.toString(),
  amount: toNumber(request.amount),
  paymentMethod: request.payment_method || 'upi',
  paymentReference: request.payment_reference || '',
  utrNumber: request.utr_number || '',
  status: request.status,
  proofUrl: request.proof_url || '',
  proofType: request.proof_type || '',
  proofUploadedAt: request.proof_uploaded_at || null,
  reviewedAt: request.reviewed_at || null,
  rejectionReason: request.rejection_reason || '',
  verificationNote: request.verification_note || '',
  verifiedAmount: request.verified_amount || null,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

const mapWithdrawalRequest = (request) => ({
  id: request._id?.toString(),
  requestRef: request.request_ref || '',
  amount: toNumber(request.amount),
  approvedAmount: toNumber(request.approved_amount),
  status: request.status,
  bankDetails: request.bank_details || {},
  rejectionReason: request.rejection_reason || '',
  reviewedAt: request.reviewed_at || null,
  transferredAt: request.transferred_at || null,
  utrNumber: request.utr_number || '',
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

const parseHistoryDateParam = (value, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  // Date-only filters should cover full day boundaries.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (endOfDay) {
      parsed.setUTCHours(23, 59, 59, 999);
    } else {
      parsed.setUTCHours(0, 0, 0, 0);
    }
  }

  return parsed;
};

const PAYMENT_REQUEST_TIMELINE_STATUSES = ['pending_proof', 'pending', 'rejected'];
const WITHDRAWAL_REQUEST_TIMELINE_STATUSES = ['pending', 'processing', 'rejected', 'failed', 'cancelled'];

const mapPaymentRequestToTimelineEntry = (request) => {
  const status = String(request?.status || '').trim().toLowerCase();
  const amount = Math.abs(toNumber(request?.amount));
  const timestamp = status === 'rejected'
    ? (request?.reviewed_at || request?.updatedAt || request?.createdAt || new Date())
    : status === 'pending'
      ? (request?.proof_uploaded_at || request?.updatedAt || request?.createdAt || new Date())
      : (request?.createdAt || request?.updatedAt || new Date());
  const title = status === 'rejected'
    ? 'Add Funds Rejected'
    : status === 'pending'
      ? 'Add Funds Under Review'
      : 'Add Funds Requested';
  const subtitle = status === 'rejected'
    ? (request?.rejection_reason || 'Request rejected')
    : status === 'pending'
      ? 'Proof submitted, awaiting approval'
      : 'Upload payment proof to continue';
  const timelineStatus = status === 'rejected' ? 'failed' : 'pending';

  return {
    id: request?._id?.toString(),
    timestamp: new Date(timestamp).toISOString(),
    category: 'payment',
    direction: 'credit',
    amount,
    signedAmount: amount,
    title,
    subtitle,
    status: timelineStatus,
    reference: request?.payment_reference || request?._id?.toString?.() || '',
    rawType: `payment_request_${status || 'pending'}`,
    source: 'add_fund_request',
  };
};

const mapWithdrawalRequestToTimelineEntry = (request) => {
  const status = String(request?.status || '').trim().toLowerCase();
  const amount = Math.abs(toNumber(request?.amount));
  const timestamp = status === 'rejected' || status === 'failed' || status === 'cancelled'
    ? (request?.reviewed_at || request?.updatedAt || request?.createdAt || new Date())
    : status === 'processing'
      ? (request?.updatedAt || request?.createdAt || new Date())
      : (request?.createdAt || request?.updatedAt || new Date());
  const bankName = String(request?.bank_details?.bank_name || '').trim();
  const accountMasked = String(request?.bank_details?.account_number_masked || '').trim();
  const bankLabel = bankName
    ? `${bankName}${accountMasked ? ` • ${accountMasked}` : ''}`
    : 'linked bank';

  let title = 'Withdrawal Requested';
  let subtitle = `Pending transfer to ${bankLabel}`;
  let timelineStatus = 'pending';

  if (status === 'processing') {
    title = 'Withdrawal Processing';
    subtitle = `Transfer in progress to ${bankLabel}`;
    timelineStatus = 'pending';
  } else if (status === 'rejected') {
    title = 'Withdrawal Rejected';
    subtitle = request?.rejection_reason || 'Withdrawal request was rejected';
    timelineStatus = 'failed';
  } else if (status === 'failed' || status === 'cancelled') {
    title = 'Withdrawal Failed';
    subtitle = request?.rejection_reason || 'Withdrawal request failed';
    timelineStatus = 'failed';
  }

  return {
    id: request?._id?.toString(),
    timestamp: new Date(timestamp).toISOString(),
    category: 'payment',
    direction: 'debit',
    amount,
    signedAmount: -amount,
    title,
    subtitle,
    status: timelineStatus,
    reference: request?.request_ref || request?.utr_number || request?._id?.toString?.() || '',
    rawType: `withdrawal_request_${status || 'pending'}`,
    source: 'withdrawal_request',
  };
};

const getBrokerPaymentInfoById = async (brokerId) => {
  if (!brokerId) return null;
  const broker = await BrokerModel.findById(brokerId);
  if (!broker) return null;
  const bankTransferDetails = {
    bankName: broker.bank_transfer_details?.bank_name || '',
    accountHolderName: broker.bank_transfer_details?.account_holder_name || '',
    accountNumber: broker.bank_transfer_details?.account_number || '',
    ifscCode: broker.bank_transfer_details?.ifsc_code || '',
    accountType: broker.bank_transfer_details?.account_type || 'current',
  };
  return {
    upiId: broker.upi_id || '',
    supportContact: broker.support_contact || '',
    supportEmail: broker.support_email || '',
    companyName: broker.company_name || broker.name || '',
    brokerId: broker.broker_id || '',
    brokerName: broker.name || '',
    qrPhotoUrl: broker.payment_qr_url || '',
    qrSettings: {
      scale: broker.payment_qr_settings?.scale ?? 1,
      offsetX: broker.payment_qr_settings?.offset_x ?? 0,
      offsetY: broker.payment_qr_settings?.offset_y ?? 0,
      padding: broker.payment_qr_settings?.padding ?? 8,
    },
    bankTransferDetails,
    availablePaymentMethods: [
      ...(broker.payment_qr_url ? ['upi'] : []),
      ...((bankTransferDetails.accountNumber && bankTransferDetails.ifscCode) ? ['bank_transfer'] : []),
    ],
  };
};

/**
 * @desc     Get fund balance
 * @route    GET /api/customer/funds
 * @access   Private (Customer only)
 */
const getBalance = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const emptyBoundary = resolveCurrentWeeklyBoundary({ transactions: [] });
  const pendingWithdrawals = await getPendingWithdrawalsTotal({
    customerMongoId: req.user._id,
    brokerIdStr,
  });

  const fund = await FundModel.findOne({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  });

  if (!fund) {
    const _emptyFundPayload = {
      success: true,
      balance: {
        net: 0,
        withdrawableNetCash: 0,
        intraday: { available: 0, used: 0, free: 0 },
        overnight: { available: 0 },
      },
      wallet: {
        availableCash: 0,
        depositedCash: 0,
        netCash: 0,
        pendingWithdrawals,
        withdrawableNetCash: 0,
      },
      trading: {
        openingBalance: 0,
        intraday: { available: 0, used: 0, remaining: 0 },
        delivery: { available: 0, used: 0, remaining: 0 },
        optionPremium: { percent: 10, base: 0, limit: 0, used: 0, remaining: 0 },
        commodityDelivery: { available: 0, used: 0, remaining: 0 },
        commodityIntraday: { available: 0, used: 0, remaining: 0 },
        commodityOptionPremium: { percent: 10, base: 0, limit: 0, used: 0, remaining: 0 },
      },
      summary: {
        payInLastWeek: 0,
        payInToday: 0,
        payOutToday: 0,
        realizedPnlToday: 0,
        realizedPnlThisWeek: 0,
        realizedPnlSinceSettlement: 0,
        weekBoundaryStart: emptyBoundary.boundaryStartUtc.toISOString(),
        weekBoundaryType: emptyBoundary.boundaryType,
      },
      settlement: {
        boundaryStart: emptyBoundary.boundaryStartUtc.toISOString(),
        boundaryType: emptyBoundary.boundaryType,
        weekStart: emptyBoundary.weekStartUtc.toISOString(),
        weekEnd: emptyBoundary.weekEndUtc.toISOString(),
        latestSettlementAt: null,
        latestSettlementMode: null,
      },
    };
    return res.status(200).json(applyGlitchOverlay(_emptyFundPayload, 'funds', req));
  }

  const intradayAvailable = fund.intraday?.available_limit || fund.intraday?.available || 0;
  const intradayUsed = fund.intraday?.used_limit || fund.intraday?.used || 0;
  // Delivery used: prefer new delivery.used_limit, fallback to legacy delivery.used
  const deliveryUsedLimit = toNumber(fund.delivery?.used_limit);
  const deliveryUsed = deliveryUsedLimit > 0 ? deliveryUsedLimit : toNumber(fund.delivery?.used);
  // Delivery available: overnight.available_limit is the remaining available (already decremented by orders)
  const deliveryAvailable = fund.overnight?.available_limit || fund.delivery?.available_limit || fund.delivery?.available || 0;
  const openingBalance = intradayAvailable + deliveryAvailable + deliveryUsed;
  const depositedCash = toNumber(fund.net_available_balance);
  const pnlBalance = toNumber(fund.pnl_balance);
  const availableCash = depositedCash + pnlBalance;
  const optionPercent = toNumber(fund.option_limit_percentage) || 10;

  // Option premium = single pool of X% of opening balance
  // Margin deductions go to the respective bucket, but the cap is one combined pool
  const optionIntradayUsed = toNumber(fund.option_limit?.intraday?.used_today);
  const optionDeliveryUsed = toNumber(fund.option_limit?.overnight?.used_today);
  // Reconstruct original delivery limit (it gets decremented by option + delivery orders)
  const originalDeliveryLimit = deliveryAvailable + deliveryUsed + optionDeliveryUsed;
  const optionOpeningBalance = intradayAvailable + originalDeliveryLimit;
  const optionLimit = Math.round((optionPercent / 100) * optionOpeningBalance * 100) / 100;
  const optionUsed = optionIntradayUsed + optionDeliveryUsed;
  const optionRemaining = Math.max(0, optionLimit - optionUsed);
  const commodityDeliveryAvailable = toNumber(fund.commodity_delivery?.available_limit);
  const commodityDeliveryUsed = toNumber(fund.commodity_delivery?.used_limit);
  const commodityIntradayAvailable = toNumber(fund.commodity_intraday?.available_limit);
  const commodityIntradayUsed = toNumber(fund.commodity_intraday?.used_limit);
  const commodityOptionPercent = toNumber(fund.commodity_option?.limit_percentage) || 10;
  const commodityOptionUsed = toNumber(fund.commodity_option?.used);
  const commodityOptionBase = commodityIntradayAvailable + commodityDeliveryAvailable;
  const commodityOptionLimit = Math.round((commodityOptionBase * (commodityOptionPercent / 100)) * 100) / 100;
  const commodityOptionRemaining = Math.max(0, commodityOptionLimit - commodityOptionUsed);

  // Calculate pay-in summary from approved/completed withdrawals in the current
  // Saturday-reset IST week (Saturday 00:00 IST -> next Saturday 00:00 IST).
  const { startUtc: weekStartUtc, endUtc: weekEndUtc } = getCurrentSaturdayWeekRangeUtc();
  const approvedWithdrawalsThisWeek = await WithdrawalRequestModel.find({
    customer_id: req.user._id,
    broker_id_str: brokerIdStr,
    status: { $in: APPROVED_WITHDRAWAL_STATUSES },
    $or: [
      { transferred_at: { $gte: weekStartUtc, $lt: weekEndUtc } },
      { reviewed_at: { $gte: weekStartUtc, $lt: weekEndUtc } },
      { updatedAt: { $gte: weekStartUtc, $lt: weekEndUtc } },
    ],
  })
    .select('amount approved_amount')
    .lean();

  const payInLastWeek = approvedWithdrawalsThisWeek.reduce((sum, request) => {
    const approved = toNumber(request?.approved_amount);
    return sum + (approved > 0 ? approved : toNumber(request?.amount));
  }, 0);

  const weeklyBoundary = resolveCurrentWeeklyBoundary({
    transactions: fund.transactions || [],
    nowUtc: new Date(),
  });
  const boundaryStartUtc = weeklyBoundary.boundaryStartUtc;

  // Calculate realized P&L for active week/session using weekly settlement boundary.
  const realizedPnlThisWeek = (fund.transactions || [])
    .filter((t) => {
      const ts = t.timestamp ? new Date(t.timestamp) : null;
      return (
        ts
        && ts >= boundaryStartUtc
        && (t.type === 'realized_profit' || t.type === 'realized_loss')
      );
    })
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Subtract approved withdrawals recorded in fund.transactions since the boundary.
  // When a withdrawal is approved, pendingWithdrawals drops to 0 (request is no longer pending)
  // but a 'withdrawal' transaction is pushed to fund.transactions — we must account for it.
  const withdrawalTxThisWeek = (fund.transactions || [])
    .filter((t) => {
      const ts = t.timestamp ? new Date(t.timestamp) : null;
      return ts && ts >= boundaryStartUtc && t.type === 'withdrawal';
    })
    .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);

  const netCashAfterWithdrawals = Number((realizedPnlThisWeek - withdrawalTxThisWeek).toFixed(2));
  const withdrawableNetCash = Math.max(0, netCashAfterWithdrawals - pendingWithdrawals);

  const _fundsPayload = {
    success: true,
    // Legacy fields (backward compatible)
    balance: {
      net: availableCash,
      withdrawableNetCash,
      intraday: {
        available: intradayAvailable,
        used: intradayUsed,
        free: intradayAvailable - intradayUsed,
        utilization: intradayAvailable > 0
          ? Math.round((intradayUsed / intradayAvailable) * 100)
          : 0,
      },
      overnight: {
        available: deliveryAvailable,
      },
    },
    wallet: {
      availableCash,
      depositedCash,
      netCash: netCashAfterWithdrawals,
      pendingWithdrawals,
      withdrawableNetCash,
      withdrawnThisWeek: Number(withdrawalTxThisWeek.toFixed(2)),
    },
    trading: {
      openingBalance,
      intraday: {
        available: intradayAvailable,
        used: intradayUsed,
        remaining: Math.max(0, intradayAvailable - intradayUsed),
      },
      delivery: {
        available: deliveryAvailable + deliveryUsed,
        used: deliveryUsed,
        remaining: Math.max(0, deliveryAvailable),
      },
      optionPremium: {
        percent: optionPercent,
        base: optionOpeningBalance,
        limit: optionLimit,
        used: optionUsed,
        remaining: optionRemaining,
        usedIntraday: optionIntradayUsed,
        usedDelivery: optionDeliveryUsed,
      },
      commodityDelivery: {
        available: commodityDeliveryAvailable,
        used: commodityDeliveryUsed,
        remaining: Math.max(0, commodityDeliveryAvailable - commodityDeliveryUsed),
      },
      commodityIntraday: {
        available: commodityIntradayAvailable,
        used: commodityIntradayUsed,
        remaining: Math.max(0, commodityIntradayAvailable - commodityIntradayUsed),
      },
      commodityOptionPremium: {
        percent: commodityOptionPercent,
        base: commodityOptionBase,
        limit: commodityOptionLimit,
        used: commodityOptionUsed,
        remaining: commodityOptionRemaining,
      },
    },
    summary: {
      payInLastWeek,
      // Legacy aliases kept temporarily for frontend compatibility.
      payInToday: payInLastWeek,
      payOutToday: 0,
      realizedPnlToday: Number(realizedPnlThisWeek.toFixed(2)),
      realizedPnlThisWeek: Number(realizedPnlThisWeek.toFixed(2)),
      realizedPnlSinceSettlement: Number(realizedPnlThisWeek.toFixed(2)),
      weekBoundaryStart: boundaryStartUtc.toISOString(),
      weekBoundaryType: weeklyBoundary.boundaryType,
    },
    settlement: {
      boundaryStart: boundaryStartUtc.toISOString(),
      boundaryType: weeklyBoundary.boundaryType,
      weekStart: weeklyBoundary.weekStartUtc.toISOString(),
      weekEnd: weeklyBoundary.weekEndUtc.toISOString(),
      latestSettlementAt: weeklyBoundary.latestSettlement?.timestamp
        ? weeklyBoundary.latestSettlement.timestamp.toISOString()
        : null,
      latestSettlementMode: weeklyBoundary.latestSettlement?.metadata?.mode || null,
    },
  };
  res.status(200).json(applyGlitchOverlay(_fundsPayload, 'funds', req));
});

/**
 * @desc     Request to add funds (offline transfer request)
 * @route    POST /api/customer/funds/add
 * @access   Private (Customer only)
 */
const requestAddFunds = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const amount = toNumber(req.body?.amount);
  const utrNumber = typeof req.body?.utr_number === 'string' ? req.body.utr_number.trim() : '';
  const paymentMethod = String(req.body?.payment_method || 'upi').trim().toLowerCase();

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Valid amount is required.',
    });
  }

  if (!SUPPORTED_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: 'Unsupported payment method.',
    });
  }

  const paymentInfo = await getBrokerPaymentInfoById(req.user.mongoBrokerId);

  if (!paymentInfo) {
    return res.status(404).json({
      success: false,
      message: 'Broker payment details are not available.',
    });
  }

  const hasUpiMethod = Boolean(paymentInfo.qrPhotoUrl);
  const hasBankTransferMethod = Boolean(
    paymentInfo.bankTransferDetails?.accountNumber && paymentInfo.bankTransferDetails?.ifscCode
  );

  if (paymentMethod === 'upi' && !hasUpiMethod) {
    return res.status(400).json({
      success: false,
      message: 'Broker UPI payment details are not available.',
    });
  }

  if (paymentMethod !== 'upi' && !hasBankTransferMethod) {
    return res.status(400).json({
      success: false,
      message: 'Broker bank transfer details are not available.',
    });
  }

  const paymentRequest = await createPaymentRequest(
    customerIdStr,
    brokerIdStr,
    amount,
    paymentMethod,
    '',
    '', // proofUrl deprecated
    {
      customerMongoId: req.user._id,
      customerName: req.user.name,
      brokerMongoId: req.user.mongoBrokerId,
      utrNumber, // Pass optional UTR/transaction ID
    }
  );

  res.status(201).json({
    success: true,
    message: 'Request submitted for verification.',
    request: paymentRequest,
    paymentInfo,
  });
});

/**
 * @desc     DEPRECATED: Submit payment proof for an add-funds request
 * @route    POST /api/customer/funds/add/:id/proof
 * @access   Private (Customer only)
 * @deprecated Screenshot proof upload is no longer required. Deposits now go directly to pending status.
 */
const submitAddFundsProof = asyncHandler(async (_req, res) => {
  // Screenshot proof upload is deprecated - deposits no longer require proof images
  return res.status(410).json({
    success: false,
    message: 'Screenshot proof upload is no longer required. Your deposit request is already pending verification.',
  });

});

/**
 * @desc     Request to withdraw funds
 * @route    POST /api/customer/funds/withdraw
 * @access   Private (Customer only)
 */
const requestWithdraw = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const { bankAccount } = req.body || {};
  const amount = toNumber(req.body?.amount);

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Valid amount is required.',
    });
  }

  if (!isSaturdayIst()) {
    return res.status(400).json({
      success: false,
      message: 'Withdrawal requests are allowed only on Saturdays (IST).',
    });
  }

  if (!brokerIdStr || !req.user.mongoBrokerId) {
    return res.status(400).json({
      success: false,
      message: 'Broker mapping not found for this account.',
    });
  }

  const fund = await FundModel.findOne({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  }).select('transactions pnl_balance');

  const weeklyBoundary = resolveCurrentWeeklyBoundary({
    transactions: fund?.transactions || [],
    nowUtc: new Date(),
  });
  const realizedPnlThisWeek = (fund?.transactions || [])
    .filter((t) => {
      const ts = t.timestamp ? new Date(t.timestamp) : null;
      return (
        ts
        && ts >= weeklyBoundary.boundaryStartUtc
        && (t.type === 'realized_profit' || t.type === 'realized_loss')
      );
    })
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const netCash = Number(realizedPnlThisWeek.toFixed(2));
  const pendingWithdrawals = await getPendingWithdrawalsTotal({
    customerMongoId: req.user._id,
    brokerIdStr,
  });
  const withdrawableNetCash = Math.max(0, netCash - pendingWithdrawals);

  if (withdrawableNetCash <= 0) {
    return res.status(400).json({
      success: false,
      message: 'No withdrawable net cash available.',
      available: 0,
      netCash,
      pendingWithdrawals,
      requested: amount,
    });
  }

  if (amount > withdrawableNetCash) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient withdrawable net cash.',
      available: withdrawableNetCash,
      netCash,
      pendingWithdrawals,
      requested: amount,
    });
  }

  let selectedBank = null;
  if (bankAccount?.id) {
    selectedBank = await BankAccountModel.findOne({
      _id: bankAccount.id,
      customer_id: req.user._id,
      is_active: true,
    });
  }
  if (!selectedBank) {
    selectedBank = await BankAccountModel.findOne({
      customer_id: req.user._id,
      is_active: true,
    }).sort({ is_primary: -1, createdAt: -1 });
  }

  if (!selectedBank) {
    return res.status(400).json({
      success: false,
      message: 'No active bank account found. Please add a bank account first.',
    });
  }

  const withdrawalRequest = await createWithdrawalRequest(
    customerIdStr,
    brokerIdStr,
    amount,
    {
      id: selectedBank._id,
      bankName: selectedBank.bank_name,
      accountNumberMasked: selectedBank.account_number_masked,
      ifsc: selectedBank.ifsc_code,
    },
    {
      customerMongoId: req.user._id,
      brokerMongoId: req.user.mongoBrokerId,
      customerName: req.user.name,
    }
  );

  res.status(201).json({
    success: true,
    message: 'Withdrawal request submitted. Pending broker approval.',
    request: withdrawalRequest,
    wallet: {
      netCash,
      pendingWithdrawals: pendingWithdrawals + amount,
      withdrawableNetCash: Math.max(0, withdrawableNetCash - amount),
    },
  });
});

/**
 * @desc     Get customer add-fund request records
 * @route    GET /api/customer/funds/payments
 * @access   Private (Customer only)
 */
const getAddFundRequests = asyncHandler(async (req, res) => {
  const customerMongoId = req.user._id;
  const brokerIdStr = req.user.stringBrokerId;
  const { status = 'all', page = 1, limit = 20 } = req.query;

  const query = {
    customer_id: customerMongoId,
    broker_id_str: brokerIdStr,
  };
  if (status && status !== 'all') {
    query.status = status;
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [requests, total] = await Promise.all([
    PaymentProofModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit),
    PaymentProofModel.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    payments: requests.map(mapPaymentRequest),
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc     Get customer withdrawal request records
 * @route    GET /api/customer/funds/withdrawals
 * @access   Private (Customer only)
 */
const getWithdrawalRequests = asyncHandler(async (req, res) => {
  const customerMongoId = req.user._id;
  const brokerIdStr = req.user.stringBrokerId;
  const { status = 'all', page = 1, limit = 20 } = req.query;

  const query = {
    customer_id: customerMongoId,
    broker_id_str: brokerIdStr,
  };
  if (status && status !== 'all') {
    query.status = status;
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [requests, total] = await Promise.all([
    WithdrawalRequestModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit),
    WithdrawalRequestModel.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    withdrawals: requests.map(mapWithdrawalRequest),
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc     DEPRECATED: Get Cloudinary upload signature for payment proof
 * @route    GET /api/customer/funds/upload-signature
 * @access   Private (Customer only)
 * @deprecated Screenshot proof upload is no longer required.
 */
const getFundsUploadSignature = asyncHandler(async (_req, res) => {
  // Screenshot proof upload is deprecated - no longer needed
  return res.status(410).json({
    success: false,
    message: 'Screenshot proof upload is no longer required. Deposits are verified without proof images.',
  });
});

/**
 * @desc     Get fund transaction history
 * @route    GET /api/customer/funds/transactions
 * @access   Private (Customer only)
 */
const getFundHistory = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const {
    page = 1,
    limit = 20,
    type,
    category = 'all',
    ui = 'false',
    includeRequests = 'true',
    from,
    to,
  } = req.query;

  const fund = await FundModel.findOne({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  });

  if (!fund || !fund.transactions) {
    return res.status(200).json({
      success: true,
      transactions: [],
      pagination: {
        page: 1,
        limit: parseInt(limit, 10) || 20,
        total: 0,
        pages: 0,
      },
    });
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const normalizedCategory = sanitizeFundTransactionCategory(category);
  const uiMode = ['1', 'true', 'yes'].includes(String(ui || '').trim().toLowerCase());
  const includeRequestTimeline = uiMode
    ? !['0', 'false', 'no'].includes(String(includeRequests || '').trim().toLowerCase())
    : false;
  const fromDate = parseHistoryDateParam(from, false);
  const toDate = parseHistoryDateParam(to, true);

  let transactions = [...fund.transactions];

  if (type && type !== 'all') {
    transactions = transactions.filter((t) => t.type === type);
  }

  if (normalizedCategory !== 'all') {
    transactions = transactions.filter((t) => matchesFundTransactionCategory(t, normalizedCategory));
  }

  if (fromDate || toDate) {
    transactions = transactions.filter((t) => {
      const txDate = getFundTransactionDate(t);
      if (fromDate && txDate < fromDate) return false;
      if (toDate && txDate > toDate) return false;
      return true;
    });
  }

  transactions.sort((a, b) => getFundTransactionDate(b) - getFundTransactionDate(a));

  if (!uiMode) {
    const skip = (parsedPage - 1) * parsedLimit;
    const filteredCount = transactions.length;
    const paginatedTransactions = transactions.slice(skip, skip + parsedLimit);

    return res.status(200).json({
      success: true,
      transactions: paginatedTransactions,
      filters: {
        type: type && type !== 'all' ? String(type) : 'all',
        category: normalizedCategory,
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
        ui: false,
        includeRequests: false,
      },
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: filteredCount,
        pages: Math.ceil(filteredCount / parsedLimit),
      },
    });
  }

  let timelineRows = transactions.map((t) => mapFundTransactionForCustomer(t));

  if (
    includeRequestTimeline
    && (normalizedCategory === 'all' || normalizedCategory === 'payment')
    && (!type || type === 'all')
  ) {
    const requestQuery = {
      customer_id: req.user._id,
      broker_id_str: brokerIdStr,
    };

    const [paymentRequests, withdrawalRequests] = await Promise.all([
      PaymentProofModel.find({
        ...requestQuery,
        status: { $in: PAYMENT_REQUEST_TIMELINE_STATUSES },
      }).select('status amount payment_reference rejection_reason createdAt updatedAt proof_uploaded_at reviewed_at'),
      WithdrawalRequestModel.find({
        ...requestQuery,
        status: { $in: WITHDRAWAL_REQUEST_TIMELINE_STATUSES },
      }).select('status amount request_ref utr_number rejection_reason bank_details createdAt updatedAt reviewed_at'),
    ]);

    const mappedRequestRows = [
      ...paymentRequests.map((request) => mapPaymentRequestToTimelineEntry(request)),
      ...withdrawalRequests.map((request) => mapWithdrawalRequestToTimelineEntry(request)),
    ].filter((entry) => {
      const entryDate = new Date(entry.timestamp);
      if (Number.isNaN(entryDate.getTime())) return false;
      if (fromDate && entryDate < fromDate) return false;
      if (toDate && entryDate > toDate) return false;
      return true;
    });

    timelineRows = [...timelineRows, ...mappedRequestRows];
  }

  timelineRows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const skip = (parsedPage - 1) * parsedLimit;
  const filteredCount = timelineRows.length;
  const paginatedTransactions = timelineRows.slice(skip, skip + parsedLimit);

  res.status(200).json({
    success: true,
    transactions: paginatedTransactions,
    filters: {
      type: type && type !== 'all' ? String(type) : 'all',
      category: normalizedCategory,
      from: fromDate ? fromDate.toISOString() : null,
      to: toDate ? toDate.toISOString() : null,
      ui: true,
      includeRequests: includeRequestTimeline,
    },
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total: filteredCount,
      pages: Math.ceil(filteredCount / parsedLimit),
    },
  });
});

/**
 * @desc     Get broker payment details (UPI ID, etc.)
 * @route    GET /api/customer/funds/payment-info
 * @access   Private (Customer only)
 */
const getPaymentInfo = asyncHandler(async (req, res) => {
  const paymentInfo = await getBrokerPaymentInfoById(req.user.mongoBrokerId);
  if (!paymentInfo) {
    return res.status(404).json({
      success: false,
      message: 'Broker information not found.',
    });
  }

  res.status(200).json({
    success: true,
    paymentInfo,
  });
});

export {
  getBalance,
  requestAddFunds,
  submitAddFundsProof,
  requestWithdraw,
  getFundHistory,
  getPaymentInfo,
  getAddFundRequests,
  getWithdrawalRequests,
  getFundsUploadSignature,
};
