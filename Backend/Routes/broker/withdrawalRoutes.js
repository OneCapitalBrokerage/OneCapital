// Routes/broker/withdrawalRoutes.js
// Broker Withdrawal Request APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getWithdrawalStats,
} from '../../Controllers/broker/WithdrawalController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/broker/withdrawals
 * @desc    Get pending withdrawal requests
 * @access  Private (Broker only)
 */
router.get('/withdrawals', getWithdrawals);

/**
 * @route   POST /api/broker/withdrawals/:id/approve
 * @desc    Approve withdrawal
 * @access  Private (Broker only)
 */
router.post('/withdrawals/:id/approve', approveWithdrawal);

/**
 * @route   POST /api/broker/withdrawals/:id/reject
 * @desc    Reject withdrawal
 * @access  Private (Broker only)
 */
router.post('/withdrawals/:id/reject', rejectWithdrawal);

/**
 * @route   GET /api/broker/withdrawals/stats
 * @desc    Get withdrawal stats
 * @access  Private (Broker only)
 */
router.get('/withdrawals/stats', getWithdrawalStats);

export default router;
