// Routes/customer/fundRoutes.js
// Customer Fund Management APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getBalance,
  requestAddFunds,
  submitAddFundsProof,
  requestWithdraw,
  getFundHistory,
  getPaymentInfo,
  getAddFundRequests,
  getWithdrawalRequests,
  getFundsUploadSignature,
} from '../../Controllers/customer/FundController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/customer/funds
 * @desc    Get fund balance
 * @access  Private (Customer only)
 */
router.get('/funds', getBalance);

/**
 * @route   GET /api/customer/funds/transactions
 * @desc    Get fund transaction history
 * @access  Private (Customer only)
 */
router.get('/funds/transactions', getFundHistory);

/**
 * @route   POST /api/customer/funds/add
 * @desc    Request to add funds (submit payment)
 * @access  Private (Customer only)
 */
router.post('/funds/add', requestAddFunds);

/**
 * @route   POST /api/customer/funds/add/:id/proof
 * @desc    Submit add-funds payment proof (image)
 * @access  Private (Customer only)
 */
router.post('/funds/add/:id/proof', submitAddFundsProof);

/**
 * @route   POST /api/customer/funds/withdraw
 * @desc    Request withdrawal
 * @access  Private (Customer only)
 */
router.post('/funds/withdraw', requestWithdraw);

/**
 * @route   GET /api/customer/funds/payments
 * @desc    Get add-funds request records
 * @access  Private (Customer only)
 */
router.get('/funds/payments', getAddFundRequests);

/**
 * @route   GET /api/customer/funds/withdrawals
 * @desc    Get withdrawal request records
 * @access  Private (Customer only)
 */
router.get('/funds/withdrawals', getWithdrawalRequests);

/**
 * @route   GET /api/customer/funds/payment-info
 * @desc    Get broker payment info (UPI ID, etc.)
 * @access  Private (Customer only)
 */
router.get('/funds/payment-info', getPaymentInfo);

/**
 * @route   GET /api/customer/funds/upload-signature
 * @desc    Get Cloudinary upload signature for payment proof image
 * @access  Private (Customer only)
 */
router.get('/funds/upload-signature', getFundsUploadSignature);

export default router;
