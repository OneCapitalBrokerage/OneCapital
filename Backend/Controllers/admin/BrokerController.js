// Controllers/admin/BrokerController.js
// Admin Broker Management - CRUD operations for brokers

import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import BankAccountModel from '../../Model/Auth/BankAccountModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import SessionModel from '../../Model/Auth/SessionModel.js';
import DeletedCustomerModel from '../../Model/DeletedCustomerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import FundTransactionModel from '../../Model/FundManagement/FundTransactionModel.js';
import PaymentProofModel from '../../Model/FundManagement/PaymentProofModel.js';
import WithdrawalRequestModel from '../../Model/FundManagement/WithdrawalRequestModel.js';
import CustomerKYCModel from '../../Model/KYC/CustomerKYCModel.js';
import KYCRequestModel from '../../Model/KYC/KYCRequestModel.js';
import RegistrationModel from '../../Model/RegistrationModel.js';
import NotificationModel from '../../Model/System/NotificationModel.js';
import ClientPricingModel from '../../Model/Trading/ClientPricingModel.js';
import HoldingModel from '../../Model/Trading/HoldingModel.js';
import OrderAttemptModel from '../../Model/Trading/OrderAttemptModel.js';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import PositionModel from '../../Model/Trading/PositionsModel.js';
import WatchlistModel from '../../Model/Trading/WatchListModel.js';
import UserWatchlistModel from '../../Model/UserWatchlistModel.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';

// Helper: find broker by broker_id string OR mongo _id
const findBroker = async (id, select = '-password') => {
  let broker = await BrokerModel.findOne({ broker_id: id }).select(select);
  if (!broker) broker = await BrokerModel.findById(id).select(select);
  return broker;
};

// Use canonical broker_id_str for customer counts
const customerCountQuery = (brokerIdStr) => ({ broker_id_str: brokerIdStr });

const buildOrQuery = (clauses = []) => {
  const validClauses = clauses.filter(Boolean);
  if (validClauses.length === 0) return { _id: null };
  if (validClauses.length === 1) return validClauses[0];
  return { $or: validClauses };
};

const uniqueStrings = (values = []) => [...new Set(values.filter(Boolean).map((value) => String(value)))];

const createBrokerAccessToken = (broker) =>
  jwt.sign(
    {
      id: broker._id,
      role: 'broker',
      stringBrokerId: broker.broker_id || broker.login_id || String(broker._id),
      mongoBrokerId: broker._id,
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '30d' }
  );

const createBrokerRefreshToken = (broker) =>
  jwt.sign(
    {
      id: broker._id,
      role: 'broker',
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '60d' }
  );

/**
 * @desc     Get all brokers
 * @route    GET /api/admin/brokers
 * @access   Private (Admin only)
 */
const getAllBrokers = asyncHandler(async (req, res) => {
  const {
    status,
    search,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const query = {};

  if (status && status !== 'all') query.status = status;

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { broker_id: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { reference_code: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [brokers, total] = await Promise.all([
    BrokerModel.find(query).select('-password').sort(sortOptions).skip(skip).limit(parseInt(limit)),
    BrokerModel.countDocuments(query),
  ]);

  const brokersWithStats = await Promise.all(
    brokers.map(async (broker) => {
      const clientCount = await CustomerModel.countDocuments(customerCountQuery(broker.broker_id));
      return {
        id: broker.broker_id,
        _id: broker._id,
        name: broker.name,
        ownerName: broker.owner_name,
        email: broker.email,
        phone: broker.phone,
        status: broker.status || 'active',
        referenceCode: broker.reference_code || null,
        clientCount,
        complianceScore: broker.compliance_score || 100,
        kycVerified: broker.kyc_verified || false,
        createdAt: broker.createdAt,
        lastLogin: broker.last_login,
      };
    })
  );

  res.status(200).json({
    success: true,
    brokers: brokersWithStats,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Get broker details by ID
 * @route    GET /api/admin/brokers/:id
 * @access   Private (Admin only)
 */
const getBrokerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const broker = await findBroker(id);
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  const [clientCount, activeClients, totalAum] = await Promise.all([
    CustomerModel.countDocuments(customerCountQuery(broker.broker_id)),
    CustomerModel.countDocuments({ ...customerCountQuery(broker.broker_id), status: 'active' }),
    FundModel.aggregate([
      { $match: { broker_id_str: broker.broker_id } },
      { $group: { _id: null, total: { $sum: { $add: [{ $ifNull: ['$net_available_balance', 0] }, { $ifNull: ['$pnl_balance', 0] }] } } } }
    ]),
  ]);

  res.status(200).json({
    success: true,
    broker: {
      id: broker.broker_id,
      _id: broker._id,
      name: broker.name,
      ownerName: broker.owner_name,
      email: broker.email,
      phone: broker.phone,
      companyName: broker.company_name,
      registrationNumber: broker.registration_number,
      gstNumber: broker.gst_number,
      supportContact: broker.support_contact,
      supportEmail: broker.support_email,
      upiId: broker.upi_id,
      address: broker.address,
      status: broker.status || 'active',
      referenceCode: broker.reference_code || null,
      complianceScore: broker.compliance_score || 100,
      kycVerified: broker.kyc_verified || false,
      settings: broker.settings,
      stats: {
        totalClients: clientCount,
        activeClients,
        totalAum: totalAum[0]?.total || 0,
      },
      createdAt: broker.createdAt,
      lastLogin: broker.last_login,
    },
  });
});

/**
 * @desc     Create new broker
 * @route    POST /api/admin/brokers
 * @access   Private (Admin only)
 */
const createBroker = asyncHandler(async (req, res) => {
  const { name, password, email, phone, ownerName, companyName, registrationNumber, gstNumber } = req.body;

  if (!name || !password) {
    return res.status(400).json({ success: false, message: 'Name and password are required.' });
  }

  if (email) {
    const existingEmail = await BrokerModel.findOne({ email: email.toLowerCase() });
    if (existingEmail) return res.status(400).json({ success: false, message: 'Email already registered.' });
  }

  let brokerId;
  let exists = true;
  while (exists) {
    brokerId = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    exists = await BrokerModel.findOne({ broker_id: brokerId });
  }

  const newBroker = await BrokerModel.create({
    broker_id: brokerId,
    name,
    password,
    email: email ? email.toLowerCase() : undefined,
    phone,
    owner_name: ownerName || name,
    company_name: companyName,
    registration_number: registrationNumber,
    gst_number: gstNumber,
    role: 'broker',
    status: 'active',
  });

  console.log(`[Admin] ${req.user?._id} created broker ${newBroker.broker_id}`);

  res.status(201).json({
    success: true,
    message: 'Broker created successfully.',
    broker: {
      id: newBroker.broker_id,
      name: newBroker.name,
      email: newBroker.email,
      referenceCode: newBroker.reference_code,
      status: 'active',
      createdAt: newBroker.createdAt,
    },
  });
});

/**
 * @desc     Update broker details
 * @route    PUT /api/admin/brokers/:id
 * @access   Private (Admin only)
 */
const updateBroker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const broker = await findBroker(id, undefined);
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  const allowedFields = [
    'name', 'email', 'phone', 'owner_name', 'company_name',
    'registration_number', 'gst_number', 'support_contact',
    'support_email', 'upi_id', 'address', 'compliance_score',
    'kyc_verified', 'settings'
  ];

  // Email uniqueness guard (only when a new email is being provided)
  if (updateData.email !== undefined) {
    const newEmail = updateData.email ? updateData.email.toLowerCase() : undefined;
    if (newEmail) {
      const collision = await BrokerModel.findOne({ email: newEmail, _id: { $ne: broker._id } });
      if (collision) return res.status(400).json({ success: false, message: 'Email already in use by another broker.' });
    }
    updateData.email = newEmail;
  }

  allowedFields.forEach(field => {
    if (updateData[field] !== undefined) broker[field] = updateData[field];
  });

  if (updateData.ownerName) broker.owner_name = updateData.ownerName;
  if (updateData.companyName) broker.company_name = updateData.companyName;
  if (updateData.registrationNumber) broker.registration_number = updateData.registrationNumber;
  if (updateData.gstNumber) broker.gst_number = updateData.gstNumber;
  if (updateData.supportContact) broker.support_contact = updateData.supportContact;
  if (updateData.supportEmail) broker.support_email = updateData.supportEmail;
  if (updateData.upiId) broker.upi_id = updateData.upiId;
  if (updateData.complianceScore !== undefined) broker.compliance_score = updateData.complianceScore;
  if (updateData.kycVerified !== undefined) broker.kyc_verified = updateData.kycVerified;
  if (updateData.password) broker.password = updateData.password;

  await broker.save();

  res.status(200).json({
    success: true,
    message: 'Broker updated successfully.',
    broker: { id: broker.broker_id, name: broker.name, email: broker.email, status: broker.status },
  });
});

/**
 * @desc     Update broker reference code
 * @route    PUT /api/admin/brokers/:id/reference-code
 * @access   Private (Admin only)
 */
const updateReferenceCode = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { referenceCode } = req.body;

  if (!referenceCode) {
    return res.status(400).json({ success: false, message: 'referenceCode is required.' });
  }

  // Validate: uppercase, A-Z0-9 only, 4-12 chars
  const normalized = referenceCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
    return res.status(400).json({
      success: false,
      message: 'Reference code must be 4–12 characters, letters and digits only (A-Z, 0-9).',
    });
  }

  const broker = await findBroker(id, undefined);
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  // Uniqueness check excluding current broker
  const collision = await BrokerModel.findOne({ reference_code: normalized, _id: { $ne: broker._id } });
  if (collision) {
    return res.status(409).json({ success: false, message: `Reference code "${normalized}" is already in use by another broker.` });
  }

  broker.reference_code = normalized;
  await broker.save();

  console.log(`[Admin] ${req.user?._id} updated reference_code for broker ${broker.broker_id} → ${normalized}`);

  res.status(200).json({
    success: true,
    message: 'Reference code updated.',
    referenceCode: broker.reference_code,
  });
});

/**
 * @desc     Delete broker
 * @route    DELETE /api/admin/brokers/:id
 * @access   Private (Admin only)
 */
const deleteBroker = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const broker = await findBroker(id, undefined);
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  const brokerMongoId = broker._id;
  const brokerIdStr = broker.broker_id;

  const customers = await CustomerModel.find(
    buildOrQuery([
      { broker_id: brokerMongoId },
      customerCountQuery(brokerIdStr),
    ]),
    '_id customer_id'
  ).lean();

  const customerMongoIds = customers.map((customer) => customer._id).filter(Boolean);
  const customerIdStrs = uniqueStrings(customers.map((customer) => customer.customer_id));

  const customerRefClauses = [
    customerMongoIds.length ? { customer_id: { $in: customerMongoIds } } : null,
    customerIdStrs.length ? { customer_id_str: { $in: customerIdStrs } } : null,
  ].filter(Boolean);

  const customerWatchlistLegacyClauses = customerMongoIds.length
    ? [{ userId: { $in: customerMongoIds } }]
    : [];

  const customerUserClauses = [
    customerMongoIds.length ? { user_id: { $in: customerMongoIds } } : null,
    customerIdStrs.length ? { user_id_str: { $in: customerIdStrs } } : null,
  ].filter(Boolean);

  const deletionTasks = [
    {
      key: 'funds',
      model: FundModel,
      query: buildOrQuery([
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
      ]),
    },
    {
      key: 'fundTransactions',
      model: FundTransactionModel,
      query: buildOrQuery([
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
      ]),
    },
    {
      key: 'paymentProofs',
      model: PaymentProofModel,
      query: buildOrQuery([
        { broker_id: brokerMongoId },
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
      ]),
    },
    {
      key: 'withdrawalRequests',
      model: WithdrawalRequestModel,
      query: buildOrQuery([
        { broker_id: brokerMongoId },
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
      ]),
    },
    {
      key: 'orders',
      model: OrderModel,
      query: buildOrQuery([
        { broker_id: brokerMongoId },
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
      ]),
    },
    {
      key: 'orderAttempts',
      model: OrderAttemptModel,
      query: buildOrQuery([
        { broker_id: brokerMongoId },
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
      ]),
    },
    {
      key: 'holdings',
      model: HoldingModel,
      query: buildOrQuery([
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
        ...customerWatchlistLegacyClauses,
      ]),
    },
    {
      key: 'positions',
      model: PositionModel,
      query: buildOrQuery([
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
        ...customerWatchlistLegacyClauses,
      ]),
    },
    {
      key: 'clientPricing',
      model: ClientPricingModel,
      query: buildOrQuery([
        { broker_id_str: brokerIdStr },
        customerIdStrs.length ? { customer_id_str: { $in: customerIdStrs } } : null,
      ]),
    },
    {
      key: 'userWatchlists',
      model: UserWatchlistModel,
      query: buildOrQuery([
        { broker_id_str: brokerIdStr },
        customerIdStrs.length ? { customer_id_str: { $in: customerIdStrs } } : null,
        ...customerWatchlistLegacyClauses,
      ]),
    },
    {
      key: 'watchlists',
      model: WatchlistModel,
      query: buildOrQuery(customerRefClauses),
    },
    {
      key: 'bankAccounts',
      model: BankAccountModel,
      query: buildOrQuery(customerRefClauses),
    },
    {
      key: 'customerKycs',
      model: CustomerKYCModel,
      query: buildOrQuery(customerRefClauses),
    },
    {
      key: 'kycRequests',
      model: KYCRequestModel,
      query: buildOrQuery([
        { broker_id: brokerMongoId },
        { broker_id_str: brokerIdStr },
        ...customerRefClauses,
        customerMongoIds.length ? { linkedCustomerId: { $in: customerMongoIds } } : null,
      ]),
    },
    {
      key: 'registrations',
      model: RegistrationModel,
      query: buildOrQuery([
        { brokerId: brokerMongoId },
        { broker_id_str: brokerIdStr },
      ]),
    },
    {
      key: 'deletedCustomers',
      model: DeletedCustomerModel,
      query: buildOrQuery([
        { attached_broker_id: brokerMongoId },
        { deleted_by: brokerMongoId },
        customerIdStrs.length ? { customer_id: { $in: customerIdStrs } } : null,
      ]),
    },
    {
      key: 'notifications',
      model: NotificationModel,
      query: buildOrQuery([
        { user_type: 'Broker', user_id: brokerMongoId },
        { user_type: 'Broker', user_id_str: brokerIdStr },
        ...customerUserClauses.map((clause) => ({ user_type: 'Customer', ...clause })),
      ]),
    },
    {
      key: 'sessions',
      model: SessionModel,
      query: buildOrQuery([
        { user_type: 'Broker', user_id: brokerMongoId },
        { user_type: 'Broker', user_id_str: brokerIdStr },
        ...customerUserClauses.map((clause) => ({ user_type: 'Customer', ...clause })),
      ]),
    },
  ];

  const deletionResults = await Promise.all(
    deletionTasks.map((task) => task.model.deleteMany(task.query))
  );

  const deleted = deletionTasks.reduce((summary, task, index) => ({
    ...summary,
    [task.key]: deletionResults[index]?.deletedCount || 0,
  }), {});

  const [customersDeleteResult, brokerDeleteResult] = await Promise.all([
    CustomerModel.deleteMany(buildOrQuery([
      { broker_id: brokerMongoId },
      customerCountQuery(brokerIdStr),
    ])),
    BrokerModel.deleteOne({ _id: brokerMongoId }),
  ]);

  deleted.customers = customersDeleteResult?.deletedCount || 0;
  deleted.broker = brokerDeleteResult?.deletedCount || 0;

  if (!deleted.broker) {
    return res.status(404).json({ success: false, message: 'Broker not found or already deleted.' });
  }

  console.log(
    `[Admin] ${req.user?._id} permanently deleted broker ${brokerIdStr} with cascade data`,
    deleted
  );

  res.status(200).json({
    success: true,
    message: 'Broker and all associated customer data deleted permanently.',
    deleted,
  });
});

/**
 * @desc     Block broker
 * @route    POST /api/admin/brokers/:id/block
 * @access   Private (Admin only)
 */
const blockBroker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const broker = await findBroker(id, undefined);
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  broker.status = 'blocked';
  broker.block_reason = reason || 'Blocked by admin';
  broker.blocked_at = new Date();
  await broker.save();

  // Also block all their customers (canonical field)
  await CustomerModel.updateMany(
    customerCountQuery(broker.broker_id),
    { $set: { status: 'blocked', block_reason: 'Broker blocked' } }
  );

  console.log(`[Admin] ${req.user?._id} blocked broker ${broker.broker_id}`);

  res.status(200).json({
    success: true,
    message: 'Broker blocked. All associated customers have also been blocked.',
  });
});

/**
 * @desc     Unblock broker
 * @route    POST /api/admin/brokers/:id/unblock
 * @access   Private (Admin only)
 */
const unblockBroker = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const broker = await findBroker(id, undefined);
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  broker.status = 'active';
  broker.block_reason = undefined;
  broker.blocked_at = undefined;
  await broker.save();

  // Unblock customers that were blocked due to broker block
  await CustomerModel.updateMany(
    { ...customerCountQuery(broker.broker_id), block_reason: 'Broker blocked' },
    { $set: { status: 'active' }, $unset: { block_reason: 1 } }
  );

  console.log(`[Admin] ${req.user?._id} unblocked broker ${broker.broker_id}`);

  res.status(200).json({ success: true, message: 'Broker unblocked successfully.' });
});

/**
 * @desc     Get broker compliance score
 * @route    GET /api/admin/brokers/:id/compliance
 * @access   Private (Admin only)
 */
const getBrokerCompliance = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const broker = await findBroker(id);
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  const cq = customerCountQuery(broker.broker_id);

  const [totalClients, verifiedClients, pendingKyc] = await Promise.all([
    CustomerModel.countDocuments(cq),
    CustomerModel.countDocuments({ ...cq, kyc_status: 'verified' }),
    CustomerModel.countDocuments({ ...cq, kyc_status: 'pending' }),
  ]);

  const kycCompletionRate = totalClients > 0 ? Math.round((verifiedClients / totalClients) * 100) : 100;

  res.status(200).json({
    success: true,
    data: {
      brokerId: broker.broker_id,
      brokerName: broker.name,
      overallScore: broker.compliance_score || 100,
      metrics: { kycVerified: broker.kyc_verified || false, kycCompletionRate, totalClients, verifiedClients, pendingKyc },
      lastUpdated: new Date(),
    },
  });
});

/**
 * @desc     Get broker credentials (admin view)
 * @route    GET /api/admin/brokers/:id/credentials
 * @access   Private (Admin only)
 */
const getBrokerCredentials = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const broker = await findBroker(id, '+password');
  if (!broker) return res.status(404).json({ success: false, message: 'Broker not found.' });

  console.log(`[Admin] ${req.user?._id} viewed credentials for broker ${broker.broker_id}`);

  res.status(200).json({
    success: true,
    credentials: {
      brokerId: broker.broker_id,
      email: broker.email || null,
      phone: broker.phone || null,
      password: broker.password,
    },
  });
});

/**
 * @desc     Login as broker (direct broker session)
 * @route    POST /api/admin/brokers/:id/login-as
 * @access   Private (Admin only)
 */
const loginAsBroker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?._id;
  const adminIdStr = req.user?.admin_id || String(adminId || '');

  const broker = await findBroker(id, undefined);
  if (!broker) {
    return res.status(404).json({ success: false, message: 'Broker not found.' });
  }

  const brokerStatus = String(broker.status || 'active').toLowerCase();
  if (['blocked', 'suspended', 'inactive'].includes(brokerStatus)) {
    return res.status(403).json({
      success: false,
      message: 'Selected broker account is not eligible for login.',
    });
  }

  const accessToken = createBrokerAccessToken(broker);
  const refreshToken = createBrokerRefreshToken(broker);
  const brokerIdStr = broker.broker_id || broker.login_id || String(broker._id);

  await writeAuditSuccess({
    req,
    type: 'security',
    severity: 'info',
    eventType: 'ADMIN_BROKER_DIRECT_LOGIN',
    category: 'authentication',
    message: `Admin ${adminIdStr} switched into broker ${brokerIdStr} session.`,
    metadata: {
      switchMode: 'direct_broker_session',
      switchedSession: true,
    },
    target: {
      type: 'broker',
      id: broker._id,
      id_str: brokerIdStr,
    },
    broker: {
      broker_id: broker._id,
      broker_id_str: brokerIdStr,
    },
  });

  console.log(`[Admin] ${adminIdStr} switched into broker ${brokerIdStr} session`);

  return res.status(200).json({
    success: true,
    message: 'Broker session generated successfully.',
    token: accessToken,
    accessToken,
    refreshToken,
    broker: {
      id: brokerIdStr,
      broker_id: brokerIdStr,
      name: broker.name,
      email: broker.email || null,
      phone: broker.phone || null,
      status: broker.status || 'active',
      ownerName: broker.owner_name || broker.name,
      companyName: broker.company_name || null,
    },
    expiresIn: '30 days',
  });
});

export {
  getAllBrokers,
  getBrokerById,
  createBroker,
  updateBroker,
  updateReferenceCode,
  deleteBroker,
  blockBroker,
  unblockBroker,
  getBrokerCompliance,
  getBrokerCredentials,
  loginAsBroker,
};
