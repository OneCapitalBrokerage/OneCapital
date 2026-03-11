// Controllers/customer/OrderHistoryController.js
// Customer Order History - Historical orders and trade history

import asyncHandler from 'express-async-handler';
import OrderModel from '../../Model/Trading/OrdersModel.js';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const computeClosedNetPnl = (order) => {
  const stored = Number(order.realized_pnl);
  const canTrustStored =
    String(order.settlement_status || '').toLowerCase() === 'settled' ||
    !!order.brokerage_breakdown ||
    Number.isFinite(Number(order.effective_exit_price)) ||
    Number.isFinite(Number(order.raw_exit_price));
  if (canTrustStored && Number.isFinite(stored)) return stored;

  const side = String(order.side || '').toUpperCase();
  const qty = toNumber(order.quantity);
  const entry = toNumber(order.effective_entry_price || order.price);
  const exit = toNumber(order.effective_exit_price || order.closed_ltp || order.exit_price);
  const brokerage = toNumber(order.brokerage);
  const gross = side === 'SELL' ? (entry - exit) * qty : (exit - entry) * qty;
  return gross - brokerage;
};

/**
 * @desc     Get order history
 * @route    GET /api/customer/orders/history
 * @access   Private (Customer only)
 */
const getOrderHistory = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const { 
    page = 1, 
    limit = 50, 
    startDate, 
    endDate,
    symbol,
    side,
    status,
  } = req.query;

  const query = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  };

  // Date filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  // Symbol filter
  if (symbol) {
    query.symbol = { $regex: symbol, $options: 'i' };
  }

  // Side filter
  if (side && side !== 'all') {
    query.side = side.toUpperCase();
  }

  // Status filter
  if (status && status !== 'all') {
    query.status = status.toUpperCase();
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    OrderModel.countDocuments(query),
  ]);

  const formattedOrders = orders.map(o => ({
    id: o._id,
    orderId: o.order_id,
    symbol: o.symbol,
    exchange: o.exchange,
    side: o.side,
    quantity: o.quantity,
    price: o.price,
    orderType: o.order_type,
    product: o.product,
    status: o.status || o.order_status,
    placedAt: o.placed_at,
    closedAt: o.closed_at,
    closedLtp: o.closed_ltp,
    rawEntryPrice: o.raw_entry_price,
    effectiveEntryPrice: o.effective_entry_price || o.price,
    rawExitPrice: o.raw_exit_price,
    effectiveExitPrice: o.effective_exit_price || o.closed_ltp || o.exit_price,
    brokerage: o.brokerage || 0,
    pnl: String(o.status || o.order_status).toUpperCase() === 'CLOSED'
      ? computeClosedNetPnl(o)
      : null,
  }));

  res.status(200).json({
    success: true,
    orders: formattedOrders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Get today's orders
 * @route    GET /api/customer/orders/today
 * @access   Private (Customer only)
 */
const getTodayOrders = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orders = await OrderModel.find({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    createdAt: { $gte: today },
  }).sort({ createdAt: -1 });

  const summary = {
    total: orders.length,
    open: orders.filter(o => (o.status || o.order_status) === 'OPEN').length,
    closed: orders.filter(o => (o.status || o.order_status) === 'CLOSED').length,
    cancelled: orders.filter(o => (o.status || o.order_status) === 'CANCELLED').length,
    rejected: orders.filter(o => (o.status || o.order_status) === 'REJECTED').length,
  };

  res.status(200).json({
    success: true,
    orders: orders.map(o => ({
      id: o._id,
      orderId: o.order_id,
      symbol: o.symbol,
      side: o.side,
      quantity: o.quantity,
      price: o.price,
      status: o.status || o.order_status,
      placedAt: o.placed_at,
    })),
    summary,
  });
});

/**
 * @desc     Get cancelled orders
 * @route    GET /api/customer/orders/cancelled
 * @access   Private (Customer only)
 */
const getCancelledOrders = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const { page = 1, limit = 50 } = req.query;

  const query = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    status: 'CANCELLED',
  };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ cancelled_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    OrderModel.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    orders: orders.map(o => ({
      id: o._id,
      orderId: o.order_id,
      symbol: o.symbol,
      side: o.side,
      quantity: o.quantity,
      price: o.price,
      placedAt: o.placed_at,
      cancelledAt: o.cancelled_at,
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Get trade book (executed trades)
 * @route    GET /api/customer/trades
 * @access   Private (Customer only)
 */
const getTradeBook = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const { page = 1, limit = 50, date } = req.query;

  const query = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    status: 'CLOSED',
  };

  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    query.closed_at = { $gte: start, $lte: end };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [trades, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ closed_at: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    OrderModel.countDocuments(query),
  ]);

  // Calculate totals
  let totalPnl = 0;
  let totalBuyValue = 0;
  let totalSellValue = 0;

  const formattedTrades = trades.map(t => {
    const pnl = computeClosedNetPnl(t);
    const entryPrice = toNumber(t.effective_entry_price || t.price);
    const exitPrice = toNumber(t.effective_exit_price || t.closed_ltp || t.exit_price);
    
    totalPnl += pnl;
    if (t.side === 'BUY') totalBuyValue += entryPrice * t.quantity;
    else totalSellValue += entryPrice * t.quantity;

    return {
      id: t._id,
      orderId: t.order_id,
      symbol: t.symbol,
      exchange: t.exchange,
      side: t.side,
      quantity: t.quantity,
      entryPrice,
      exitPrice,
      brokerage: toNumber(t.brokerage),
      pnl,
      executedAt: t.closed_at,
    };
  });

  res.status(200).json({
    success: true,
    trades: formattedTrades,
    summary: {
      totalTrades: total,
      totalPnl,
      totalBuyValue,
      totalSellValue,
    },
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Get P&L report
 * @route    GET /api/customer/pnl
 * @access   Private (Customer only)
 */
const getPnlReport = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const { startDate, endDate, groupBy = 'day' } = req.query;

  const query = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    status: 'CLOSED',
  };

  if (startDate || endDate) {
    query.closed_at = {};
    if (startDate) query.closed_at.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.closed_at.$lte = end;
    }
  }

  const trades = await OrderModel.find(query).sort({ closed_at: 1 });

  // Calculate daily P&L
  const dailyPnl = {};
  let totalPnl = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  trades.forEach(t => {
    const pnl = computeClosedNetPnl(t);
    
    totalPnl += pnl;
    if (pnl > 0) winningTrades++;
    else if (pnl < 0) losingTrades++;

    const dateKey = t.closed_at?.toISOString().split('T')[0] || 'unknown';
    if (!dailyPnl[dateKey]) {
      dailyPnl[dateKey] = { pnl: 0, trades: 0 };
    }
    dailyPnl[dateKey].pnl += pnl;
    dailyPnl[dateKey].trades++;
  });

  // Convert to array
  const pnlByDate = Object.entries(dailyPnl).map(([date, data]) => ({
    date,
    pnl: data.pnl,
    trades: data.trades,
  }));

  res.status(200).json({
    success: true,
    report: {
      summary: {
        totalPnl,
        totalTrades: trades.length,
        winningTrades,
        losingTrades,
        winRate: trades.length > 0 
          ? ((winningTrades / trades.length) * 100).toFixed(2)
          : 0,
      },
      byDate: pnlByDate,
    },
  });
});

export {
  getOrderHistory,
  getTodayOrders,
  getCancelledOrders,
  getTradeBook,
  getPnlReport,
};
