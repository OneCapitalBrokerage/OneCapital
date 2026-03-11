// Routes/customer/dashboardRoutes.js
// Customer Dashboard APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getDashboard,
  getProfile,
  updateProfile,
  getAccountSummary,
} from '../../Controllers/customer/DashboardController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/customer/dashboard
 * @desc    Get customer dashboard data
 * @access  Private (Customer only)
 */
router.get('/dashboard', getDashboard);

/**
 * @route   GET /api/customer/profile
 * @desc    Get customer profile
 * @access  Private (Customer only)
 */
router.get('/profile', getProfile);

/**
 * @route   PUT /api/customer/profile
 * @desc    Update customer profile
 * @access  Private (Customer only)
 */
router.put('/profile', updateProfile);

/**
 * @route   GET /api/customer/account/summary
 * @desc    Get account summary (charges, fees, ledger)
 * @access  Private (Customer only)
 */
router.get('/account/summary', getAccountSummary);

export default router;
