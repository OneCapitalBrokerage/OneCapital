// Controllers/broker/SettingsController.js
// Broker Settings - Manage broker preferences and configuration

import asyncHandler from 'express-async-handler';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import { v2 as cloudinary } from 'cloudinary';
import { remove as cloudinaryRemove } from '../../services/storage/adapters/cloudinaryAdapter.js';

const QR_SETTING_LIMITS = {
  scale: { min: 0.5, max: 2.5, fallback: 1 },
  offset: { min: -45, max: 45, fallback: 0 },
  padding: { min: 0, max: 24, fallback: 8 },
};

const clampNumber = (value, limits) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return limits.fallback;
  return Math.min(limits.max, Math.max(limits.min, parsed));
};

const normalizeQrSettings = (value = {}) => ({
  scale: clampNumber(value.scale, QR_SETTING_LIMITS.scale),
  offset_x: clampNumber(value.offsetX ?? value.offset_x, QR_SETTING_LIMITS.offset),
  offset_y: clampNumber(value.offsetY ?? value.offset_y, QR_SETTING_LIMITS.offset),
  padding: clampNumber(value.padding, QR_SETTING_LIMITS.padding),
});

const mapQrSettings = (value = {}) => {
  const normalized = normalizeQrSettings(value);
  return {
    scale: normalized.scale,
    offsetX: normalized.offset_x,
    offsetY: normalized.offset_y,
    padding: normalized.padding,
  };
};

const normalizeBankTransferDetails = (value = {}) => ({
  bank_name: String(value.bankName ?? value.bank_name ?? '').trim(),
  account_holder_name: String(value.accountHolderName ?? value.account_holder_name ?? '').trim(),
  account_number: String(value.accountNumber ?? value.account_number ?? '').replace(/\s+/g, ''),
  ifsc_code: String(value.ifscCode ?? value.ifsc_code ?? '').trim().toUpperCase(),
  account_type: value.accountType === 'savings' || value.account_type === 'savings' ? 'savings' : 'current',
});

const mapBankTransferDetails = (value = {}) => {
  const normalized = normalizeBankTransferDetails(value);
  return {
    bankName: normalized.bank_name,
    accountHolderName: normalized.account_holder_name,
    accountNumber: normalized.account_number,
    ifscCode: normalized.ifsc_code,
    accountType: normalized.account_type,
  };
};

const getBrokerQrFolder = (broker) => `broker_payment_qr/${broker?._id}`;

/**
 * @desc     Get broker settings
 * @route    GET /api/broker/settings
 * @access   Private (Broker only)
 */
const getSettings = asyncHandler(async (req, res) => {
  const broker = req.user;

  res.status(200).json({
    success: true,
    settings: {
      // Profile
      profile: {
        name: broker.name,
        ownerName: broker.owner_name,
        email: broker.email,
        phone: broker.phone,
        companyName: broker.company_name,
        registrationNumber: broker.registration_number,
        gstNumber: broker.gst_number,
        address: broker.address,
      },
      // Client-facing info
      clientInfo: {
        supportContact: broker.support_contact,
        supportEmail: broker.support_email,
        qrPhotoUrl: broker.payment_qr_url,
        qrPhotoPublicId: broker.payment_qr_public_id,
        qrSettings: mapQrSettings(broker.payment_qr_settings),
        bankTransferDetails: mapBankTransferDetails(broker.bank_transfer_details),
      },
      // Trading defaults
      trading: {
        defaultOrderType: broker.settings?.default_order_type || 'MIS',
      },
      // Weekly settlement
      settlement: {
        autoWeeklySettlementEnabled: broker.settings?.settlement?.auto_weekly_settlement_enabled !== false,
        autoSettlementDay: 'sunday',
        timezone: 'Asia/Kolkata',
      },
      // Notifications
      notifications: {
        tradeExecutions: broker.settings?.notifications?.trade_executions ?? true,
        marginAlerts: broker.settings?.notifications?.margin_alerts ?? true,
        clientOnboarding: broker.settings?.notifications?.client_onboarding ?? true,
      },
      // Security
      security: {
        biometricLogin: broker.settings?.biometric_login || false,
      },
    },
  });
});

/**
 * @desc     Update broker settings
 * @route    PUT /api/broker/settings
 * @access   Private (Broker only)
 */
const updateSettings = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const updateData = req.body;

  const broker = await BrokerModel.findById(brokerId);

  if (!broker) {
    return res.status(404).json({
      success: false,
      message: 'Broker not found.',
    });
  }

  // Update profile fields
  if (updateData.name) broker.name = updateData.name;
  if (updateData.ownerName) broker.owner_name = updateData.ownerName;
  if (updateData.email) broker.email = updateData.email;
  if (updateData.phone) broker.phone = updateData.phone;
  if (updateData.companyName) broker.company_name = updateData.companyName;
  if (updateData.registrationNumber) broker.registration_number = updateData.registrationNumber;
  if (updateData.gstNumber) broker.gst_number = updateData.gstNumber;
  if (updateData.address) broker.address = updateData.address;

  // Update password if provided
  if (updateData.password) {
    broker.password = updateData.password;
  }

  // Initialize settings if not exists
  if (!broker.settings) {
    broker.settings = {};
  }

  // Update trading settings
  if (updateData.defaultOrderType) {
    broker.settings.default_order_type = updateData.defaultOrderType;
  }

  const autoSettlementToggle =
    updateData?.settlement?.autoWeeklySettlementEnabled ??
    updateData?.autoWeeklySettlementEnabled;
  if (autoSettlementToggle !== undefined) {
    if (!broker.settings.settlement) broker.settings.settlement = {};
    broker.settings.settlement.auto_weekly_settlement_enabled = Boolean(autoSettlementToggle);
  }

  // Update security settings
  if (updateData.biometricLogin !== undefined) {
    broker.settings.biometric_login = updateData.biometricLogin;
  }

  await broker.save();

  res.status(200).json({
    success: true,
    message: 'Settings updated successfully.',
  });
});

/**
 * @desc     Update client-facing info (UPI, support contact)
 * @route    PUT /api/broker/settings/client-info
 * @access   Private (Broker only)
 */
const updateClientInfo = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const {
    supportContact,
    supportEmail,
    qrPhotoUrl,
    qrPhotoPublicId,
    qrSettings,
    bankTransferDetails,
  } = req.body;

  const broker = await BrokerModel.findById(brokerId);

  if (!broker) {
    return res.status(404).json({
      success: false,
      message: 'Broker not found.',
    });
  }

  const existingQrPublicId = broker.payment_qr_public_id || '';
  const nextQrPublicId =
    qrPhotoPublicId !== undefined ? String(qrPhotoPublicId || '').trim() : existingQrPublicId;
  const nextQrPhotoUrl =
    qrPhotoUrl !== undefined ? String(qrPhotoUrl || '').trim() : String(broker.payment_qr_url || '');
  const qrFolder = getBrokerQrFolder(broker);
  const normalizedBankTransferDetails =
    bankTransferDetails !== undefined ? normalizeBankTransferDetails(bankTransferDetails) : null;

  if (qrPhotoPublicId !== undefined && nextQrPublicId && !nextQrPublicId.startsWith(`${qrFolder}/`)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid QR asset.',
    });
  }

  if (normalizedBankTransferDetails) {
    const hasAccountNumber = Boolean(normalizedBankTransferDetails.account_number);
    const hasIfsc = Boolean(normalizedBankTransferDetails.ifsc_code);

    if (hasAccountNumber !== hasIfsc) {
      return res.status(400).json({
        success: false,
        message: 'Bank account number and IFSC code must be saved together.',
      });
    }

    if (normalizedBankTransferDetails.ifsc_code && normalizedBankTransferDetails.ifsc_code.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'IFSC code must be 11 characters.',
      });
    }
  }

  if (supportContact !== undefined) broker.support_contact = supportContact;
  if (supportEmail !== undefined) broker.support_email = supportEmail;
  if (qrPhotoUrl !== undefined) broker.payment_qr_url = nextQrPhotoUrl;
  if (qrPhotoPublicId !== undefined) broker.payment_qr_public_id = nextQrPublicId;
  if (qrSettings !== undefined) broker.payment_qr_settings = normalizeQrSettings(qrSettings);
  if (bankTransferDetails !== undefined) {
    broker.bank_transfer_details = normalizedBankTransferDetails;
  }

  await broker.save();

  const shouldDeletePreviousQr =
    existingQrPublicId &&
    (
      (qrPhotoPublicId !== undefined && !nextQrPublicId) ||
      (qrPhotoPublicId !== undefined && nextQrPublicId !== existingQrPublicId)
    );

  if (shouldDeletePreviousQr) {
    const cleanupResult = await cloudinaryRemove(existingQrPublicId);
    if (!cleanupResult?.success) {
      console.warn('[BrokerSettings] Failed to remove previous QR asset:', existingQrPublicId, cleanupResult?.error);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Client info updated successfully.',
    clientInfo: {
      supportContact: broker.support_contact,
      supportEmail: broker.support_email,
      qrPhotoUrl: broker.payment_qr_url,
      qrPhotoPublicId: broker.payment_qr_public_id,
      qrSettings: mapQrSettings(broker.payment_qr_settings),
      bankTransferDetails: mapBankTransferDetails(broker.bank_transfer_details),
    },
  });
});

/**
 * @desc     Get Cloudinary signature for broker client-info uploads (QR image)
 * @route    GET /api/broker/settings/client-info/upload-signature
 * @access   Private (Broker only)
 */
const getClientInfoUploadSignature = asyncHandler(async (req, res) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const folder = getBrokerQrFolder(req.user);

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
 * @desc     Delete a temporary uploaded QR asset that was not saved
 * @route    POST /api/broker/settings/client-info/qr/discard
 * @access   Private (Broker only)
 */
const discardClientInfoQrUpload = asyncHandler(async (req, res) => {
  const publicId = String(req.body?.publicId || '').trim();
  const allowedFolder = getBrokerQrFolder(req.user);

  if (!publicId) {
    return res.status(400).json({
      success: false,
      message: 'publicId is required.',
    });
  }

  if (!publicId.startsWith(`${allowedFolder}/`)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid QR asset.',
    });
  }

  const result = await cloudinaryRemove(publicId);

  if (!result?.success && result?.error !== 'not found') {
    return res.status(500).json({
      success: false,
      message: 'Failed to discard QR asset.',
    });
  }

  res.status(200).json({
    success: true,
    message: 'Discarded QR asset.',
  });
});

/**
 * @desc     Update notification preferences
 * @route    PUT /api/broker/settings/notifications
 * @access   Private (Broker only)
 */
const updateNotifications = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const { tradeExecutions, marginAlerts, clientOnboarding } = req.body;

  const broker = await BrokerModel.findById(brokerId);

  if (!broker) {
    return res.status(404).json({
      success: false,
      message: 'Broker not found.',
    });
  }

  // Initialize settings if not exists
  if (!broker.settings) broker.settings = {};
  if (!broker.settings.notifications) broker.settings.notifications = {};

  if (tradeExecutions !== undefined) {
    broker.settings.notifications.trade_executions = tradeExecutions;
  }
  if (marginAlerts !== undefined) {
    broker.settings.notifications.margin_alerts = marginAlerts;
  }
  if (clientOnboarding !== undefined) {
    broker.settings.notifications.client_onboarding = clientOnboarding;
  }

  await broker.save();

  res.status(200).json({
    success: true,
    message: 'Notification preferences updated.',
    notifications: broker.settings.notifications,
  });
});

export {
  getSettings,
  updateSettings,
  updateClientInfo,
  updateNotifications,
  getClientInfoUploadSignature,
  discardClientInfoQrUpload,
};
