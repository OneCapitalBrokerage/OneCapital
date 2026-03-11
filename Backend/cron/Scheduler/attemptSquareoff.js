import placeMarketOrder from "./placeMarketOrder.js";

export async function attemptSquareoff(order) {
  if (!order) return { ok: false, reason: 'no-order' };

  // Use canonical schema fields (with fallback for safety)
  const orderStatus = order.status || order.order_status;
  const orderCategory = order.category || order.order_category;
  const productUp = String(order.product || '').toUpperCase();

  // Derive category from product if missing
  const effectiveCategory = orderCategory ||
    (productUp === 'MIS' ? 'INTRADAY' : (productUp === 'CNC' ? 'DELIVERY' : 'F&O'));

  const isActiveStatus = (s) => {
    return s === 'OPEN' || s === 'EXECUTED' || s === 'HOLD' || s === null || s === undefined;
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
      console.log(`[Squareoff] Closing Intraday: ${order._id} (Status: ${orderStatus})`);
      const res = await placeMarketOrder(order._id);
      return { ok: true, action: 'closed_intraday', result: res };
    }

    // CASE 1b: HOLD orders — close only when validity expires
    if (isHold && isActiveStatus(orderStatus)) {
      if (!effectiveExpiry) {
        return { ok: false, reason: 'no_expiry_date_found_for_hold' };
      }

      if (isExpired()) {
        console.log(`[Squareoff] Closing HOLD on Expiry: ${order._id} (Exp: ${effectiveExpiry.toISOString()})`);
        const res = await placeMarketOrder(order._id);
        return { ok: true, action: 'closed_hold_on_expiry', result: res };
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
        console.log(`[Squareoff] Closing EXPIRED Overnight: ${order._id} (Exp: ${effectiveExpiry.toISOString()})`);
        const res = await placeMarketOrder(order._id);
        return { ok: true, action: 'closed_expired_overnight', result: res };
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
