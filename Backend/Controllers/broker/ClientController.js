// Controllers/broker/ClientController.js
// Broker Client Management - Full CRUD for broker's clients
// Migrated and extended from CustomerController.js

import asyncHandler from 'express-async-handler';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import DeletedCustomerModel from '../../Model/DeletedCustomerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import { reserveDeliveryForHoldConversion, refundMarginImmediate } from '../../services/marginLifecycle.js';
import { resolveOrderValidity, canBrokerExtendValidity, extendValidityByDays } from '../../services/orderValidity.js';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import ClientPricingModel from '../../Model/Trading/ClientPricingModel.js';
import HoldingModel from '../../Model/Trading/HoldingModel.js';
import PositionsModel from '../../Model/Trading/PositionsModel.js';
import UserWatchlistModel from '../../Model/UserWatchlistModel.js';
import {
  INITIAL_CLIENT_PRICING,
  ensureClientPricingConfig,
  normalizeClientPricing,
} from '../../Utils/ClientPricingEngine.js';

// Utility function
const formatDate = (date) => {
  if (!date) return 'N/A';
  return date.toISOString().split('T')[0];
};

/**
 * Generate a unique 10-digit customer ID with collision retry.
 */
const generateCustomerId = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const exists = await CustomerModel.findOne({ customer_id: id }).select('_id').lean();
    if (!exists) return id;
  }
  throw new Error('Failed to generate unique customer ID after 10 attempts');
};

const getBrokerOwnershipClauses = (brokerId, brokerIdStr) => {
  const clauses = [{ broker_id: brokerId }, { attached_broker_id: brokerId }];
  if (brokerIdStr) {
    clauses.push({ broker_id_str: brokerIdStr });
  }
  return clauses;
};

const getCustomerOwnershipQuery = (customerId, brokerId, brokerIdStr) => ({
  customer_id: customerId,
  $or: getBrokerOwnershipClauses(brokerId, brokerIdStr),
});

const INITIAL_CLIENT_PRICING_RESPONSE = Object.freeze({
  brokerage: {
    cashPercent: INITIAL_CLIENT_PRICING.brokerage.cash.percent,
    futurePercent: INITIAL_CLIENT_PRICING.brokerage.future.percent,
    optionsPerLot: INITIAL_CLIENT_PRICING.brokerage.option.per_lot,
  },
  spread: {
    ...INITIAL_CLIENT_PRICING.spread,
  },
});

const toNumber = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const mapPricingConfigToResponse = (pricing) => ({
  brokerage: {
    cashPercent:
      pricing?.brokerage?.cash?.percent ?? INITIAL_CLIENT_PRICING_RESPONSE.brokerage.cashPercent,
    futurePercent:
      pricing?.brokerage?.future?.percent ?? INITIAL_CLIENT_PRICING_RESPONSE.brokerage.futurePercent,
    optionsPerLot:
      pricing?.brokerage?.option?.per_lot ?? INITIAL_CLIENT_PRICING_RESPONSE.brokerage.optionsPerLot,
  },
  spread: {
    cash: pricing?.spread?.cash ?? INITIAL_CLIENT_PRICING_RESPONSE.spread.cash,
    future: pricing?.spread?.future ?? INITIAL_CLIENT_PRICING_RESPONSE.spread.future,
    option: pricing?.spread?.option ?? INITIAL_CLIENT_PRICING_RESPONSE.spread.option,
    mcx: pricing?.spread?.mcx ?? INITIAL_CLIENT_PRICING_RESPONSE.spread.mcx,
  },
});

const sanitizePricingPayload = (payload = {}, base = INITIAL_CLIENT_PRICING_RESPONSE) => {
  const incomingBrokerage = payload?.brokerage || {};
  const incomingSpread = payload?.spread || {};

  const nextBrokerage = {
    cashPercent: clamp(
      toNumber(
        incomingBrokerage?.cash?.percent ?? incomingBrokerage?.cashPercent,
        base.brokerage.cashPercent
      ),
      0,
      100
    ),
    futurePercent: clamp(
      toNumber(
        incomingBrokerage?.future?.percent ?? incomingBrokerage?.futurePercent,
        base.brokerage.futurePercent
      ),
      0,
      100
    ),
    optionsPerLot: clamp(
      toNumber(
        incomingBrokerage?.option?.per_lot ??
        incomingBrokerage?.option?.perLot ??
        incomingBrokerage?.optionsPerLot,
        base.brokerage.optionsPerLot
      ),
      0,
      100000
    ),
  };

  const spreadCash = toNumber(incomingSpread?.cash);
  const spreadFuture = toNumber(incomingSpread?.future);
  const spreadOption = toNumber(incomingSpread?.option);
  const spreadMcx = toNumber(incomingSpread?.mcx);

  const nextSpread = {
    cash: clamp(spreadCash ?? base.spread.cash, -1000, 1000),
    future: clamp(spreadFuture ?? base.spread.future, -1000, 1000),
    option: clamp(spreadOption ?? base.spread.option, -1000, 1000),
    mcx: clamp(spreadMcx ?? base.spread.mcx, -1000, 1000),
  };

  return { brokerage: nextBrokerage, spread: nextSpread };
};

const mapResponsePricingToStoredConfig = (pricing = INITIAL_CLIENT_PRICING_RESPONSE) =>
  normalizeClientPricing({
    brokerage: {
      cash: { percent: pricing.brokerage.cashPercent },
      future: { percent: pricing.brokerage.futurePercent },
      option: { per_lot: pricing.brokerage.optionsPerLot },
    },
    spread: pricing.spread,
  });

/**
 * @desc     Get all clients for this broker
 * @route    GET /api/broker/clients
 * @access   Private (Broker only)
 */
const getAllClients = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const {
    status,
    trading,
    search,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const filters = [{ $or: getBrokerOwnershipClauses(brokerId, brokerIdStr) }];

  if (status && status !== 'all') {
    filters.push({ status });
  }

  if (trading === 'enabled') {
    filters.push({ trading_enabled: true });
  } else if (trading === 'disabled') {
    filters.push({ trading_enabled: { $ne: true } });
  }

  if (search) {
    filters.push({ $or: [
      { name: { $regex: search, $options: 'i' } },
      { customer_id: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ] });
  }

  const query = filters.length === 1 ? filters[0] : { $and: filters };
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [customers, total] = await Promise.all([
    CustomerModel.find(query)
      .select('+password')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit)),
    CustomerModel.countDocuments(query),
  ]);

  const formattedCustomers = customers.map(customer => ({
    id: customer.customer_id,
    _id: customer._id,
    name: customer.name,
    password: customer.password,
    email: customer.email,
    phone: customer.phone,
    status: customer.status || 'active',
    kycStatus: customer.kyc_status || 'pending',
    tradingEnabled: customer.trading_enabled || false,
    holdingsExitAllowed: customer.holdings_exit_allowed || false,
    profilePhoto: customer.profile_photo || null,
    joiningDate: formatDate(customer.createdAt),
    lastLogin: customer.last_login,
    blockedByAdmin: !!customer.blocked_by, // True if blocked by admin (blocked_by references Admin model)
  }));

  res.status(200).json({
    success: true,
    clients: formattedCustomers,
    count: total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Get client details
 * @route    GET /api/broker/clients/:id
 * @access   Private (Broker only)
 */
const getClientById = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  ).select('+password');

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  // Get fund info
  const fund = await FundModel.findOne({
    customer_id_str: id,
    broker_id_str: brokerIdStr
  });

  // Get order counts
  const [totalOrders, openOrders] = await Promise.all([
    OrderModel.countDocuments({ 
      customer_id_str: id,
      broker_id_str: brokerIdStr
    }),
    OrderModel.countDocuments({ 
      customer_id_str: id,
      broker_id_str: brokerIdStr,
      status: { $in: ['OPEN', 'EXECUTED'] }
    }),
  ]);

  res.status(200).json({
    success: true,
    client: {
      id: customer.customer_id,
      _id: customer._id,
      name: customer.name,
      password: customer.password,
      email: customer.email,
      phone: customer.phone,
      status: customer.status || 'active',
      kycStatus: customer.kyc_status || 'pending',
      tradingEnabled: customer.trading_enabled || false,
      holdingsExitAllowed: customer.holdings_exit_allowed || false,
      segmentsAllowed: customer.segments_allowed || [],
      profilePhoto: customer.profile_photo || null,
      settings: customer.settings,
      joiningDate: formatDate(customer.createdAt),
      lastLogin: customer.last_login,
      blockedByAdmin: !!customer.blocked_by, // True if blocked by admin (blocked_by references Admin model)
      blockReason: customer.block_reason || null,
      funds: fund ? {
        balance: (fund.net_available_balance || 0) + (fund.pnl_balance || 0),
        intradayLimit: fund.intraday?.available_limit || 0,
        intradayUsed: fund.intraday?.used_limit || 0,
        overnightLimit: fund.overnight?.available_limit || 0,
      } : null,
      stats: {
        totalOrders,
        openOrders,
      },
    },
  });
});

/**
 * @desc     Create new client
 * @route    POST /api/broker/clients
 * @access   Private (Broker only)
 */
const createClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { name, password, email, phone } = req.body;

  if (!name || !password) {
    return res.status(400).json({
      success: false,
      message: 'Name and password are required.',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters.',
    });
  }

  // Generate unique customer ID
  const customerId = await generateCustomerId();

  // Create customer
  const newCustomer = await CustomerModel.create({
    customer_id: customerId,
    name,
    password,
    email: email ? email.toLowerCase() : undefined,
    phone,
    broker_id: brokerId,
    broker_id_str: brokerIdStr,
    role: 'customer',
    status: 'active',
    trading_enabled: true,
  });

  // Create fund record
  await FundModel.create({
    customer_id: newCustomer._id,
    customer_id_str: newCustomer.customer_id,
    broker_id_str: brokerIdStr,
    net_available_balance: 0,
    intraday: { available_limit: 0, used_limit: 0 },
    overnight: { available_limit: 0 },
  });

  await ensureClientPricingConfig({
    brokerIdStr,
    customerIdStr: newCustomer.customer_id,
    updatedBy: brokerId,
  });

  res.status(201).json({
    success: true,
    message: 'Client created successfully.',
    client: {
      id: newCustomer.customer_id,
      name: newCustomer.name,
      joiningDate: formatDate(newCustomer.createdAt),
      status: 'active',
    },
  });
});

/**
 * @desc     Update client details
 * @route    PUT /api/broker/clients/:id
 * @access   Private (Broker only)
 */
const updateClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const updateData = req.body;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  // Update allowed fields
  if (updateData.name) customer.name = updateData.name;
  if (updateData.email) customer.email = updateData.email.toLowerCase();
  if (updateData.phone) customer.phone = updateData.phone;
  if (updateData.password) customer.password = updateData.password;
  if (updateData.status) customer.status = updateData.status;
  if (updateData.tradingEnabled !== undefined) customer.trading_enabled = updateData.tradingEnabled;
  if (updateData.segmentsAllowed) customer.segments_allowed = updateData.segmentsAllowed;

  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Client updated successfully.',
    client: {
      id: customer.customer_id,
      name: customer.name,
      status: customer.status,
    },
  });
});

/**
 * @desc     Delete client (soft delete - move to recycle bin)
 * @route    DELETE /api/broker/clients/:id
 * @access   Private (Broker only)
 */
const deleteClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  // Fetch all related data
  const [fundData, orders, holdings, positions, watchlist] = await Promise.all([
    FundModel.findOne({ customer_id_str: id, broker_id_str: brokerIdStr }),
    OrderModel.find({ customer_id_str: id, broker_id_str: brokerIdStr }),
    HoldingModel.find({ userId: customer._id }),
    PositionsModel.find({ userId: customer._id }),
    UserWatchlistModel.findOne({ customer_id_str: id, broker_id_str: brokerIdStr }),
  ]);

  // Create archived customer record
  const archivedCustomer = await DeletedCustomerModel.create({
    customer_id: customer.customer_id,
    password: customer.password || '',
    name: customer.name,
    role: customer.role,
    attached_broker_id: customer.broker_id || customer.attached_broker_id || brokerId,
    original_id: customer._id,
    deleted_at: new Date(),
    deleted_by: brokerId,
    original_created_at: customer.createdAt,
    archived_fund: fundData ? {
      net_available_balance: fundData.net_available_balance || 0,
      pnl_balance: fundData.pnl_balance || 0,
      intraday: fundData.intraday || {},
      overnight: fundData.overnight || {},
    } : {},
    archived_orders: orders.map(o => o.toObject()),
    archived_holdings: holdings.map(h => h.toObject()),
    archived_positions: positions.map(p => p.toObject()),
    archived_watchlist: watchlist?.instruments || [],
    data_summary: {
      total_orders: orders.length,
      total_holdings: holdings.length,
      total_positions: positions.length,
      watchlist_count: watchlist?.instruments?.length || 0,
      fund_balance: (fundData?.net_available_balance || 0) + (fundData?.pnl_balance || 0),
    },
  });

  // Delete from original collections
  await Promise.all([
    CustomerModel.deleteOne({ _id: customer._id }),
    fundData && FundModel.deleteOne({ _id: fundData._id }),
    orders.length > 0 && OrderModel.deleteMany({ customer_id_str: id, broker_id_str: brokerIdStr }),
    holdings.length > 0 && HoldingModel.deleteMany({ userId: customer._id }),
    positions.length > 0 && PositionsModel.deleteMany({ userId: customer._id }),
    watchlist && UserWatchlistModel.deleteOne({ _id: watchlist._id }),
  ]);

  res.status(200).json({
    success: true,
    message: 'Client moved to recycle bin.',
    id,
    dataSummary: archivedCustomer.data_summary,
  });
});

/**
 * @desc     Block client
 * @route    POST /api/broker/clients/:id/block
 * @access   Private (Broker only)
 */
const blockClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { reason } = req.body;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  customer.status = 'blocked';
  customer.block_reason = reason || 'Blocked by broker';
  customer.trading_enabled = false;
  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Client blocked successfully.',
  });
});

/**
 * @desc     Unblock client
 * @route    POST /api/broker/clients/:id/unblock
 * @access   Private (Broker only)
 */
const unblockClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  customer.status = 'active';
  customer.trading_enabled = true;
  customer.block_reason = undefined;
  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Client unblocked successfully.',
  });
});

/**
 * @desc     Toggle client trading permission
 * @route    PUT /api/broker/clients/:id/trading
 * @access   Private (Broker only)
 */
const toggleTrading = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { enabled, reason } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Field "enabled" (boolean) is required.',
    });
  }

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  if (customer.status === 'blocked') {
    return res.status(400).json({
      success: false,
      message: 'Cannot change trading for a blocked account. Unblock the client first.',
    });
  }

  customer.trading_enabled = enabled;
  customer.restriction_reason = enabled ? undefined : (reason || 'Trading stopped by broker');
  await customer.save();

  res.status(200).json({
    success: true,
    message: enabled ? 'Trading enabled for client.' : 'Trading stopped for client.',
    tradingEnabled: customer.trading_enabled,
  });
});

/**
 * @desc     Toggle client holdings exit permission
 * @route    PUT /api/broker/clients/:id/holdings-exit
 * @access   Private (Broker only)
 */
const toggleHoldingsExit = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { allowed } = req.body;

  if (typeof allowed !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Field "allowed" (boolean) is required.',
    });
  }

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  customer.holdings_exit_allowed = allowed;
  await customer.save();

  res.status(200).json({
    success: true,
    message: allowed ? 'Holdings exit unlocked for client.' : 'Holdings exit locked for client.',
    holdingsExitAllowed: customer.holdings_exit_allowed,
  });
});

/**
 * @desc     Toggle per-order exit permission for a specific order (broker-controlled)
 * @route    PUT /api/broker/clients/:clientId/orders/:orderId/exit-toggle
 * @access   Private (Broker only)
 */
const toggleOrderExitAllowed = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { clientId, orderId } = req.params;
  const { allowed } = req.body;

  if (typeof allowed !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Field "allowed" (boolean) is required.',
    });
  }

  // Verify client belongs to this broker
  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(clientId, brokerId, brokerIdStr)
  );
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Client not found.' });
  }

  // Verify order belongs to this customer
  const order = await OrderModel.findOne({
    _id: orderId,
    customer_id_str: customer.customer_id,
    broker_id_str: brokerIdStr,
  });
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found for this client.' });
  }

  order.exit_allowed = allowed;
  await order.save();

  res.status(200).json({
    success: true,
    message: allowed ? 'Exit unlocked for this order.' : 'Exit locked for this order.',
    exit_allowed: order.exit_allowed,
    orderId: order._id,
  });
});

/**
 * @desc     Login as client (impersonation)
 * @route    POST /api/broker/clients/:id/login-as
 * @access   Private (Broker only)
 */
const loginAsClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  // Generate impersonation token
  const jwt = await import('jsonwebtoken');
  const token = jwt.default.sign(
    {
      id: customer._id,
      role: 'customer',
      mongoBrokerId: brokerId,
      stringBrokerId: brokerIdStr,
      impersonatedBy: brokerId,
      impersonatorRole: 'broker',
      isImpersonation: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  console.log(`[Broker] Broker ${brokerIdStr} logged in as client ${customer.customer_id}`);

  res.status(200).json({
    success: true,
    message: 'Impersonation token generated.',
    token,
    client: {
      id: customer.customer_id,
      name: customer.name,
    },
    expiresIn: '2 hours',
  });
});

/**
 * @desc     Get client credentials (for broker reference)
 * @route    GET /api/broker/clients/:id/credentials
 * @access   Private (Broker only)
 */
const getClientCredentials = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  ).select('+password');

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  res.status(200).json({
    success: true,
    credentials: {
      id: customer.customer_id,
      password: customer.password,
    },
  });
});

/**
 * @desc     Get client holdings
 * @route    GET /api/broker/clients/:id/holdings
 * @access   Private (Broker only)
 */
const getClientHoldings = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const holdings = await HoldingModel.find({ userId: customer._id });

  res.status(200).json({
    success: true,
    holdings,
    count: holdings.length,
  });
});

/**
 * @desc     Get client positions
 * @route    GET /api/broker/clients/:id/positions
 * @access   Private (Broker only)
 */
const getClientPositions = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const positions = await PositionsModel.find({ userId: customer._id });

  res.status(200).json({
    success: true,
    positions,
    count: positions.length,
  });
});

/**
 * @desc     Get client ledger/fund history
 * @route    GET /api/broker/clients/:id/ledger
 * @access   Private (Broker only)
 */
const getClientLedger = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  // Get fund record
  const fund = await FundModel.findOne({
    customer_id_str: id,
    broker_id_str: brokerIdStr
  });

  // Get recent orders for transaction history
  const recentOrders = await OrderModel.find({
    customer_id_str: id,
    broker_id_str: brokerIdStr,
    status: 'CLOSED'
  })
  .sort({ closed_at: -1 })
  .limit(50)
  .select(
    'symbol side quantity price effective_entry_price closed_ltp exit_price effective_exit_price margin_blocked closed_at realized_pnl brokerage'
  );

  res.status(200).json({
    success: true,
    ledger: {
      currentBalance: (fund?.net_available_balance || 0) + (fund?.pnl_balance || 0),
      intraday: fund?.intraday || { available_limit: 0, used_limit: 0 },
      overnight: fund?.overnight || { available_limit: 0 },
      recentTransactions: recentOrders.map(order => ({
        type: order.side,
        symbol: order.symbol,
        quantity: order.quantity,
        price: Number(order.effective_entry_price ?? order.price ?? 0),
        exitPrice: Number(order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? 0),
        brokerage: Number(order.brokerage ?? 0),
        closedAt: order.closed_at,
        pnl: (
          String(order.settlement_status || '').toLowerCase() === 'settled' ||
          !!order.brokerage_breakdown ||
          Number.isFinite(Number(order.effective_exit_price)) ||
          Number.isFinite(Number(order.raw_exit_price))
        ) && Number.isFinite(Number(order.realized_pnl))
          ? Number(order.realized_pnl)
          : (
            String(order.side || '').toUpperCase() === 'BUY'
              ? (
                Number(order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? 0) -
                Number(order.effective_entry_price ?? order.price ?? 0)
              ) * Number(order.quantity || 0)
              : (
                Number(order.effective_entry_price ?? order.price ?? 0) -
                Number(order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? 0)
              ) * Number(order.quantity || 0)
          ) - Number(order.brokerage ?? 0),
      })),
    },
  });
});

/**
 * @desc     Get client pricing settings
 * @route    GET /api/broker/clients/:id/pricing
 * @access   Private (Broker only)
 */
const getClientPricing = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  ).select('_id customer_id');

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const pricingDoc = await ClientPricingModel.findOne({
    broker_id_str: brokerIdStr,
    customer_id_str: customer.customer_id,
  }).lean();

  const pricingConfig = pricingDoc
    ? normalizeClientPricing({
        brokerage: pricingDoc.brokerage,
        spread: pricingDoc.spread,
      })
    : await ensureClientPricingConfig({
        brokerIdStr,
        customerIdStr: customer.customer_id,
        updatedBy: brokerId,
      });
  const pricing = mapPricingConfigToResponse(pricingConfig);

  res.status(200).json({
    success: true,
    customerId: customer.customer_id,
    pricing,
    source: pricingDoc ? 'stored' : 'seeded',
    updatedAt: pricingDoc?.updatedAt || null,
  });
});

/**
 * @desc     Update client pricing settings
 * @route    PUT /api/broker/clients/:id/pricing
 * @access   Private (Broker only)
 */
const updateClientPricing = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(id, brokerId, brokerIdStr)
  ).select('_id customer_id');

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  const existingConfig = await ensureClientPricingConfig({
    brokerIdStr,
    customerIdStr: customer.customer_id,
    updatedBy: brokerId,
  });
  const base = mapPricingConfigToResponse(existingConfig);
  const next = sanitizePricingPayload(req.body || {}, base);
  const stored = mapResponsePricingToStoredConfig(next);

  const saved = await ClientPricingModel.findOneAndUpdate(
    {
      broker_id_str: brokerIdStr,
      customer_id_str: customer.customer_id,
    },
    {
      $set: {
        broker_id_str: brokerIdStr,
        customer_id_str: customer.customer_id,
        brokerage: stored.brokerage,
        spread: stored.spread,
        updated_by: brokerId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    message: 'Client pricing updated successfully.',
    customerId: customer.customer_id,
    pricing: mapPricingConfigToResponse(
      normalizeClientPricing({
        brokerage: saved.brokerage,
        spread: saved.spread,
      })
    ),
    updatedAt: saved.updatedAt,
  });
});

/**
 * @desc     Get deleted clients (recycle bin)
 * @route    GET /api/broker/clients-deleted
 * @access   Private (Broker only)
 */
const getDeletedClients = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;

  const deletedClients = await DeletedCustomerModel.find({
    $or: [
      { attached_broker_id: brokerId },
      { deleted_by: brokerId },
    ],
  })
    .sort({ deleted_at: -1 })
    .select('customer_id name email phone deleted_at expires_at data_summary original_created_at');

  res.status(200).json({
    success: true,
    clients: deletedClients.map(dc => ({
      _id: dc._id,
      customerId: dc.customer_id,
      name: dc.name,
      email: dc.email,
      phone: dc.phone,
      deletedAt: dc.deleted_at,
      expiresAt: dc.expires_at,
      dataSummary: dc.data_summary,
      originalCreatedAt: dc.original_created_at,
    })),
    count: deletedClients.length,
  });
});

/**
 * @desc     Restore deleted client from recycle bin
 * @route    POST /api/broker/clients-deleted/:id/restore
 * @access   Private (Broker only)
 */
const restoreClient = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const archived = await DeletedCustomerModel.findOne({
    _id: id,
    $or: [
      { attached_broker_id: brokerId },
      { deleted_by: brokerId },
    ],
  });

  if (!archived) {
    return res.status(404).json({
      success: false,
      message: 'Deleted client not found.',
    });
  }

  // Check if customer_id is already taken (edge case: ID reused)
  const existing = await CustomerModel.findOne({ customer_id: archived.customer_id });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'A client with this ID already exists. Cannot restore.',
    });
  }

  // Recreate customer record
  const restoredCustomer = await CustomerModel.create({
    customer_id: archived.customer_id,
    password: archived.password || 'changeme123',
    name: archived.name,
    email: archived.email,
    phone: archived.phone,
    role: archived.role || 'customer',
    broker_id: archived.attached_broker_id || brokerId,
    broker_id_str: brokerIdStr,
    status: 'active',
    trading_enabled: false,
  });

  // Recreate fund record
  const archivedFund = archived.archived_fund || {};
  await FundModel.create({
    customer_id: restoredCustomer._id,
    customer_id_str: restoredCustomer.customer_id,
    broker_id_str: brokerIdStr,
    net_available_balance: archivedFund.net_available_balance || 0,
    intraday: archivedFund.intraday || { available_limit: 0, used_limit: 0 },
    overnight: archivedFund.overnight || { available_limit: 0 },
  });

  await ensureClientPricingConfig({
    brokerIdStr,
    customerIdStr: restoredCustomer.customer_id,
    updatedBy: brokerId,
  });

  // Restore orders if any
  const archivedOrders = archived.archived_orders || [];
  if (archivedOrders.length > 0) {
    const ordersToInsert = archivedOrders.map(o => {
      const { _id, __v, ...rest } = o;
      return { ...rest, userId: restoredCustomer._id };
    });
    await OrderModel.insertMany(ordersToInsert, { ordered: false }).catch(() => {});
  }

  // Remove from deleted collection
  await DeletedCustomerModel.deleteOne({ _id: archived._id });

  res.status(200).json({
    success: true,
    message: 'Client restored successfully. Trading is disabled by default.',
    client: {
      id: restoredCustomer.customer_id,
      name: restoredCustomer.name,
    },
  });
});

/**
 * Convert an intraday (MIS) order to HOLD status.
 * Broker-only action with ownership validation.
 * POST /api/broker/clients/:id/orders/:orderId/convert-to-hold
 */
const convertOrderToHold = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id: customerId, orderId } = req.params;

  // 1. Ownership check
  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(customerId, brokerId, brokerIdStr)
  ).select('_id customer_id broker_id_str').lean();

  if (!customer) {
    return res.status(404).json({ success: false, message: 'Client not found or access denied' });
  }

  // 2. Find the order and verify it belongs to this client+broker
  let order = await OrderModel.findOne({ order_id: orderId });
  if (!order) order = await OrderModel.findById(orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  if (order.customer_id_str !== customer.customer_id) {
    return res.status(403).json({ success: false, message: 'Order does not belong to this client' });
  }

  // 3. Validate eligibility: must be MIS and OPEN
  const currentStatus = (order.status || order.order_status || '').toUpperCase();
  const currentProduct = (order.product || '').toUpperCase();

  if (currentProduct !== 'MIS') {
    return res.status(400).json({ success: false, message: 'Only MIS (intraday) orders can be converted to Hold' });
  }

  if (currentStatus !== 'OPEN' && currentStatus !== 'EXECUTED') {
    return res.status(400).json({ success: false, message: `Order must be OPEN or EXECUTED to convert. Current status: ${currentStatus}` });
  }

  // 4. Reserve delivery margin for HOLD conversion
  const fund = await FundModel.findOne({
    broker_id_str: order.broker_id_str,
    customer_id_str: order.customer_id_str,
  });

  if (!fund) {
    return res.status(400).json({ success: false, message: 'Fund account not found for this client' });
  }

  // Calculate required delivery margin (same as original order margin)
  const marginBlocked = Number(order.margin_blocked) || 0;
  const requiredDeliveryMargin = marginBlocked > 0
    ? marginBlocked
    : (Number(order.effective_entry_price || order.price) * Number(order.quantity));

  // Reserve delivery margin (fails if insufficient)
  const reserveResult = reserveDeliveryForHoldConversion(fund, requiredDeliveryMargin, {
    orderId: String(order._id),
  });

  if (!reserveResult.ok) {
    return res.status(400).json({ success: false, message: reserveResult.error });
  }

  // Release intraday margin that was locked for this MIS order
  refundMarginImmediate(fund, 'intraday', marginBlocked, {
    reason: 'MIS→CNC hold conversion',
    orderId: String(order._id),
  });

  // Set new delivery margin on the order
  order.margin_blocked = requiredDeliveryMargin;
  await fund.save();

  // Convert to delivery order: MIS → CNC, status → OPEN
  order.product = 'CNC';
  order.category = 'DELIVERY';
  order.order_category = 'DELIVERY';
  order.status = 'OPEN';
  order.order_status = 'OPEN';
  order.requires_approval = false;
  order.approval_status = 'approved';
  order.approved_by = brokerId;
  order.approved_at = new Date();
  order.updatedAt = new Date();
  order.hold_converted_by = 'broker';
  order.hold_converted_at = new Date();
  order.hold_broker_id = brokerId;

  // Assign validity for the HOLD order (now delivery lifecycle)
  const instrumentExpiry = order.meta?.selectedStock?.expiry || null;
  const validity = resolveOrderValidity({
    product: 'CNC',
    exchange: order.exchange,
    segment: order.segment,
    symbol: order.symbol,
    instrumentExpiry,
    placedAt: new Date(),
  });
  order.validity_mode = validity.mode;
  order.validity_started_at = validity.startsAt;
  order.validity_expires_at = validity.expiresAt;

  await order.save();

  return res.status(200).json({
    success: true,
    message: 'Order converted to Holdings (CNC) successfully',
    order: {
      id: order._id,
      order_id: order.order_id,
      symbol: order.symbol,
      status: order.status,
      deliveryMarginReserved: requiredDeliveryMargin,
    },
  });
});

/**
 * @desc     Extend validity of an equity longterm order
 * @route    POST /api/broker/clients/:id/orders/:orderId/extend-validity
 * @access   Private (Broker only)
 */
const extendOrderValidity = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id: customerId, orderId } = req.params;
  const { reason } = req.body || {};

  // 1. Ownership check
  const customer = await CustomerModel.findOne(
    getCustomerOwnershipQuery(customerId, brokerId, brokerIdStr)
  ).select('_id customer_id broker_id_str').lean();

  if (!customer) {
    return res.status(404).json({ success: false, message: 'Client not found or access denied' });
  }

  // 2. Find the order
  let order = await OrderModel.findOne({ order_id: orderId });
  if (!order) order = await OrderModel.findById(orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  if (order.customer_id_str !== customer.customer_id) {
    return res.status(403).json({ success: false, message: 'Order does not belong to this client' });
  }

  // 3. Check eligibility
  const check = canBrokerExtendValidity(order);
  if (!check.ok) {
    return res.status(400).json({ success: false, message: check.reason });
  }

  // 4. Extend by 7 days
  const result = extendValidityByDays(order, 7, { brokerId, brokerIdStr }, reason || '');

  await order.save();

  console.log(`[Broker] Extended validity for order ${orderId}: ${result.previousExpiry.toISOString()} -> ${result.newExpiry.toISOString()}`);

  return res.status(200).json({
    success: true,
    message: 'Order validity extended by 7 days',
    order: {
      id: order._id,
      order_id: order.order_id,
      symbol: order.symbol,
      status: order.status,
      validity_mode: order.validity_mode,
      validity_expires_at: order.validity_expires_at,
      validity_extended_count: order.validity_extended_count,
      previousExpiry: result.previousExpiry,
      newExpiry: result.newExpiry,
    },
  });
});

export {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  blockClient,
  unblockClient,
  toggleTrading,
  toggleHoldingsExit,
  toggleOrderExitAllowed,
  loginAsClient,
  getClientCredentials,
  getClientHoldings,
  getClientPositions,
  getClientLedger,
  getClientPricing,
  updateClientPricing,
  getDeletedClients,
  restoreClient,
  convertOrderToHold,
  extendOrderValidity,
};
