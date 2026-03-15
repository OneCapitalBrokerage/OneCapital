// Controllers/broker/PaymentController.js
// Broker Payment Verification - review customer add-fund requests

import asyncHandler from 'express-async-handler';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import PaymentProofModel from '../../Model/FundManagement/PaymentProofModel.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (value) =>
  toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sanitizeStatus = (status) => String(status || '').trim().toLowerCase();
const SUPPORTED_PAYMENT_METHODS = ['upi', 'imps', 'neft', 'rtgs'];
const normalizePaymentMethod = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED_PAYMENT_METHODS.includes(normalized) ? normalized : 'upi';
};

const buildStatusQuery = (status) => {
  const normalized = sanitizeStatus(status);
  if (!normalized || normalized === 'all') return null;
  if (normalized === 'pending') {
    // Broker pending list should include requests waiting for proof and proof-submitted requests.
    return { $in: ['pending_proof', 'pending'] };
  }
  return normalized;
};

const hydrateCustomerNames = async (payments) => {
  const missingIds = payments
    .filter((p) => !p.customer_name && p.customer_id_str)
    .map((p) => p.customer_id_str);

  if (missingIds.length === 0) return {};

  const customers = await CustomerModel.find({
    customer_id: { $in: missingIds },
  }).select('customer_id name');

  return customers.reduce((acc, customer) => {
    acc[customer.customer_id] = customer.name;
    return acc;
  }, {});
};

const mapPaymentResponse = (payment, fallbackCustomerName = '') => ({
  id: payment._id?.toString(),
  customerId: payment.customer_id_str,
  clientId: payment.customer_id_str,
  customerName: payment.customer_name || fallbackCustomerName || 'Unknown',
  clientName: payment.customer_name || fallbackCustomerName || 'Unknown',
  name: payment.customer_name || fallbackCustomerName || 'Unknown',
  amount: toNumber(payment.amount),
  paymentMethod: payment.payment_method || 'upi',
  transactionRef: payment.payment_reference || '',
  utrNumber: payment.utr_number || '',
  status: payment.status,
  proofUrl: payment.proof_url || '',
  proofType: payment.proof_type || '',
  proofUploadedAt: payment.proof_uploaded_at || null,
  reviewedAt: payment.reviewed_at || null,
  rejectionReason: payment.rejection_reason || '',
  verifiedAmount: payment.verified_amount || null,
  notes: payment.verification_note || '',
  createdAt: payment.createdAt,
});

const findOrCreateFundForPayment = async (payment, brokerIdStr) => {
  let fund = await FundModel.findOne({
    customer_id_str: payment.customer_id_str,
    broker_id_str: brokerIdStr,
  });

  if (!fund) {
    fund = await FundModel.findOne({
      customer_id: payment.customer_id,
    });
  }

  if (!fund) {
    fund = await FundModel.create({
      customer_id: payment.customer_id,
      customer_id_str: payment.customer_id_str,
      broker_id_str: brokerIdStr,
      net_available_balance: 0,
      available_balance: 0,
      withdrawable_balance: 0,
      intraday: { available_limit: 0, used_limit: 0, available: 0, used: 0 },
      overnight: { available_limit: 0, used_limit: 0 },
      delivery: { available: 0, used: 0, available_limit: 0, used_limit: 0 },
      option_limit_percentage: 10,
      commodity_delivery: { available_limit: 0, used_limit: 0 },
      commodity_option: { limit_percentage: 10, used: 0 },
    });
  }

  return fund;
};

/**
 * @desc     Get payment requests
 * @route    GET /api/broker/payments
 * @access   Private (Broker only)
 */
const getPayments = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { status = 'pending', page = 1, limit = 20 } = req.query;

  const query = { broker_id_str: brokerIdStr };
  const statusQuery = buildStatusQuery(status);
  if (statusQuery) query.status = statusQuery;

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [payments, total] = await Promise.all([
    PaymentProofModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit),
    PaymentProofModel.countDocuments(query),
  ]);

  const customerNameMap = await hydrateCustomerNames(payments);
  const response = payments.map((payment) =>
    mapPaymentResponse(payment, customerNameMap[payment.customer_id_str])
  );

  res.status(200).json({
    success: true,
    payments: response,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc     Verify payment (status only, fund credit will be handled later)
 * @route    POST /api/broker/payments/:id/verify
 * @access   Private (Broker only)
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { verifiedAmount, notes, transactionRef } = req.body || {};

  const payment = await PaymentProofModel.findOne({ _id: id, broker_id_str: brokerIdStr });

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment request not found.',
    });
  }

  if (payment.status === 'verified') {
    return res.status(400).json({
      success: false,
      message: 'Payment already verified.',
    });
  }

  if (payment.status === 'pending_proof') {
    return res.status(400).json({
      success: false,
      message: 'Payment proof is not submitted yet.',
    });
  }

  if (payment.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Cannot verify a ${payment.status} request.`,
    });
  }

  const amountToMark = toNumber(verifiedAmount) > 0 ? toNumber(verifiedAmount) : toNumber(payment.amount);

  // Credit customer's available cash on verification.
  // This naturally handles negative balance scenarios:
  // e.g. -500 + 1000 = 500
  const fund = await findOrCreateFundForPayment(payment, brokerIdStr);
  const previousBalance = toNumber(
    fund.net_available_balance ?? fund.available_balance
  );
  const newBalance = previousBalance + amountToMark;

  fund.net_available_balance = newBalance;
  fund.available_balance = newBalance;
  fund.withdrawable_balance = newBalance;
  if (!fund.transactions) fund.transactions = [];
  fund.transactions.push({
    type: 'credit',
    amount: amountToMark,
    notes: `Payment verified (${payment.payment_method || 'upi'})`,
    reference: transactionRef || payment.payment_reference || '',
    verifiedBy: brokerId,
    timestamp: new Date(),
  });
  await fund.save();

  payment.status = 'verified';
  payment.reviewed_by = brokerId;
  payment.reviewed_at = new Date();
  payment.verified_amount = amountToMark;
  payment.verification_note = notes || '';
  if (transactionRef) payment.payment_reference = transactionRef;
  await payment.save();
  const paymentRef = payment.payment_reference || payment._id?.toString() || '';
  const verifyNoteParts = [
    `Credited ${formatCurrency(amountToMark)}. Balance moved from ${formatCurrency(previousBalance)} to ${formatCurrency(newBalance)}.`,
  ];
  if (notes) {
    verifyNoteParts.push(`Broker note: ${notes}`);
  }

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'PAYMENT_VERIFY',
    category: 'funds',
    message: `Add-funds request ${paymentRef} for customer ${payment.customer_id_str} was verified by broker.`,
    target: {
      type: 'customer',
      id: payment.customer_id,
      id_str: payment.customer_id_str,
    },
    entity: {
      type: 'payment_proof',
      id: payment._id,
      ref: paymentRef,
    },
    broker: {
      broker_id: brokerId,
      broker_id_str: brokerIdStr,
    },
    customer: {
      customer_id: payment.customer_id,
      customer_id_str: payment.customer_id_str,
    },
    amountDelta: amountToMark,
    fundBefore: {
      depositedCash: previousBalance,
      availableCash: previousBalance,
    },
    fundAfter: {
      depositedCash: newBalance,
      availableCash: newBalance,
    },
    note: verifyNoteParts.join(' '),
    metadata: {
      paymentStatus: payment.status,
      verifiedAmount: amountToMark,
      transactionRef: transactionRef || paymentRef,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Payment verified and customer available cash credited.',
    payment: mapPaymentResponse(payment),
    balance: {
      customerId: payment.customer_id_str,
      previous: previousBalance,
      credited: amountToMark,
      current: newBalance,
    },
  });
});

/**
 * @desc     Reject payment request
 * @route    POST /api/broker/payments/:id/reject
 * @access   Private (Broker only)
 */
const rejectPayment = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { reason } = req.body || {};

  const payment = await PaymentProofModel.findOne({ _id: id, broker_id_str: brokerIdStr });

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment request not found.',
    });
  }

  if (payment.status === 'verified') {
    return res.status(400).json({
      success: false,
      message: 'Verified requests cannot be rejected.',
    });
  }

  const previousStatus = payment.status;

  payment.status = 'rejected';
  payment.reviewed_by = brokerId;
  payment.reviewed_at = new Date();
  payment.rejection_reason = reason || '';
  await payment.save();
  const paymentRef = payment.payment_reference || payment._id?.toString() || '';
  const rejectNote = reason
    ? `Reason: ${reason}.`
    : 'Rejected during broker review.';

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'PAYMENT_REJECT',
    category: 'funds',
    message: `Add-funds request ${paymentRef} for customer ${payment.customer_id_str} was rejected by broker.`,
    target: {
      type: 'customer',
      id: payment.customer_id,
      id_str: payment.customer_id_str,
    },
    entity: {
      type: 'payment_proof',
      id: payment._id,
      ref: paymentRef,
    },
    broker: {
      broker_id: brokerId,
      broker_id_str: brokerIdStr,
    },
    customer: {
      customer_id: payment.customer_id,
      customer_id_str: payment.customer_id_str,
    },
    note: rejectNote,
    metadata: {
      amount: toNumber(payment.amount),
      previousStatus,
      newStatus: payment.status,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Payment rejected.',
    payment: mapPaymentResponse(payment),
  });
});

/**
 * @desc     DISABLED: Delete payment request (deposits are non-deletable)
 * @route    DELETE /api/broker/payments/:id
 * @access   Private (Broker only)
 * @deprecated Deposit entries cannot be deleted for audit integrity.
 */
const deletePayment = asyncHandler(async (_req, res) => {
  // Deposit entries are no longer deletable to ensure audit integrity
  return res.status(403).json({
    success: false,
    message: 'Deposit entries cannot be deleted. They are preserved for audit purposes.',
  });
});

/**
 * @desc     Get payment proof image
 * @route    GET /api/broker/payments/:id/proof
 * @access   Private (Broker only)
 */
const getPaymentProof = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const payment = await PaymentProofModel.findOne({ _id: id, broker_id_str: brokerIdStr });

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment request not found.',
    });
  }

  if (!payment.proof_url) {
    return res.status(404).json({
      success: false,
      message: 'No payment proof available.',
    });
  }

  res.status(200).json({
    success: true,
    proof: {
      url: payment.proof_url,
      type: payment.proof_type || 'image',
      uploadedAt: payment.proof_uploaded_at || payment.updatedAt,
    },
  });
});

/**
 * @desc     Get payment verification stats
 * @route    GET /api/broker/payments/stats
 * @access   Private (Broker only)
 */
const getPaymentStats = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;

  const payments = await PaymentProofModel.find({ broker_id_str: brokerIdStr }).select('amount status');

  const stats = {
    pending: { count: 0, amount: 0 },
    pendingProof: { count: 0, amount: 0 },
    verified: { count: 0, amount: 0 },
    rejected: { count: 0, amount: 0 },
    pendingCount: 0,
    totalPending: 0,
    total: payments.length,
    totalAmount: 0,
  };

  for (const payment of payments) {
    const amount = toNumber(payment.amount);
    stats.totalAmount += amount;

    if (payment.status === 'pending') {
      stats.pending.count += 1;
      stats.pending.amount += amount;
    } else if (payment.status === 'pending_proof') {
      stats.pendingProof.count += 1;
      stats.pendingProof.amount += amount;
    } else if (payment.status === 'verified') {
      stats.verified.count += 1;
      stats.verified.amount += amount;
    } else if (payment.status === 'rejected') {
      stats.rejected.count += 1;
      stats.rejected.amount += amount;
    }
  }

  stats.pendingCount = stats.pending.count + stats.pendingProof.count;
  stats.totalPending = stats.pending.amount + stats.pendingProof.amount;

  res.status(200).json({
    success: true,
    stats,
  });
});

/**
 * @desc     Get processed payment history
 * @route    GET /api/broker/payments/history
 * @access   Private (Broker only)
 */
const getPaymentHistory = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { page = 1, limit = 20, status = 'all' } = req.query;

  const query = {
    broker_id_str: brokerIdStr,
    status: { $in: ['verified', 'rejected'] },
  };

  const normalizedStatus = sanitizeStatus(status);
  if (normalizedStatus === 'verified' || normalizedStatus === 'rejected') {
    query.status = normalizedStatus;
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [payments, total] = await Promise.all([
    PaymentProofModel.find(query).sort({ reviewed_at: -1, updatedAt: -1 }).skip(skip).limit(parsedLimit),
    PaymentProofModel.countDocuments(query),
  ]);

  const customerNameMap = await hydrateCustomerNames(payments);
  const response = payments.map((payment) =>
    mapPaymentResponse(payment, customerNameMap[payment.customer_id_str])
  );

  res.status(200).json({
    success: true,
    payments: response,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

// Helper function to create payment request (called from customer side)
// UPDATED: Screenshot proof no longer required - always starts as 'pending'
const createPaymentRequest = async (
  customerId,
  brokerId,
  amount,
  paymentMethod = 'upi',
  transactionRef = '',
  _proofUrl = '', // DEPRECATED: proof URL no longer used
  options = {}
) => {
  const parsedAmount = toNumber(amount);
  if (parsedAmount <= 0) {
    throw new Error('Invalid amount for payment request');
  }

  if (!options?.customerMongoId) {
    throw new Error('Customer context is required to create payment request');
  }

  // Normalize optional UTR/transaction ID
  const utrNumber = typeof options.utrNumber === 'string' ? options.utrNumber.trim() : '';
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

  const payment = await PaymentProofModel.create({
    customer_id: options.customerMongoId,
    customer_id_str: customerId,
    customer_name: options.customerName || '',
    broker_id: options.brokerMongoId || undefined,
    broker_id_str: brokerId,
    amount: parsedAmount,
    payment_method: normalizedPaymentMethod,
    payment_reference: transactionRef || '',
    payment_date: new Date(),
    utr_number: utrNumber || undefined,
    // Screenshot proof fields deprecated - no longer populated
    proof_type: 'image',
    proof_url: undefined,
    proof_public_id: undefined,
    proof_uploaded_at: null,
    status: 'pending', // Always start as pending, no proof upload step
  });

  await writeAuditSuccess({
    type: 'transaction',
    eventType: 'PAYMENT_REQUEST_CREATE',
    category: 'funds',
    message: `Add-funds request ${payment.payment_reference || payment._id?.toString()} was created by customer ${customerId}.`,
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
      type: 'payment_proof',
      id: payment._id,
      ref: payment.payment_reference || payment._id?.toString(),
    },
    broker: {
      broker_id: options.brokerMongoId,
      broker_id_str: brokerId,
    },
    customer: {
      customer_id: options.customerMongoId,
      customer_id_str: customerId,
    },
    amountDelta: parsedAmount,
    note: `Requested amount: ${formatCurrency(parsedAmount)} via ${normalizedPaymentMethod.toUpperCase()}. Pending broker verification.`,
    metadata: {
      status: payment.status,
      paymentMethod: normalizedPaymentMethod,
      utrNumber: utrNumber || undefined,
    },
  });

  return mapPaymentResponse(payment, options.customerName);
};

export {
  getPayments,
  verifyPayment,
  rejectPayment,
  deletePayment,
  getPaymentProof,
  getPaymentStats,
  getPaymentHistory,
  createPaymentRequest,
};
