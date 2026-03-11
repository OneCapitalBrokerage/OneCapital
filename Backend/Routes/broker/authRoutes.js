// Routes/broker/authRoutes.js
// Broker Authentication APIs

import express from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import { verifyBrokerCode } from '../../Controllers/broker/VerifyCodeController.js';

const router = express.Router();

const createAccessToken = (broker) =>
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

const createRefreshToken = (broker) =>
  jwt.sign(
    {
      id: broker._id,
      role: 'broker',
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '60d' }
  );

/**
 * @route   GET /api/broker/verify-code
 * @desc    Validate a broker reference code (used during customer registration)
 * @access  Public
 */
router.get('/verify-code', verifyBrokerCode);

/**
 * @route   POST /api/broker/auth/login
 * @desc    Broker login
 * @access  Public
 */
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { brokerId, password } = req.body || {};
  const normalizedBrokerId = String(brokerId || '').trim();
  const inputPassword = String(password || '');

  if (!normalizedBrokerId || !inputPassword) {
    return res.status(400).json({
      success: false,
      message: 'Broker ID and password are required.',
    });
  }

  const brokerCandidates = await BrokerModel.find({
    $or: [{ broker_id: normalizedBrokerId }, { login_id: normalizedBrokerId }],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select('+password');

  if (!brokerCandidates || brokerCandidates.length === 0) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials.',
    });
  }

  let broker = null;
  for (const candidate of brokerCandidates) {
    const storedPassword = String(candidate.password || '');
    let isMatch = storedPassword === inputPassword;

    // Backward compatibility: if password is bcrypt-hashed in older datasets, allow bcrypt compare.
    if (!isMatch && storedPassword.startsWith('$2')) {
      // eslint-disable-next-line no-await-in-loop
      isMatch = await bcrypt.compare(inputPassword, storedPassword);
    }

    if (isMatch) {
      broker = candidate;
      break;
    }
  }

  if (!broker) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials.',
    });
  }

  if (broker.status === 'blocked' || broker.status === 'suspended') {
    return res.status(403).json({
      success: false,
      message: 'Your broker account is blocked. Please contact support.',
    });
  }

  broker.last_login = new Date();
  await broker.save();

  const accessToken = createAccessToken(broker);
  const refreshToken = createRefreshToken(broker);
  const brokerStringId = broker.broker_id || broker.login_id || String(broker._id);

  return res.status(200).json({
    success: true,
    message: 'Broker login successful.',
    accessToken,
    token: accessToken,
    refreshToken,
    broker: {
      id: brokerStringId,
      broker_id: brokerStringId,
      name: broker.name,
      email: broker.email,
      phone: broker.phone,
      status: broker.status,
      ownerName: broker.owner_name,
      companyName: broker.company_name,
    },
  });
}));

export default router;
