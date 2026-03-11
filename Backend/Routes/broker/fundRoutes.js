// Routes/broker/fundRoutes.js
// Broker Fund Management APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  addFundsToClient,
  getClientBalance,
  updateClientFunds,
  getFundHistory,
} from '../../Controllers/broker/FundController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   POST /api/broker/funds/add
 * @desc    Add funds to client account
 * @access  Private (Broker only)
 */
router.post('/funds/add', addFundsToClient);

/**
 * @route   GET /api/broker/clients/:id/balance
 * @desc    Get client balance
 * @access  Private (Broker only)
 */
router.get('/clients/:id/balance', getClientBalance);

/**
 * @route   PUT /api/broker/clients/:id/funds
 * @desc    Update client fund buckets
 * @access  Private (Broker only)
 */
router.put('/clients/:id/funds', updateClientFunds);

/**
 * @route   GET /api/broker/funds/history
 * @desc    Get fund transfer history
 * @access  Private (Broker only)
 */
router.get('/funds/history', getFundHistory);

export default router;
