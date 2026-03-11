// Routes/customer/portfolioRoutes.js
// Customer Portfolio APIs (Holdings & Positions)

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getHoldings,
  getPositions,
} from '../../Controllers/customer/TradingController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/customer/portfolio/holdings
 * @desc    Get customer's holdings (delivery/CNC)
 * @access  Private (Customer only)
 */
router.get('/portfolio/holdings', getHoldings);

/**
 * @route   GET /api/customer/portfolio/positions
 * @desc    Get customer's positions (intraday)
 * @access  Private (Customer only)
 */
router.get('/portfolio/positions', getPositions);

export default router;
