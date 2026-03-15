/**
 * marginLifecycle.js
 *
 * Single source of truth for all margin mutations.
 * Every margin reserve, release, refund, and reset MUST go through these functions.
 *
 * Business Rules:
 * - MIS placement: lock intraday margin (intraday.used_limit += margin)
 * - MIS close: release intraday margin immediately via releaseMarginOnClose()
 * - CNC/NRML placement: lock delivery margin (overnight.available_limit -= margin, delivery.used_limit += margin)
 * - CNC/NRML close: release delivery margin immediately via releaseMarginOnClose()
 * - CNC rejection: immediate refund (delivery.used_limit -= margin, overnight.available_limit += margin)
 * - Midnight intraday: backstop reset of intraday.used_limit to 0 (clears any residual leaked margin)
 * - Midnight delivery: backstop release of delivery.used_limit only when ALL CNC/NRML/HOLD orders are closed
 * - HOLD conversion (MIS->HOLD): reserve delivery margin, keep intraday locked until midnight backstop
 *
 * Option orders use OptionLimitManager directly (separate cap system, resets daily).
 */

import Order from '../Model/Trading/OrdersModel.js';
import Fund from '../Model/FundManagement/FundModel.js';
import { writeAuditSuccess } from '../Utils/AuditLogger.js';
import { isMCX } from '../Utils/mcx/resolver.js';

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v) => Number(toNumber(v).toFixed(2));

const formatCurrency = (value) =>
  round2(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const emitMarginAudit = ({
  eventType,
  message,
  fund,
  amountDelta = 0,
  marginBefore,
  marginAfter,
  note = '',
  metadata = {},
}) => {
  writeAuditSuccess({
    type: 'transaction',
    eventType,
    category: 'margin',
    message,
    source: 'system',
    actor: { type: 'system', id_str: 'SYSTEM', role: 'system' },
    target: {
      type: 'customer',
      id: fund?.customer_id,
      id_str: fund?.customer_id_str,
    },
    entity: {
      type: 'fund',
      id: fund?._id,
      ref: fund?.customer_id_str,
    },
    broker: {
      broker_id_str: fund?.broker_id_str,
    },
    customer: {
      customer_id: fund?.customer_id,
      customer_id_str: fund?.customer_id_str,
    },
    amountDelta,
    marginBefore,
    marginAfter,
    note,
    metadata,
  }).catch((error) => {
    console.error('[marginLifecycle] Failed to emit margin audit event:', error?.message || error);
  });
};

/**
 * Determine margin bucket for an order.
 * Returns 'intraday', 'delivery', or 'commodity_delivery'.
 */
export function getMarginBucket(product, { exchange, segment } = {}) {
  const p = String(product).trim().toUpperCase();
  if (p === 'CNC' || p === 'NRML') {
    if (isMCX({ exchange, segment })) return 'commodity_delivery';
    return 'delivery';
  }
  return 'intraday';
}

/**
 * Reserve margin on order placement or quantity increase.
 * Mutates fund in-memory; caller must save.
 *
 * @param {Object} fund - Mongoose fund document
 * @param {string} bucket - 'intraday' or 'delivery'
 * @param {number} amount - margin to reserve (positive)
 * @returns {{ ok: boolean, error?: string }}
 */
export function reserveMargin(fund, bucket, amount) {
  if (amount <= 0) return { ok: true };

  if (bucket === 'intraday') {
    const available = toNumber(fund.intraday?.available_limit) - toNumber(fund.intraday?.used_limit);
    if (amount > available) {
      return {
        ok: false,
        error: `Insufficient Intraday Funds! Required: ${amount.toFixed(2)}, Available: ${available.toFixed(2)}`,
      };
    }
    fund.intraday.used_limit = toNumber(fund.intraday.used_limit) + amount;
  } else if (bucket === 'commodity_delivery') {
    const available = toNumber(fund.commodity_delivery?.available_limit) - toNumber(fund.commodity_delivery?.used_limit);
    if (amount > available) {
      return {
        ok: false,
        error: `Insufficient Commodity Margin! Required: ${amount.toFixed(2)}, Available: ${available.toFixed(2)}`,
      };
    }
    fund.commodity_delivery.used_limit = toNumber(fund.commodity_delivery.used_limit) + amount;
  } else {
    // delivery
    const available = toNumber(fund.overnight?.available_limit);
    if (amount > available) {
      return {
        ok: false,
        error: `Insufficient Delivery Funds! Required: ${amount.toFixed(2)}, Available: ${available.toFixed(2)}`,
      };
    }
    fund.overnight.available_limit = toNumber(fund.overnight.available_limit) - amount;
    fund.delivery.used_limit = toNumber(fund.delivery?.used_limit) + amount;
  }

  fund.last_calculated_at = new Date();
  return { ok: true };
}

/**
 * @deprecated Use releaseMarginOnClose instead.
 * No-op retained for reference only. All callers have been migrated.
 */
export function deferMarginRelease(_fund, order, logPrefix = '[marginLifecycle]') {
  console.warn(`${logPrefix} deferMarginRelease called for ${order?.symbol} — this is deprecated. Use releaseMarginOnClose.`);
}

/**
 * Immediate margin release when an order closes, cancels, or is rejected.
 * Releases margin_blocked back to the correct fund bucket.
 * Caller must set order.margin_released_at after this call and save the order.
 *
 * @param {Object} fund - Mongoose fund document (mutated in-memory; caller must save)
 * @param {Object} order - The order being settled
 * @param {Object} [opts]
 * @param {string} [opts.reason] - Release reason for statement log
 */
export function releaseMarginOnClose(fund, order, opts = {}) {
  const amount = toNumber(order.margin_blocked);
  if (amount <= 0) return;

  const bucket = getMarginBucket(order.product, { exchange: order.exchange, segment: order.segment });

  if (bucket === 'intraday') {
    fund.intraday.used_limit = Math.max(0, toNumber(fund.intraday.used_limit) - amount);
  } else if (bucket === 'commodity_delivery') {
    fund.commodity_delivery.used_limit = Math.max(0, toNumber(fund.commodity_delivery?.used_limit) - amount);
  } else {
    fund.overnight.available_limit = toNumber(fund.overnight.available_limit) + amount;
    fund.delivery.used_limit = Math.max(0, toNumber(fund.delivery?.used_limit) - amount);
  }

  const reason = opts.reason || 'order_close';
  fund.transactions.push({
    type: 'margin_released_close',
    amount: round2(amount),
    notes: `Margin released: ${order.symbol || ''} ${order.product || ''} ₹${amount.toFixed(2)} (${reason})${opts.orderId ? ` | Order: ${opts.orderId}` : ''}`,
    status: 'completed',
    reference: opts.orderId ? String(opts.orderId) : String(order._id || ''),
    timestamp: new Date(),
  });

  fund.last_calculated_at = new Date();
  console.log(`[marginLifecycle] Immediate release on close: ${bucket} ₹${amount.toFixed(2)} | Order: ${order._id || ''} | Reason: ${reason}`);
}

/**
 * Immediate margin refund (e.g., CNC rejection by broker).
 * Releases margin back to the respective bucket immediately.
 * Mutates fund in-memory; caller must save.
 *
 * @param {Object} fund - Mongoose fund document
 * @param {string} bucket - 'intraday' or 'delivery'
 * @param {number} amount - margin to refund (positive)
 * @param {Object} [opts] - Additional options
 * @param {string} [opts.reason] - Refund reason for statement log
 * @param {string} [opts.orderId] - Order ID reference
 */
export function refundMarginImmediate(fund, bucket, amount, opts = {}) {
  if (amount <= 0) return;

  if (bucket === 'intraday') {
    fund.intraday.used_limit = Math.max(0, toNumber(fund.intraday.used_limit) - amount);
  } else if (bucket === 'commodity_delivery') {
    fund.commodity_delivery.used_limit = Math.max(0, toNumber(fund.commodity_delivery?.used_limit) - amount);
  } else {
    // delivery: release back to overnight available + decrement delivery used
    fund.overnight.available_limit = toNumber(fund.overnight.available_limit) + amount;
    fund.delivery.used_limit = Math.max(0, toNumber(fund.delivery?.used_limit) - amount);
  }

  // Add statement log entry
  fund.transactions.push({
    type: 'margin_refunded_rejection',
    amount: round2(amount),
    notes: `Margin refund: ${opts.reason || 'Order rejected'}${opts.orderId ? ` | Order: ${opts.orderId}` : ''}`,
    status: 'completed',
    reference: opts.orderId ? String(opts.orderId) : '',
    timestamp: new Date(),
  });

  fund.last_calculated_at = new Date();
  console.log(`[marginLifecycle] Immediate refund: ${bucket} ₹${amount.toFixed(2)} | Reason: ${opts.reason || 'rejection'}`);
}

/**
 * Reserve delivery margin for MIS→HOLD conversion.
 * Does NOT release intraday margin (stays locked until midnight).
 *
 * @param {Object} fund - Mongoose fund document
 * @param {number} amount - delivery margin to reserve
 * @param {Object} [opts] - Additional options
 * @param {string} [opts.orderId] - Order ID reference
 * @returns {{ ok: boolean, error?: string }}
 */
export function reserveDeliveryForHoldConversion(fund, amount, opts = {}) {
  if (amount <= 0) return { ok: true };
  const beforeMargin = {
    overnightAvailable: toNumber(fund.overnight?.available_limit),
    deliveryUsed: toNumber(fund.delivery?.used_limit),
  };

  const deliveryAvailable = toNumber(fund.overnight?.available_limit);
  if (amount > deliveryAvailable) {
    return {
      ok: false,
      error: `Insufficient Delivery margin for Hold conversion. Required: ${amount.toFixed(2)}, Available: ${deliveryAvailable.toFixed(2)}`,
    };
  }

  // Reserve from delivery bucket
  fund.overnight.available_limit = toNumber(fund.overnight.available_limit) - amount;
  fund.delivery.used_limit = toNumber(fund.delivery?.used_limit) + amount;

  // Log conversion event
  fund.transactions.push({
    type: 'margin_locked_delivery',
    amount: round2(-amount),
    notes: `MIS→HOLD conversion: delivery margin locked${opts.orderId ? ` | Order: ${opts.orderId}` : ''}`,
    status: 'completed',
    reference: opts.orderId ? String(opts.orderId) : '',
    timestamp: new Date(),
  });

  fund.last_calculated_at = new Date();
  console.log(`[marginLifecycle] Hold conversion: reserved delivery ₹${amount.toFixed(2)}`);

  emitMarginAudit({
    eventType: 'MARGIN_LOCK_DELIVERY',
    message: `Delivery margin of ${formatCurrency(amount)} was locked for customer ${fund.customer_id_str} for HOLD conversion.`,
    fund,
    amountDelta: round2(-amount),
    marginBefore: beforeMargin,
    marginAfter: {
      overnightAvailable: toNumber(fund.overnight?.available_limit),
      deliveryUsed: toNumber(fund.delivery?.used_limit),
    },
    note: `Overnight available changed from ${formatCurrency(beforeMargin.overnightAvailable)} to ${formatCurrency(fund.overnight?.available_limit)}. Delivery used changed from ${formatCurrency(beforeMargin.deliveryUsed)} to ${formatCurrency(fund.delivery?.used_limit)}.`,
    metadata: {
      orderId: opts.orderId || '',
    },
  });

  return { ok: true };
}

/**
 * Reserve commodity delivery margin for MCX MIS→HOLD conversion.
 * Does NOT release intraday margin (stays locked until midnight).
 */
export function reserveCommodityDeliveryForHoldConversion(fund, amount, opts = {}) {
  if (amount <= 0) return { ok: true };

  const available = toNumber(fund.commodity_delivery?.available_limit) - toNumber(fund.commodity_delivery?.used_limit);
  if (amount > available) {
    return {
      ok: false,
      error: `Insufficient Commodity Margin for Hold conversion. Required: ${amount.toFixed(2)}, Available: ${available.toFixed(2)}`,
    };
  }

  fund.commodity_delivery.used_limit = toNumber(fund.commodity_delivery.used_limit) + amount;

  fund.transactions.push({
    type: 'margin_locked_commodity_delivery',
    amount: round2(-amount),
    notes: `MCX MIS→HOLD conversion: commodity delivery margin locked${opts.orderId ? ` | Order: ${opts.orderId}` : ''}`,
    status: 'completed',
    reference: opts.orderId ? String(opts.orderId) : '',
    timestamp: new Date(),
  });

  fund.last_calculated_at = new Date();
  console.log(`[marginLifecycle] MCX Hold conversion: reserved commodity_delivery ₹${amount.toFixed(2)}`);
  return { ok: true };
}

/**
 * Midnight reset for intraday margin.
 * Unconditionally resets intraday.used_limit to 0.
 * Should be called for every fund record at midnight.
 *
 * @param {Object} fund - Mongoose fund document (mutated in-memory)
 */
export function midnightResetIntraday(fund) {
  const previousUsed = toNumber(fund.intraday?.used_limit);
  const beforeMargin = {
    intradayUsed: previousUsed,
  };
  fund.intraday.used_limit = 0;

  if (previousUsed > 0) {
    fund.transactions.push({
      type: 'margin_released_midnight_intraday',
      amount: round2(previousUsed),
      notes: `Midnight intraday margin reset: ₹${previousUsed.toFixed(2)} released`,
      status: 'completed',
      timestamp: new Date(),
    });
  }
  fund.last_calculated_at = new Date();

  if (previousUsed > 0) {
    emitMarginAudit({
      eventType: 'MARGIN_RESET_MIDNIGHT_INTRADAY',
      message: `Midnight reset cleared intraday margin of ${formatCurrency(previousUsed)} for customer ${fund.customer_id_str}.`,
      fund,
      amountDelta: round2(previousUsed),
      marginBefore: beforeMargin,
      marginAfter: {
        intradayUsed: toNumber(fund.intraday?.used_limit),
      },
      note: `Intraday used changed from ${formatCurrency(previousUsed)} to ${formatCurrency(fund.intraday?.used_limit)}.`,
    });
  }
}

/**
 * Midnight release for delivery margin.
 * Only releases if ALL CNC/NRML/HOLD orders are closed for the customer.
 *
 * @param {Object} fund - Mongoose fund document (mutated in-memory)
 * @param {number} activeDeliveryOrderCount - Count of active CNC/NRML/HOLD orders
 * @returns {boolean} - Whether margin was released
 */
export function midnightReleaseDelivery(fund, activeDeliveryOrderCount) {
  const deliveryUsed = toNumber(fund.delivery?.used_limit);

  if (activeDeliveryOrderCount > 0) {
    console.log(`[marginLifecycle] Delivery margin ₹${deliveryUsed.toFixed(2)} carried forward (${activeDeliveryOrderCount} active orders)`);
    return false;
  }

  if (deliveryUsed <= 0) return false;

  // Release delivery used back to overnight available
  fund.overnight.available_limit = toNumber(fund.overnight.available_limit) + deliveryUsed;
  fund.delivery.used_limit = 0;

  fund.transactions.push({
    type: 'margin_released_midnight_delivery',
    amount: round2(deliveryUsed),
    notes: `Midnight delivery margin release: ₹${deliveryUsed.toFixed(2)} released (all delivery orders closed)`,
    status: 'completed',
    timestamp: new Date(),
  });

  fund.last_calculated_at = new Date();
  console.log(`[marginLifecycle] Delivery margin ₹${deliveryUsed.toFixed(2)} released at midnight`);

  return true;
}

/**
 * Midnight release for commodity delivery margin.
 * Only releases if ALL MCX CNC orders are closed for the customer.
 */
export function midnightReleaseCommodityDelivery(fund, activeMcxDeliveryCount) {
  const used = toNumber(fund.commodity_delivery?.used_limit);

  if (activeMcxDeliveryCount > 0) {
    console.log(`[marginLifecycle] Commodity delivery margin ₹${used.toFixed(2)} carried forward (${activeMcxDeliveryCount} active MCX orders)`);
    return false;
  }

  if (used <= 0) return false;

  fund.commodity_delivery.used_limit = 0;

  fund.transactions.push({
    type: 'margin_released_midnight_commodity',
    amount: round2(used),
    notes: `Midnight commodity delivery margin release: ₹${used.toFixed(2)} released (all MCX delivery orders closed)`,
    status: 'completed',
    timestamp: new Date(),
  });

  fund.last_calculated_at = new Date();
  console.log(`[marginLifecycle] Commodity delivery margin ₹${used.toFixed(2)} released at midnight`);
  return true;
}

/**
 * Run full midnight margin reset/release for a single customer fund.
 * Handles both intraday reset and conditional delivery release.
 *
 * @param {Object} fund - Mongoose fund document
 * @param {string} customerIdStr - Customer ID string
 * @param {string} brokerIdStr - Broker ID string
 */
export async function runMidnightMarginReset(fund, customerIdStr, brokerIdStr) {
  // 1. Always reset intraday
  midnightResetIntraday(fund);

  // 2. Conditionally release equity delivery
  const activeDeliveryOrders = await Order.countDocuments({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    product: { $in: ['CNC', 'NRML'] },
    status: { $in: ['OPEN', 'EXECUTED', 'HOLD', 'PENDING'] },
    $nor: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
  });

  midnightReleaseDelivery(fund, activeDeliveryOrders);

  // 3. Conditionally release commodity delivery (MCX CNC)
  const activeMcxDeliveryOrders = await Order.countDocuments({
    customer_id_str: customerIdStr,
    broker_id_str: brokerIdStr,
    product: { $in: ['CNC', 'NRML'] },
    status: { $in: ['OPEN', 'EXECUTED', 'HOLD', 'PENDING'] },
    $or: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
  });

  midnightReleaseCommodityDelivery(fund, activeMcxDeliveryOrders);
}
