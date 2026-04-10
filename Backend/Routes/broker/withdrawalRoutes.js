// Routes/broker/withdrawalRoutes.js
// Broker Withdrawal Request APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getWithdrawalStats,
  createManualWithdrawal,
  getManualWithdrawals,
  getManualWithdrawalStats,
  getWithdrawalEligibility,
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

/**
 * @route   POST /api/broker/clients/:id/manual-withdrawals
 * @desc    Record manual withdrawal payout entry
 * @access  Private (Broker only)
 */
router.post('/clients/:id/manual-withdrawals', createManualWithdrawal);

/**
 * @route   GET /api/broker/manual-withdrawals
 * @desc    Get manual withdrawal payout entries
 * @access  Private (Broker only)
 */
router.get('/manual-withdrawals', getManualWithdrawals);

/**
 * @route   GET /api/broker/manual-withdrawals/stats
 * @desc    Get manual withdrawal stats
 * @access  Private (Broker only)
 */
router.get('/manual-withdrawals/stats', getManualWithdrawalStats);

/**
 * @route   GET /api/broker/withdrawals/eligibility
 * @desc    Get client withdrawable net cash summary
 * @access  Private (Broker only)
 */
router.get('/withdrawals/eligibility', getWithdrawalEligibility);

export default router;
