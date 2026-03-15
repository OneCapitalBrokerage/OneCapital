// Controllers/admin/CustomerController.js
// Admin Customer Management - View and manage all customers

import asyncHandler from 'express-async-handler';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import FundTransactionModel from '../../Model/FundManagement/FundTransactionModel.js';
import OrderModel from '../../Model/Trading/OrdersModel.js';

// Helper: find customer by customer_id string OR mongo _id
const findCustomer = async (id, select = '-password') => {
  let customer = await CustomerModel.findOne({ customer_id: id }).select(select);
  if (!customer) customer = await CustomerModel.findById(id).select(select);
  return customer;
};

const resolveCustomerBrokerContext = async (customer) => {
  if (!customer) {
    return {
      mongoBrokerId: null,
      stringBrokerId: null,
    };
  }

  const canonicalBrokerIdStr = customer.broker_id_str || null;
  let brokerDoc = null;

  if (customer.broker_id) {
    brokerDoc = await BrokerModel.findById(customer.broker_id).select('broker_id');
  }

  if (!brokerDoc && canonicalBrokerIdStr) {
    brokerDoc = await BrokerModel.findOne({ broker_id: canonicalBrokerIdStr }).select('_id broker_id');
  }

  return {
    mongoBrokerId: brokerDoc?._id || customer.broker_id || null,
    stringBrokerId: brokerDoc?.broker_id || canonicalBrokerIdStr || null,
  };
};

/**
 * @desc     Get all customers
 * @route    GET /api/admin/customers
 * @access   Private (Admin only)
 */
const getAllCustomers = asyncHandler(async (req, res) => {
  const {
    status,
    brokerId,
    kycStatus,
    search,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const query = {};
  const andFilters = [];

  if (status && status !== 'all') {
    query.status = status;
  }

  if (kycStatus && kycStatus !== 'all') {
    query.kyc_status = kycStatus;
  }

  if (brokerId) {
    // Support filtering by broker_id string (canonical field)
    const broker = await BrokerModel.findOne({ broker_id: brokerId });
    if (broker) {
      andFilters.push({
        $or: [
          { broker_id: broker._id },
          { broker_id_str: brokerId },
        ],
      });
    } else {
      // Invalid broker filter should return empty result set, not all customers.
      andFilters.push({ _id: null });
    }
  }

  if (search) {
    andFilters.push({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { customer_id: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ],
    });
  }

  if (andFilters.length > 0) {
    query.$and = andFilters;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [customers, total] = await Promise.all([
    CustomerModel.find(query)
      .select('-password')
      .populate('broker_id', 'broker_id name')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit)),
    CustomerModel.countDocuments(query),
  ]);

  const customersFormatted = customers.map(customer => {
    // Support both canonical broker_id and legacy attached_broker_id populated docs
    const brokerDoc = customer.broker_id?._id ? customer.broker_id : null;
    return {
      id: customer.customer_id,
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      status: customer.status || 'active',
      kycStatus: customer.kyc_status || 'pending',
      tradingEnabled: customer.trading_enabled || false,
      holdingsExitAllowed: customer.holdings_exit_allowed || false,
      broker: brokerDoc ? {
        id: brokerDoc.broker_id,
        name: brokerDoc.name,
      } : (customer.broker_id_str ? { id: customer.broker_id_str, name: customer.broker_id_str } : null),
      createdAt: customer.createdAt,
      lastLogin: customer.last_login,
    };
  });

  res.status(200).json({
    success: true,
    customers: customersFormatted,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Get customer details by ID
 * @route    GET /api/admin/customers/:id
 * @access   Private (Admin only)
 */
const getCustomerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let customer = await CustomerModel.findOne({ customer_id: id })
    .select('-password')
    .populate('broker_id', 'broker_id name email phone');

  if (!customer) {
    customer = await CustomerModel.findById(id)
      .select('-password')
      .populate('broker_id', 'broker_id name email phone');
  }

  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found.' });
  }

  const fund = await FundModel.findOne({ customer_id_str: customer.customer_id });

  const [totalOrders, openOrders] = await Promise.all([
    OrderModel.countDocuments({ customer_id_str: customer.customer_id }),
    OrderModel.countDocuments({ customer_id_str: customer.customer_id, status: { $in: ['OPEN', 'EXECUTED'] } }),
  ]);

  const brokerDoc = customer.broker_id?._id ? customer.broker_id : null;

  res.status(200).json({
    success: true,
    customer: {
      id: customer.customer_id,
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      dateOfBirth: customer.date_of_birth,
      gender: customer.gender,
      panNumber: customer.pan_number,
      address: customer.address,
      status: customer.status || 'active',
      kycStatus: customer.kyc_status || 'pending',
      tradingEnabled: customer.trading_enabled || false,
      holdingsExitAllowed: customer.holdings_exit_allowed || false,
      segmentsAllowed: customer.segments_allowed || [],
      settings: customer.settings,
      // Admin warning state
      warning: {
        active: customer.admin_warning_active || false,
        message: customer.admin_warning_message || '',
        createdAt: customer.admin_warning_created_at,
        updatedAt: customer.admin_warning_updated_at,
      },
      broker: brokerDoc ? {
        id: brokerDoc.broker_id,
        name: brokerDoc.name,
        email: brokerDoc.email,
        phone: brokerDoc.phone,
      } : (customer.broker_id_str ? { id: customer.broker_id_str, name: customer.broker_id_str } : null),
      funds: fund ? {
        balance: (fund.net_available_balance || 0) + (fund.pnl_balance || 0),
        intradayLimit: fund.intraday?.available_limit || 0,
        intradayUsed: fund.intraday?.used_limit || 0,
        overnightLimit: fund.overnight?.available_limit || 0,
      } : null,
      stats: { totalOrders, openOrders },
      createdAt: customer.createdAt,
      lastLogin: customer.last_login,
      lastActive: customer.last_active,
    },
  });
});

/**
 * @desc     Update customer details
 * @route    PUT /api/admin/customers/:id
 * @access   Private (Admin only)
 */
const updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const customer = await findCustomer(id, undefined);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  const allowedFields = [
    'name', 'email', 'phone', 'date_of_birth', 'gender',
    'pan_number', 'address', 'status', 'kyc_status',
    'trading_enabled', 'segments_allowed', 'settings'
  ];

  allowedFields.forEach(field => {
    if (updateData[field] !== undefined) customer[field] = updateData[field];
  });

  if (updateData.dateOfBirth) customer.date_of_birth = updateData.dateOfBirth;
  if (updateData.panNumber) customer.pan_number = updateData.panNumber;
  if (updateData.kycStatus) customer.kyc_status = updateData.kycStatus;
  if (updateData.tradingEnabled !== undefined) customer.trading_enabled = updateData.tradingEnabled;
  if (updateData.holdingsExitAllowed !== undefined) customer.holdings_exit_allowed = updateData.holdingsExitAllowed;
  if (updateData.segmentsAllowed) customer.segments_allowed = updateData.segmentsAllowed;
  if (updateData.password) customer.password = updateData.password;

  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Customer updated successfully.',
    customer: { id: customer.customer_id, name: customer.name, status: customer.status },
  });
});

/**
 * @desc     Block customer
 * @route    POST /api/admin/customers/:id/block
 * @access   Private (Admin only)
 */
const blockCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const customer = await findCustomer(id, undefined);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  customer.status = 'blocked';
  customer.block_reason = reason || 'Blocked by admin';
  customer.blocked_at = new Date();
  customer.blocked_by = req.user._id; // Admin ID — distinguishes admin blocks from broker blocks
  customer.trading_enabled = false;
  await customer.save();

  console.log(`[Admin] ${req.user?._id} blocked customer ${customer.customer_id} — reason: ${customer.block_reason}`);

  res.status(200).json({ success: true, message: 'Customer blocked successfully.' });
});

/**
 * @desc     Unblock customer
 * @route    POST /api/admin/customers/:id/unblock
 * @access   Private (Admin only)
 */
const unblockCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const customer = await findCustomer(id, undefined);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  customer.status = 'active';
  customer.block_reason = undefined;
  customer.blocked_at = undefined;
  customer.blocked_by = undefined; // Clear admin block reference
  await customer.save();

  console.log(`[Admin] ${req.user?._id} unblocked customer ${customer.customer_id}`);

  res.status(200).json({ success: true, message: 'Customer unblocked successfully.' });
});

/**
 * @desc     Enable trading for customer
 * @route    POST /api/admin/customers/:id/trading/enable
 * @access   Private (Admin only)
 */
const enableTrading = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { segments } = req.body;

  const customer = await findCustomer(id, undefined);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  if (customer.status === 'blocked') {
    return res.status(400).json({ success: false, message: 'Cannot enable trading for blocked customer.' });
  }

  customer.trading_enabled = true;
  if (segments && Array.isArray(segments)) customer.segments_allowed = segments;
  await customer.save();

  res.status(200).json({ success: true, message: 'Trading enabled for customer.', segments: customer.segments_allowed });
});

/**
 * @desc     Disable trading for customer
 * @route    POST /api/admin/customers/:id/trading/disable
 * @access   Private (Admin only)
 */
const disableTrading = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const customer = await findCustomer(id, undefined);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  customer.trading_enabled = false;
  customer.trading_disabled_reason = reason;
  await customer.save();

  res.status(200).json({ success: true, message: 'Trading disabled for customer.' });
});

/**
 * @desc     Toggle holdings exit permission
 * @route    PUT /api/admin/customers/:id/holdings-exit
 * @access   Private (Admin only)
 */
const toggleHoldingsExit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { allowed } = req.body;

  if (typeof allowed !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Field "allowed" (boolean) is required.' });
  }

  const customer = await findCustomer(id, undefined);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  customer.holdings_exit_allowed = allowed;
  await customer.save();

  console.log(`[Admin] ${req.user?._id} set holdings_exit_allowed=${allowed} for customer ${customer.customer_id}`);

  res.status(200).json({
    success: true,
    message: allowed ? 'Holdings exit unlocked.' : 'Holdings exit locked.',
    holdingsExitAllowed: customer.holdings_exit_allowed,
  });
});

/**
 * @desc     Get customer credentials (admin view)
 * @route    GET /api/admin/customers/:id/credentials
 * @access   Private (Admin only)
 */
const getCustomerCredentials = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const customer = await findCustomer(id, '+password');
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  console.log(`[Admin] ${req.user?._id} viewed credentials for customer ${customer.customer_id}`);

  res.status(200).json({
    success: true,
    credentials: {
      customerId: customer.customer_id,
      email: customer.email,
      phone: customer.phone,
      password: customer.password,
    },
  });
});

/**
 * @desc     Login as customer (impersonation)
 * @route    POST /api/admin/customers/:id/login-as
 * @access   Private (Admin only)
 */
const loginAsCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  const customer = await findCustomer(id, undefined);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  // Use canonical broker linkage used by active customer schema.
  const { stringBrokerId } = await resolveCustomerBrokerContext(customer);

  const jwt = await import('jsonwebtoken');
  const token = jwt.default.sign(
    {
      id: customer._id,
      role: 'customer',
      customer_id: customer.customer_id,
      mongoBrokerId,
      stringBrokerId,
      impersonatedBy: adminId,
      impersonatorRole: 'admin',
      isImpersonation: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  console.log(`[Admin] ${adminId} impersonating customer ${customer.customer_id}`);

  res.status(200).json({
    success: true,
    message: 'Impersonation token generated.',
    token,
    customer: { id: customer.customer_id, name: customer.name },
    expiresIn: '2 hours',
    warning: 'This session is logged for audit purposes.',
  });
});

/**
 * @desc     Set admin warning for customer
 * @route    POST /api/admin/customers/:id/warning
 * @access   Private (Admin only)
 */
const setWarning = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const adminId = req.user._id;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Warning message is required.',
    });
  }

  const customer = await findCustomer(id, undefined);
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found.' });
  }

  const isNew = !customer.admin_warning_active;

  customer.admin_warning_active = true;
  customer.admin_warning_message = message.trim();
  customer.admin_warning_updated_at = new Date();
  if (isNew) {
    customer.admin_warning_created_at = new Date();
  }
  customer.admin_warning_created_by = adminId;
  await customer.save();

  console.log(`[Admin] ${adminId} set warning for customer ${customer.customer_id}: "${message.trim().substring(0, 50)}..."`);

  res.status(200).json({
    success: true,
    message: 'Warning set successfully.',
    warning: {
      active: true,
      message: customer.admin_warning_message,
      createdAt: customer.admin_warning_created_at,
      updatedAt: customer.admin_warning_updated_at,
    },
  });
});

/**
 * @desc     Clear admin warning for customer
 * @route    DELETE /api/admin/customers/:id/warning
 * @access   Private (Admin only)
 */
const clearWarning = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  const customer = await findCustomer(id, undefined);
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found.' });
  }

  if (!customer.admin_warning_active) {
    return res.status(400).json({
      success: false,
      message: 'No active warning to clear.',
    });
  }

  customer.admin_warning_active = false;
  customer.admin_warning_message = '';
  customer.admin_warning_updated_at = new Date();
  await customer.save();

  console.log(`[Admin] ${adminId} cleared warning for customer ${customer.customer_id}`);

  res.status(200).json({
    success: true,
    message: 'Warning cleared successfully.',
  });
});

/**
 * @desc     Clear customer statement (embedded fund ledger + legacy fund transactions)
 * @route    DELETE /api/admin/customers/:id/statement
 * @access   Private (Admin only)
 */
const clearStatement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  const customer = await findCustomer(id, undefined);
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found.' });
  }

  const { mongoBrokerId, stringBrokerId } = await resolveCustomerBrokerContext(customer);
  const customerIdStr = customer.customer_id;

  const fundQuery = { customer_id_str: customerIdStr };
  if (stringBrokerId) {
    fundQuery.broker_id_str = stringBrokerId;
  }

  const fund = await FundModel.findOne(fundQuery).select('_id transactions');
  const embeddedTransactionCount = Array.isArray(fund?.transactions)
    ? fund.transactions.length
    : 0;

  if (fund) {
    fund.transactions = [];
    await fund.save();
  }

  const legacyDeleteQuery = { customer_id_str: customerIdStr };
  if (stringBrokerId) {
    legacyDeleteQuery.broker_id_str = stringBrokerId;
  }

  const deleteResult = await FundTransactionModel.deleteMany(legacyDeleteQuery);
  const legacyDeletedCount = Number(deleteResult.deletedCount || 0);
  const totalCleared = embeddedTransactionCount + legacyDeletedCount;

  console.log(
    `[Admin] ${adminId} cleared statement for customer ${customerIdStr} — cleared embedded=${embeddedTransactionCount}, legacy=${legacyDeletedCount}`
  );

  res.status(200).json({
    success: true,
    message: `Statement cleared successfully. Cleared ${totalCleared} entries.`,
    clearedCount: totalCleared,
    embeddedClearedCount: embeddedTransactionCount,
    legacyDeletedCount,
    fundFound: Boolean(fund),
  });
});

export {
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  blockCustomer,
  unblockCustomer,
  enableTrading,
  disableTrading,
  toggleHoldingsExit,
  getCustomerCredentials,
  loginAsCustomer,
  setWarning,
  clearWarning,
  clearStatement,
};
