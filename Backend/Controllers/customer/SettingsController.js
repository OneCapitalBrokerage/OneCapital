// Controllers/customer/SettingsController.js
// Customer Settings - Account preferences and security

import asyncHandler from 'express-async-handler';
import { v2 as cloudinary } from 'cloudinary';
import CustomerModel from '../../Model/Auth/CustomerModel.js';

/**
 * @desc     Get customer settings
 * @route    GET /api/customer/settings
 * @access   Private (Customer only)
 */
const getSettings = asyncHandler(async (req, res) => {
  const customer = req.user;

  res.status(200).json({
    success: true,
    settings: {
      profile: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        profilePhoto: customer.avatar,
      },
      trading: {
        defaultOrderType: customer.settings?.default_order_type || 'MIS',
        defaultExchange: customer.settings?.default_exchange || 'NSE',
        confirmBeforeOrder: customer.settings?.confirm_before_order ?? true,
      },
      notifications: {
        orderExecutions: customer.settings?.notifications?.order_executions ?? true,
        priceAlerts: customer.settings?.notifications?.price_alerts ?? true,
        marketNews: customer.settings?.notifications?.market_news ?? false,
      },
      security: {
        biometricLogin: customer.settings?.biometric_login || false,
        twoFactorEnabled: customer.settings?.two_factor_enabled || false,
      },
    },
  });
});

/**
 * @desc     Update customer settings
 * @route    PUT /api/customer/settings
 * @access   Private (Customer only)
 */
const updateSettings = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const updateData = req.body;

  const customer = await CustomerModel.findById(customerId);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Customer not found.',
    });
  }

  // Identity fields are locked — reject attempts to change them here
  if (updateData.name || updateData.email || updateData.phone || updateData.profilePhoto) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, phone, and photo cannot be updated via this endpoint.',
    });
  }

  // Initialize settings if not exists
  if (!customer.settings) {
    customer.settings = {};
  }

  // Update trading settings
  if (updateData.defaultOrderType) {
    customer.settings.default_order_type = updateData.defaultOrderType;
  }
  if (updateData.defaultExchange) {
    customer.settings.default_exchange = updateData.defaultExchange;
  }
  if (updateData.confirmBeforeOrder !== undefined) {
    customer.settings.confirm_before_order = updateData.confirmBeforeOrder;
  }

  // Update security settings
  if (updateData.biometricLogin !== undefined) {
    customer.settings.biometric_login = updateData.biometricLogin;
  }

  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Settings updated successfully.',
  });
});

/**
 * @desc     Change password
 * @route    PUT /api/customer/settings/password
 * @access   Private (Customer only)
 */
const changePassword = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current and new password are required.',
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 8 characters.',
    });
  }

  if (newPassword === currentPassword) {
    return res.status(400).json({
      success: false,
      message: 'New password must be different from the current password.',
    });
  }

  const customer = await CustomerModel.findById(customerId).select('+password');

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Customer not found.',
    });
  }

  if (customer.password !== currentPassword) {
    return res.status(401).json({
      success: false,
      message: 'Current password is incorrect.',
    });
  }

  customer.password = newPassword;
  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully.',
  });
});

/**
 * @desc     Update notification preferences
 * @route    PUT /api/customer/settings/notifications
 * @access   Private (Customer only)
 */
const updateNotifications = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const { orderExecutions, priceAlerts, marketNews } = req.body;

  const customer = await CustomerModel.findById(customerId);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Customer not found.',
    });
  }

  // Initialize settings if not exists
  if (!customer.settings) customer.settings = {};
  if (!customer.settings.notifications) customer.settings.notifications = {};

  if (orderExecutions !== undefined) {
    customer.settings.notifications.order_executions = orderExecutions;
  }
  if (priceAlerts !== undefined) {
    customer.settings.notifications.price_alerts = priceAlerts;
  }
  if (marketNews !== undefined) {
    customer.settings.notifications.market_news = marketNews;
  }

  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Notification preferences updated.',
    notifications: customer.settings.notifications,
  });
});

/**
 * @desc     Upload profile photo
 * @route    POST /api/customer/settings/photo
 * @access   Private (Customer only)
 */
const uploadProfilePhoto = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const { photoUrl } = req.body;

  if (!photoUrl) {
    return res.status(400).json({
      success: false,
      message: 'Photo URL is required.',
    });
  }

  const customer = await CustomerModel.findById(customerId);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Customer not found.',
    });
  }

  customer.avatar = photoUrl;
  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Profile photo updated.',
    profilePhoto: customer.avatar,
  });
});

/**
 * @desc     Get Cloudinary upload signature for profile photo
 * @route    GET /api/customer/profile/photo-upload-signature
 * @access   Private (Customer only)
 */
const getProfilePhotoUploadSignature = asyncHandler(async (_req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'customer_profile_photos';
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
 * @desc     Get active admin warning for current customer
 * @route    GET /api/customer/warning
 * @access   Private (Customer only)
 */
const getWarning = asyncHandler(async (req, res) => {
  const customerId = req.user.customer_id;
  const customer = await CustomerModel.findOne({ customer_id: customerId }).select(
    'admin_warning_active admin_warning_message admin_warning_created_at admin_warning_updated_at'
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Customer not found.',
    });
  }

  res.status(200).json({
    success: true,
    warning: {
      active: customer.admin_warning_active || false,
      message: customer.admin_warning_active ? customer.admin_warning_message : '',
      createdAt: customer.admin_warning_active ? customer.admin_warning_created_at : null,
      updatedAt: customer.admin_warning_active ? customer.admin_warning_updated_at : null,
    },
  });
});

export {
  getSettings,
  updateSettings,
  changePassword,
  updateNotifications,
  uploadProfilePhoto,
  getProfilePhotoUploadSignature,
  getWarning,
};
