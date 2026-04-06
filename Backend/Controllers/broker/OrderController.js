// Controllers/broker/OrderController.js
// Broker CNC Order Approvals - Approve/reject delivery orders

import asyncHandler from 'express-async-handler';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import { refundMarginImmediate, reserveMargin, getMarginBucket } from '../../services/marginLifecycle.js';
import { 
  checkOptionLimit, 
  updateOptionUsage, 
  isOptionSymbol, 
  getOptionBucket,
} from '../../Utils/OptionLimitManager.js';
import { resolveOrderValidity } from '../../services/orderValidity.js';
import { removeFromWatchlist, updateTriggerInWatchlist } from '../../Utils/OrderManager.js';

/**
 * @desc     Get pending CNC orders for approval
 * @route    GET /api/broker/orders/cnc
 * @access   Private (Broker only)
 */
const getCncOrders = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { 
    status = 'pending',
    customerId,
    page = 1, 
    limit = 20 
  } = req.query;

  // Build query - CNC/NRML orders that require approval
  const query = {
    broker_id_str: brokerIdStr,
    product: { $in: ['NRML', 'CNC'] },
    requires_approval: true,
  };

  if (status && status !== 'all') {
    query.approval_status = status;
  }

  if (customerId) {
    query.customer_id_str = customerId;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ placed_at: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    OrderModel.countDocuments(query),
  ]);

  // Get customer names
  const customerIds = [...new Set(orders.map(o => o.customer_id_str))];
  const customers = await CustomerModel.find({
    customer_id: { $in: customerIds }
  }).select('customer_id name');

  const customerMap = {};
  customers.forEach(c => {
    customerMap[c.customer_id] = c.name;
  });

  const ordersFormatted = orders.map(order => ({
    id: order._id,
    orderId: order.order_id,
    customerId: order.customer_id_str,
    customerName: customerMap[order.customer_id_str] || 'Unknown',
    symbol: order.symbol,
    tradingsymbol: order.tradingsymbol,
    side: order.side,
    type: order.side,
    product: order.product,
    segment: order.segment || order.product,
    exchange: order.exchange,
    quantity: order.quantity,
    price: order.price,
    value: order.price * order.quantity,
    approvalStatus: order.approval_status,
    placedAt: order.placed_at,
    approvedAt: order.approved_at,
    createdAt: order.createdAt,
    rejectionReason: order.rejection_reason,
  }));

  res.status(200).json({
    success: true,
    orders: ordersFormatted,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Approve CNC order
 * @route    POST /api/broker/orders/cnc/:id/approve
 * @access   Private (Broker only)
 */
const approveCncOrder = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const order = await OrderModel.findOne({
    _id: id,
    broker_id_str: brokerIdStr,
    product: { $in: ['NRML', 'CNC'] },
    requires_approval: true,
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found.',
    });
  }

  if (order.approval_status === 'approved') {
    return res.status(400).json({
      success: false,
      message: 'Order is already approved.',
    });
  }

  // Reserve margin in the correct bucket (commodity_delivery for MCX CNC, delivery for equity CNC)
  // Skip if margin was already reserved at customer placement (prevents double reservation)
  const marginToReserve = Number(order.margin_blocked) || 0;
  const alreadyReserved = order.meta?.margin_hold?.reserved === true && !order.margin_released_at;

  if (marginToReserve > 0 && !alreadyReserved) {
    const fund = await FundModel.findOne({
      broker_id_str: order.broker_id_str,
      customer_id_str: order.customer_id_str,
    });

    if (!fund) {
      return res.status(400).json({
        success: false,
        message: 'Fund record not found for this client.',
      });
    }

    // Check if this is an option order
    const isOption = order.meta?.margin_hold?.isOption === true || isOptionSymbol(order.symbol);
    
    if (isOption) {
      // Option orders: check and reserve from option_premium or commodity_option bucket
      const optionCheck = checkOptionLimit(fund, order.product, marginToReserve, {
        exchange: order.exchange,
        segment: order.segment,
      });
      if (!optionCheck.allowed) {
        return res.status(400).json({
          success: false,
          message: optionCheck.message || 'Insufficient option premium limit to approve this order.',
        });
      }
      updateOptionUsage(fund, order.product, marginToReserve, {
        exchange: order.exchange,
        segment: order.segment,
      });
      // Update order meta with bucket info
      if (!order.meta) order.meta = {};
      order.meta.margin_hold = {
        ...order.meta.margin_hold,
        bucket: getOptionBucket({ exchange: order.exchange, segment: order.segment }),
        isOption: true,
        reserved: true,
      };
      await fund.save();
    } else {
      // Non-option orders: use regular margin buckets
      const bucket = getMarginBucket(order.product, { exchange: order.exchange, segment: order.segment });
      // Only reserve from delivery / commodity_delivery — MIS (intraday) is reserved at placement
      if (bucket !== 'intraday') {
        const result = reserveMargin(fund, bucket, marginToReserve);
        if (!result.ok) {
          return res.status(400).json({
            success: false,
            message: result.error || 'Insufficient margin to approve this order.',
          });
        }
        await fund.save();
      }
    }
  }

  // Set order validity using instrument expiry if available
  const instrumentExpiry = order.meta?.selectedStock?.expiry || null;
  const validity = resolveOrderValidity({
    product: order.product,
    exchange: order.exchange,
    segment: order.segment,
    symbol: order.symbol,
    instrumentExpiry,
    placedAt: new Date(),
  });
  order.validity_mode = validity.mode;
  order.validity_started_at = validity.startsAt;
  order.validity_expires_at = validity.expiresAt;

  order.approval_status = 'approved';
  order.approved_by = brokerId;
  order.approved_at = new Date();
  order.status = 'OPEN';
  order.order_status = 'OPEN';
  await order.save();
  await updateTriggerInWatchlist(order);

  console.log(`[Broker] CNC order ${id} approved for client ${order.customer_id_str}`);

  res.status(200).json({
    success: true,
    message: 'Order approved successfully.',
    order: {
      id: order._id,
      symbol: order.symbol,
      status: order.status || order.order_status,
    },
  });
});

/**
 * @desc     Reject CNC order
 * @route    POST /api/broker/orders/cnc/:id/reject
 * @access   Private (Broker only)
 */
const rejectCncOrder = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason is required.',
    });
  }

  const order = await OrderModel.findOne({
    _id: id,
    broker_id_str: brokerIdStr,
    product: { $in: ['NRML', 'CNC'] },
    requires_approval: true,
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found.',
    });
  }

  if (order.approval_status === 'rejected') {
    return res.status(400).json({
      success: false,
      message: 'Order is already rejected.',
    });
  }

  order.approval_status = 'rejected';
  order.rejection_reason = reason;
  order.rejected_at = new Date();
  order.approved_by = brokerId;
  order.approved_at = new Date();
  order.status = 'REJECTED';
  order.order_status = 'REJECTED';

  // Release blocked margin back to customer immediately
  const marginBlocked = Number(order.margin_blocked) || 0;
  if (marginBlocked > 0) {
    const fund = await FundModel.findOne({
      broker_id_str: order.broker_id_str,
      customer_id_str: order.customer_id_str,
    });

    if (fund) {
      const bucket = order.meta?.margin_hold?.bucket
        || getMarginBucket(order.product, { exchange: order.exchange, segment: order.segment });
      refundMarginImmediate(fund, bucket, marginBlocked, {
        reason: `CNC rejection: ${reason}`,
        orderId: String(order._id),
      });
      await fund.save();
      console.log(`[Broker] Margin ₹${marginBlocked.toFixed(2)} refunded for rejected CNC order ${id}`);
    }

    order.margin_blocked = 0;
  }

  await order.save();
  await removeFromWatchlist(order);

  console.log(`[Broker] CNC order ${id} rejected for client ${order.customer_id_str}: ${reason}`);

  res.status(200).json({
    success: true,
    message: 'Order rejected.',
    order: {
      id: order._id,
      symbol: order.symbol,
      reason,
    },
  });
});

/**
 * @desc     Get CNC order statistics
 * @route    GET /api/broker/orders/cnc/stats
 * @access   Private (Broker only)
 */
const getCncStats = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;

  const stats = await OrderModel.aggregate([
    { 
      $match: { 
        broker_id_str: brokerIdStr,
        product: { $in: ['NRML', 'CNC'] },
        requires_approval: true,
      } 
    },
    {
      $group: {
        _id: '$approval_status',
        count: { $sum: 1 },
        totalValue: { $sum: { $multiply: ['$price', '$quantity'] } },
      },
    },
  ]);

  const result = {
    pending: { count: 0, value: 0 },
    approved: { count: 0, value: 0 },
    rejected: { count: 0, value: 0 },
    total: 0,
    totalValue: 0,
  };

  stats.forEach((s) => {
    result[s._id] = { count: s.count, value: s.totalValue };
    result.total += s.count;
    result.totalValue += s.totalValue;
  });

  res.status(200).json({
    success: true,
    stats: result,
  });
});

export {
  getCncOrders,
  approveCncOrder,
  rejectCncOrder,
  getCncStats,
};
