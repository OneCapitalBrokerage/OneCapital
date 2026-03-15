// Controllers/customer/TradingController.js
// Customer Trading - Place orders, manage positions, and holdings

import asyncHandler from 'express-async-handler';
import OrderModel from '../../Model/Trading/OrdersModel.js';
import HoldingModel from '../../Model/Trading/HoldingModel.js';
import PositionsModel from '../../Model/Trading/PositionsModel.js';
import FundModel from '../../Model/FundManagement/FundModel.js';
import UserWatchlistModel from '../../Model/UserWatchlistModel.js';
import Instrument from '../../Model/InstrumentModel.js';
import {
  getClientPricingConfig,
  inferPricingBucket,
  inferSpreadBucket,
  getSpreadForBucket,
  getSpreadConfigForBucket,
  applySpreadToPrice,
  buildEntryBrokerageSnapshot,
  resolveLots,
} from '../../Utils/ClientPricingEngine.js';
import {
  addToWatchlist,
  removeFromWatchlist,
  updateTriggerInWatchlist,
} from '../../Utils/OrderManager.js';
import { logFailedOrderAttempt } from '../../Utils/OrderAttemptLogger.js';
import { getStandardMarketStatus, getMarketStatusForInstrument } from '../../Utils/tradingSession.js';
import { releaseMarginOnClose, getMarginBucket } from '../../services/marginLifecycle.js';
import { canBrokerExtendValidity } from '../../services/orderValidity.js';
import { syncGlobalWatchlistTokens } from '../../sockets/io.js';
import { normalizeMcxOrder } from '../../Utils/mcx/normalizer.js';
import { isMCX } from '../../Utils/mcx/resolver.js';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeProduct = (value) => String(value || '').trim().toUpperCase();
const isLongTermProduct = (value) => ['CNC', 'NRML'].includes(normalizeProduct(value));
const isPrivilegedImpersonation = (req) =>
  req.user?.isImpersonation &&
  ['broker', 'admin'].includes(req.user?.impersonatorRole);
const ORDER_DATE_FIELDS = new Set(['createdAt', 'placed_at', 'closed_at', 'exit_at']);

const resolveOrderDateField = (input) => {
  const normalized = String(input || '').trim();
  if (!ORDER_DATE_FIELDS.has(normalized)) return 'createdAt';
  return normalized;
};

const parseOrderDateParam = (value, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (endOfDay) parsed.setUTCHours(23, 59, 59, 999);
    else parsed.setUTCHours(0, 0, 0, 0);
  }

  return parsed;
};

const marketClosedPayload = ({ exchange, segment } = {}) => {
  const marketStatus = getMarketStatusForInstrument({ exchange, segment });
  const isMcx = marketStatus.sessionType === 'MCX';
  return {
    success: false,
    code: 'MARKET_CLOSED',
    message: isMcx
      ? 'MCX Market Closed. Open From 9:15AM To 11:00PM On Working Days'
      : 'Market Closed. Open From 9:15AM To 3:15PM On Working Days',
    marketStatus: {
      isOpen: marketStatus.isOpen,
      tradingDay: marketStatus.tradingDay,
      reason: marketStatus.reason,
      marketOpen: marketStatus.marketOpen,
      marketClose: marketStatus.marketClose,
      timezone: marketStatus.timezone,
      serverTimeIst: marketStatus.istNow.toISOString(),
    },
  };
};

/**
 * @desc     Place order
 * @route    POST /api/customer/orders
 * @access   Private (Customer only)
 */
const placeOrder = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const brokerId = req.user.mongoBrokerId;

  const {
    symbol,
    side,
    quantity,
    price,
    orderType = 'LIMIT',
    product = 'MIS',
    exchange = 'NSE',
    segment,
    instrumentToken,
    validity = 'DAY',
    triggerPrice,
    disclosedQuantity,
    stopLoss,
    target,
    lots,
    lotSize,
    lot_size,
  } = req.body;

  const failPlacement = async ({
    status = 400,
    message = 'Order attempt failed.',
    code,
    extraResponse,
    details,
  }) => {
    await logFailedOrderAttempt({
      req,
      payload: {
        ...req.body,
        customer_id: customerId,
        customer_id_str: customerIdStr,
        broker_id: brokerId,
        broker_id_str: brokerIdStr,
      },
      reason: message,
      code,
      status,
      details,
    });

    return res.status(status).json({
      success: false,
      message,
      ...(extraResponse || {}),
    });
  };

  // Validate required fields
  if (!symbol || !side || !quantity || !price || !instrumentToken) {
    return failPlacement({
      status: 400,
      message: 'Symbol, side, quantity, price, and instrumentToken are required.',
      code: 'VALIDATION_ERROR',
    });
  }

  const sideNorm = String(side || '').toUpperCase();
  const productNorm = normalizeProduct(product);
  const orderTypeNorm = String(orderType || 'LIMIT').toUpperCase();
  const qtyNum = toNumber(quantity);
  const rawEntryPrice = toNumber(price);
  const triggerPriceNum = toNumber(triggerPrice, 0);
  const stopLossNum = toNumber(stopLoss, 0);
  const targetNum = toNumber(target, 0);
  const requestedLotSize = lotSize ?? lot_size;
  // The current UI sends MIS SL placement in triggerPrice; arm the watcher via stop_loss.
  const effectiveStopLossNum =
    stopLossNum > 0
      ? stopLossNum
      : (productNorm === 'MIS' && orderTypeNorm === 'SL' ? triggerPriceNum : 0);

  if (!['BUY', 'SELL'].includes(sideNorm)) {
    return failPlacement({
      status: 400,
      message: 'side must be BUY or SELL.',
      code: 'VALIDATION_ERROR',
    });
  }

  if (!['MIS', 'CNC', 'NRML'].includes(productNorm)) {
    return failPlacement({
      status: 400,
      message: 'product must be MIS, CNC, or NRML.',
      code: 'VALIDATION_ERROR',
    });
  }

  if (qtyNum <= 0 || rawEntryPrice <= 0) {
    return failPlacement({
      status: 400,
      message: 'quantity and price must be positive numbers.',
      code: 'VALIDATION_ERROR',
    });
  }

  if (
    isLongTermProduct(productNorm) &&
    (
      ['SL', 'TGT'].includes(orderTypeNorm) ||
      triggerPriceNum !== 0 ||
      stopLossNum !== 0 ||
      targetNum !== 0
    )
  ) {
    return failPlacement({
      status: 400,
      message: 'SL/Target is locked for longterm orders (CNC/NRML). Use market/regular order.',
      code: 'VALIDATION_ERROR',
    });
  }

  // Check trading is enabled
  if (!req.user.trading_enabled) {
    return failPlacement({
      status: 403,
      message: 'Order placement is not available right now. Please try again later.',
      code: 'TRADING_DISABLED',
    });
  }

  // Get fund info
  const fund = await FundModel.findOne({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  });

  if (!fund) {
    return failPlacement({
      status: 400,
      message: 'Fund account not found.',
      code: 'FUND_ACCOUNT_NOT_FOUND',
    });
  }

  let resolvedExchange = exchange;
  let resolvedSegment = segment;
  let instrumentDoc = null;

  if (!resolvedExchange || !resolvedSegment || toNumber(requestedLotSize, 0) <= 0) {
    instrumentDoc = await Instrument.findOne({ instrument_token: String(instrumentToken) })
      .select('exchange segment lot_size name tick_size')
      .lean();
    resolvedExchange = resolvedExchange || instrumentDoc?.exchange || 'NSE';
    resolvedSegment = resolvedSegment || instrumentDoc?.segment || 'NSE';
  }

  // Client-level spread application for margin + P&L basis
  const pricingConfig = await getClientPricingConfig({
    brokerIdStr: String(brokerIdStr),
    customerIdStr: String(customerIdStr),
  });
  const pricingBucket = inferPricingBucket({
    exchange: resolvedExchange,
    segment: resolvedSegment,
    symbol,
    orderType,
  });
  const spreadBucket = inferSpreadBucket({
    exchange: resolvedExchange,
    segment: resolvedSegment,
    symbol,
    orderType,
  });
  const spreadConfig = getSpreadConfigForBucket(pricingConfig, spreadBucket);
  const spreadForBucket = spreadConfig.value;
  const entryPricing = applySpreadToPrice({
    rawPrice: rawEntryPrice,
    side: sideNorm,
    spread: spreadForBucket,
    spreadMode: spreadConfig.mode,
  });
  const effectiveEntryPrice = entryPricing.effectivePrice;
  let resolvedLotSize = Math.max(1, toNumber(requestedLotSize ?? instrumentDoc?.lot_size, 1));
  let finalQty = qtyNum;
  let resolvedLots = resolveLots({
    lots,
    quantity: qtyNum,
    lotSize: resolvedLotSize,
  });

  // MCX normalization: override quantity and lotSize from root spec
  const mcxNorm = normalizeMcxOrder({
    lots: resolvedLots,
    exchange: resolvedExchange,
    segment: resolvedSegment,
    name: instrumentDoc?.name,
    tradingsymbol: symbol,
    tickSize: instrumentDoc?.tick_size,
  });
  let mcxUnitsPerContract = 0;
  if (mcxNorm) {
    finalQty = mcxNorm.quantity;
    resolvedLotSize = mcxNorm.units_per_contract;
    resolvedLots = mcxNorm.lots;
    mcxUnitsPerContract = mcxNorm.units_per_contract;
  }

  // MCX NRML rejection: carryforward must use CNC
  const orderIsMcx = isMCX({ exchange: resolvedExchange, segment: resolvedSegment });
  if (orderIsMcx && productNorm === 'NRML') {
    return failPlacement({
      status: 400,
      message: 'MCX carryforward must use CNC, not NRML.',
      code: 'MCX_NRML_NOT_ALLOWED',
    });
  }

  const entryBrokerageSnapshot = buildEntryBrokerageSnapshot({
    pricing: pricingConfig,
    bucket: pricingBucket,
    side: sideNorm,
    quantity: finalQty,
    lotSize: resolvedLotSize,
    lots: resolvedLots,
    effectivePrice: effectiveEntryPrice,
  });

  // Calculate margin required
  const orderValue = effectiveEntryPrice * finalQty;
  const marginRequired = orderValue; // Full notional for all products (canonical rule)

  // Check margin against the correct bucket
  const marginBucket = getMarginBucket(productNorm, { exchange: resolvedExchange, segment: resolvedSegment });
  let availableMargin;
  if (marginBucket === 'commodity_delivery') {
    availableMargin = toNumber(fund.commodity_delivery?.available_limit) - toNumber(fund.commodity_delivery?.used_limit);
  } else if (marginBucket === 'delivery') {
    availableMargin = toNumber(fund.overnight?.available_limit);
  } else {
    availableMargin = toNumber(fund.intraday?.available_limit) - toNumber(fund.intraday?.used_limit);
  }
  if (sideNorm === 'BUY' && availableMargin < marginRequired) {
    return failPlacement({
      status: 400,
      message: marginBucket === 'commodity_delivery'
        ? 'Insufficient Commodity Margin.'
        : 'Insufficient margin.',
      code: 'INSUFFICIENT_FUNDS',
      extraResponse: {
        required: marginRequired,
        available: availableMargin,
      },
    });
  }

  // Check if CNC order requires broker approval
  const isImmediate = productNorm === 'MIS';
  const requiresApproval = !isImmediate;
  const status = isImmediate ? 'EXECUTED' : 'PENDING';
  const approvalStatus = requiresApproval ? 'pending' : 'approved';

  let order;
  try {
    // Create order
    order = await OrderModel.create({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
      broker_id: brokerId,
      customer_id: customerId,
      symbol,
      side: sideNorm,
      quantity: finalQty,
      price: effectiveEntryPrice,
      raw_entry_price: entryPricing.rawPrice,
      effective_entry_price: effectiveEntryPrice,
      entry_spread_applied: entryPricing.appliedSpread,
      order_type: orderTypeNorm,
      product: productNorm,
      exchange: resolvedExchange,
      segment: resolvedSegment,
      instrument_token: instrumentToken,
      lot_size: resolvedLotSize,
      lots: resolvedLots,
      units_per_contract: mcxUnitsPerContract,
      validity,
      trigger_price: triggerPriceNum,
      disclosed_quantity: disclosedQuantity,
      stop_loss: effectiveStopLossNum,
      target: targetNum,
      status,
      requires_approval: requiresApproval,
      approval_status: approvalStatus,
      margin_blocked: marginRequired,
      pricing_bucket: pricingBucket,
      brokerage: entryBrokerageSnapshot.amount,
      brokerage_breakdown: entryBrokerageSnapshot.breakdown,
      placed_at: new Date(),
    });

    // Block margin
    if (!requiresApproval) {
      fund.intraday.used_limit = (fund.intraday.used_limit || 0) + marginRequired;
      await fund.save();
    }
  } catch (error) {
    return failPlacement({
      status: 500,
      message: 'Order creation failed. Please try again.',
      code: 'ORDER_CREATE_FAILED',
      details: { error: error?.message || String(error) },
    });
  }

  await addToWatchlist(order);

  console.log(`[Trading] Order placed: ${sideNorm} ${qtyNum} ${symbol} @ Raw ₹${rawEntryPrice}, Effective ₹${effectiveEntryPrice}`);

  res.status(201).json({
    success: true,
    message: requiresApproval ? 'Order pending broker approval.' : 'Order placed successfully.',
    order: {
      id: order._id,
      orderId: order.order_id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
      rawEntryPrice: order.raw_entry_price,
      effectiveEntryPrice: order.effective_entry_price,
      entrySpreadApplied: order.entry_spread_applied,
      pricingBucket: order.pricing_bucket,
      status: order.status,
      requiresApproval,
    },
  });
});

/**
 * @desc     Get orders
 * @route    GET /api/customer/orders
 * @access   Private (Customer only)
 */
const getOrders = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const {
    status,
    date,
    from,
    to,
    dateField,
    page = 1,
    limit = 50,
  } = req.query;

  const query = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  };
  let sortField = 'createdAt';

  if (status && status !== 'all') {
    query.status = status.toUpperCase();
  }

  const hasDateRange = Boolean(date || from || to);
  if (hasDateRange) {
    const explicitDateField = Object.prototype.hasOwnProperty.call(req.query, 'dateField');
    const resolvedDateField = resolveOrderDateField(dateField);
    const rangeField = explicitDateField ? resolvedDateField : (from || to ? resolvedDateField : 'createdAt');
    sortField = rangeField;

    let start = null;
    let end = null;

    if (from || to) {
      start = parseOrderDateParam(from, false);
      end = parseOrderDateParam(to, true);
    } else if (date) {
      start = parseOrderDateParam(date, false);
      end = parseOrderDateParam(date, true);
    }

    if (start || end) {
      query[rangeField] = {};
      if (start) query[rangeField].$gte = start;
      if (end) query[rangeField].$lte = end;
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ [sortField]: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    OrderModel.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    orders: orders.map(o => {
      const extCheck = canBrokerExtendValidity(o);
      return ({
      id: o._id,
      orderId: o.order_id,
      symbol: o.symbol,
      side: o.side,
      quantity: o.quantity,
      price: o.price,
      orderType: o.order_type,
      product: o.product,
      status: o.status || o.order_status,
      exchange: o.exchange,
      segment: o.segment,
      instrument_token: o.instrument_token,
      lot_size: o.lot_size,
      lots: o.lots,
      units_per_contract: o.units_per_contract || 0,
      stop_loss: o.stop_loss,
      target: o.target,
      exit_price: o.exit_price,
      exit_reason: o.exit_reason,
      exit_at: o.exit_at,
      closed_ltp: o.closed_ltp,
      closed_at: o.closed_at,
      raw_entry_price: o.raw_entry_price,
      effective_entry_price: o.effective_entry_price,
      entry_spread_applied: o.entry_spread_applied,
      raw_exit_price: o.raw_exit_price,
      effective_exit_price: o.effective_exit_price,
      exit_spread_applied: o.exit_spread_applied,
      pricing_bucket: o.pricing_bucket,
      brokerage: o.brokerage,
      brokerage_breakdown: o.brokerage_breakdown,
      realized_pnl: o.realized_pnl,
      settlement_status: o.settlement_status,
      placed_at: o.placed_at,
      came_From: o.came_From,
      jobbin_price: o.increase_price,
      margin_blocked: o.margin_blocked,
      order_status: o.order_status,
      exit_allowed: o.exit_allowed ?? false,
      requires_approval: o.requires_approval,
      approval_status: o.approval_status,
      validity_mode: o.validity_mode,
      validity_started_at: o.validity_started_at,
      validity_expires_at: o.validity_expires_at,
      validity_extended_count: o.validity_extended_count,
      can_extend_validity: extCheck.ok,
      extend_validity_reason: extCheck.reason || null,
    });
    }),
    filters: {
      status: status && status !== 'all' ? String(status).toUpperCase() : 'all',
      dateField: resolveOrderDateField(dateField),
      date: date || null,
      from: from || null,
      to: to || null,
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
 * @desc     Modify order
 * @route    PUT /api/customer/orders/:id
 * @access   Private (Customer only)
 */
const modifyOrder = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const { id } = req.params;
  const { price, quantity, triggerPrice, stopLoss, target, lots, lotSize, lot_size } = req.body;

  const order = await OrderModel.findOne({
    _id: id,
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    status: { $in: ['OPEN', 'PENDING'] },
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found or cannot be modified.',
    });
  }

  if (isLongTermProduct(order.product) && !isPrivilegedImpersonation(req)) {
    const marketStatus = getMarketStatusForInstrument({ exchange: order.exchange, segment: order.segment });
    if (!marketStatus.isOpen) {
      return res.status(403).json(marketClosedPayload({ exchange: order.exchange, segment: order.segment }));
    }
  }

  if ((stopLoss !== undefined || target !== undefined) && isLongTermProduct(order.product) && !isPrivilegedImpersonation(req)) {
    const currentStopLoss = toNumber(order.stop_loss, 0);
    const currentTarget = toNumber(order.target, 0);
    const nextStopLoss = stopLoss !== undefined ? Number(stopLoss) : currentStopLoss;
    const nextTarget = target !== undefined ? Number(target) : currentTarget;

    if (!Number.isFinite(nextStopLoss) || !Number.isFinite(nextTarget) || nextStopLoss !== currentStopLoss || nextTarget !== currentTarget) {
      return res.status(400).json({
        success: false,
        message: 'SL/Target cannot be set or modified for longterm orders (CNC/NRML).',
      });
    }
  }

  // Store old values
  const oldPrice = order.price;
  const oldQuantity = order.quantity;
  const oldLots = order.lots;

  if (price !== undefined && price !== null) {
    const rawPrice = toNumber(price);
    if (rawPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'price must be a positive number.',
      });
    }

    const pricingConfig = await getClientPricingConfig({
      brokerIdStr: String(brokerIdStr),
      customerIdStr: String(customerIdStr),
    });
    const pricingBucket = order.pricing_bucket || inferPricingBucket({
      exchange: order.exchange,
      segment: order.segment,
      symbol: order.symbol,
      orderType: order.order_type,
    });
    const spreadBucket = inferSpreadBucket({
      exchange: order.exchange,
      segment: order.segment,
      symbol: order.symbol,
      orderType: order.order_type,
    });
    const modifySpreadConfig = getSpreadConfigForBucket(pricingConfig, spreadBucket);
    const spreadForBucket = modifySpreadConfig.value;
    const entryPricing = applySpreadToPrice({
      rawPrice,
      side: order.side,
      spread: spreadForBucket,
      spreadMode: modifySpreadConfig.mode,
    });

    order.raw_entry_price = entryPricing.rawPrice;
    order.effective_entry_price = entryPricing.effectivePrice;
    order.entry_spread_applied = entryPricing.appliedSpread;
    order.price = entryPricing.effectivePrice;
    order.pricing_bucket = pricingBucket;
  }

  if (quantity !== undefined && quantity !== null) {
    const qty = toNumber(quantity);
    if (qty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'quantity must be a positive number.',
      });
    }
    order.quantity = qty;
  }

  const requestedModifyLotSize = lotSize ?? lot_size;
  if (requestedModifyLotSize !== undefined && requestedModifyLotSize !== null) {
    const nextLotSize = Math.max(1, toNumber(requestedModifyLotSize, 1));
    order.lot_size = nextLotSize;
  }

  if (lots !== undefined && lots !== null) {
    const nextLots = Number(lots);
    if (!Number.isFinite(nextLots) || nextLots < 0) {
      return res.status(400).json({
        success: false,
        message: 'lots must be zero or a positive number.',
      });
    }
    order.lots = nextLots;
  }

  // MCX: recalculate quantity from lots using stored units_per_contract
  const upc = toNumber(order.units_per_contract, 0);
  if (upc > 0) {
    order.lots = Math.max(1, Math.round(toNumber(order.lots, 1)));
    order.quantity = order.lots * upc;
    order.lot_size = upc;
  } else {
    order.lots = resolveLots({
      lots: order.lots,
      quantity: order.quantity,
      lotSize: order.lot_size,
    });
  }

  if (triggerPrice !== undefined) order.trigger_price = triggerPrice;
  if (stopLoss !== undefined) {
    const normalizedStopLoss = Number(stopLoss);
    if (!Number.isFinite(normalizedStopLoss) || normalizedStopLoss < 0) {
      return res.status(400).json({
        success: false,
        message: 'stopLoss must be zero or a positive number.',
      });
    }
    order.stop_loss = normalizedStopLoss;
  }
  if (target !== undefined) {
    const normalizedTarget = Number(target);
    if (!Number.isFinite(normalizedTarget) || normalizedTarget < 0) {
      return res.status(400).json({
        success: false,
        message: 'target must be zero or a positive number.',
      });
    }
    order.target = normalizedTarget;
  }
  order.modified_at = new Date();

  const pricingConfig = await getClientPricingConfig({
    brokerIdStr: String(brokerIdStr),
    customerIdStr: String(customerIdStr),
  });
  const pricingBucket = order.pricing_bucket || inferPricingBucket({
    exchange: order.exchange,
    segment: order.segment,
    symbol: order.symbol,
    orderType: order.order_type,
  });
  const entryBrokerageSnapshot = buildEntryBrokerageSnapshot({
    pricing: pricingConfig,
    bucket: pricingBucket,
    side: order.side,
    quantity: order.quantity,
    lotSize: order.lot_size,
    lots: order.lots,
    effectivePrice: order.effective_entry_price || order.price,
  });
  order.pricing_bucket = pricingBucket;
  order.brokerage = entryBrokerageSnapshot.amount;
  order.brokerage_breakdown = entryBrokerageSnapshot.breakdown;

  // Adjust margin if needed
  if (order.price !== oldPrice || order.quantity !== oldQuantity) {
    const fund = await FundModel.findOne({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    });

    if (fund) {
      const oldMargin = order.margin_blocked || 0;
      const newMargin = order.price * order.quantity; // Full notional (canonical rule)
      const marginDiff = newMargin - oldMargin;

      if (marginDiff > 0) {
        const availableMargin = (fund.intraday?.available_limit || 0) - (fund.intraday?.used_limit || 0);
        if (availableMargin < marginDiff) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient margin for this modification.',
            requiredAdditional: marginDiff,
            available: availableMargin,
          });
        }
      }

      fund.intraday.used_limit = (fund.intraday.used_limit || 0) + marginDiff;
      order.margin_blocked = newMargin;
      await fund.save();
    }
  }

  // Store modification snapshot in meta for activity feed
  if (order.price !== oldPrice || order.quantity !== oldQuantity) {
    order.meta = {
      ...(order.meta || {}),
      last_modification: {
        old_price: oldPrice,
        new_price: order.price,
        old_quantity: oldQuantity,
        new_quantity: order.quantity,
        old_lots: oldLots,
        new_lots: order.lots,
        added_lots: (order.lots || 0) - (oldLots || 0),
        modified_at: order.modified_at,
      },
    };
  }

  await order.save();
  await updateTriggerInWatchlist(order);

  res.status(200).json({
    success: true,
    message: 'Order modified successfully.',
    order: {
      id: order._id,
      price: order.price,
      quantity: order.quantity,
    },
  });
});

/**
 * @desc     Cancel order
 * @route    DELETE /api/customer/orders/:id
 * @access   Private (Customer only)
 */
const cancelOrder = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId;
  const { id } = req.params;

  const order = await OrderModel.findOne({
    _id: id,
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    status: { $in: ['OPEN', 'PENDING', 'EXECUTED'] },
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found or cannot be cancelled.',
    });
  }

  if (isLongTermProduct(order.product) && !isPrivilegedImpersonation(req)) {
    const marketStatus = getMarketStatusForInstrument({ exchange: order.exchange, segment: order.segment });
    if (!marketStatus.isOpen) {
      return res.status(403).json(marketClosedPayload({ exchange: order.exchange, segment: order.segment }));
    }
  }

  // Release margin immediately on cancel
  if (order.margin_blocked && !order.margin_released_at) {
    const fund = await FundModel.findOne({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    });

    if (fund) {
      releaseMarginOnClose(fund, order, {
        reason: 'customer_cancel',
        orderId: String(order._id),
      });
      order.margin_released_at = new Date();
      await fund.save();
    }
  }

  order.status = 'CANCELLED';
  order.order_status = 'CANCELLED';
  order.margin_blocked = 0;
  order.cancelled_at = new Date();
  await order.save();
  await removeFromWatchlist(order);

  res.status(200).json({
    success: true,
    message: 'Order cancelled successfully.',
  });
});

/**
 * @desc     Get holdings
 * @route    GET /api/customer/holdings
 * @access   Private (Customer only)
 */
const getHoldings = asyncHandler(async (req, res) => {
  const customerId = req.user._id;

  const holdings = await HoldingModel.find({ customer_id: customerId });

  const formattedHoldings = holdings.map(h => ({
    id: h._id,
    symbol: h.tradingSymbol || h.symbol,
    exchange: h.exchange,
    quantity: h.quantity,
    averagePrice: h.averagePrice,
    currentPrice: h.currentPrice || h.averagePrice,
    pnl: ((h.currentPrice || h.averagePrice) - h.averagePrice) * h.quantity,
    pnlPercentage: h.averagePrice > 0 
      ? (((h.currentPrice || h.averagePrice) - h.averagePrice) / h.averagePrice * 100).toFixed(2)
      : 0,
    investedValue: h.averagePrice * h.quantity,
    currentValue: (h.currentPrice || h.averagePrice) * h.quantity,
  }));

  const totalInvested = formattedHoldings.reduce((sum, h) => sum + h.investedValue, 0);
  const totalCurrent = formattedHoldings.reduce((sum, h) => sum + h.currentValue, 0);

  res.status(200).json({
    success: true,
    holdings: formattedHoldings,
    summary: {
      totalHoldings: holdings.length,
      totalInvested,
      currentValue: totalCurrent,
      totalPnl: totalCurrent - totalInvested,
      pnlPercentage: totalInvested > 0 
        ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(2)
        : 0,
    },
  });
});

/**
 * @desc     Get positions
 * @route    GET /api/customer/positions
 * @access   Private (Customer only)
 */
const getPositions = asyncHandler(async (req, res) => {
  const customerId = req.user._id;

  const positions = await PositionsModel.find({ customer_id: customerId });

  const formattedPositions = positions.map(p => ({
    id: p._id,
    symbol: p.tradingSymbol || p.symbol,
    exchange: p.exchange,
    product: p.product,
    quantity: p.quantity,
    side: p.quantity > 0 ? 'LONG' : 'SHORT',
    averagePrice: p.averagePrice,
    ltp: p.ltp || p.averagePrice,
    pnl: p.pnl || 0,
    realizedPnl: p.realizedPnl || 0,
    unrealizedPnl: p.unrealizedPnl || 0,
  }));

  const totalPnl = formattedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const realizedPnl = formattedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0);
  const unrealizedPnl = formattedPositions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);

  res.status(200).json({
    success: true,
    positions: formattedPositions,
    summary: {
      totalPositions: positions.length,
      totalPnl,
      realizedPnl,
      unrealizedPnl,
    },
  });
});

/**
 * @desc     Get watchlist
 * @route    GET /api/customer/watchlist
 * @access   Private (Customer only)
 */
const getWatchlist = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId || req.user.broker_id_str || req.user.attached_broker_id?.toString();

  if (!customerIdStr || !brokerIdStr) {
    return res.status(400).json({ success: false, message: 'customer_id or broker_id missing' });
  }

  const DEFAULT_LIST = 'Watchlist 1';

  let watchlists = await UserWatchlistModel.find({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  })
    .sort({ createdAt: 1 })
    .lean();

  if (!watchlists || watchlists.length === 0) {
    const created = await UserWatchlistModel.create({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
      name: DEFAULT_LIST,
      instruments: [],
    });
    watchlists = [created.toObject()];
  }

  const tokenSet = new Set();
  const symbolSet = new Set();

  watchlists.forEach((list) => {
    (list.instruments || []).forEach((item) => {
      if (item.instrumentToken) tokenSet.add(String(item.instrumentToken));
      if (item.symbol) symbolSet.add(String(item.symbol).toUpperCase());
    });
  });

  const [tokenDocs, symbolDocs] = await Promise.all([
    tokenSet.size
      ? Instrument.find({ instrument_token: { $in: Array.from(tokenSet) } })
        .select('instrument_token tradingsymbol name exchange segment expiry instrument_type lot_size')
        .lean()
      : [],
    symbolSet.size
      ? Instrument.find({ tradingsymbol: { $in: Array.from(symbolSet) } })
        .select('instrument_token tradingsymbol name exchange segment expiry instrument_type lot_size')
        .lean()
      : [],
  ]);

  const tokenMap = new Map(tokenDocs.map((doc) => [String(doc.instrument_token), doc]));
  const symbolSegmentMap = new Map();
  const symbolExchangeMap = new Map();
  const symbolMap = new Map();
  symbolDocs.forEach((doc) => {
    const symbolKey = String(doc.tradingsymbol || '').toUpperCase();
    const segmentKey = String(doc.segment || '').toUpperCase();
    const exchangeKey = String(doc.exchange || '').toUpperCase();
    if (!symbolKey) return;

    symbolMap.set(symbolKey, doc);
    if (segmentKey) symbolSegmentMap.set(`${symbolKey}|${segmentKey}`, doc);
    if (exchangeKey) symbolExchangeMap.set(`${symbolKey}|${exchangeKey}`, doc);
  });

  const normalized = watchlists.map((list) => {
    const instruments = (list.instruments || []).map((item) => {
      const tokenKey = item.instrumentToken ? String(item.instrumentToken) : null;
      const symbolKey = item.symbol ? String(item.symbol).toUpperCase() : null;
      const segmentKey = item.segment ? String(item.segment).toUpperCase() : null;
      const exchangeKey = item.exchange ? String(item.exchange).toUpperCase() : null;
      const lookup = (tokenKey && tokenMap.get(tokenKey))
        || (symbolKey && segmentKey && symbolSegmentMap.get(`${symbolKey}|${segmentKey}`))
        || (symbolKey && exchangeKey && symbolExchangeMap.get(`${symbolKey}|${exchangeKey}`))
        || (symbolKey && symbolMap.get(symbolKey));

      return {
        ...item,
        name: item.name || lookup?.name || lookup?.tradingsymbol || item.symbol,
        instrumentToken: item.instrumentToken || lookup?.instrument_token,
        exchange: item.exchange || lookup?.exchange || item.segment,
        segment: item.segment || lookup?.segment,
        instrument_type: item.instrument_type || lookup?.instrument_type || null,
        lot_size: item.lot_size || lookup?.lot_size || null,
        expiry: item.expiry || lookup?.expiry || null,
      };
    });

    return {
      id: list._id,
      name: list.name === 'Default' ? DEFAULT_LIST : list.name,
      instruments,
      createdAt: list.createdAt,
    };
  });

  const active = normalized[0]?.name || DEFAULT_LIST;
  const count = normalized.reduce((sum, list) => sum + (list.instruments?.length || 0), 0);

  res.status(200).json({
    success: true,
    watchlists: normalized,
    watchlist: normalized[0]?.instruments || [],
    active,
    count,
  });
});

/**
 * @desc     Update watchlist
 * @route    PUT /api/customer/watchlist
 * @access   Private (Customer only)
 */
const updateWatchlist = asyncHandler(async (req, res) => {
  const customerIdStr = req.user.customer_id;
  const brokerIdStr = req.user.stringBrokerId || req.user.broker_id_str || req.user.attached_broker_id?.toString();
  const {
    instruments,
    action,
    symbol,
    listName,
    name,
    instrumentToken,
    exchange,
    segment,
    instrumentName,
    expiry,
    instrument_type,
    lot_size,
  } = req.body;

  if (!customerIdStr || !brokerIdStr) {
    return res.status(400).json({ success: false, message: 'customer_id or broker_id missing' });
  }

  const DEFAULT_LIST = 'Watchlist 1';
  const MAX_LISTS = 5;
  const desiredName = String(listName || name || DEFAULT_LIST).trim();
  const effectiveName = desiredName || DEFAULT_LIST;

  if (action === 'delete_list') {
    const rawTargetName = String(listName || name || '').trim();
    if (!rawTargetName) {
      return res.status(400).json({ success: false, message: 'Watchlist name is required.' });
    }

    const targetName = rawTargetName === 'Default' ? DEFAULT_LIST : rawTargetName;
    if (targetName === DEFAULT_LIST) {
      return res.status(400).json({ success: false, message: `${DEFAULT_LIST} cannot be deleted.` });
    }

    const listToDelete = await UserWatchlistModel.findOne({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
      name: targetName,
    });

    if (!listToDelete) {
      return res.status(404).json({ success: false, message: 'Watchlist not found.' });
    }

    await UserWatchlistModel.deleteOne({ _id: listToDelete._id });

    let updatedLists = await UserWatchlistModel.find({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    })
      .sort({ createdAt: 1 })
      .lean();

    if (!updatedLists.length) {
      const createdDefault = await UserWatchlistModel.create({
        customer_id_str: customerIdStr,
        broker_id_str: brokerIdStr,
        name: DEFAULT_LIST,
        instruments: [],
      });
      updatedLists = [createdDefault.toObject()];
    }

    syncGlobalWatchlistTokens().catch((err) => {
      console.error('[GlobalRetain] Mutation sync failed:', err.message);
    });

    const normalizedLists = updatedLists.map((list) => ({
      id: list._id,
      name: list.name === 'Default' ? DEFAULT_LIST : list.name,
      instruments: list.instruments || [],
    }));

    const defaultList = normalizedLists.find((list) => list.name === DEFAULT_LIST);
    const activeList = defaultList || normalizedLists[0] || { name: DEFAULT_LIST, instruments: [] };

    return res.status(200).json({
      success: true,
      message: 'Watchlist deleted.',
      watchlist: activeList.instruments || [],
      watchlists: normalizedLists,
      active: activeList.name || DEFAULT_LIST,
    });
  }

  if (action === 'create') {
    const existingLists = await UserWatchlistModel.find({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    }).lean();

    if (existingLists.length >= MAX_LISTS) {
      return res.status(400).json({ success: false, message: `Maximum ${MAX_LISTS} watchlists allowed.` });
    }

    const existingNames = new Set(existingLists.map((list) => (list.name === 'Default' ? DEFAULT_LIST : list.name)));
    let finalName = effectiveName;
    if (!finalName || existingNames.has(finalName)) {
      for (let i = 1; i <= MAX_LISTS; i += 1) {
        const candidate = `Watchlist ${i}`;
        if (!existingNames.has(candidate)) {
          finalName = candidate;
          break;
        }
      }
    }

    const created = await UserWatchlistModel.create({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
      name: finalName || DEFAULT_LIST,
      instruments: [],
    });

    const updatedLists = await UserWatchlistModel.find({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Watchlist created.',
      watchlist: created.instruments,
      watchlists: updatedLists.map((list) => ({
        id: list._id,
        name: list.name === 'Default' ? DEFAULT_LIST : list.name,
        instruments: list.instruments || [],
      })),
      active: created.name === 'Default' ? DEFAULT_LIST : created.name,
    });
  }

  const listQuery = {
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    name: effectiveName,
  };

  if (effectiveName === DEFAULT_LIST) {
    delete listQuery.name;
    listQuery.$or = [{ name: DEFAULT_LIST }, { name: 'Default' }];
  }

  let watchlist = await UserWatchlistModel.findOne(listQuery);

  if (!watchlist) {
    const existingCount = await UserWatchlistModel.countDocuments({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
    });
    if (existingCount >= MAX_LISTS) {
      return res.status(400).json({ success: false, message: `Maximum ${MAX_LISTS} watchlists allowed.` });
    }

    watchlist = await UserWatchlistModel.create({
      customer_id_str: customerIdStr,
      broker_id_str: brokerIdStr,
      name: effectiveName,
      instruments: [],
    });
  }

  if (instruments) {
    watchlist.instruments = instruments;
  } else if (action === 'add' && symbol) {
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    const normalizedToken = instrumentToken ? String(instrumentToken).trim() : '';
    const normalizedSegment = String(segment || '').trim().toUpperCase();
    const normalizedExchange = String(exchange || '').trim().toUpperCase();

    const existing = watchlist.instruments.find((item) => {
      const itemToken = item?.instrumentToken ? String(item.instrumentToken).trim() : '';
      const itemSymbol = String(item?.symbol || '').trim().toUpperCase();
      const itemSegment = String(item?.segment || '').trim().toUpperCase();
      const itemExchange = String(item?.exchange || '').trim().toUpperCase();

      if (normalizedToken && itemToken && itemToken === normalizedToken) return true;
      if (itemSymbol !== normalizedSymbol) return false;
      if (normalizedSegment && itemSegment && itemSegment === normalizedSegment) return true;
      if (normalizedExchange && itemExchange && itemExchange === normalizedExchange) return true;

      return !normalizedToken && !normalizedSegment && !normalizedExchange;
    });

    let resolvedExpiry = expiry || null;
    let resolvedInstrumentType = instrument_type || null;
    let resolvedLotSize = lot_size || null;

    if ((!resolvedExpiry || !resolvedInstrumentType || !resolvedLotSize) && normalizedToken) {
      const instrumentDoc = await Instrument.findOne({ instrument_token: normalizedToken })
        .select('expiry instrument_type lot_size')
        .lean();
      resolvedExpiry = resolvedExpiry || instrumentDoc?.expiry || null;
      resolvedInstrumentType = resolvedInstrumentType || instrumentDoc?.instrument_type || null;
      resolvedLotSize = resolvedLotSize || instrumentDoc?.lot_size || null;
    }

    if (!existing) {
      watchlist.instruments.push({
        symbol: normalizedSymbol,
        name: instrumentName,
        instrumentToken: normalizedToken || null,
        exchange: normalizedExchange || 'NSE',
        segment: normalizedSegment || null,
        instrument_type: resolvedInstrumentType,
        lot_size: resolvedLotSize,
        expiry: resolvedExpiry,
        addedAt: new Date(),
      });
    } else {
      if (!existing.instrumentToken && normalizedToken) {
        existing.instrumentToken = normalizedToken;
      }
      if (instrumentName && !existing.name) {
        existing.name = instrumentName;
      }
      if (normalizedExchange && !existing.exchange) {
        existing.exchange = normalizedExchange;
      }
      if (normalizedSegment && !existing.segment) {
        existing.segment = normalizedSegment;
      }
      if (!existing.instrument_type && resolvedInstrumentType) {
        existing.instrument_type = resolvedInstrumentType;
      }
      if (!existing.lot_size && resolvedLotSize) {
        existing.lot_size = resolvedLotSize;
      }
      if (!existing.expiry && resolvedExpiry) {
        existing.expiry = resolvedExpiry;
      }
    }
  } else if (action === 'remove' && symbol) {
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    const normalizedToken = instrumentToken ? String(instrumentToken).trim() : '';
    const normalizedSegment = String(segment || '').trim().toUpperCase();
    const normalizedExchange = String(exchange || '').trim().toUpperCase();

    watchlist.instruments = watchlist.instruments.filter((item) => {
      const itemToken = item?.instrumentToken ? String(item.instrumentToken).trim() : '';
      const itemSymbol = String(item?.symbol || '').trim().toUpperCase();
      const itemSegment = String(item?.segment || '').trim().toUpperCase();
      const itemExchange = String(item?.exchange || '').trim().toUpperCase();

      if (normalizedToken && itemToken) return itemToken !== normalizedToken;
      if (itemSymbol !== normalizedSymbol) return true;
      if (normalizedSegment && itemSegment && itemSegment !== normalizedSegment) return true;
      if (normalizedExchange && itemExchange && itemExchange !== normalizedExchange) return true;
      return false;
    });
  }

  watchlist.instruments = (watchlist.instruments || []).filter(
    (item) => item && typeof item.symbol === 'string' && item.symbol.trim().length > 0
  );

  await watchlist.save();

  const updatedLists = await UserWatchlistModel.find({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
  })
    .sort({ createdAt: 1 })
    .lean();

  // Sync global token retention after watchlist change
  syncGlobalWatchlistTokens().catch((err) => {
    console.error('[GlobalRetain] Mutation sync failed:', err.message);
  });

  res.status(200).json({
    success: true,
    message: 'Watchlist updated.',
    watchlist: watchlist.instruments,
    watchlists: updatedLists.map((list) => ({
      id: list._id,
      name: list.name === 'Default' ? DEFAULT_LIST : list.name,
      instruments: list.instruments || [],
    })),
    active: watchlist.name === 'Default' ? DEFAULT_LIST : watchlist.name,
  });
});

export {
  placeOrder,
  getOrders,
  modifyOrder,
  cancelOrder,
  getHoldings,
  getPositions,
  getWatchlist,
  updateWatchlist,
};
