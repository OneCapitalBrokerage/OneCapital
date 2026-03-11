// Controllers/broker/SettingsController.js
// Broker Settings - Manage broker preferences and configuration

import asyncHandler from 'express-async-handler';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import { v2 as cloudinary } from 'cloudinary';

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
        upiId: broker.upi_id,
        qrPhotoUrl: broker.payment_qr_url,
        qrPhotoPublicId: broker.payment_qr_public_id,
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
  const { upiId, supportContact, supportEmail, qrPhotoUrl, qrPhotoPublicId } = req.body;

  const broker = await BrokerModel.findById(brokerId);

  if (!broker) {
    return res.status(404).json({
      success: false,
      message: 'Broker not found.',
    });
  }

  if (upiId !== undefined) broker.upi_id = upiId;
  if (supportContact !== undefined) broker.support_contact = supportContact;
  if (supportEmail !== undefined) broker.support_email = supportEmail;
  if (qrPhotoUrl !== undefined) broker.payment_qr_url = qrPhotoUrl;
  if (qrPhotoPublicId !== undefined) broker.payment_qr_public_id = qrPhotoPublicId;

  await broker.save();

  res.status(200).json({
    success: true,
    message: 'Client info updated successfully.',
    clientInfo: {
      upiId: broker.upi_id,
      supportContact: broker.support_contact,
      supportEmail: broker.support_email,
      qrPhotoUrl: broker.payment_qr_url,
      qrPhotoPublicId: broker.payment_qr_public_id,
    },
  });
});

/**
 * @desc     Get Cloudinary signature for broker client-info uploads (QR image)
 * @route    GET /api/broker/settings/client-info/upload-signature
 * @access   Private (Broker only)
 */
const getClientInfoUploadSignature = asyncHandler(async (_req, res) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const folder = 'broker_payment_qr';

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
};
