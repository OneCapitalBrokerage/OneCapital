import placeMarketOrder from "./placeMarketOrder.js";

const IST_OFFSET_MINUTES = 330;

function setISTTime(date, hour, minute) {
  const base = new Date(date);
  const istMs = base.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const istDate = new Date(istMs);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth();
  const day = istDate.getUTCDate();
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000);
}

function deriveIntradayCutoff(order, fallback = new Date()) {
  const base = order?.validity_started_at || order?.placed_at || order?.createdAt || fallback;
  const exchange = String(order?.exchange || '').toUpperCase();
  const segment = String(order?.segment || '').toUpperCase();
  const isMcx = exchange.includes('MCX') || segment.includes('MCX');
  return isMcx ? setISTTime(base, 23, 0) : setISTTime(base, 15, 15);
}

function coerceClosedAt(value, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function attemptSquareoff(order, opts = {}) {
  if (!order) return { ok: false, reason: 'no-order' };

  // Use canonical schema fields (with fallback for safety)
  const orderStatus = order.status || order.order_status;
  const orderCategory = order.category || order.order_category;
  const productUp = String(order.product || '').toUpperCase();

  // Derive category from product if missing
  const effectiveCategory = orderCategory ||
    (productUp === 'MIS' ? 'INTRADAY' : (productUp === 'CNC' ? 'DELIVERY' : 'F&O'));

  const isActiveStatus = (s) => {
    return s === 'OPEN' || s === 'EXECUTED' || s === 'PARTIALLY_FILLED' || s === 'HOLD' || s === null || s === undefined;
  };

  // Resolve expiry: prefer canonical validity_expires_at, fallback to legacy fields
  const now = new Date();
  const canonicalExpiry = order.validity_expires_at ? new Date(order.validity_expires_at) : null;

  // Legacy fallback (for orders created before validity migration)
  let legacyExpiry = null;
  if (!canonicalExpiry) {
    const expireDateRaw = order.meta?.selectedStock?.expiry || order.expireDate;
    if (expireDateRaw) {
      legacyExpiry = new Date(expireDateRaw);
      if (Number.isNaN(legacyExpiry.getTime())) legacyExpiry = null;
    }
  }

  const effectiveExpiry = canonicalExpiry || legacyExpiry;

  /**
   * Check if expiry has passed.
   * - For canonical validity_expires_at: full timestamp comparison (now >= expiresAt)
   * - For legacy date-string expiry: date-only comparison (today >= expiryDate in IST)
   */
  const isExpired = () => {
    if (canonicalExpiry) {
      return now >= canonicalExpiry;
    }
    if (legacyExpiry) {
      const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const expireStr = legacyExpiry.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return expireStr <= todayStr;
    }
    return false;
  };

  try {
    const isHold = orderStatus === 'HOLD';

    // CASE 1: INTRADAY (always close at market close) — skip if HOLD
    if (effectiveCategory === 'INTRADAY' && isActiveStatus(orderStatus) && !isHold) {
      const closedAt = coerceClosedAt(opts.closedAt || canonicalExpiry || deriveIntradayCutoff(order, now), now);
      console.log(`[Squareoff] Closing Intraday: ${order._id} (Status: ${orderStatus})`);
      const res = await placeMarketOrder(order._id, {
        order,
        snapshot: opts.snapshot || null,
        closedAt,
      });
      return {
        ok: Boolean(res?.ok),
        action: res?.ok ? 'closed_intraday' : 'close_intraday_failed',
        result: res,
        reason: res?.error,
      };
    }

    // CASE 1b: HOLD orders — close only when validity expires
    if (isHold && isActiveStatus(orderStatus)) {
      if (!effectiveExpiry) {
        return { ok: false, reason: 'no_expiry_date_found_for_hold' };
      }

      if (isExpired()) {
        const closedAt = coerceClosedAt(opts.closedAt || effectiveExpiry || now, now);
        console.log(`[Squareoff] Closing HOLD on Expiry: ${order._id} (Exp: ${effectiveExpiry.toISOString()})`);
        const res = await placeMarketOrder(order._id, {
          order,
          snapshot: opts.snapshot || null,
          closedAt,
        });
        return {
          ok: Boolean(res?.ok),
          action: res?.ok ? 'closed_hold_on_expiry' : 'close_hold_on_expiry_failed',
          result: res,
          reason: res?.error,
        };
      } else {
        return { ok: true, action: 'hold_kept_active_future_expiry' };
      }
    }

    // CASE 2: OVERNIGHT / DELIVERY / F&O — close only when validity expires
    if ((effectiveCategory === 'F&O' || effectiveCategory === 'DELIVERY' || effectiveCategory === 'OVERNIGHT') && isActiveStatus(orderStatus)) {
      if (!effectiveExpiry) {
        return { ok: false, reason: 'no_expiry_date_found' };
      }

      if (isExpired()) {
        const closedAt = coerceClosedAt(opts.closedAt || effectiveExpiry || now, now);
        console.log(`[Squareoff] Closing EXPIRED Overnight: ${order._id} (Exp: ${effectiveExpiry.toISOString()})`);
        const res = await placeMarketOrder(order._id, {
          order,
          snapshot: opts.snapshot || null,
          closedAt,
        });
        return {
          ok: Boolean(res?.ok),
          action: res?.ok ? 'closed_expired_overnight' : 'close_expired_overnight_failed',
          result: res,
          reason: res?.error,
        };
      } else {
        return { ok: true, action: 'kept_active_future_expiry' };
      }
    }

    return { ok: true, action: 'noop' };

  } catch (err) {
    console.error('[attemptSquareoff] Error:', err.message);
    return { ok: false, reason: 'error', error: err.message };
  }
}
