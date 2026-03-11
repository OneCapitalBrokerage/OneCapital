// Routes/customer/authRoutes.js
// Customer Authentication APIs

import express from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import CustomerModel from '../../Model/Auth/CustomerModel.js';

const router = express.Router();

const buildSuspendedPayload = () => ({
  success: false,
  code: 'ACCOUNT_SUSPENDED',
  message: 'Account suspended.',
});

const buildInactivePayload = () => ({
  success: false,
  code: 'ACCOUNT_INACTIVE',
  message: 'Account inactive. Please contact your broker.',
});

/**
 * @route   POST /api/customer/auth/login
 * @desc    Customer login
 * @access  Public
 */
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password, customerId } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required.',
    });
  }

  // Find customer by email or customer_id
  let customer;
  if (email) {
    customer = await CustomerModel.findOne({ email: email.toLowerCase() }).select('+password');
  } else if (customerId) {
    customer = await CustomerModel.findOne({ customer_id: customerId }).select('+password');
  } else {
    return res.status(400).json({
      success: false,
      message: 'Email or Customer ID is required.',
    });
  }

  if (!customer) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials.',
    });
  }

  // Check password (plain text comparison as per user's requirement)
  if (customer.password !== password) {
    // Update failed login attempts
    customer.failed_login_attempts = (customer.failed_login_attempts || 0) + 1;
    await customer.save();
    
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials.',
    });
  }

  // Check account status
  if (customer.status === 'blocked') {
    return res.status(403).json(buildSuspendedPayload());
  }

  if (customer.status === 'inactive') {
    return res.status(403).json(buildInactivePayload());
  }

  // Update last login
  customer.last_login = new Date();
  customer.failed_login_attempts = 0;
  await customer.save();

  // Generate tokens
  const brokerId = customer.broker_id || customer.attached_broker_id;
  const brokerIdStr = customer.broker_id_str || customer.attached_broker_id?.toString();

  const accessToken = jwt.sign(
    { 
      id: customer._id, 
      role: 'customer',
      customer_id: customer.customer_id,
      stringBrokerId: brokerIdStr,
      mongoBrokerId: brokerId,
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '30d' }
  );

  const refreshToken = jwt.sign(
    { id: customer._id, role: 'customer' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '60d' }
  );

  res.status(200).json({
    success: true,
    message: 'Login successful.',
    token: accessToken,
    refreshToken,
    user: {
      id: customer.customer_id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      status: customer.status,
      kycStatus: customer.kyc_status,
      tradingEnabled: customer.trading_enabled,
      holdingsExitAllowed: customer.holdings_exit_allowed,
      profilePhoto: customer.profile_photo,
    },
  });
}));

/**
 * @route   POST /api/customer/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/auth/refresh-token', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token is required.',
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
    
    const customer = await CustomerModel.findById(decoded.id);
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token.',
      });
    }

    if (customer.status === 'blocked') {
      return res.status(403).json(buildSuspendedPayload());
    }

    if (customer.status === 'inactive') {
      return res.status(403).json(buildInactivePayload());
    }

    // Generate new access token
    const brokerId = customer.broker_id || customer.attached_broker_id;
    const brokerIdStr = customer.broker_id_str || customer.attached_broker_id?.toString();

    const accessToken = jwt.sign(
      { 
        id: customer._id, 
        role: 'customer',
        customer_id: customer.customer_id,
        stringBrokerId: brokerIdStr,
        mongoBrokerId: brokerId,
      },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      token: accessToken,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token.',
    });
  }
}));

/**
 * @route   POST /api/customer/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/auth/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required.',
    });
  }

  const customer = await CustomerModel.findOne({ email: email.toLowerCase() });

  // Always return success to prevent email enumeration
  res.status(200).json({
    success: true,
    message: 'If an account with this email exists, a password reset link has been sent.',
  });

  // TODO: Implement actual password reset email sending
  if (customer) {
    console.log(`[Auth] Password reset requested for customer: ${customer.customer_id}`);
  }
}));

export default router;
