// Controllers/customer/DashboardController.js
// Customer Dashboard - Overview and statistics for trading customer

import asyncHandler from 'express-async-handler';
import FundModel from '../../Model/FundManagement/FundModel.js';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import HoldingModel from '../../Model/Trading/HoldingModel.js';
import PositionsModel from '../../Model/Trading/PositionsModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import BrokerModel from '../../Model/Auth/BrokerModel.js';

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
 * @desc     Get customer dashboard data
 * @route    GET /api/customer/dashboard
 * @access   Private (Customer only)
 */
const getDashboard = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;

  // Get data in parallel
  const [fund, holdings, positions, todayOrders] = await Promise.all([
    FundModel.findOne({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    }),
    HoldingModel.find({ userId: customerId }),
    PositionsModel.find({ userId: customerId }),
    OrderModel.find({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ]);

  // Calculate holdings value
  const holdingsValue = holdings.reduce((sum, h) => {
    return sum + ((h.averagePrice || 0) * (h.quantity || 0));
  }, 0);

  // Calculate positions P&L
  let positionsPnl = 0;
  let unrealizedPnl = 0;
  positions.forEach(p => {
    if (p.realizedPnl) positionsPnl += p.realizedPnl;
    if (p.unrealizedPnl) unrealizedPnl += p.unrealizedPnl;
  });

  // Calculate today's P&L from closed orders
  const closedOrders = todayOrders.filter(
    (o) => String(o.status || o.order_status || '').toUpperCase() === 'CLOSED'
  );
  const todayPnl = closedOrders.reduce((sum, o) => sum + computeClosedNetPnl(o), 0);

  res.status(200).json({
    success: true,
    data: {
      funds: {
        balance: (fund?.net_available_balance || 0) + (fund?.pnl_balance || 0),
        intradayLimit: fund?.intraday?.available_limit || 0,
        intradayUsed: fund?.intraday?.used_limit || 0,
        intradayFree: (fund?.intraday?.available_limit || 0) - (fund?.intraday?.used_limit || 0),
        overnightLimit: fund?.overnight?.available_limit || 0,
      },
      holdings: {
        count: holdings.length,
        value: holdingsValue,
      },
      positions: {
        count: positions.length,
        realizedPnl: positionsPnl,
        unrealizedPnl,
      },
      today: {
        orders: todayOrders.length,
        trades: closedOrders.length,
        pnl: todayPnl,
      },
      lastUpdated: new Date(),
    },
  });
});

/**
 * @desc     Get customer profile
 * @route    GET /api/customer/profile
 * @access   Private (Customer only)
 */
const getProfile = asyncHandler(async (req, res) => {
  const customer = req.user;

  let brokerSupportContact = '';
  if (customer.broker_id) {
    const broker = await BrokerModel.findById(customer.broker_id)
      .select('support_contact')
      .lean();
    brokerSupportContact = broker?.support_contact || '';
  }

  res.status(200).json({
    success: true,
    profile: {
      id: customer.customer_id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      panNumber: customer.pan_number,
      dateOfBirth: customer.date_of_birth,
      gender: customer.gender,
      profilePhoto: customer.avatar,
      status: customer.status || 'active',
      kycStatus: customer.kyc_status || 'pending',
      tradingEnabled: customer.trading_enabled,
      holdingsExitAllowed: customer.holdings_exit_allowed,
      dealerMode: customer.dealer_mode || false,
      dealerModeReason: customer.dealer_mode_reason || null,
      segmentsAllowed: customer.segments_allowed || [],
      isImpersonation: !!req.user?.isImpersonation,
      impersonatorRole: req.user?.impersonatorRole || null,
      createdAt: customer.createdAt,
      lastLogin: customer.last_login,
      brokerSupportContact,
    },
  });
});

/**
 * @desc     Update customer profile
 * @route    PUT /api/customer/profile
 * @access   Private (Customer only)
 */
const updateProfile = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const { name, email, phone, profilePhoto } = req.body;

  // Identity fields are KYC-locked and cannot be changed via this endpoint
  if (name || email || phone) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, and phone cannot be changed here. Use the dedicated settings flow.',
    });
  }

  const customer = await CustomerModel.findById(customerId);

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Customer not found.',
    });
  }

  if (profilePhoto) customer.avatar = profilePhoto;

  await customer.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    profile: {
      id: customer.customer_id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      profilePhoto: customer.avatar,
    },
  });
});

/**
 * @desc     Get customer account summary
 * @route    GET /api/customer/account-summary
 * @access   Private (Customer only)
 */
const getAccountSummary = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;

  // Get comprehensive account data
  const [customer, fund, holdings, positions, allOrders] = await Promise.all([
    CustomerModel.findById(customerId),
    FundModel.findOne({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    }),
    HoldingModel.find({ userId: customerId }),
    PositionsModel.find({ userId: customerId }),
    OrderModel.find({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    }).sort({ createdAt: -1 }).limit(100),
  ]);

  // Calculate portfolio value
  const holdingsValue = holdings.reduce((sum, h) => {
    return sum + ((h.currentPrice || h.averagePrice || 0) * (h.quantity || 0));
  }, 0);

  // Calculate investment
  const investedValue = holdings.reduce((sum, h) => {
    return sum + ((h.averagePrice || 0) * (h.quantity || 0));
  }, 0);

  // Calculate P&L
  const holdingsPnl = holdingsValue - investedValue;

  // Trading stats
  const totalTrades = allOrders.filter(o => o.order_status === 'CLOSED').length;
  const buyOrders = allOrders.filter(o => o.side === 'BUY').length;
  const sellOrders = allOrders.filter(o => o.side === 'SELL').length;

  res.status(200).json({
    success: true,
    summary: {
      account: {
        id: customer.customer_id,
        name: customer.name,
        status: customer.status,
      },
      funds: {
        balance: (fund?.net_available_balance || 0) + (fund?.pnl_balance || 0),
        marginAvailable: (fund?.intraday?.available_limit || 0) - (fund?.intraday?.used_limit || 0),
        marginUsed: fund?.intraday?.used_limit || 0,
      },
      portfolio: {
        currentValue: holdingsValue,
        investedValue,
        pnl: holdingsPnl,
        pnlPercentage: investedValue > 0 ? ((holdingsPnl / investedValue) * 100).toFixed(2) : 0,
      },
      holdings: {
        count: holdings.length,
        stocks: holdings.map(h => ({
          symbol: h.tradingSymbol || h.symbol,
          quantity: h.quantity,
          avgPrice: h.averagePrice,
          currentPrice: h.currentPrice || h.averagePrice,
        })),
      },
      positions: {
        open: positions.length,
      },
      trading: {
        totalTrades,
        buyOrders,
        sellOrders,
      },
    },
  });
});

export {
  getDashboard,
  getProfile,
  updateProfile,
  getAccountSummary,
};
