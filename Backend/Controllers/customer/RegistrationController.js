// Controllers/customer/RegistrationController.js
// Customer Registration - Self-registration and KYC submission

import asyncHandler from 'express-async-handler';
import RegistrationModel from '../../Model/RegistrationModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import { v2 as cloudinary } from 'cloudinary';

const normalizeDocument = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const url = value.trim();
    if (!url) return null;
    return { url, uploadedAt: new Date() };
  }

  if (typeof value === 'object') {
    const url = String(value.url || value.secure_url || '').trim();
    if (!url) return null;
    return {
      url,
      public_id: value.public_id || value.publicId || null,
      uploadedAt: value.uploadedAt || value.uploaded_at || new Date(),
    };
  }

  return null;
};

const sanitizeRegistrationDocuments = (documents = {}) => {
  const cleaned = {};

  const aadhaarFront = normalizeDocument(documents.aadhaarFront || documents.aadharFront);
  const aadhaarBack = normalizeDocument(documents.aadhaarBack || documents.aadharBack);
  const panCard = normalizeDocument(documents.panCard);
  const bankProof = normalizeDocument(documents.bankProof);

  if (aadhaarFront) cleaned.aadhaarFront = aadhaarFront;
  if (aadhaarBack) cleaned.aadhaarBack = aadhaarBack;
  if (panCard) cleaned.panCard = panCard;
  if (bankProof) cleaned.bankProof = bankProof;

  return cleaned;
};

const hasRequiredSignupDocuments = (documents = {}) => (
  !!documents.panCard?.url
  && !!documents.aadhaarFront?.url
  && !!documents.aadhaarBack?.url
  && !!documents.bankProof?.url
);

/**
 * @desc     Submit registration request
 * @route    POST /api/customer/register
 * @access   Public
 */
const submitRegistration = asyncHandler(async (req, res) => {
  const {
    name,
    firstName,
    middleName,
    lastName,
    email,
    phone,
    mobileNumber,
    whatsappNumber,
    userId,
    password,
    documents,
    broker_code,
    dateOfBirth,
    gender,
    panNumber,
    aadharNumber,
    occupation,
    annual_income,
    nominee,
    bank_details,
    segments_requested,
    address,
    terms_agreed,
    data_consent,
  } = req.body;

  const normalizedEmail = email ? email.toLowerCase() : undefined;
  const normalizedPhone = phone || mobileNumber;
  const normalizedUserId = userId ? String(userId).toUpperCase().trim() : undefined;
  const normalizedBrokerCode = broker_code ? String(broker_code).toUpperCase().trim() : '';
  const registrationDocuments = sanitizeRegistrationDocuments(documents || {});

  const fullName = (name || [firstName, middleName, lastName].filter(Boolean).join(' ')).trim();

  // Validate required fields (aligned with signup UI)
  if (!fullName) {
    return res.status(400).json({
      success: false,
      message: 'Full name is required.',
    });
  }
  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required.',
    });
  }
  if (!normalizedBrokerCode) {
    return res.status(400).json({
      success: false,
      message: 'Reference code is required.',
    });
  }
  if (!normalizedEmail && !normalizedPhone) {
    return res.status(400).json({
      success: false,
      message: 'Email or mobile number is required.',
    });
  }
  if (!hasRequiredSignupDocuments(registrationDocuments)) {
    return res.status(400).json({
      success: false,
      message: 'PAN, Aadhaar front/back, and bank proof documents are required.',
    });
  }

  const orFilters = [];
  if (normalizedUserId) orFilters.push({ userId: normalizedUserId });
  if (normalizedEmail) orFilters.push({ email: normalizedEmail });
  if (normalizedPhone) orFilters.push({ phone: normalizedPhone }, { mobileNumber: normalizedPhone });

  // Check if already registered
  const existing = orFilters.length > 0 ? await RegistrationModel.findOne({ $or: orFilters }) : null;
  if (existing) {
    const conflictLabel = normalizedUserId ? 'User ID, email, or mobile' : 'email or mobile';
    return res.status(400).json({
      success: false,
      message: `A registration with this ${conflictLabel} already exists.`,
    });
  }

  // Check if customer already exists
  const customerFilters = [
    ...(normalizedUserId ? [{ customer_id: normalizedUserId }] : []),
    ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
    ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
  ];
  const existingCustomer = customerFilters.length > 0
    ? await CustomerModel.findOne({ $or: customerFilters })
    : null;
  if (existingCustomer) {
    const conflictLabel = normalizedUserId ? 'User ID, email, or mobile' : 'email or mobile';
    return res.status(400).json({
      success: false,
      message: `A customer with this ${conflictLabel} already exists.`,
    });
  }

  // Resolve broker_code to brokerId
  let resolvedBrokerId = null;
  let resolvedBrokerIdStr = null;
  const broker = await BrokerModel.findOne(
    { reference_code: normalizedBrokerCode, status: 'active' },
    '_id broker_id'
  );
  if (!broker) {
    return res.status(400).json({
      success: false,
      message: 'Invalid broker code. Please check the code provided by your broker.',
    });
  }
  resolvedBrokerId = broker._id;
  resolvedBrokerIdStr = broker.broker_id;

  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const derivedFirstName = nameParts[0] || fullName;
  const derivedLastName = nameParts.slice(1).join(' ');

  // Create registration
  const registration = await RegistrationModel.create({
    name: fullName,
    firstName: derivedFirstName,
    lastName: derivedLastName,
    email: normalizedEmail,
    phone: normalizedPhone,
    mobileNumber: normalizedPhone,
    whatsappNumber: whatsappNumber || normalizedPhone,
    ...(normalizedUserId && { userId: normalizedUserId }),
    password,
    ...(dateOfBirth && { dateOfBirth }),
    ...(gender && { gender }),
    ...(panNumber && { panNumber: panNumber.toUpperCase() }),
    ...(aadharNumber && { aadharNumber }),
    ...(occupation && { occupation }),
    ...(annual_income && { annual_income }),
    ...(nominee && { nominee }),
    ...(bank_details && {
      bank_details: {
        bank_name: bank_details.bank_name,
        account_holder_name: bank_details.account_holder_name,
        account_number: bank_details.account_number,
        ifsc_code: bank_details.ifsc_code ? String(bank_details.ifsc_code).toUpperCase() : '',
        account_type: bank_details.account_type === 'current' ? 'current' : 'savings',
      },
    }),
    ...(segments_requested && { segments_requested }),
    ...(address && { address }),
    documents: registrationDocuments,
    ...(resolvedBrokerId && { brokerId: resolvedBrokerId }),
    ...(resolvedBrokerIdStr && { broker_id_str: resolvedBrokerIdStr }),
    terms_agreed: !!terms_agreed,
    data_consent: !!data_consent,
    status: hasRequiredSignupDocuments(registrationDocuments) ? 'under_review' : 'pending',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({
    success: true,
    message: 'Registration submitted successfully.',
    registrationId: registration._id,
    nextStep: registration.status === 'under_review'
      ? 'Your application is under review.'
      : 'Please complete document upload to move under review.',
  });
});

/**
 * @desc     Upload KYC documents
 * @route    POST /api/customer/register/:id/documents
 * @access   Public
 */
const uploadDocuments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { aadhaarFront, aadhaarBack, panCard, bankProof, documents } = req.body;

  const registration = await RegistrationModel.findById(id);

  if (!registration) {
    return res.status(404).json({
      success: false,
      message: 'Registration not found.',
    });
  }

  if (!registration.documents) {
    registration.documents = {};
  }

  const normalizedIncoming = sanitizeRegistrationDocuments(
    documents || { aadhaarFront, aadhaarBack, panCard, bankProof }
  );
  const existingDocs = typeof registration.documents?.toObject === 'function'
    ? registration.documents.toObject()
    : (registration.documents || {});
  registration.documents = {
    ...existingDocs,
    ...normalizedIncoming,
  };

  // Check if all required documents are uploaded
  const hasAllDocs = hasRequiredSignupDocuments(registration.documents);

  if (hasAllDocs) {
    registration.status = 'under_review';
  }

  await registration.save();

  res.status(200).json({
    success: true,
    message: hasAllDocs 
      ? 'All documents uploaded. Your application is under review.'
      : 'Documents uploaded. Please upload remaining documents.',
    documentsStatus: {
      aadhaarFront: !!registration.documents.aadhaarFront?.url,
      aadhaarBack: !!registration.documents.aadhaarBack?.url,
      panCard: !!registration.documents.panCard?.url,
      bankProof: !!registration.documents.bankProof?.url,
    },
    applicationStatus: registration.status,
  });
});

/**
 * @desc     Check registration status
 * @route    GET /api/customer/register/:id/status
 * @access   Public
 */
const checkStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const registration = await RegistrationModel.findById(id);

  if (!registration) {
    return res.status(404).json({
      success: false,
      message: 'Registration not found.',
    });
  }

  res.status(200).json({
    success: true,
    registration: {
      id: registration._id,
      name: registration.name || `${registration.firstName || ''} ${registration.lastName || ''}`.trim(),
      email: registration.email,
      status: registration.status,
      documents: {
        aadhaarFront: !!registration.documents?.aadhaarFront?.url,
        aadhaarBack: !!registration.documents?.aadhaarBack?.url,
        panCard: !!registration.documents?.panCard?.url,
        bankProof: !!registration.documents?.bankProof?.url,
      },
      submittedAt: registration.createdAt,
      reviewedAt: registration.reviewedAt,
      rejectionReason: registration.rejectionReason,
    },
  });
});

/**
 * @desc     Get Cloudinary signature for direct upload
 * @route    GET /api/customer/register/upload-signature
 * @access   Public
 */
const getUploadSignature = asyncHandler(async (req, res) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const folder = 'kyc_documents';

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET || ''
  );

  res.status(200).json({
    success: true,
    signature,
    timestamp,
    folder,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  });
});

/**
 * @desc    Check if a user ID is available
 * @route   GET /api/customer/register/check-userid?userId=RAHUL123
 * @access  Public
 */
const checkUserId = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId || !String(userId).trim()) {
    return res.status(400).json({ success: false, message: 'userId is required.' });
  }
  const normalized = String(userId).toUpperCase().trim();

  const [existingReg, existingCustomer] = await Promise.all([
    RegistrationModel.findOne({ userId: normalized }, '_id'),
    CustomerModel.findOne({ customer_id: normalized }, '_id'),
  ]);

  const available = !existingReg && !existingCustomer;
  return res.status(200).json({ success: true, available, userId: normalized });
});

export {
  submitRegistration,
  uploadDocuments,
  checkStatus,
  getUploadSignature,
  checkUserId,
};
