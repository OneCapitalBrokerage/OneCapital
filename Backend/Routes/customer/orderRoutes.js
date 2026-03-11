// Routes/customer/orderRoutes.js
// Customer Orders APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireTrading } from '../../Middleware/restrictionMiddleware.js';
import {
  placeOrder,
  getOrders,
  modifyOrder,
  cancelOrder,
} from '../../Controllers/customer/TradingController.js';
import { postOrder as legacyPostOrder } from '../../Controllers/legacy/orderController.js';
import {
  getOrderHistory,
  getTodayOrders,
  getCancelledOrders,
  getTradeBook,
  getPnlReport,
} from '../../Controllers/customer/OrderHistoryController.js';
import { getOrderBook } from '../../Controllers/customer/OrderBookController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/customer/orders
 * @desc    Get all orders
 * @access  Private (Customer only)
 */
router.get('/orders', getOrders);

/**
 * @route   POST /api/customer/orders
 * @desc    Place new order
 * @access  Private (Customer only)
 */
router.post('/orders', requireTrading, placeOrder);

/**
 * @route   POST /api/customer/postOrder
 * @desc    Place order via legacy pipeline
 * @access  Private (Customer only)
 */
router.post('/postOrder', requireTrading, (req, res, next) => {
  req.body = {
    ...req.body,
    broker_id_str: req.user.stringBrokerId || req.user.broker_id_str || req.user.attached_broker_id?.toString(),
    customer_id_str: req.user.customer_id,
    broker_id: req.user.mongoBrokerId || req.user.broker_id,
    customer_id: req.user._id,
  };
  return legacyPostOrder(req, res, next);
});

/**
 * @route   GET /api/customer/orders/today
 * @desc    Get today's orders
 * @access  Private (Customer only)
 */
router.get('/orders/today', getTodayOrders);

/**
 * @route   GET /api/customer/orders/history
 * @desc    Get order history with pagination
 * @access  Private (Customer only)
 */
router.get('/orders/history', getOrderHistory);

/**
 * @route   GET /api/customer/orders/cancelled
 * @desc    Get cancelled orders
 * @access  Private (Customer only)
 */
router.get('/orders/cancelled', getCancelledOrders);

/**
 * @route   GET /api/customer/order-book
 * @desc    Get order book (section + bucket)
 * @access  Private (Customer only)
 */
router.get('/order-book', getOrderBook);

/**
 * @route   GET /api/customer/trades
 * @desc    Get trade book (executed trades)
 * @access  Private (Customer only)
 */
router.get('/trades', getTradeBook);

/**
 * @route   GET /api/customer/pnl
 * @desc    Get P&L report
 * @access  Private (Customer only)
 */
router.get('/pnl', getPnlReport);

/**
 * @route   PUT /api/customer/orders/:id
 * @desc    Modify order
 * @access  Private (Customer only)
 */
router.put('/orders/:id', requireTrading, modifyOrder);

/**
 * @route   DELETE /api/customer/orders/:id
 * @desc    Cancel order
 * @access  Private (Customer only)
 */
router.delete('/orders/:id', requireTrading, cancelOrder);

export default router;
