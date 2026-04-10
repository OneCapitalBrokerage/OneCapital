// Controllers/broker/FundController.js
// Broker Fund Management - Add funds to client accounts

import asyncHandler from 'express-async-handler';
import FundModel from '../../Model/FundManagement/FundModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';
import {
  assertDepositOnlyMutation,
  snapshotFundBalanceAxes,
} from '../../Utils/fundBalanceInvariants.js';

const DEFAULT_OPTION_CHAIN_LIMIT_PERCENT = 10;
const DEFAULT_MANUAL_DEPOSIT_METHOD = 'upi';
const MANUAL_DEPOSIT_METHODS = new Set([
  'upi',
  'imps',
  'neft',
  'rtgs',
  'bank_transfer',
  'cash',
  'cheque',
  'internal',
  'other',
]);

const MANUAL_DEPOSIT_METHOD_LABELS = {
  upi: 'UPI',
  imps: 'IMPS',
  neft: 'NEFT',
  rtgs: 'RTGS',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
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

const nonNegative = (value) => Math.max(0, toNumber(value));
const normalizeOptionLimitPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_OPTION_CHAIN_LIMIT_PERCENT;
  return Math.max(0, Math.min(100, n));
};
const toIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const sanitizeText = (value, maxLen = 200) => String(value || '').trim().slice(0, maxLen);

const normalizeManualDepositMethod = (value) => {
  const method = String(value || DEFAULT_MANUAL_DEPOSIT_METHOD).trim().toLowerCase();
  if (MANUAL_DEPOSIT_METHODS.has(method)) return method;
  return DEFAULT_MANUAL_DEPOSIT_METHOD;
};

const buildManualDepositNote = ({
  method,
  reference,
  notes,
  paidAt,
}) => {
  const pieces = [];
  const methodLabel = MANUAL_DEPOSIT_METHOD_LABELS[method] || 'Payment';
  pieces.push(`Funds credited (${methodLabel})`);
  if (reference) pieces.push(`Ref: ${reference}`);
  if (paidAt) pieces.push(`Paid at: ${paidAt.toISOString()}`);
  if (notes) pieces.push(`Broker note: ${notes}`);
  return pieces.join(' | ');
};

const getBrokerOwnershipClauses = (brokerId, brokerIdStr) => {
  const clauses = [{ broker_id: brokerId }, { attached_broker_id: brokerId }];
  if (brokerIdStr) {
    clauses.push({ broker_id_str: brokerIdStr });
  }
  return clauses;
};

const normalizeFundDocument = (fund) => {
  if (!fund.intraday) fund.intraday = {};
  if (!fund.overnight) fund.overnight = {};
  if (!fund.delivery) fund.delivery = {};
  if (!fund.commodity_delivery) fund.commodity_delivery = { available_limit: 0, used_limit: 0 };
  if (!fund.commodity_intraday) fund.commodity_intraday = { available_limit: 0, used_limit: 0 };
  if (!fund.commodity_option) fund.commodity_option = { limit_percentage: 10, used: 0 };
  if (!fund.option_premium) fund.option_premium = { limit_percentage: fund.option_limit_percentage ?? 10, used: 0 };
  return fund;
};

const getFundSnapshot = (fund) => {
  const depositedCash = nonNegative(fund.net_available_balance ?? fund.available_balance);
  const pnlBalance = Number(fund.pnl_balance) || 0;
  const availableCash = depositedCash + pnlBalance;
  const intradayAvailable = nonNegative(fund.intraday?.available_limit ?? fund.intraday?.available);
  const intradayUsed = nonNegative(fund.intraday?.used_limit ?? fund.intraday?.used);
  const longTermAvailable = nonNegative(fund.overnight?.available_limit ?? fund.delivery?.available);
  const openingBalance = intradayAvailable + longTermAvailable;
  const marginUsed = nonNegative(fund.used_margin ?? intradayUsed);
  // Prefer new schema field, fallback to legacy
  const optionChainLimitPercent = normalizeOptionLimitPercent(
    fund.option_premium?.limit_percentage ?? fund.option_limit_percentage
  );
  const optionChainLimit = Number(((openingBalance * optionChainLimitPercent) / 100).toFixed(2));
  const optionPremiumUsed = nonNegative(fund.option_premium?.used ?? fund.option_premium_used);
  const commodityDeliveryAvailable = nonNegative(fund.commodity_delivery?.available_limit);
  const commodityDeliveryUsed = nonNegative(fund.commodity_delivery?.used_limit);
  const commodityIntradayAvailable = nonNegative(fund.commodity_intraday?.available_limit);
  const commodityIntradayUsed = nonNegative(fund.commodity_intraday?.used_limit);
  const commodityOptionLimitPercent = normalizeOptionLimitPercent(fund.commodity_option?.limit_percentage);
  const commodityOptionUsed = nonNegative(fund.commodity_option?.used);
  const commodityOptionLimit = Number((((commodityIntradayAvailable + commodityDeliveryAvailable) * commodityOptionLimitPercent) / 100).toFixed(2));

  return {
    availableCash,
    depositedCash,
    pnlBalance,
    openingBalance,
    intradayAvailable,
    intradayUsed,
    intradayFree: Math.max(0, intradayAvailable - intradayUsed),
    longTermAvailable,
    marginUsed,
    optionChainLimit,
    optionChainLimitPercent,
    optionPremiumUsed,
    commodityDeliveryAvailable,
    commodityDeliveryUsed,
    commodityIntradayAvailable,
    commodityIntradayUsed,
    commodityOptionLimitPercent,
    commodityOptionLimit,
    commodityOptionUsed,
  };
};

const getChangedFundFields = (beforeSnapshot, afterSnapshot) => {
  const fields = [];

  if (toNumber(beforeSnapshot?.depositedCash) !== toNumber(afterSnapshot?.depositedCash)) {
    fields.push('deposited cash');
  }
  if (toNumber(beforeSnapshot?.openingBalance) !== toNumber(afterSnapshot?.openingBalance)) {
    fields.push('opening balance');
  }
  if (toNumber(beforeSnapshot?.intradayAvailable) !== toNumber(afterSnapshot?.intradayAvailable)) {
    fields.push('intraday available');
  }
  if (toNumber(beforeSnapshot?.longTermAvailable) !== toNumber(afterSnapshot?.longTermAvailable)) {
    fields.push('long-term available');
  }
  if (
    toNumber(beforeSnapshot?.optionChainLimitPercent) !== toNumber(afterSnapshot?.optionChainLimitPercent)
  ) {
    fields.push('option limit percentage');
  }
  if (toNumber(beforeSnapshot?.commodityDeliveryAvailable) !== toNumber(afterSnapshot?.commodityDeliveryAvailable)) {
    fields.push('commodity delivery available');
  }
  if (toNumber(beforeSnapshot?.commodityIntradayAvailable) !== toNumber(afterSnapshot?.commodityIntradayAvailable)) {
    fields.push('commodity intraday available');
  }
  if (toNumber(beforeSnapshot?.commodityOptionLimitPercent) !== toNumber(afterSnapshot?.commodityOptionLimitPercent)) {
    fields.push('commodity option limit percentage');
  }

  return fields;
};

const isManualDepositTransaction = (transaction = {}) => {
  if (String(transaction?.type || '').toLowerCase() !== 'credit') return false;
  const notes = String(transaction?.notes || '').toLowerCase();
  return (
    notes.includes('manual deposit recorded')
    || notes.includes('manual deposit entry')
    || notes.includes('funds credited')
  );
};

const parseManualDepositMethodFromNotes = (notes = '') => {
  const text = String(notes || '');
  const match = text.match(/(?:manual deposit(?: recorded| entry)?|funds credited)\s*\(([^)]+)\)/i);
  if (!match?.[1]) return 'other';

  const raw = String(match[1]).trim().toLowerCase();
  const methodKey = Object.entries(MANUAL_DEPOSIT_METHOD_LABELS)
    .find(([, label]) => label.toLowerCase() === raw)?.[0];
  return methodKey || 'other';
};

const mapManualDepositResponse = ({ transaction, customer }) => {
  const method = parseManualDepositMethodFromNotes(transaction?.notes || '');
  return {
    id: transaction?._id?.toString?.() || '',
    customerId: customer?.customer_id || customer?.id || '',
    customerName: customer?.name || '',
    amount: Math.abs(toNumber(transaction?.amount)),
    method,
    methodLabel: MANUAL_DEPOSIT_METHOD_LABELS[method] || MANUAL_DEPOSIT_METHOD_LABELS.other,
    paidAt: transaction?.timestamp || null,
    reference: String(transaction?.reference || '').trim(),
    notes: String(transaction?.notes || '').trim(),
    status: String(transaction?.status || 'completed').toLowerCase(),
  };
};

const applyFundSnapshot = (fund, snapshot) => {
  // Use depositedCash (pure deposits) — fall back to availableCash for backward compat
  const depositedCash = nonNegative(snapshot.depositedCash ?? snapshot.availableCash);
  const intradayAvailable = nonNegative(snapshot.intradayAvailable);
  const longTermAvailable = nonNegative(snapshot.longTermAvailable);
  const optionChainLimitPercent = normalizeOptionLimitPercent(
    snapshot.optionChainLimitPercent ?? fund.option_premium?.limit_percentage ?? fund.option_limit_percentage
  );

  normalizeFundDocument(fund);

  fund.net_available_balance = depositedCash;
  fund.available_balance = depositedCash;
  fund.withdrawable_balance = depositedCash;
  fund.available_margin = depositedCash;
  fund.opening_balance = intradayAvailable + longTermAvailable;

  fund.intraday.available_limit = intradayAvailable;
  fund.intraday.available = intradayAvailable;

  fund.overnight.available_limit = longTermAvailable;
  fund.delivery.available = longTermAvailable;

  // Update both legacy and new schema fields for option limit percentage
  fund.option_limit_percentage = optionChainLimitPercent;
  fund.option_premium.limit_percentage = optionChainLimitPercent;
  if (fund.markModified) fund.markModified('option_premium');

  // Commodity buckets
  const commodityDeliveryAvailable = nonNegative(snapshot.commodityDeliveryAvailable ?? fund.commodity_delivery?.available_limit);
  fund.commodity_delivery.available_limit = commodityDeliveryAvailable;

  const commodityIntradayAvailable = nonNegative(snapshot.commodityIntradayAvailable ?? fund.commodity_intraday?.available_limit);
  fund.commodity_intraday.available_limit = commodityIntradayAvailable;

  const commodityOptionLimitPercent = normalizeOptionLimitPercent(
    snapshot.commodityOptionLimitPercent ?? fund.commodity_option?.limit_percentage
  );
  fund.commodity_option.limit_percentage = commodityOptionLimitPercent;
  if (fund.markModified) fund.markModified('commodity_option');

  fund.last_calculated_at = new Date();
};

const findOwnedCustomer = async (customerId, brokerId, brokerIdStr) =>
  CustomerModel.findOne({
    customer_id: customerId,
    $or: getBrokerOwnershipClauses(brokerId, brokerIdStr),
  });

const findOrCreateFund = async (customer, brokerIdStr) => {
  let fund = await FundModel.findOne({ customer_id: customer._id });

  if (!fund && brokerIdStr) {
    fund = await FundModel.findOne({
      customer_id_str: customer.customer_id,
      broker_id_str: brokerIdStr,
    });
  }

  if (!fund) {
    fund = await FundModel.findOne({ customer_id_str: customer.customer_id });
  }

  if (!fund) {
    fund = await FundModel.create({
      customer_id: customer._id,
      customer_id_str: customer.customer_id,
      broker_id_str: brokerIdStr,
      net_available_balance: 0,
      available_balance: 0,
      withdrawable_balance: 0,
      intraday: { available_limit: 0, used_limit: 0, available: 0, used: 0 },
      overnight: { available_limit: 0, used_limit: 0 },
      delivery: { available: 0, used: 0 },
      option_limit_percentage: DEFAULT_OPTION_CHAIN_LIMIT_PERCENT,
      option_premium: { limit_percentage: DEFAULT_OPTION_CHAIN_LIMIT_PERCENT, used: 0 },
      option_premium_used: 0,
      commodity_delivery: { available_limit: 0, used_limit: 0 },
      commodity_intraday: { available_limit: 0, used_limit: 0 },
      commodity_option: { limit_percentage: DEFAULT_OPTION_CHAIN_LIMIT_PERCENT, used: 0 },
    });
  } else {
    if (!fund.customer_id) {
      fund.customer_id = customer._id;
    }
    if (!fund.customer_id_str) {
      fund.customer_id_str = customer.customer_id;
    }
    if (brokerIdStr && fund.broker_id_str !== brokerIdStr) {
      fund.broker_id_str = brokerIdStr;
    }
    normalizeFundDocument(fund);
  }

  return fund;
};

const findFundForCustomer = async (customer, brokerIdStr) => {
  if (!customer) return null;

  let fund = await FundModel.findOne({ customer_id: customer._id });

  if (!fund && brokerIdStr) {
    fund = await FundModel.findOne({
      customer_id_str: customer.customer_id,
      broker_id_str: brokerIdStr,
    });
  }

  if (!fund) {
    fund = await FundModel.findOne({ customer_id_str: customer.customer_id });
  }

  if (fund) {
    normalizeFundDocument(fund);
  }

  return fund;
};

const buildBalanceResponse = (customer, fund) => {
  const snapshot = getFundSnapshot(fund);

  return {
    customerId: customer.customer_id,
    customerName: customer.name,
    funds: snapshot,
    balance: {
      // Legacy fields retained for existing consumers.
      net: snapshot.availableCash,
      availableCash: snapshot.availableCash,
      openingBalance: snapshot.openingBalance,
      intraday: {
        available: snapshot.intradayAvailable,
        used: snapshot.intradayUsed,
        free: snapshot.intradayFree,
      },
      overnight: {
        available: snapshot.longTermAvailable,
      },
      optionChain: {
        limit: snapshot.optionChainLimit,
        percentage: snapshot.optionChainLimitPercent,
      },
      commodityDelivery: {
        available: snapshot.commodityDeliveryAvailable,
        used: snapshot.commodityDeliveryUsed,
        free: Math.max(0, snapshot.commodityDeliveryAvailable - snapshot.commodityDeliveryUsed),
      },
      commodityIntraday: {
        available: snapshot.commodityIntradayAvailable,
        used: snapshot.commodityIntradayUsed,
        free: Math.max(0, snapshot.commodityIntradayAvailable - snapshot.commodityIntradayUsed),
      },
      commodityOption: {
        percentage: snapshot.commodityOptionLimitPercent,
        limit: snapshot.commodityOptionLimit,
        used: snapshot.commodityOptionUsed,
        remaining: Math.max(0, snapshot.commodityOptionLimit - snapshot.commodityOptionUsed),
      },
      marginUsed: snapshot.marginUsed,
    },
  };
};

/**
 * @desc     Add funds to client account
 * @route    POST /api/broker/funds/add
 * @access   Private (Broker only)
 */
const addFundsToClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { customerId, amount, notes } = req.body;

  if (!customerId || !amount) {
    return res.status(400).json({
      success: false,
      message: 'Customer ID and amount are required.',
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be greater than 0.',
    });
  }

  const customer = await findOwnedCustomer(customerId, brokerId, brokerIdStr);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const fund = await findOrCreateFund(customer, brokerIdStr);
  const beforeAxes = snapshotFundBalanceAxes(fund);
  const beforeSnapshot = getFundSnapshot(fund);
  const previousBalance = nonNegative(fund.net_available_balance);
  const updatedBalance = previousBalance + Number(amount);
  applyFundSnapshot(fund, {
    depositedCash: updatedBalance,
    intradayAvailable: fund.intraday?.available_limit ?? fund.intraday?.available,
    longTermAvailable: fund.overnight?.available_limit ?? fund.delivery?.available,
    optionChainLimitPercent: fund.option_limit_percentage,
  });
  
  // Log transaction
  if (!fund.transactions) fund.transactions = [];
  fund.transactions.push({
    type: 'credit',
    amount: Number(amount),
    notes: notes || 'Funds added by broker',
    addedBy: brokerId,
    timestamp: new Date(),
  });

  const afterAxes = snapshotFundBalanceAxes(fund);
  assertDepositOnlyMutation({
    before: beforeAxes,
    after: afterAxes,
    context: 'FundController.addFundsToClient',
  });

  await fund.save();
  const afterSnapshot = getFundSnapshot(fund);
  const amountAdded = Number(amount);
  const fundAddNote = notes
    ? `Manual fund add recorded. Broker note: ${notes}`
    : 'Manual fund add recorded.';

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'FUND_MANUAL_ADD',
    category: 'funds',
    message: `Broker added ${formatCurrency(amountAdded)} to customer ${customer.customer_id}. Deposited cash changed from ${formatCurrency(beforeSnapshot.depositedCash)} to ${formatCurrency(afterSnapshot.depositedCash)}.`,
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
    amountDelta: amountAdded,
    fundBefore: {
      depositedCash: beforeSnapshot.depositedCash,
      availableCash: beforeSnapshot.availableCash,
      openingBalance: beforeSnapshot.openingBalance,
    },
    fundAfter: {
      depositedCash: afterSnapshot.depositedCash,
      availableCash: afterSnapshot.availableCash,
      openingBalance: afterSnapshot.openingBalance,
    },
    marginBefore: {
      intradayAvailable: beforeSnapshot.intradayAvailable,
      intradayUsed: beforeSnapshot.intradayUsed,
      longTermAvailable: beforeSnapshot.longTermAvailable,
      optionChainLimitPercent: beforeSnapshot.optionChainLimitPercent,
    },
    marginAfter: {
      intradayAvailable: afterSnapshot.intradayAvailable,
      intradayUsed: afterSnapshot.intradayUsed,
      longTermAvailable: afterSnapshot.longTermAvailable,
      optionChainLimitPercent: afterSnapshot.optionChainLimitPercent,
    },
    note: fundAddNote,
    metadata: {
      amountAdded,
      previousDepositedCash: beforeSnapshot.depositedCash,
      newDepositedCash: afterSnapshot.depositedCash,
      changedFields: 'deposited cash',
    },
  });

  console.log(`[Broker] Added ₹${amount} to client ${customerId}. New balance: ₹${fund.net_available_balance}`);

  res.status(200).json({
    success: true,
    message: `₹${amount} added to client account.`,
    data: {
      customerId,
      previousBalance,
      addedAmount: Number(amount),
      newBalance: nonNegative(fund.net_available_balance),
    },
  });
});

/**
 * @desc     Record manual deposit received via external channels (e.g. WhatsApp)
 * @route    POST /api/broker/clients/:id/manual-deposits
 * @access   Private (Broker only)
 */
const createManualDeposit = asyncHandler(async (req, res) => {
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

  const normalizedMethod = normalizeManualDepositMethod(method);
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

  const fund = await findOrCreateFund(customer, brokerIdStr);
  const beforeAxes = snapshotFundBalanceAxes(fund);
  const beforeSnapshot = getFundSnapshot(fund);

  const previousDepositedCash = nonNegative(fund.net_available_balance);
  const updatedDepositedCash = previousDepositedCash + parsedAmount;

  applyFundSnapshot(fund, {
    depositedCash: updatedDepositedCash,
    intradayAvailable: fund.intraday?.available_limit ?? fund.intraday?.available,
    longTermAvailable: fund.overnight?.available_limit ?? fund.delivery?.available,
    optionChainLimitPercent: fund.option_premium?.limit_percentage ?? fund.option_limit_percentage,
    commodityDeliveryAvailable: fund.commodity_delivery?.available_limit,
    commodityIntradayAvailable: fund.commodity_intraday?.available_limit,
    commodityOptionLimitPercent: fund.commodity_option?.limit_percentage,
  });

  if (!fund.transactions) fund.transactions = [];

  const transaction = {
    type: 'credit',
    amount: parsedAmount,
    notes: buildManualDepositNote({
      method: normalizedMethod,
      reference: sanitizedReference,
      notes: sanitizedNotes,
      paidAt: paidAtDate,
    }),
    status: 'completed',
    reference: sanitizedReference,
    addedBy: brokerId,
    timestamp: paidAtDate,
  };

  fund.transactions.push(transaction);

  const afterAxes = snapshotFundBalanceAxes(fund);
  assertDepositOnlyMutation({
    before: beforeAxes,
    after: afterAxes,
    context: 'FundController.createManualDeposit',
  });

  await fund.save();

  const savedTx = fund.transactions[fund.transactions.length - 1] || transaction;
  const afterSnapshot = getFundSnapshot(fund);

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'FUND_MANUAL_DEPOSIT_CREATE',
    category: 'funds',
    message: `Broker credited ${formatCurrency(parsedAmount)} to customer ${customer.customer_id}.`,
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
    amountDelta: parsedAmount,
    fundBefore: {
      depositedCash: beforeSnapshot.depositedCash,
      availableCash: beforeSnapshot.availableCash,
      openingBalance: beforeSnapshot.openingBalance,
    },
    fundAfter: {
      depositedCash: afterSnapshot.depositedCash,
      availableCash: afterSnapshot.availableCash,
      openingBalance: afterSnapshot.openingBalance,
    },
    marginBefore: {
      intradayAvailable: beforeSnapshot.intradayAvailable,
      intradayUsed: beforeSnapshot.intradayUsed,
      longTermAvailable: beforeSnapshot.longTermAvailable,
      optionChainLimitPercent: beforeSnapshot.optionChainLimitPercent,
    },
    marginAfter: {
      intradayAvailable: afterSnapshot.intradayAvailable,
      intradayUsed: afterSnapshot.intradayUsed,
      longTermAvailable: afterSnapshot.longTermAvailable,
      optionChainLimitPercent: afterSnapshot.optionChainLimitPercent,
    },
    note: sanitizedNotes || `Manual deposit method: ${MANUAL_DEPOSIT_METHOD_LABELS[normalizedMethod]}.`,
    metadata: {
      method: normalizedMethod,
      methodLabel: MANUAL_DEPOSIT_METHOD_LABELS[normalizedMethod],
      paidAt: paidAtDate.toISOString(),
      reference: sanitizedReference,
      previousDepositedCash,
      newDepositedCash: afterSnapshot.depositedCash,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Manual deposit recorded successfully.',
    deposit: {
      id: savedTx?._id?.toString?.() || '',
      customerId: customer.customer_id,
      customerName: customer.name,
      amount: parsedAmount,
      method: normalizedMethod,
      methodLabel: MANUAL_DEPOSIT_METHOD_LABELS[normalizedMethod],
      paidAt: paidAtDate.toISOString(),
      reference: sanitizedReference,
      notes: sanitizedNotes,
      status: 'completed',
    },
    balance: {
      previousDepositedCash,
      newDepositedCash: afterSnapshot.depositedCash,
    },
  });
});

/**
 * @desc     Get broker manual deposit history
 * @route    GET /api/broker/manual-deposits
 * @access   Private (Broker only)
 */
const getManualDeposits = asyncHandler(async (req, res) => {
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
      $or: getBrokerOwnershipClauses(brokerId, brokerIdStr),
    }).select('customer_id name _id');
  }

  const deposits = [];

  for (const customer of selectedCustomers) {
    // eslint-disable-next-line no-await-in-loop
    const fund = await findFundForCustomer(customer, brokerIdStr);
    if (!fund?.transactions?.length) continue;

    const manualDeposits = fund.transactions
      .filter((transaction) => isManualDepositTransaction(transaction))
      .map((transaction) => mapManualDepositResponse({ transaction, customer }));

    deposits.push(...manualDeposits);
  }

  deposits.sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0));

  const total = deposits.length;
  const skip = (parsedPage - 1) * parsedLimit;
  const paginatedDeposits = deposits.slice(skip, skip + parsedLimit);

  res.status(200).json({
    success: true,
    deposits: paginatedDeposits,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc     Get client balance
 * @route    GET /api/broker/clients/:id/balance
 * @access   Private (Broker only)
 */
const getClientBalance = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await findOwnedCustomer(id, brokerId, brokerIdStr);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const fund = await findOrCreateFund(customer, brokerIdStr);
  await fund.save();

  res.status(200).json({
    success: true,
    data: buildBalanceResponse(customer, fund),
  });
});

/**
 * @desc     Update client fund buckets
 * @route    PUT /api/broker/clients/:id/funds
 * @access   Private (Broker only)
 */
const updateClientFunds = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const {
    depositedCash,
    availableCash,
    openingBalance,
    intradayAvailable,
    longTermAvailable,
    optionLimitPercentage,
    commodityDeliveryAvailable,
    commodityIntradayAvailable,
    commodityOptionLimitPercentage,
    note,
  } = req.body || {};

  // Accept depositedCash (new) or availableCash (legacy) interchangeably
  const effectiveDepositedCash = depositedCash ?? availableCash;

  const hasAnyUpdate =
    effectiveDepositedCash !== undefined ||
    openingBalance !== undefined ||
    intradayAvailable !== undefined ||
    longTermAvailable !== undefined ||
    optionLimitPercentage !== undefined ||
    commodityDeliveryAvailable !== undefined ||
    commodityIntradayAvailable !== undefined ||
    commodityOptionLimitPercentage !== undefined;

  if (!hasAnyUpdate) {
    return res.status(400).json({
      success: false,
      message: 'At least one fund field is required.',
    });
  }

  const invalidFields = [
    ['depositedCash', effectiveDepositedCash],
    ['openingBalance', openingBalance],
    ['intradayAvailable', intradayAvailable],
    ['longTermAvailable', longTermAvailable],
    ['optionLimitPercentage', optionLimitPercentage],
    ['commodityDeliveryAvailable', commodityDeliveryAvailable],
    ['commodityIntradayAvailable', commodityIntradayAvailable],
    ['commodityOptionLimitPercentage', commodityOptionLimitPercentage],
  ]
    .filter(([, value]) => value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0))
    .map(([key]) => key);

  if (invalidFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid non-negative numeric values for: ${invalidFields.join(', ')}`,
    });
  }

  if (optionLimitPercentage !== undefined) {
    const pct = Number(optionLimitPercentage);
    if (pct > 100) {
      return res.status(400).json({
        success: false,
        message: 'optionLimitPercentage cannot exceed 100.',
      });
    }
  }

  if (commodityOptionLimitPercentage !== undefined) {
    const pct = Number(commodityOptionLimitPercentage);
    if (pct > 100) {
      return res.status(400).json({
        success: false,
        message: 'commodityOptionLimitPercentage cannot exceed 100.',
      });
    }
  }

  const customer = await findOwnedCustomer(id, brokerId, brokerIdStr);
  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const fund = await findOrCreateFund(customer, brokerIdStr);
  const beforeAxes = snapshotFundBalanceAxes(fund);
  const previousSnapshot = getFundSnapshot(fund);
  const nextIntradayAvailable =
    intradayAvailable !== undefined ? nonNegative(intradayAvailable) : previousSnapshot.intradayAvailable;
  const nextLongTermAvailable =
    longTermAvailable !== undefined ? nonNegative(longTermAvailable) : previousSnapshot.longTermAvailable;

  // Use depositedCash (pure deposits) — not the combined availableCash which includes P&L
  const nextDepositedCash =
    effectiveDepositedCash !== undefined ? nonNegative(effectiveDepositedCash) : previousSnapshot.depositedCash;

  const nextCommodityDeliveryAvailable =
    commodityDeliveryAvailable !== undefined ? nonNegative(commodityDeliveryAvailable) : previousSnapshot.commodityDeliveryAvailable;
  const nextCommodityIntradayAvailable =
    commodityIntradayAvailable !== undefined ? nonNegative(commodityIntradayAvailable) : previousSnapshot.commodityIntradayAvailable;
  const nextCommodityOptionLimitPercent =
    commodityOptionLimitPercentage !== undefined
      ? normalizeOptionLimitPercent(commodityOptionLimitPercentage)
      : previousSnapshot.commodityOptionLimitPercent;

  const nextSnapshot = {
    depositedCash: nextDepositedCash,
    openingBalance: nextIntradayAvailable + nextLongTermAvailable,
    intradayAvailable: nextIntradayAvailable,
    longTermAvailable: nextLongTermAvailable,
    optionChainLimitPercent:
      optionLimitPercentage !== undefined
        ? normalizeOptionLimitPercent(optionLimitPercentage)
        : previousSnapshot.optionChainLimitPercent,
    commodityDeliveryAvailable: nextCommodityDeliveryAvailable,
    commodityIntradayAvailable: nextCommodityIntradayAvailable,
    commodityOptionLimitPercent: nextCommodityOptionLimitPercent,
  };

  applyFundSnapshot(fund, nextSnapshot);

  if (!fund.transactions) fund.transactions = [];
  fund.transactions.push({
    type: 'adjustment',
    amount: nextDepositedCash - previousSnapshot.depositedCash,
    notes: note || 'Funds edited by broker',
    editedBy: brokerId,
    timestamp: new Date(),
  });

  const afterAxes = snapshotFundBalanceAxes(fund);
  assertDepositOnlyMutation({
    before: beforeAxes,
    after: afterAxes,
    context: 'FundController.updateClientFunds',
  });

  await fund.save();
  const updatedSnapshot = getFundSnapshot(fund);
  const changedFields = getChangedFundFields(previousSnapshot, updatedSnapshot);
  const editDelta = nextDepositedCash - previousSnapshot.depositedCash;
  const fundEditNote = note
    ? `Manual fund update recorded. Broker note: ${note}`
    : 'Manual fund update recorded.';

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'FUND_MANUAL_EDIT',
    category: 'funds',
    message: `Broker updated funds for customer ${customer.customer_id}. Deposited cash changed from ${formatCurrency(previousSnapshot.depositedCash)} to ${formatCurrency(updatedSnapshot.depositedCash)}.`,
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
    amountDelta: editDelta,
    fundBefore: {
      depositedCash: previousSnapshot.depositedCash,
      availableCash: previousSnapshot.availableCash,
      openingBalance: previousSnapshot.openingBalance,
    },
    fundAfter: {
      depositedCash: updatedSnapshot.depositedCash,
      availableCash: updatedSnapshot.availableCash,
      openingBalance: updatedSnapshot.openingBalance,
    },
    marginBefore: {
      intradayAvailable: previousSnapshot.intradayAvailable,
      intradayUsed: previousSnapshot.intradayUsed,
      longTermAvailable: previousSnapshot.longTermAvailable,
      optionChainLimitPercent: previousSnapshot.optionChainLimitPercent,
      commodityDeliveryAvailable: previousSnapshot.commodityDeliveryAvailable,
      commodityIntradayAvailable: previousSnapshot.commodityIntradayAvailable,
      commodityOptionLimitPercent: previousSnapshot.commodityOptionLimitPercent,
    },
    marginAfter: {
      intradayAvailable: updatedSnapshot.intradayAvailable,
      intradayUsed: updatedSnapshot.intradayUsed,
      longTermAvailable: updatedSnapshot.longTermAvailable,
      optionChainLimitPercent: updatedSnapshot.optionChainLimitPercent,
      commodityDeliveryAvailable: updatedSnapshot.commodityDeliveryAvailable,
      commodityIntradayAvailable: updatedSnapshot.commodityIntradayAvailable,
      commodityOptionLimitPercent: updatedSnapshot.commodityOptionLimitPercent,
    },
    note: fundEditNote,
    metadata: {
      amountChanged: editDelta,
      previousDepositedCash: previousSnapshot.depositedCash,
      newDepositedCash: updatedSnapshot.depositedCash,
      changedFields: changedFields.join(', ') || 'deposited cash',
    },
  });

  res.status(200).json({
    success: true,
    message: 'Client funds updated successfully.',
    data: {
      ...buildBalanceResponse(customer, fund),
      previous: previousSnapshot,
    },
  });
});

/**
 * @desc     Get fund transfer history
 * @route    GET /api/broker/funds/history
 * @access   Private (Broker only)
 */
const getFundHistory = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { customerId, page = 1, limit = 20, type } = req.query;

  // Build query
  const query = { broker_id_str: brokerIdStr };
  if (customerId) {
    query.customer_id_str = customerId;
  }

  // Get funds with transactions
  const funds = await FundModel.find(query).select('customer_id_str transactions');

  // Flatten all transactions
  let allTransactions = [];
  funds.forEach(fund => {
    if (fund.transactions && fund.transactions.length > 0) {
      fund.transactions.forEach(tx => {
        allTransactions.push({
          ...tx.toObject ? tx.toObject() : tx,
          customerId: fund.customer_id_str,
        });
      });
    }
  });

  // Filter by type if specified
  if (type && type !== 'all') {
    allTransactions = allTransactions.filter(tx => tx.type === type);
  }

  // Sort by timestamp (newest first)
  allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Paginate
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const paginatedTransactions = allTransactions.slice(skip, skip + parseInt(limit));

  res.status(200).json({
    success: true,
    transactions: paginatedTransactions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: allTransactions.length,
      pages: Math.ceil(allTransactions.length / parseInt(limit)),
    },
  });
});

export {
  addFundsToClient,
  createManualDeposit,
  getClientBalance,
  getManualDeposits,
  updateClientFunds,
  getFundHistory,
};
