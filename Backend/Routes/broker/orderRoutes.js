// Routes/broker/orderRoutes.js
// Broker CNC Order Approval APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getCncOrders,
  approveCncOrder,
  rejectCncOrder,
  getCncStats,
} from '../../Controllers/broker/OrderController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/broker/orders/cnc
 * @desc    Get pending CNC orders
 * @access  Private (Broker only)
 */
router.get('/orders/cnc', getCncOrders);

/**
 * @route   POST /api/broker/orders/cnc/:id/approve
 * @desc    Approve CNC order
 * @access  Private (Broker only)
 */
router.post('/orders/cnc/:id/approve', approveCncOrder);

/**
 * @route   POST /api/broker/orders/cnc/:id/reject
 * @desc    Reject CNC order
 * @access  Private (Broker only)
 */
router.post('/orders/cnc/:id/reject', rejectCncOrder);

/**
 * @route   GET /api/broker/orders/cnc/stats
 * @desc    Get CNC order stats
 * @access  Private (Broker only)
 */
router.get('/orders/cnc/stats', getCncStats);

export default router;
