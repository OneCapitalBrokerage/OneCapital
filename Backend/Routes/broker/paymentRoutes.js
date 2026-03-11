// Routes/broker/paymentRoutes.js
// Broker Payment Verification APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getPayments,
  verifyPayment,
  rejectPayment,
  deletePayment,
  getPaymentProof,
  getPaymentStats,
  getPaymentHistory,
} from '../../Controllers/broker/PaymentController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/broker/payments
 * @desc    Get payment requests by status
 * @access  Private (Broker only)
 */
router.get('/payments', getPayments);

/**
 * @route   POST /api/broker/payments/:id/verify
 * @desc    Verify and add funds
 * @access  Private (Broker only)
 */
router.post('/payments/:id/verify', verifyPayment);

/**
 * @route   POST /api/broker/payments/:id/reject
 * @desc    Reject payment
 * @access  Private (Broker only)
 */
router.post('/payments/:id/reject', rejectPayment);

/**
 * @route   DELETE /api/broker/payments/:id
 * @desc    Delete payment request
 * @access  Private (Broker only)
 */
router.delete('/payments/:id', deletePayment);

/**
 * @route   GET /api/broker/payments/:id/proof
 * @desc    Get payment proof image
 * @access  Private (Broker only)
 */
router.get('/payments/:id/proof', getPaymentProof);

/**
 * @route   GET /api/broker/payments/stats
 * @desc    Get payment verification stats
 * @access  Private (Broker only)
 */
router.get('/payments/stats', getPaymentStats);

/**
 * @route   GET /api/broker/payments/history
 * @desc    Get past payment approvals
 * @access  Private (Broker only)
 */
router.get('/payments/history', getPaymentHistory);

export default router;
