// Routes/customer/watchlistRoutes.js
// Customer Watchlist APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getWatchlist,
  updateWatchlist,
} from '../../Controllers/customer/TradingController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/customer/watchlist
 * @desc    Get user's watchlist
 * @access  Private (Customer only)
 */
router.get('/watchlist', getWatchlist);

/**
 * @route   POST /api/customer/watchlist
 * @desc    Add stock to watchlist
 * @access  Private (Customer only)
 */
router.post('/watchlist', updateWatchlist);

/**
 * @route   PUT /api/customer/watchlist
 * @desc    Update watchlist (reorder, etc.)
 * @access  Private (Customer only)
 */
router.put('/watchlist', updateWatchlist);

/**
 * @route   DELETE /api/customer/watchlist/list/:name
 * @desc    Delete a watchlist by name
 * @access  Private (Customer only)
 */
router.delete('/watchlist/list/:name', (req, res, next) => {
  req.body = req.body || {};
  req.body.action = 'delete_list';
  req.body.name = decodeURIComponent(req.params.name);
  updateWatchlist(req, res, next);
});

/**
 * @route   DELETE /api/customer/watchlist/:symbol
 * @desc    Remove stock from watchlist
 * @access  Private (Customer only)
 */
router.delete('/watchlist/:symbol', (req, res, next) => {
  // Inject symbol into body for updateWatchlist handler
  req.body = req.body || {};
  req.body.action = 'remove';
  req.body.symbol = decodeURIComponent(req.params.symbol);
  if (req.query.instrumentToken) {
    req.body.instrumentToken = String(req.query.instrumentToken);
  }
  if (req.query.segment) {
    req.body.segment = String(req.query.segment);
  }
  if (req.query.exchange) {
    req.body.exchange = String(req.query.exchange);
  }
  if (req.query.listName) {
    req.body.listName = req.query.listName;
  }
  updateWatchlist(req, res, next);
});

export default router;
