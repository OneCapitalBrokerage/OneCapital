// Routes/broker/marginRoutes.js
// Broker Margin Management APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  updateClientMargin,
  getClientMargin,
  getMarginHistory,
} from '../../Controllers/broker/MarginController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   POST /api/broker/margin/update
 * @desc    Update client margin
 * @access  Private (Broker only)
 */
router.post('/margin/update', updateClientMargin);

/**
 * @route   GET /api/broker/clients/:id/margin
 * @desc    Get client margin details
 * @access  Private (Broker only)
 */
router.get('/clients/:id/margin', getClientMargin);

/**
 * @route   GET /api/broker/margin/history
 * @desc    Get margin update history
 * @access  Private (Broker only)
 */
router.get('/margin/history', getMarginHistory);

export default router;
