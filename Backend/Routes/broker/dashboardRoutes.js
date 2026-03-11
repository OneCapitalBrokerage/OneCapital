// Routes/broker/dashboardRoutes.js
// Broker Dashboard and Profile APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getDashboard,
  getProfile,
  getAlerts,
  getActivityFeed,
  getStats,
} from '../../Controllers/broker/DashboardController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/broker/dashboard
 * @desc    Get broker dashboard data
 * @access  Private (Broker only)
 */
router.get('/dashboard', getDashboard);

/**
 * @route   GET /api/broker/profile
 * @desc    Get broker profile
 * @access  Private (Broker only)
 */
router.get('/profile', getProfile);

/**
 * @route   GET /api/broker/alerts
 * @desc    Get broker alerts (margin calls, etc.)
 * @access  Private (Broker only)
 */
router.get('/alerts', getAlerts);

/**
 * @route   GET /api/broker/activity
 * @desc    Get recent activity feed
 * @access  Private (Broker only)
 */
router.get('/activity', getActivityFeed);

/**
 * @route   GET /api/broker/stats
 * @desc    Get broker performance stats
 * @access  Private (Broker only)
 */
router.get('/stats', getStats);

export default router;
