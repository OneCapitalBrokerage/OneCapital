// Controllers/admin/DashboardController.js
// Admin Dashboard - Platform-wide statistics and monitoring

import asyncHandler from 'express-async-handler';
import BrokerModel from '../../Model/Auth/BrokerModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import RegistrationModel from '../../Model/RegistrationModel.js';

/**
 * @desc     Get admin dashboard data
 * @route    GET /api/admin/dashboard
 * @access   Private (Admin only)
 */
const getDashboard = asyncHandler(async (req, res) => {
  // Get counts in parallel
  const [
    totalBrokers,
    activeBrokers,
    totalCustomers,
    activeCustomers,
    pendingKyc,
    todayOrders,
  ] = await Promise.all([
    BrokerModel.countDocuments(),
    BrokerModel.countDocuments({ status: 'active' }),
    CustomerModel.countDocuments(),
    CustomerModel.countDocuments({ status: 'active' }),
    RegistrationModel.countDocuments({ status: 'pending' }),
    OrderModel.countDocuments({ 
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } 
    }),
  ]);

  // Calculate total AUM (Assets Under Management)
  const aumResult = await FundModel.aggregate([
    {
      $group: {
        _id: null,
        totalAum: { $sum: { $add: [{ $ifNull: ['$net_available_balance', 0] }, { $ifNull: ['$pnl_balance', 0] }] } },
        totalIntradayLimit: { $sum: '$intraday.available_limit' },
        totalOvernightLimit: { $sum: '$overnight.available_limit' },
      }
    }
  ]);

  const aum = aumResult[0] || { totalAum: 0, totalIntradayLimit: 0, totalOvernightLimit: 0 };

  res.status(200).json({
    success: true,
    data: {
      brokers: {
        total: totalBrokers,
        active: activeBrokers,
        inactive: totalBrokers - activeBrokers,
      },
      customers: {
        total: totalCustomers,
        active: activeCustomers,
        inactive: totalCustomers - activeCustomers,
      },
      kyc: {
        pending: pendingKyc,
      },
      trading: {
        todayOrders: todayOrders,
      },
      financials: {
        totalAum: aum.totalAum,
        totalIntradayLimit: aum.totalIntradayLimit,
        totalOvernightLimit: aum.totalOvernightLimit,
      },
      lastUpdated: new Date(),
    },
  });
});

/**
 * @desc     Get platform statistics
 * @route    GET /api/admin/stats
 * @access   Private (Admin only)
 */
const getStats = asyncHandler(async (req, res) => {
  const { period = '7d' } = req.query;

  // Calculate date range
  let startDate = new Date();
  switch (period) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  // Get stats for period
  const [
    newBrokers,
    newCustomers,
    ordersInPeriod,
    kycApprovedInPeriod,
  ] = await Promise.all([
    BrokerModel.countDocuments({ createdAt: { $gte: startDate } }),
    CustomerModel.countDocuments({ createdAt: { $gte: startDate } }),
    OrderModel.countDocuments({ createdAt: { $gte: startDate } }),
    RegistrationModel.countDocuments({ 
      status: 'approved',
      reviewedAt: { $gte: startDate } 
    }),
  ]);

  // Daily breakdown for charts
  const dailyOrders = await OrderModel.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        volume: { $sum: { $multiply: ['$price', '$quantity'] } },
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const dailySignups = await CustomerModel.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      period,
      summary: {
        newBrokers,
        newCustomers,
        ordersInPeriod,
        kycApprovedInPeriod,
      },
      charts: {
        dailyOrders,
        dailySignups,
      },
    },
  });
});

/**
 * @desc     Get pending action items for admin
 * @route    GET /api/admin/action-items
 * @access   Private (Admin only)
 */
const getActionItems = asyncHandler(async (req, res) => {
  // Get counts of pending items
  const [
    pendingKyc,
    blockedBrokers,
    blockedCustomers,
  ] = await Promise.all([
    RegistrationModel.countDocuments({ status: 'pending' }),
    BrokerModel.countDocuments({ status: 'blocked' }),
    CustomerModel.countDocuments({ status: 'blocked' }),
  ]);

  // Get recent pending KYC requests
  const recentPendingKyc = await RegistrationModel
    .find({ status: 'pending' })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('firstName lastName email createdAt');

  res.status(200).json({
    success: true,
    data: {
      counts: {
        pendingKyc,
        blockedBrokers,
        blockedCustomers,
        total: pendingKyc + blockedBrokers + blockedCustomers,
      },
      recentPendingKyc: recentPendingKyc.map(kyc => ({
        id: kyc._id,
        name: `${kyc.firstName} ${kyc.lastName}`,
        email: kyc.email,
        submittedAt: kyc.createdAt,
      })),
    },
  });
});

/**
 * @desc     Get recent activity feed
 * @route    GET /api/admin/activity
 * @access   Private (Admin only)
 */
const getActivityFeed = asyncHandler(async (req, res) => {
  const { limit = 20, page = 1 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Get recent activities from multiple sources
  const [recentOrders, recentKyc, recentCustomers, recentBrokers] = await Promise.all([
    OrderModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('symbol side quantity price order_status customer_id_str createdAt'),
    RegistrationModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('firstName lastName status createdAt'),
    CustomerModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('customer_id name createdAt'),
    BrokerModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('broker_id name createdAt'),
  ]);

  // Combine and format activities
  const activities = [];

  recentOrders.forEach(order => {
    activities.push({
      type: 'order',
      message: `Order ${order.side} ${order.quantity} ${order.symbol} @ ${order.price}`,
      status: order.order_status,
      user: order.customer_id_str,
      timestamp: order.createdAt,
    });
  });

  recentKyc.forEach(kyc => {
    activities.push({
      type: 'kyc',
      message: `KYC submission from ${kyc.firstName} ${kyc.lastName}`,
      status: kyc.status,
      timestamp: kyc.createdAt,
    });
  });

  recentCustomers.forEach(customer => {
    activities.push({
      type: 'customer',
      message: `New customer registered: ${customer.name}`,
      user: customer.customer_id,
      timestamp: customer.createdAt,
    });
  });

  recentBrokers.forEach(broker => {
    activities.push({
      type: 'broker',
      message: `New broker registered: ${broker.name}`,
      user: broker.broker_id,
      timestamp: broker.createdAt,
    });
  });

  // Sort by timestamp
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Paginate
  const paginatedActivities = activities.slice(skip, skip + parseInt(limit));

  res.status(200).json({
    success: true,
    data: paginatedActivities,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: activities.length,
    },
  });
});

export {
  getDashboard,
  getStats,
  getActionItems,
  getActivityFeed,
};
