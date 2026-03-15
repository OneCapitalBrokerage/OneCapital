// Controllers/broker/DashboardController.js
// Broker Dashboard - Statistics and overview for broker panel

import asyncHandler from 'express-async-handler';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import PaymentProofModel from '../../Model/FundManagement/PaymentProofModel.js';
import RegistrationModel from '../../Model/RegistrationModel.js';
import CustomerKYCModel from '../../Model/KYC/CustomerKYCModel.js';
import WithdrawalRequestModel from '../../Model/FundManagement/WithdrawalRequestModel.js';

const getBrokerCustomerClauses = (brokerId, brokerIdStr) => {
  const clauses = [{ broker_id: brokerId }, { attached_broker_id: brokerId }];
  if (brokerIdStr) {
    clauses.push({ broker_id_str: brokerIdStr });
  }
  return clauses;
};

const getBrokerOrderClauses = (brokerId, brokerIdStr) => {
  const clauses = [{ broker_id: brokerId }];
  if (brokerIdStr) {
    clauses.push({ broker_id_str: brokerIdStr });
  }
  return clauses;
};

const getPendingApprovalsSummary = async ({ brokerIdStr }) => {
  if (!brokerIdStr) {
    return {
      registrationPending: 0,
      kycPending: 0,
      cncPending: 0,
      withdrawalPending: 0,
      paymentPending: 0,
      totalPending: 0,
    };
  }

  const [brokerCustomers, registrationPending, cncPending, withdrawalPending, paymentPending] = await Promise.all([
    CustomerModel.find({ broker_id_str: brokerIdStr }).select('_id').lean(),
    RegistrationModel.countDocuments({
      broker_id_str: brokerIdStr,
      status: { $in: ['pending', 'under_review'] },
    }),
    OrderModel.countDocuments({
      broker_id_str: brokerIdStr,
      product: { $in: ['NRML', 'CNC'] },
      requires_approval: true,
      approval_status: 'pending',
    }),
    WithdrawalRequestModel.countDocuments({
      broker_id_str: brokerIdStr,
      status: { $in: ['pending', 'processing'] },
    }),
    PaymentProofModel.countDocuments({
      broker_id_str: brokerIdStr,
      status: { $in: ['pending', 'pending_proof'] },
    }),
  ]);

  const customerIds = brokerCustomers.map((customer) => customer._id);
  const kycPending = customerIds.length > 0
    ? await CustomerKYCModel.countDocuments({
      customer_id: { $in: customerIds },
      $or: [
        { 'aadhaar.status': 'pending' },
        { 'pan.status': 'pending' },
        { 'bank_proof.status': 'pending' },
      ],
    })
    : 0;

  const totalPending = registrationPending + cncPending + withdrawalPending + paymentPending + kycPending;

  return {
    registrationPending,
    kycPending,
    cncPending,
    withdrawalPending,
    paymentPending,
    totalPending,
  };
};

/**
 * @desc     Get broker dashboard data
 * @route    GET /api/broker/dashboard
 * @access   Private (Broker only)
 */
const getDashboard = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const customerScope = getBrokerCustomerClauses(brokerId, brokerIdStr);
  const orderScope = getBrokerOrderClauses(brokerId, brokerIdStr);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const activeOrderStatuses = ['PENDING', 'OPEN', 'EXECUTED', 'PARTIALLY_FILLED', 'HOLD'];
  const terminalOrderStatuses = ['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

  // Get counts in parallel
  const [
    totalClients,
    activeClients,
    todayOrders,
    openOrders,
    pendingApprovals,
  ] = await Promise.all([
    CustomerModel.countDocuments({ $or: customerScope }),
    CustomerModel.countDocuments({
      $and: [{ $or: customerScope }, { status: 'active' }],
    }),
    OrderModel.countDocuments({
      $and: [{ $or: orderScope }, { createdAt: { $gte: dayStart } }],
    }),
    OrderModel.countDocuments({
      $and: [
        { $or: orderScope },
        {
          $or: [
            { status: { $in: activeOrderStatuses } },
            { order_status: { $in: [...activeOrderStatuses, null] } },
          ],
        },
        {
          $nor: [
            { status: { $in: terminalOrderStatuses } },
            { order_status: { $in: terminalOrderStatuses } },
          ],
        },
      ],
    }),
    getPendingApprovalsSummary({ brokerIdStr }),
  ]);

  // AUM on broker dashboard should reflect deposited cash only (exclude P&L).
  const depositedCashExpr = { $ifNull: ['$net_available_balance', { $ifNull: ['$available_balance', 0] }] };

  const aumResult = await FundModel.aggregate([
    { $match: { broker_id_str: brokerIdStr } },
    {
      $group: {
        _id: null,
        totalAum: { $sum: depositedCashExpr },
        totalIntradayLimit: { $sum: '$intraday.available_limit' },
        totalIntradayUsed: { $sum: '$intraday.used_limit' },
        totalOvernightLimit: { $sum: '$overnight.available_limit' },
      }
    }
  ]);

  const aum = aumResult[0] || { 
    totalAum: 0, 
    totalIntradayLimit: 0, 
    totalIntradayUsed: 0,
    totalOvernightLimit: 0 
  };

  res.status(200).json({
    success: true,
    data: {
      clients: {
        total: totalClients,
        active: activeClients,
        inactive: totalClients - activeClients,
      },
      trading: {
        todayOrders,
        openOrders,
      },
      kyc: {
        pending: pendingApprovals.registrationPending,
        totalPendingActions: pendingApprovals.totalPending,
      },
      approvals: pendingApprovals,
      financials: {
        totalAum: aum.totalAum,
        totalIntradayLimit: aum.totalIntradayLimit,
        totalIntradayUsed: aum.totalIntradayUsed,
        totalOvernightLimit: aum.totalOvernightLimit,
        marginUtilization: aum.totalIntradayLimit > 0 
          ? Math.round((aum.totalIntradayUsed / aum.totalIntradayLimit) * 100) 
          : 0,
      },
      lastUpdated: new Date(),
    },
  });
});

/**
 * @desc     Get broker profile
 * @route    GET /api/broker/profile
 * @access   Private (Broker only)
 */
const getProfile = asyncHandler(async (req, res) => {
  const broker = req.user;

  res.status(200).json({
    success: true,
    profile: {
      id: broker.login_id,
      name: broker.name,
      ownerName: broker.owner_name,
      email: broker.email,
      phone: broker.phone,
      companyName: broker.company_name,
      registrationNumber: broker.registration_number,
      gstNumber: broker.gst_number,
      supportContact: broker.support_contact,
      supportEmail: broker.support_email,
      upiId: broker.upi_id,
      paymentQrUrl: broker.payment_qr_url,
      paymentQrPublicId: broker.payment_qr_public_id,
      paymentQrSettings: {
        scale: broker.payment_qr_settings?.scale ?? 1,
        offsetX: broker.payment_qr_settings?.offset_x ?? 0,
        offsetY: broker.payment_qr_settings?.offset_y ?? 0,
        padding: broker.payment_qr_settings?.padding ?? 8,
      },
      bankTransferDetails: {
        bankName: broker.bank_transfer_details?.bank_name || '',
        accountHolderName: broker.bank_transfer_details?.account_holder_name || '',
        accountNumber: broker.bank_transfer_details?.account_number || '',
        ifscCode: broker.bank_transfer_details?.ifsc_code || '',
        accountType: broker.bank_transfer_details?.account_type || 'current',
      },
      address: broker.address,
      status: broker.status,
      kycVerified: broker.kyc_verified,
      referenceCode: broker.reference_code || null,
      settings: broker.settings,
      createdAt: broker.createdAt,
      lastLogin: broker.last_login,
    },
  });
});

/**
 * @desc     Get broker alerts
 * @route    GET /api/broker/alerts
 * @access   Private (Broker only)
 */
const getAlerts = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const customerScope = getBrokerCustomerClauses(brokerId, brokerIdStr);

  const alerts = [];

  // Check for clients with high margin usage
  const highMarginClients = await FundModel.aggregate([
    { $match: { broker_id_str: brokerIdStr } },
    {
      $project: {
        customer_id_str: 1,
        usage: {
          $cond: [
            { $gt: ['$intraday.available_limit', 0] },
            { $divide: ['$intraday.used_limit', '$intraday.available_limit'] },
            0
          ]
        }
      }
    },
    { $match: { usage: { $gte: 0.8 } } }, // 80%+ usage
    { $limit: 10 }
  ]);

  // Batch-lookup names for high-margin clients
  const marginClientIds = highMarginClients.map(c => c.customer_id_str).filter(Boolean);
  const marginNameMap = {};
  if (marginClientIds.length > 0) {
    const marginCustomers = await CustomerModel.find({ customer_id: { $in: marginClientIds } })
      .select('customer_id name')
      .lean();
    marginCustomers.forEach(c => { marginNameMap[c.customer_id] = c.name; });
  }

  highMarginClients.forEach(client => {
    const name = marginNameMap[client.customer_id_str];
    const clientLabel = name ? `${name} (${client.customer_id_str})` : client.customer_id_str;
    alerts.push({
      type: 'margin_warning',
      severity: 'warning',
      message: `Client ${clientLabel} has ${Math.round(client.usage * 100)}% margin utilization`,
      timestamp: new Date(),
    });
  });

  const pendingApprovals = await getPendingApprovalsSummary({ brokerIdStr });
  if (pendingApprovals.totalPending > 0) {
    alerts.push({
      type: 'approvals_pending',
      severity: 'info',
      message: `${pendingApprovals.totalPending} pending approval actions (Reg ${pendingApprovals.registrationPending}, KYC ${pendingApprovals.kycPending}, CNC ${pendingApprovals.cncPending}, WD ${pendingApprovals.withdrawalPending}, Pay ${pendingApprovals.paymentPending})`,
      timestamp: new Date(),
    });
  }

  // Check for blocked clients
  const blockedClients = await CustomerModel.countDocuments({ 
    $and: [{ $or: customerScope }, { status: 'blocked' }],
  });
  if (blockedClients > 0) {
    alerts.push({
      type: 'blocked_clients',
      severity: 'warning',
      message: `${blockedClients} clients are currently blocked`,
      timestamp: new Date(),
    });
  }

  res.status(200).json({
    success: true,
    alerts,
    count: alerts.length,
  });
});

/**
 * @desc     Get recent activity feed
 * @route    GET /api/broker/activity
 * @access   Private (Broker only)
 */
const getActivityFeed = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const brokerId = req.user._id;
  const { limit = 5 } = req.query;
  const customerScope = getBrokerCustomerClauses(brokerId, brokerIdStr);
  const orderScope = getBrokerOrderClauses(brokerId, brokerIdStr);
  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 100)
    : 5;

  // Get recent orders
  const recentOrders = await OrderModel.find({ $or: orderScope })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .select('symbol side quantity price order_status status customer_id_str createdAt');

  // Get recently modified orders
  const recentModifiedOrders = await OrderModel.find({
    $or: orderScope,
    modified_at: { $exists: true, $ne: null },
    'meta.last_modification': { $exists: true },
  })
    .sort({ modified_at: -1 })
    .limit(safeLimit)
    .select('symbol side quantity price lots order_status status customer_id_str modified_at meta');

  // Get recent customers
  const recentCustomers = await CustomerModel.find({ $or: customerScope })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('customer_id name createdAt');

  // Get recent payment requests/updates (pending + approved etc.)
  const recentPayments = await PaymentProofModel.find({ broker_id_str: brokerIdStr })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(safeLimit)
    .select('customer_id_str customer_name amount status reviewed_at createdAt updatedAt');

  // Batch-lookup customer names for all order activities
  const orderCustomerIds = [
    ...recentOrders.map(o => o.customer_id_str),
    ...recentModifiedOrders.map(o => o.customer_id_str),
  ].filter(Boolean);
  const uniqueOrderCustomerIds = [...new Set(orderCustomerIds)];

  const customerNameMap = {};
  if (uniqueOrderCustomerIds.length > 0) {
    const customers = await CustomerModel.find({ customer_id: { $in: uniqueOrderCustomerIds } })
      .select('customer_id name')
      .lean();
    customers.forEach(c => {
      customerNameMap[c.customer_id] = c.name;
    });
  }

  // Combine activities
  const activities = [];

  recentOrders.forEach(order => {
    const customerName = customerNameMap[order.customer_id_str] || '';
    activities.push({
      type: 'order',
      message: `${order.side} ${order.quantity} ${order.symbol} @ ₹${order.price}`,
      status: order.order_status || order.status,
      user: order.customer_id_str,
      userName: customerName,
      timestamp: order.createdAt,
    });
  });

  recentModifiedOrders.forEach(order => {
    const mod = order.meta?.last_modification;
    const addedLots = mod?.added_lots ?? 0;
    const oldPrice = mod?.old_price != null ? `₹${Number(mod.old_price).toFixed(2)}` : '?';
    const newPrice = mod?.new_price != null ? `₹${Number(mod.new_price).toFixed(2)}` : '?';
    const oldQty = mod?.old_quantity ?? '?';
    const newQty = mod?.new_quantity ?? order.quantity;
    const customerName = customerNameMap[order.customer_id_str] || '';
    activities.push({
      type: 'order_modify',
      message: `Modified ${order.side} ${order.symbol} | Qty: ${oldQty} → ${newQty}${addedLots > 0 ? ` (+${addedLots} lots)` : ''} | Avg: ${oldPrice} → ${newPrice}`,
      status: order.order_status || order.status,
      user: order.customer_id_str,
      userName: customerName,
      timestamp: order.modified_at,
      meta: mod || null,
    });
  });

  recentCustomers.forEach(customer => {
    activities.push({
      type: 'client_joined',
      message: `New client registered: ${customer.name}`,
      user: customer.customer_id,
      userName: customer.name,
      timestamp: customer.createdAt,
    });
  });

  recentPayments.forEach((payment) => {
    const status = String(payment.status || '').toLowerCase();
    const customerTag = [payment.customer_name, payment.customer_id_str].filter(Boolean).join(' • ');
    let message = `Payment request ₹${payment.amount} created`;
    if (status === 'pending_proof') {
      message = `Payment request ₹${payment.amount} created (awaiting proof)${customerTag ? ` - ${customerTag}` : ''}`;
    } else if (status === 'pending') {
      message = `Payment proof submitted for ₹${payment.amount} (pending approval)${customerTag ? ` - ${customerTag}` : ''}`;
    } else if (status === 'verified') {
      message = `Payment approved for ₹${payment.amount}${customerTag ? ` - ${customerTag}` : ''}`;
    } else if (status === 'rejected') {
      message = `Payment rejected for ₹${payment.amount}${customerTag ? ` - ${customerTag}` : ''}`;
    } else if (customerTag) {
      message = `${message} - ${customerTag}`;
    }

    activities.push({
      type: 'payment',
      message,
      status: status.toUpperCase(),
      user: payment.customer_id_str,
      userName: payment.customer_name || '',
      timestamp: payment.reviewed_at || payment.updatedAt || payment.createdAt,
    });
  });

  // Sort by timestamp
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.status(200).json({
    success: true,
    activities: activities.slice(0, safeLimit),
  });
});

/**
 * @desc     Get broker stats
 * @route    GET /api/broker/stats
 * @access   Private (Broker only)
 */
const getStats = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const brokerId = req.user._id;
  const { period = '7d' } = req.query;
  const customerScope = getBrokerCustomerClauses(brokerId, brokerIdStr);
  const orderScope = getBrokerOrderClauses(brokerId, brokerIdStr);

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
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  // Get stats
  const [newClients, ordersInPeriod, orderVolume] = await Promise.all([
    CustomerModel.countDocuments({
      $and: [{ $or: customerScope }, { createdAt: { $gte: startDate } }],
    }),
    OrderModel.countDocuments({
      $and: [{ $or: orderScope }, { createdAt: { $gte: startDate } }],
    }),
    OrderModel.aggregate([
      {
        $match: {
          $and: [{ $or: orderScope }, { createdAt: { $gte: startDate } }],
        },
      },
      {
        $group: {
          _id: null,
          totalVolume: { $sum: { $multiply: ['$price', '$quantity'] } },
          totalOrders: { $sum: 1 },
        }
      }
    ]),
  ]);

  // Daily breakdown
  const dailyOrders = await OrderModel.aggregate([
    {
      $match: {
        $and: [{ $or: orderScope }, { createdAt: { $gte: startDate } }],
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        volume: { $sum: { $multiply: ['$price', '$quantity'] } },
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      period,
      summary: {
        newClients,
        ordersInPeriod,
        totalVolume: orderVolume[0]?.totalVolume || 0,
      },
      charts: {
        dailyOrders,
      },
    },
  });
});

export {
  getDashboard,
  getProfile,
  getAlerts,
  getActivityFeed,
  getStats,
};
