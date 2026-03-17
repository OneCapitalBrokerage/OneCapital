// Controllers/broker/RegistrationController.js
// Broker panel — view, approve, and reject customer registration applications

import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import RegistrationModel from '../../Model/RegistrationModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import BankAccountModel from '../../Model/Auth/BankAccountModel.js';
import CustomerKYC from '../../Model/KYC/CustomerKYCModel.js';

const generateCustomerId = async (session = null) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const findQuery = CustomerModel.findOne({ customer_id: id }).select('_id');
    if (session) findQuery.session(session);
    const exists = await findQuery.lean();
    if (!exists) return id;
  }
  throw new Error('Failed to generate unique customer ID');
};

const generatePlainPassword = (length = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const maskAccountNumber = (value) => {
  const raw = String(value || '').replace(/\s+/g, '');
  if (raw.length <= 4) return raw;
  return `****${raw.slice(-4)}`;
};

const maskAadhaar = (value) => {
  const raw = String(value || '').replace(/\s+/g, '');
  if (!raw) return undefined;
  if (raw.length >= 4) return `********${raw.slice(-4)}`;
  return raw;
};

const docDate = (doc, fallback = new Date()) => (
  doc?.uploadedAt || doc?.uploaded_at || fallback
);

const withCode = (message, code, meta = {}) => {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, meta);
  return error;
};

const handleApprovalErrorResponse = (res, error) => {
  if (error?.code === 'REGISTRATION_NOT_FOUND') {
    res.status(404).json({ success: false, message: 'Registration not found.' });
    return true;
  }
  if (error?.code === 'INVALID_STATUS') {
    res.status(400).json({ success: false, message: `Cannot approve a registration with status: ${error.status}` });
    return true;
  }
  if (error?.code === 'MISSING_DOCUMENTS') {
    res.status(400).json({ success: false, message: 'Registration is missing required documents (PAN, Aadhaar front/back, bank proof).' });
    return true;
  }
  if (error?.code === 'DUPLICATE_CUSTOMER') {
    res.status(400).json({ success: false, message: 'A customer account with this email or phone already exists.' });
    return true;
  }
  return false;
};

/**
 * @desc    List registration applications for this broker
 * @route   GET /api/broker/registrations
 * @access  Private (Broker only)
 */
const getRegistrations = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { status, page = 1, limit = 20 } = req.query;

  const query = { broker_id_str: brokerIdStr };
  if (status && status !== 'all') query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [registrations, total] = await Promise.all([
    RegistrationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password -documents.aadhaarFront -documents.aadhaarBack -documents.panCard -documents.passportPhoto -documents.signature -documents.bankProof -documents.incomeProof')
      .lean(),
    RegistrationModel.countDocuments(query),
  ]);

  const list = registrations.map((r) => ({
    id: r._id,
    name: r.name || `${r.firstName || ''} ${r.lastName || ''}`.trim(),
    email: r.email || '',
    phone: r.phone || r.mobileNumber || '',
    panNumber: r.panNumber ? r.panNumber.slice(0, 5) + '***' + r.panNumber.slice(-1) : null,
    status: r.status,
    segments_requested: r.segments_requested || [],
    submittedAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    rejectionReason: r.rejectionReason,
  }));

  res.status(200).json({
    success: true,
    registrations: list,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc    Get full registration details including document URLs
 * @route   GET /api/broker/registrations/:id
 * @access  Private (Broker only)
 */
const getRegistrationDetail = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const registration = await RegistrationModel.findOne({
    _id: id,
    broker_id_str: brokerIdStr,
  }).select('-password').lean();

  if (!registration) {
    return res.status(404).json({ success: false, message: 'Registration not found.' });
  }

  res.status(200).json({
    success: true,
    registration: {
      id: registration._id,
      name: registration.name || `${registration.firstName || ''} ${registration.lastName || ''}`.trim(),
      email: registration.email,
      phone: registration.phone || registration.mobileNumber,
      dateOfBirth: registration.dateOfBirth,
      gender: registration.gender,
      panNumber: registration.panNumber,
      aadharNumber: registration.aadharNumber,
      occupation: registration.occupation,
      annual_income: registration.annual_income,
      address: registration.address,
      nominee: registration.nominee,
      bank_details: registration.bank_details,
      segments_requested: registration.segments_requested,
      documents: registration.documents,
      status: registration.status,
      rejectionReason: registration.rejectionReason,
      submittedAt: registration.createdAt,
      reviewedAt: registration.reviewedAt,
    },
  });
});

/**
 * @desc    Approve a registration — creates CustomerModel + FundModel, returns customer_id
 * @route   POST /api/broker/registrations/:id/approve
 * @access  Private (Broker only)
 */
const approveRegistration = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const registration = await RegistrationModel.findOne({
    _id: id,
    broker_id_str: brokerIdStr,
  });

  if (!registration) {
    return res.status(404).json({ success: false, message: 'Registration not found.' });
  }

  if (registration.status === 'approved') {
    return res.status(400).json({ success: false, message: 'Registration is already approved.' });
  }

  if (!['pending', 'under_review'].includes(registration.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot approve a registration with status: ${registration.status}`,
    });
  }

  const createFromRegistration = async (session = null) => {
    const findOptions = session ? { session } : {};
    const reg = await RegistrationModel.findOne({
      _id: id,
      broker_id_str: brokerIdStr,
    }, null, findOptions);

    if (!reg) {
      throw withCode('Registration not found.', 'REGISTRATION_NOT_FOUND');
    }
    if (!['pending', 'under_review'].includes(reg.status)) {
      throw withCode('Invalid registration status.', 'INVALID_STATUS', { status: reg.status });
    }

    const docs = reg.documents || {};
    if (!docs.panCard?.url || !docs.aadhaarFront?.url || !docs.aadhaarBack?.url || !docs.bankProof?.url) {
      throw withCode('Missing required documents.', 'MISSING_DOCUMENTS');
    }

    const contactPhone = reg.phone || reg.mobileNumber;
    const duplicateFilters = [];
    if (reg.email) duplicateFilters.push({ email: reg.email });
    if (contactPhone) duplicateFilters.push({ phone: contactPhone });
    if (duplicateFilters.length > 0) {
      const existing = await CustomerModel.findOne({ $or: duplicateFilters }, '_id', findOptions).lean();
      if (existing) {
        throw withCode('Duplicate customer.', 'DUPLICATE_CUSTOMER');
      }
    }

    const customerId = await generateCustomerId(session);
    const submittedPassword = String(reg.password || '').trim();
    const loginPassword = submittedPassword || generatePlainPassword();
    const now = new Date();

    const customerPayload = {
      customer_id: customerId,
      name: reg.name || `${reg.firstName || ''} ${reg.lastName || ''}`.trim(),
      password: loginPassword,
      email: reg.email,
      phone: contactPhone,
      date_of_birth: reg.dateOfBirth,
      gender: reg.gender,
      pan_number: reg.panNumber,
      aadhar_number: reg.aadharNumber,
      address: reg.address,
      broker_id: brokerId,
      broker_id_str: brokerIdStr,
      status: 'active',
      kyc_status: 'verified',
      kyc_verified_at: now,
      trading_enabled: false,
      segments_allowed: Array.isArray(reg.segments_requested) && reg.segments_requested.length > 0
        ? reg.segments_requested
        : ['EQUITY', 'F&O', 'COMMODITY', 'CURRENCY'],
    };

    const [newCustomer] = await CustomerModel.create([customerPayload], findOptions);

    await FundModel.create([{
      customer_id: newCustomer._id,
      customer_id_str: customerId,
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
    }], findOptions);

    const bank = reg.bank_details || {};
    const hasBankData = !!(
      bank.bank_name
      && bank.account_holder_name
      && bank.account_number
      && bank.ifsc_code
    );
    if (hasBankData) {
      await BankAccountModel.create([{
        customer_id: newCustomer._id,
        customer_id_str: String(newCustomer._id),
        bank_name: bank.bank_name,
        account_number: bank.account_number,
        account_number_masked: maskAccountNumber(bank.account_number),
        ifsc_code: String(bank.ifsc_code).toUpperCase(),
        account_holder_name: bank.account_holder_name,
        account_type: bank.account_type === 'current' ? 'current' : 'savings',
        is_verified: true,
        verified_at: now,
        verification_method: 'manual',
        is_primary: true,
        is_active: true,
      }], findOptions);
    }

    const kycPayload = {
      customer_id: newCustomer._id,
      customer_id_str: String(newCustomer._id),
      aadhaar: {
        number: maskAadhaar(reg.aadharNumber),
        number_full: reg.aadharNumber || undefined,
        front: docs.aadhaarFront?.url ? {
          url: docs.aadhaarFront.url,
          public_id: docs.aadhaarFront.public_id || null,
          uploaded_at: docDate(docs.aadhaarFront, now),
        } : undefined,
        back: docs.aadhaarBack?.url ? {
          url: docs.aadhaarBack.url,
          public_id: docs.aadhaarBack.public_id || null,
          uploaded_at: docDate(docs.aadhaarBack, now),
        } : undefined,
        status: 'approved',
        submitted_at: now,
        reviewed_at: now,
        rejection_reason: null,
      },
      pan: {
        number: reg.panNumber || undefined,
        front: docs.panCard?.url ? {
          url: docs.panCard.url,
          public_id: docs.panCard.public_id || null,
          uploaded_at: docDate(docs.panCard, now),
        } : undefined,
        status: 'approved',
        submitted_at: now,
        reviewed_at: now,
        rejection_reason: null,
      },
      bank_proof: {
        document: docs.bankProof?.url ? {
          url: docs.bankProof.url,
          public_id: docs.bankProof.public_id || null,
          uploaded_at: docDate(docs.bankProof, now),
        } : undefined,
        status: 'approved',
        submitted_at: now,
        reviewed_at: now,
        rejection_reason: null,
      },
      overall_status: 'approved',
    };

    await CustomerKYC.findOneAndUpdate(
      { customer_id: newCustomer._id },
      { $set: kycPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true, ...findOptions }
    );

    reg.status = 'approved';
    reg.reviewedBy = req.user._id;
    reg.reviewedAt = now;
    await reg.save(findOptions);

    return {
      newCustomer,
      customerId,
      loginPassword,
      generatedPassword: !submittedPassword,
    };
  };

  let result = null;
  let session = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      result = await createFromRegistration(session);
    });
  } catch (error) {
    if (handleApprovalErrorResponse(res, error)) return;
    const transactionUnsupported = /transaction|replica set|mongos/i.test(String(error?.message || ''));
    if (!transactionUnsupported) {
      throw error;
    }
  } finally {
    if (session) {
      await session.endSession();
    }
  }

  if (!result) {
    try {
      result = await createFromRegistration();
    } catch (error) {
      if (handleApprovalErrorResponse(res, error)) return;
      throw error;
    }
  }

  res.status(200).json({
    success: true,
    message: 'Registration approved. Customer account created.',
    customer_id: result.customerId,
    password: result.loginPassword,
    passwordGenerated: result.generatedPassword,
    customer: {
      id: result.customerId,
      name: result.newCustomer.name,
      email: result.newCustomer.email,
      phone: result.newCustomer.phone,
      kycStatus: result.newCustomer.kyc_status,
      tradingEnabled: result.newCustomer.trading_enabled,
    },
  });
});

/**
 * @desc    Reject a registration with a reason
 * @route   POST /api/broker/registrations/:id/reject
 * @access  Private (Broker only)
 */
const rejectRegistration = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
  }

  const registration = await RegistrationModel.findOne({
    _id: id,
    broker_id_str: brokerIdStr,
  });

  if (!registration) {
    return res.status(404).json({ success: false, message: 'Registration not found.' });
  }

  if (registration.status === 'approved') {
    return res.status(400).json({ success: false, message: 'Cannot reject an already approved registration.' });
  }

  registration.status = 'rejected';
  registration.rejectionReason = String(reason).trim();
  registration.reviewedBy = req.user._id;
  registration.reviewedAt = new Date();
  await registration.save();

  res.status(200).json({
    success: true,
    message: 'Registration rejected.',
  });
});

/**
 * @desc    Delete a single registration record
 * @route   DELETE /api/broker/registrations/:id
 * @access  Private (Broker only)
 */
const deleteRegistration = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const registration = await RegistrationModel.findOne({
    _id: id,
    broker_id_str: brokerIdStr,
  });

  if (!registration) {
    return res.status(404).json({ success: false, message: 'Registration not found.' });
  }

  await RegistrationModel.deleteOne({ _id: id, broker_id_str: brokerIdStr });

  res.status(200).json({
    success: true,
    message: 'Registration record deleted successfully.',
  });
});

/**
 * @desc    Get registration counts by status (for dashboard badge)
 * @route   GET /api/broker/registrations/stats
 * @access  Private (Broker only)
 */
const getRegistrationStats = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;

  const stats = await RegistrationModel.aggregate([
    { $match: { broker_id_str: brokerIdStr } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const result = { pending: 0, under_review: 0, approved: 0, rejected: 0, total: 0 };
  stats.forEach(({ _id, count }) => {
    if (_id in result) result[_id] = count;
    result.total += count;
  });

  res.status(200).json({ success: true, stats: result });
});

export {
  getRegistrations,
  getRegistrationDetail,
  approveRegistration,
  rejectRegistration,
  deleteRegistration,
  getRegistrationStats,
};
