// Controllers/legacy/orderController.js
import asyncHandler from "express-async-handler";
import Order from "../../Model/Trading/OrdersModel.js";
import Fund from "../../Model/FundManagement/FundModel.js";
import Customer from "../../Model/Auth/CustomerModel.js";
import Instrument from "../../Model/InstrumentModel.js";

import {
  addToWatchlist,
  removeFromWatchlist,
  updateTriggerInWatchlist,
} from "../../Utils/OrderManager.js";
import { checkOptionLimit, updateOptionUsage, rollbackOptionUsage } from "../../Utils/OptionLimitManager.js";
import { closeOrderAndSettle } from "../../services/closeOrderAndSettle.js";
import {
  getMarginBucket,
  reserveMargin,
  releaseMarginOnClose,
  refundMarginImmediate,
  reserveDeliveryForHoldConversion,
  reserveCommodityDeliveryForHoldConversion,
} from "../../services/marginLifecycle.js";
import {
  getClientPricingConfig,
  inferPricingBucket,
  inferSpreadBucket,
  getSpreadConfigForBucket,
  applySpreadToPrice,
  buildEntryBrokerageSnapshot,
  resolveLots,
} from "../../Utils/ClientPricingEngine.js";
import { resolveOrderValidity } from "../../services/orderValidity.js";
import { isMCX } from "../../Utils/mcx/resolver.js";
import { logFailedOrderAttempt } from "../../Utils/OrderAttemptLogger.js";
import { formatMarketClosedMessage, getMarketStatusForInstrument } from "../../Utils/tradingSession.js";

const toNumber = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const normalizeProduct = (value) => String(value || "").trim().toUpperCase();
const isLongTermProduct = (value) => ["CNC", "NRML"].includes(normalizeProduct(value));
const normalizeRiskValue = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const normalizeExitReason = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "broker_manual") return "manual";
  return normalized;
};

const isCustomerRequest = (req) => {
  const role = String(req.role || req.user?.role || '').toLowerCase();
  return role === 'customer';
};

const isPrivilegedImpersonation = (req) =>
  req.user?.isImpersonation &&
  ['broker', 'admin'].includes(req.user?.impersonatorRole);

const marketClosedPayload = ({ exchange, segment } = {}) => {
  const marketStatus = getMarketStatusForInstrument({ exchange, segment });
  return {
    success: false,
    code: 'MARKET_CLOSED',
    message: formatMarketClosedMessage({ exchange, segment }),
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

const postOrder = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // ... (Apki purani destructuring aur validations same rahengi) ...
  const {
    broker_id_str,
    customer_id_str,
    instrument_token,  // Kite field (replaces Dhan's security_Id)
    symbol,
    side,
    product,
    price = 0,
    quantity,
    lot_size = 1,
    lots,
    segment = "UNKNOWN",
    exchange,
    order_type,
    customer_id,
    broker_id,
    jobbin_price,
    came_From, // Extract came_From
    meta = {},
  } = body;

  const failAttempt = async ({
    status = 400,
    error = "Order attempt failed",
    code,
    extraResponse,
    details,
  }) => {
    await logFailedOrderAttempt({
      req,
      payload: body,
      reason: error,
      code,
      status,
      details,
    });

    return res.status(status).json({
      error,
      ...(extraResponse || {}),
    });
  };

  if (!broker_id_str || !customer_id_str) {
    return failAttempt({
      status: 400,
      error: "broker_id_str and customer_id_str are required",
      code: "VALIDATION_ERROR",
    });
  }
  if (!instrument_token || !symbol) {
    return failAttempt({
      status: 400,
      error: "instrument_token and symbol are required",
      code: "VALIDATION_ERROR",
    });
  }
  if (!side || !["BUY", "SELL"].includes(side)) {
    return failAttempt({
      status: 400,
      error: "side must be BUY or SELL",
      code: "VALIDATION_ERROR",
    });
  }
  if (
    !product ||
    !["MIS", "NRML", "CNC"].includes(String(product).trim().toUpperCase())
  ) {
    return failAttempt({
      status: 400,
      error: "product must be MIS, NRML, or CNC",
      code: "VALIDATION_ERROR",
    });
  }

  const productNorm = normalizeProduct(product);
  const orderTypeNorm = String(order_type || "MARKET").trim().toUpperCase();
  const sideNorm = String(side || '').trim().toUpperCase();
  const qtyNum = Number(quantity);
  const requestedTriggerPrice = normalizeRiskValue(body.trigger_price);
  const requestedTarget = normalizeRiskValue(body.target);
  const requestedStopLoss = normalizeRiskValue(body.stop_loss);
  // The current UI sends MIS SL placement in trigger_price; arm the watcher via stop_loss.
  const effectiveStopLoss =
    requestedStopLoss > 0
      ? requestedStopLoss
      : (productNorm === "MIS" && orderTypeNorm === "SL" ? requestedTriggerPrice : 0);

  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    return failAttempt({
      status: 400,
      error: "quantity must be a positive number",
      code: "VALIDATION_ERROR",
    });
  }
  const rawEntryPrice = Number(price);
  if (!Number.isFinite(rawEntryPrice) || rawEntryPrice <= 0) {
    return failAttempt({
      status: 400,
      error: "price must be a positive number",
      code: "VALIDATION_ERROR",
    });
  }

  if (
    isLongTermProduct(productNorm) &&
    (
      ["SL", "TGT"].includes(orderTypeNorm) ||
      requestedTriggerPrice !== 0 ||
      requestedTarget !== 0 ||
      requestedStopLoss !== 0
    )
  ) {
    return failAttempt({
      status: 400,
      error: "SL/Target is locked for longterm orders (CNC/NRML). Use market/regular order.",
      code: "VALIDATION_ERROR",
    });
  }

  // Resolve instrument context before pricing/margin checks.
  let resolvedExchange = exchange;
  let resolvedSegment = segment;
  let instrumentDoc = null;

  if (!resolvedExchange || !resolvedSegment || resolvedSegment === "UNKNOWN") {
    instrumentDoc = await Instrument.findOne({ instrument_token: String(instrument_token) })
      .select("exchange segment tradingsymbol name expiry instrument_type lot_size")
      .lean();
    resolvedExchange = resolvedExchange || instrumentDoc?.exchange || "NSE";
    resolvedSegment = resolvedSegment === "UNKNOWN" ? (instrumentDoc?.segment || "NSE") : resolvedSegment;
  } else {
    instrumentDoc = await Instrument.findOne({ instrument_token: String(instrument_token) })
      .select("exchange segment tradingsymbol name expiry instrument_type lot_size")
      .lean();
  }

  // MCX NRML rejection: carryforward must use CNC
  if (isMCX({ exchange: resolvedExchange, segment: resolvedSegment }) && productNorm === 'NRML') {
    return failAttempt({
      status: 400,
      error: 'MCX carryforward must use CNC, not NRML.',
      code: 'MCX_NRML_NOT_ALLOWED',
    });
  }

  // Client-level spread application (effective entry price drives margin + P&L basis)
  const pricingConfig = await getClientPricingConfig({
    brokerIdStr: String(broker_id_str),
    customerIdStr: String(customer_id_str),
  });
  const pricingBucket = inferPricingBucket({
    exchange: resolvedExchange,
    segment: resolvedSegment,
    symbol,
    orderType: orderTypeNorm,
  });
  const spreadBucket = inferSpreadBucket({
    exchange: resolvedExchange,
    segment: resolvedSegment,
    symbol,
    orderType: orderTypeNorm,
  });
  const spreadConfig = getSpreadConfigForBucket(pricingConfig, spreadBucket);
  const entryPricing = applySpreadToPrice({
    rawPrice: rawEntryPrice,
    side: sideNorm,
    spread: spreadConfig.value,
    spreadMode: spreadConfig.mode,
  });
  const effectiveEntryPrice = entryPricing.effectivePrice;
  const resolvedLotSize = Math.max(1, toNumber(lot_size || instrumentDoc?.lot_size || 1));
  const resolvedLots = resolveLots({
    lots,
    quantity: qtyNum,
    lotSize: resolvedLotSize,
  });
  const entryBrokerageSnapshot = buildEntryBrokerageSnapshot({
    pricing: pricingConfig,
    bucket: pricingBucket,
    side: sideNorm,
    quantity: qtyNum,
    lotSize: resolvedLotSize,
    lots: resolvedLots,
    effectivePrice: effectiveEntryPrice,
  });

  // ============================================================
  // START: FUND & MARGIN LOGIC (Same as updateOrder)
  // ============================================================

  const requiredMargin = effectiveEntryPrice * qtyNum;

  const fund = await Fund.findOne({ broker_id_str, customer_id_str });

  if (!fund) {
    return failAttempt({
      status: 404,
      error: "Fund account not found for this user.",
      code: "FUND_ACCOUNT_NOT_FOUND",
    });
  }

  let marginBucket = null;

  // --- SPECIAL LOGIC: OPTIONS USE ONLY OPTION PREMIUM BALANCE ---
  const symUpper = String(symbol).toUpperCase();
  const isOption = (symUpper.endsWith("CE") || symUpper.endsWith("PE") || symUpper.endsWith("CALL") || symUpper.endsWith("PUT"));

  if (isOption) {
    // If broker provides a new limit % in payload, update it FIRST
    if (body.option_limit_percentage !== undefined && body.option_limit_percentage !== null) {
        fund.option_limit_percentage = Number(body.option_limit_percentage);
        await fund.save(); // Save immediately so checkOptionLimit sees new value
    }

    // Options trade ONLY against the option premium limit — not intraday/overnight
    const limitCheck = checkOptionLimit(fund, productNorm, requiredMargin, { exchange: resolvedExchange, segment: resolvedSegment });
    if (!limitCheck.allowed) {
      return failAttempt({
        status: 400,
        error: limitCheck.message,
        code: "OPTION_LIMIT",
      });
    }

    // Deduct from option premium only (not intraday/overnight)
    console.log(`[OrderController] Option Order: Symbol=${symbol}, Product=${productNorm}, Margin=${requiredMargin}, Raw=${rawEntryPrice}, Effective=${effectiveEntryPrice}, Bucket=${pricingBucket}`);
    updateOptionUsage(fund, productNorm, requiredMargin, { exchange: resolvedExchange, segment: resolvedSegment });
  } else {
    // --- NON-OPTION: Use bucket-aware reserve from marginLifecycle ---
    marginBucket = getMarginBucket(productNorm, { exchange: resolvedExchange, segment: resolvedSegment });
    const reserveResult = reserveMargin(fund, marginBucket, requiredMargin);
    if (!reserveResult.ok) {
      return failAttempt({
        status: 400,
        error: reserveResult.error,
        code: "INSUFFICIENT_FUNDS",
      });
    }
    console.log(`[OrderController] Non-Option Order: Symbol=${symbol}, Product=${productNorm}, Margin=${requiredMargin}, Bucket=${marginBucket}, Raw=${rawEntryPrice}, Effective=${effectiveEntryPrice}, PricingBucket=${pricingBucket}`);
  }

  await fund.save();
  // ============================================================
  // END: FUND LOGIC
  // ============================================================

  let resolvedCustomerId = customer_id;
  let resolvedBrokerId = broker_id;

  if (!resolvedCustomerId || !resolvedBrokerId) {
    const customerDoc = await Customer.findOne({ customer_id: String(customer_id_str) })
      .select("_id broker_id broker_id_str")
      .lean();
    resolvedCustomerId = resolvedCustomerId || customerDoc?._id;
    resolvedBrokerId = resolvedBrokerId || customerDoc?.broker_id;
  }

  if (!resolvedCustomerId || !resolvedBrokerId) {
    return failAttempt({
      status: 400,
      error: "customer_id and broker_id are required",
      code: "VALIDATION_ERROR",
    });
  }

  const isImmediate = productNorm === "MIS";
  const requiresApproval = !isImmediate;
  const status = isImmediate ? "EXECUTED" : "PENDING";
  const approvalStatus = requiresApproval ? "pending" : "approved";

  // Resolve validity lifecycle
  const placedAt = new Date();
  const instrumentExpiry =
    meta?.selectedStock?.expiry ||
    body.expiry ||
    instrumentDoc?.expiry ||
    null;
  const validity = resolveOrderValidity({
    product: productNorm,
    exchange: String(resolvedExchange || "NSE"),
    segment: String(resolvedSegment || "NSE"),
    symbol: String(symbol),
    instrumentExpiry,
    placedAt,
  });

  const mergedMeta = {
    ...(meta || {}),
    ...(marginBucket ? {
      margin_hold: {
        reserved: true,
        reservedAt: new Date(),
        bucket: marginBucket,
        source: 'customer_place',
      },
    } : {}),
    selectedStock: {
      ...(meta?.selectedStock || {}),
      symbol: String(symbol),
      exchange: String(resolvedExchange || "NSE"),
      segment: String(resolvedSegment || "NSE"),
      instrument_token: String(instrument_token),
      expiry: instrumentExpiry || null,
    },
  };

  const orderDoc = new Order({
    customer_id: resolvedCustomerId,
    customer_id_str: String(customer_id_str),
    broker_id: resolvedBrokerId,
    broker_id_str: String(broker_id_str),
    instrument_token: String(instrument_token),
    symbol: String(symbol),
    exchange: String(resolvedExchange || "NSE"),
    segment: String(resolvedSegment || "NSE"),
    side,
    order_type: orderTypeNorm === "TGT" ? "LIMIT" : orderTypeNorm,
    product: productNorm,
    status,
    requires_approval: requiresApproval,
    approval_status: approvalStatus,
    price: effectiveEntryPrice,
    raw_entry_price: rawEntryPrice,
    effective_entry_price: effectiveEntryPrice,
    entry_spread_applied: entryPricing.appliedSpread,
    trigger_price: Number(body.trigger_price || 0),
    target: Number(body.target || 0),
    quantity: qtyNum,
    lot_size: resolvedLotSize,
    lots: resolvedLots,
    increase_price:
      jobbin_price === "" || jobbin_price == null ? 0 : Number(jobbin_price),
    margin_blocked: requiredMargin,
    pricing_bucket: pricingBucket,
    brokerage: entryBrokerageSnapshot.amount,
    brokerage_breakdown: entryBrokerageSnapshot.breakdown,
    came_From: came_From || "Open",
    meta: mergedMeta,
    placed_at: placedAt,
    stop_loss: effectiveStopLoss,
    validity_mode: validity.mode,
    validity_started_at: validity.startsAt,
    validity_expires_at: validity.expiresAt,
  });

  try {
    const saved = await orderDoc.save();

    // Add to RAM (For Auto-Exit)
    await addToWatchlist(saved);

    return res.json({ ok: true, message: "Order saved", order: saved });
  } catch (error) {
    // --- ROLLBACK FUND (Refund if Fail) ---
    if (isOption) {
      // Options only used option premium — rollback that
      rollbackOptionUsage(fund, productNorm, requiredMargin, { exchange: resolvedExchange, segment: resolvedSegment });
    } else {
      // Use the same bucket that was reserved
      refundMarginImmediate(fund, marginBucket, requiredMargin, {
        reason: 'order_save_rollback',
        orderId: 'pre_save',
      });
    }

    await fund.save();
    return failAttempt({
      status: 500,
      error: "Order creation failed: " + error.message,
      code: "ORDER_CREATE_FAILED",
      details: { stage: "order_save" },
    });
  }
});

const getOrderInstrument = asyncHandler(async (req, res) => {
  const source =
    req.method === "GET" && req.query && Object.keys(req.query).length
      ? req.query
      : req.body || {};
  const { broker_id_str, customer_id_str, orderStatus, product } = source || {};
  const order_status =
    typeof orderStatus === "string" ? orderStatus.trim().toUpperCase() : "";
  const productIn =
    typeof product === "string" ? product.trim().toUpperCase() : "";

  const filter = {};
  if (broker_id_str) filter.broker_id_str = String(broker_id_str);
  if (customer_id_str) filter.customer_id_str = String(customer_id_str); // If caller requested a specific product (MIS or NRML), apply filter

  if (productIn && ["MIS", "NRML", "CNC"].includes(productIn)) {
    filter.product = productIn;
  } // Default behavior: if caller doesn't specify orderStatus, return only OPEN orders // BUT when caller asked for NRML/overnight (`product=NRML`), do NOT filter by order_status (NRML orders keep order_status null).

  if (["NRML", "CNC"].includes(String(productIn).toUpperCase())) {
    // 🎯 FIX: For CNC/NRML, filter out explicitly CLOSED orders, keeping only active/null status.
    filter.order_status = { $ne: "CLOSED" };
  } else {
    if (order_status) {
      // allow special value 'ALL' to bypass filtering
      if (String(order_status).toUpperCase() !== "ALL") {
        filter.order_status = String(order_status);
      }
    } else {
      filter.order_status = "OPEN";
    }
  }

  try {
    const ordersInstrument = await Order.find(filter).lean();
    return res.json({ ok: true, ordersInstrument });
  } catch (err) {
    console.error("getOrderInstrument error:", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch orders" });
  }
});

const updateOrder = asyncHandler(async (req, res) => {
  const {
    broker_id_str,
    customer_id_str,
    order_id,
    instrument_token,  // Kite field
    symbol,
    side,
    product,
    quantity,
    lots,
    lot_size,
    price,
    order_status,
    segment,
    closed_ltp,
    closed_at,
    came_From,
    stop_loss,
    target,
    ...rest
  } = req.body || {};
  const hasStopLossInput = stop_loss !== undefined;
  const hasTargetInput = target !== undefined;
  const hasPriceInput = price !== undefined;
  const requestedStopLoss = hasStopLossInput ? Number(stop_loss) : undefined;
  const requestedTarget = hasTargetInput ? Number(target) : undefined;
  const requestedPrice = hasPriceInput ? Number(price) : undefined;
  const normalizedExitReason = normalizeExitReason(rest.exit_reason);

  if (!order_id) {
    return res.status(400).json({ success: false, message: 'order_id is required' });
  }

  // Update Object Creation
  const update = {};

  if (quantity !== undefined && quantity !== null) update.quantity = Number(quantity);
  if (lots !== undefined && lots !== null && lots !== '') update.lots = Number(lots);
  if (lot_size !== undefined && lot_size !== null && lot_size !== '') {
    update.lot_size = Math.max(1, Number(lot_size) || 1);
  }
  if (hasPriceInput && String(order_status || '').toUpperCase() !== 'CLOSED') {
    // NOTE: weighted average is computed later (after fetching existing order)
    // when qty increases. Store raw requested price temporarily.
    update._requestedPrice = requestedPrice;
    update.entry_spread_applied = 0;
  }
  if (order_status) {
    update.order_status = order_status;
    update.status = order_status; // sync with schema field
  }
  if (closed_ltp) {
    update.closed_ltp = Number(closed_ltp);
    update.exit_price = Number(closed_ltp);
  }
  if (closed_at) {
    update.closed_at = closed_at;
    update.exit_at = closed_at;
  }
  if (normalizedExitReason) update.exit_reason = normalizedExitReason;

  // 👇 Fix: Add came_From to update object
  if (came_From) update.came_From = String(came_From).trim();

  // Validate SL/Target payload values (if provided)
  if (hasStopLossInput && !Number.isFinite(requestedStopLoss)) {
    return res.status(400).json({ success: false, message: "stop_loss must be a valid number" });
  }
  if (hasTargetInput && !Number.isFinite(requestedTarget)) {
    return res.status(400).json({ success: false, message: "target must be a valid number" });
  }
  if (hasPriceInput && (!Number.isFinite(requestedPrice) || requestedPrice <= 0)) {
    return res.status(400).json({ success: false, message: "price must be a positive number" });
  }

  update.updatedAt = new Date();

  // 👇 Re-approval logic: CNC/NRML orders with qty/lots changes go back to PENDING
  // This runs AFTER all other status updates to ensure it takes priority
  const requiresReapproval = req.body.requires_reapproval === true;
  if (requiresReapproval) {
    update.status = 'PENDING';
    update.order_status = 'PENDING';
    update.requires_approval = true;
    update.approval_status = 'pending';
    update.approved_by = null;
    update.approved_at = null;
    update.modified_at = new Date();
    // TODO: Notify broker about the modification (broker module pending)
  }

  try {
    // 1. Find Existing Order
    let existing = await Order.findById(order_id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // ── Price calculation when price is provided ──
    if (update._requestedPrice !== undefined) {
      const isBrokerOverride = rest.broker_price_override === true;

      if (isBrokerOverride) {
        // Broker explicit price override — use raw price as-is, no spread, no averaging
        const rawPrice = Math.round(toNumber(update._requestedPrice) * 100) / 100;
        update.price = rawPrice;
        update.raw_entry_price = rawPrice;
        update.effective_entry_price = rawPrice;
        update.entry_spread_applied = 0;
      } else {
        const isQtyIncrease = update.quantity && update.quantity > existing.quantity;
        if (isQtyIncrease) {
          const oldQty = toNumber(existing.quantity);
          const oldPrice = toNumber(existing.effective_entry_price || existing.price);
          const addedQty = toNumber(update.quantity) - oldQty;
          // Frontend sends raw LTP for new lots — apply spread here (same as order placement)
          const rawNewLotPrice = toNumber(update._requestedPrice);
          const pricingConfig = await getClientPricingConfig({
            brokerIdStr: existing.broker_id_str,
            customerIdStr: existing.customer_id_str,
          });
          const pricingBucket = existing.pricing_bucket || inferPricingBucket({
            exchange: existing.exchange,
            segment: existing.segment,
            symbol: existing.symbol,
            orderType: existing.order_type,
          });
          const spreadBucket = inferSpreadBucket({
            exchange: existing.exchange,
            segment: existing.segment,
            symbol: existing.symbol,
            orderType: existing.order_type,
          });
          const modSpreadConfig = getSpreadConfigForBucket(pricingConfig, spreadBucket);
          const newLotPricing = applySpreadToPrice({
            rawPrice: rawNewLotPrice,
            side: existing.side,
            spread: modSpreadConfig.value,
            spreadMode: modSpreadConfig.mode,
          });
          const effectiveNewLotPrice = newLotPricing.effectivePrice;
          // Single weighted average: (oldQty × oldEffectivePrice + addedQty × newEffectivePrice) / totalQty
          const weightedAvg = ((oldQty * oldPrice) + (addedQty * effectiveNewLotPrice)) / toNumber(update.quantity);
          const finalPrice = Math.round(weightedAvg * 100) / 100;
          update.price = finalPrice;
          update.raw_entry_price = rawNewLotPrice;
          update.effective_entry_price = finalPrice;
          update.entry_spread_applied = newLotPricing.appliedSpread;
        } else {
          // No qty increase — direct price update (customer edit or same-qty modify)
          const pricingConfig = await getClientPricingConfig({
            brokerIdStr: existing.broker_id_str,
            customerIdStr: existing.customer_id_str,
          });
          const spreadBucket = inferSpreadBucket({
            exchange: existing.exchange,
            segment: existing.segment,
            symbol: existing.symbol,
            orderType: existing.order_type,
          });
          const editSpreadConfig = getSpreadConfigForBucket(pricingConfig, spreadBucket);
          const updatedEntryPricing = applySpreadToPrice({
            rawPrice: update._requestedPrice,
            side: existing.side,
            spread: editSpreadConfig.value,
            spreadMode: editSpreadConfig.mode,
          });
          update.price = updatedEntryPricing.effectivePrice;
          update.raw_entry_price = updatedEntryPricing.rawPrice;
          update.effective_entry_price = updatedEntryPricing.effectivePrice;
          update.entry_spread_applied = updatedEntryPricing.appliedSpread;
        }
      }
      delete update._requestedPrice;
    }

    const isLongTermHoldingOrder = isLongTermProduct(update.product || existing.product || product);
    if (
      isLongTermHoldingOrder &&
      isCustomerRequest(req) &&
      !isPrivilegedImpersonation(req)
    ) {
      const marketStatus = getMarketStatusForInstrument({ exchange: existing.exchange, segment: existing.segment });
      if (!marketStatus.isOpen) {
        return res.status(403).json(marketClosedPayload({ exchange: existing.exchange, segment: existing.segment }));
      }
    }

    const effectiveProduct = normalizeProduct(update.product || existing.product || product);
    if (
      isLongTermProduct(effectiveProduct) &&
      (hasStopLossInput || hasTargetInput) &&
      isCustomerRequest(req) &&
      !isPrivilegedImpersonation(req)
    ) {
      const currentStopLoss = normalizeRiskValue(existing.stop_loss);
      const currentTarget = normalizeRiskValue(existing.target);
      const nextStopLoss = hasStopLossInput ? requestedStopLoss : currentStopLoss;
      const nextTarget = hasTargetInput ? requestedTarget : currentTarget;

      if (nextStopLoss !== currentStopLoss || nextTarget !== currentTarget) {
        return res.status(400).json({
          success: false,
          message: "SL/Target cannot be set or modified for longterm orders (CNC/NRML).",
        });
      }
    }

    // 👇 SL/Target update (allowed after longterm lock checks)
    if (hasStopLossInput) update.stop_loss = requestedStopLoss;
    if (hasTargetInput) update.target = requestedTarget;

    // ── CLOSE PATH: Delegate to closeOrderAndSettle ──
    const incomingStatus = (order_status || '').toUpperCase();
    const existingStatus = (existing.status || existing.order_status || '').toUpperCase();
    const isCustomerLongTermExitRequest =
      incomingStatus === 'CLOSED' &&
      existingStatus !== 'CLOSED' &&
      isLongTermProduct(effectiveProduct) &&
      isCustomerRequest(req) &&
      !isPrivilegedImpersonation(req);

    if (isCustomerLongTermExitRequest) {
      const customerDoc = await Customer.findOne({ customer_id: existing.customer_id_str })
        .select('holdings_exit_allowed')
        .lean();
      if (!customerDoc?.holdings_exit_allowed && !existing?.exit_allowed) {
        return res.status(403).json({
          success: false,
          message: 'Holdings exit is locked by your broker.',
        });
      }
    }

    if (incomingStatus === 'CLOSED' && existingStatus !== 'CLOSED') {
      const exitPrice = Number(closed_ltp) || Number(existing.price) || 0;
      const result = await closeOrderAndSettle(existing._id, {
        exitPrice,
        exitReason: normalizedExitReason || 'manual',
        cameFrom: came_From || '',
      });

      if (!result.ok) {
        if (result.error === 'already_closed_or_not_found') {
          await removeFromWatchlist({
            _id: existing._id,
            instrument_token: existing.instrument_token || existing.security_Id,
          });
        }
        return res.status(409).json({ success: false, message: result.error || 'Failed to close order' });
      }

      await removeFromWatchlist(result.order || {
        _id: existing._id,
        instrument_token: existing.instrument_token || existing.security_Id,
      });

      return res.status(200).json({
        success: true,
        message: 'Order closed & settled',
        order: result.order,
        pnl: result.pnl,
      });
    }

    // ── NON-CLOSE PATHS: qty increase, SL/Target modify, HOLD transition, re-approval ──
    // 2. Find Fund
    const fund = await Fund.findOne({
      broker_id_str: existing.broker_id_str,
      customer_id_str: existing.customer_id_str
    });

    if (!fund) {
      return res.status(404).json({ success: false, message: "Fund account not found" });
    }

    const currentProduct = update.product || existing.product;
    const currentStatus = update.order_status || existing.order_status || existing.status;
    const isHold = currentStatus === 'HOLD';
    const isIntraday = String(currentProduct).trim().toUpperCase() === 'MIS' || isHold;


    const existingIsIntraday = String(existing.product).trim().toUpperCase() === 'MIS';


    // Detect if this is an option order
    const exSymUpper = String(existing.symbol).toUpperCase();
    const isOptionUpdate = (exSymUpper.endsWith("CE") || exSymUpper.endsWith("PE") || exSymUpper.endsWith("CALL") || exSymUpper.endsWith("PUT"));

    if (update.quantity && update.quantity > existing.quantity && existing.order_status !== 'CLOSED') {

      const newQty = Number(update.quantity);
      const calcPrice = update.price ? Number(update.price) : Number(existing.price);

      const oldMargin = existing.margin_blocked || (existing.quantity * existing.price);
      const newTotalMargin = newQty * calcPrice;

      const marginToDeduct = newTotalMargin - oldMargin;

      if (marginToDeduct > 0) {

        if (isOptionUpdate) {
          // Options: check and deduct ONLY from option premium limit
          const limitCheck = checkOptionLimit(fund, currentProduct, marginToDeduct, { exchange: existing.exchange, segment: existing.segment });
          if (!limitCheck.allowed) {
            return res.status(400).json({
              success: false,
              message: limitCheck.message.replace('Required:', 'Additional Required:')
            });
          }
          updateOptionUsage(fund, currentProduct, marginToDeduct, { exchange: existing.exchange, segment: existing.segment });
        } else {
          // Non-options: bucket-aware reserve via marginLifecycle
          const modBucket = getMarginBucket(effectiveProduct, { exchange: existing.exchange, segment: existing.segment });
          const reserveResult = reserveMargin(fund, modBucket, marginToDeduct);
          if (!reserveResult.ok) {
            return res.status(400).json({
              success: false,
              message: reserveResult.error,
            });
          }

          // Update margin_hold metadata to reflect the bucket
          if (!existing.meta) existing.meta = {};
          update['meta.margin_hold'] = {
            reserved: true,
            reservedAt: new Date(),
            bucket: modBucket,
            source: existing.meta?.margin_hold?.source || 'customer_place',
          };
        }

        // Record new total margin
        update.margin_blocked = newTotalMargin;
      }
    }

    // Qty decrease: release freed margin delta from the correct bucket
    else if (update.quantity && update.quantity < existing.quantity && existing.order_status !== 'CLOSED') {
      const newQty = Number(update.quantity);
      const calcPrice = update.price ? Number(update.price) : Number(existing.effective_entry_price || existing.price);

      const oldMargin = toNumber(existing.margin_blocked) || (existing.quantity * toNumber(existing.effective_entry_price || existing.price));
      const newTotalMargin = newQty * calcPrice;
      const marginToRelease = oldMargin - newTotalMargin;

      if (marginToRelease > 0) {
        if (isOptionUpdate) {
          rollbackOptionUsage(fund, effectiveProduct, marginToRelease, { exchange: existing.exchange, segment: existing.segment });
        } else {
          const relBucket = existing.meta?.margin_hold?.bucket
            || getMarginBucket(effectiveProduct, { exchange: existing.exchange, segment: existing.segment });
          refundMarginImmediate(fund, relBucket, marginToRelease, {
            reason: 'qty_decrease',
            orderId: String(existing._id),
          });
        }
      }
      update.margin_blocked = newTotalMargin;
    }


    // HOLD transition: release intraday, reserve delivery, update margin on order
    else if (update.order_status === 'HOLD' && ['OPEN', 'EXECUTED'].includes((existing.status || existing.order_status || '').toUpperCase()) && existingIsIntraday) {
      const intradayMargin = toNumber(existing.margin_blocked);
      const requiredDeliveryMargin = toNumber(existing.price) * toNumber(existing.quantity);
      const isMcxOrder = isMCX({ exchange: existing.exchange, segment: existing.segment });

      const deliveryReserve = isMcxOrder
        ? reserveCommodityDeliveryForHoldConversion(fund, requiredDeliveryMargin, { orderId: String(existing._id) })
        : reserveDeliveryForHoldConversion(fund, requiredDeliveryMargin, { orderId: String(existing._id) });
      if (!deliveryReserve.ok) {
        return res.status(400).json({ success: false, message: deliveryReserve.error });
      }

      // Release the intraday margin that was locked for this MIS order
      const intradayBucket = isMcxOrder ? 'commodity_intraday' : 'intraday';
      refundMarginImmediate(fund, intradayBucket, intradayMargin, {
        reason: 'MIS→HOLD conversion',
        orderId: String(existing._id),
      });

      update.margin_blocked = requiredDeliveryMargin;
      update.margin_released_at = undefined; // delivery margin still active
    }

    // CANCELLED / REJECTED: release margin immediately
    else if (['CANCELLED', 'REJECTED'].includes((update.order_status || '').toUpperCase()) &&
             !existing.margin_released_at &&
             toNumber(existing.margin_blocked) > 0) {
      if (!existing.margin_released_at) {
        releaseMarginOnClose(fund, existing, {
          reason: (update.order_status || '').toLowerCase(),
          orderId: String(existing._id),
          bucketOverride: existing.meta?.margin_hold?.bucket,
        });
        update.margin_blocked = 0;
        update.margin_released_at = new Date();
      }
    }

    const finalPricingConfig = await getClientPricingConfig({
      brokerIdStr: existing.broker_id_str,
      customerIdStr: existing.customer_id_str,
    });
    const finalPricingBucket = update.pricing_bucket || existing.pricing_bucket || inferPricingBucket({
      exchange: update.exchange || existing.exchange,
      segment: update.segment || existing.segment,
      symbol: update.symbol || existing.symbol,
      orderType: update.order_type || existing.order_type,
    });
    const finalEntryPrice = toNumber(
      update.effective_entry_price ?? update.price ?? existing.effective_entry_price ?? existing.price
    );
    const finalQuantity = toNumber(update.quantity ?? existing.quantity);
    const finalLotSize = Math.max(1, toNumber(update.lot_size ?? existing.lot_size ?? 1));
    const finalLots = resolveLots({
      lots: update.lots ?? existing.lots,
      quantity: finalQuantity,
      lotSize: finalLotSize,
    });
    const entryBrokerageSnapshot = buildEntryBrokerageSnapshot({
      pricing: finalPricingConfig,
      bucket: finalPricingBucket,
      side: update.side || existing.side,
      quantity: finalQuantity,
      lotSize: finalLotSize,
      lots: finalLots,
      effectivePrice: finalEntryPrice,
    });

    update.pricing_bucket = finalPricingBucket;
    update.lot_size = finalLotSize;
    update.lots = finalLots;
    update.brokerage = entryBrokerageSnapshot.amount;
    update.brokerage_breakdown = entryBrokerageSnapshot.breakdown;

    await fund.save();

    const updated = await Order.findByIdAndUpdate(existing._id, { $set: update }, { new: true, runValidators: true });

    if (!updated) {
      return res.status(500).json({ success: false, message: 'Failed to update order' });
    }

    // Keep trigger registry in sync for all lifecycle changes.
    await updateTriggerInWatchlist(updated);

    return res.status(200).json({ success: true, message: 'Order updated', order: updated });

  } catch (err) {
    console.error('[updateOrder] error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
  }
});


// NOTE: Frontend se ab hum 'PUT' request bhejenge
const exitAllOpenOrder = asyncHandler(async (req, res) => {
  // URL params se IDs
  const { broker_id_str, customer_id_str } = req.query;

  // Body se Payload
  const { closed_ltp_map, closed_at } = req.body || {};

  if (!broker_id_str || !customer_id_str) {
    res.status(400);
    throw new Error("Missing Broker ID or Customer ID");
  }

  // Fetch open intraday orders (use canonical schema fields)
  const openOrders = await Order.find({
    broker_id_str: broker_id_str,
    customer_id_str: customer_id_str,
    status: "OPEN",
    category: "INTRADAY",
  });

  if (!openOrders || openOrders.length === 0) {
    console.log("No orders found for:", broker_id_str, customer_id_str);
    return res.status(200).json({
      success: false,
      message: "No open Intraday orders found to exit.",
    });
  }

  const results = [];

  // Close each order via unified closeOrderAndSettle service
  for (const order of openOrders) {
    try {
      const exitPrice = closed_ltp_map ? Number(closed_ltp_map[order._id]) || 0 : 0;

      const result = await closeOrderAndSettle(order._id, {
        exitPrice,
        exitReason: 'square_off',
        cameFrom: 'Open',
      });

      if (result.ok) {
        await removeFromWatchlist(result.order || {
          _id: order._id,
          instrument_token: order.instrument_token || order.security_Id,
        });
      }

      results.push({
        id: order._id,
        status: result.ok ? "Success" : "Failed",
        pnl: result.pnl,
        error: result.error,
      });
    } catch (error) {
      console.error(`Failed to exit order ${order._id}:`, error);
      results.push({ id: order._id, status: "Failed", error: error.message });
    }
  }

  res.status(200).json({
    success: true,
    message: `Processed ${results.length} orders`,
    details: results,
  });
});


const deleteOrder = asyncHandler(async (req, res) => {
  const { order_id } = req.body;

  if (!order_id) {
    return res.status(400).json({ success: false, message: "Order ID required" });
  }

  try {
    const deleted = await Order.findByIdAndDelete(order_id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    await removeFromWatchlist(deleted);
    return res.status(200).json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to delete order" });
  }
});

const deleteAllClosedOrders = asyncHandler(async (req, res) => {
  const { broker_id_str, customer_id_str } = req.body;

  if (!broker_id_str || !customer_id_str) {
    return res.status(400).json({ success: false, message: "Broker ID and Customer ID required" });
  }

  try {
    const result = await Order.deleteMany({
      broker_id_str,
      customer_id_str,
      order_status: "CLOSED"
    });

    return res.status(200).json({ 
      success: true, 
      message: `${result.deletedCount} orders deleted successfully` 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to delete all orders" });
  }
});

export { getOrderInstrument, postOrder, updateOrder, exitAllOpenOrder, deleteOrder, deleteAllClosedOrders };
