/**
 * orderValidity.js
 *
 * Central utility for order validity lifecycle.
 * Handles equity 7-day validity, instrument expiry, intraday day expiry,
 * and broker extension logic.
 */

const EQUITY_VALIDITY_DAYS = 7;
const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTE = 15;  // Market closes at 3:15 PM IST sharp
const MCX_CLOSE_HOUR = 23;
const MCX_CLOSE_MINUTE = 0;     // MCX business cutoff at 11:00 PM IST
const EXTENSION_WINDOW_HOURS = 24;
const IST_OFFSET_MINUTES = 330; // IST = UTC+5:30 = 330 minutes

/**
 * Set a Date to a specific IST time (hour:minute) on the same IST calendar date.
 * Avoids fragile toLocaleDateString → new Date(string) parsing.
 */
function setISTTime(date, hour, minute) {
  const d = new Date(date);
  const istMs = d.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const istDate = new Date(istMs);
  const y = istDate.getUTCFullYear();
  const m = istDate.getUTCMonth();
  const day = istDate.getUTCDate();
  return new Date(Date.UTC(y, m, day, hour, minute, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000);
}

/**
 * Check if an order is for cash equity instruments (NSE/BSE equity, not derivatives).
 * Derivatives have instrument expiry and should NOT use the 7-day validity.
 */
export function isCashEquityInstrument(orderOrInstrument) {
  const exchange = String(orderOrInstrument.exchange || '').toUpperCase();
  const segment = String(orderOrInstrument.segment || '').toUpperCase();
  const symbol = String(orderOrInstrument.symbol || orderOrInstrument.tradingsymbol || '').toUpperCase();
  const instrumentType = String(
    orderOrInstrument.instrument_type ||
    orderOrInstrument.instrumentType ||
    ''
  ).toUpperCase();

  // Must be NSE or BSE
  if (exchange !== 'NSE' && exchange !== 'BSE') return false;

  // Segment/exchange derivative hints (NFO-FUT, NFO-OPT, BFO-OPT, MCX-*, CDS-* etc.)
  if (
    segment.includes('NFO') ||
    segment.includes('BFO') ||
    segment.includes('MCX') ||
    segment.includes('CDS') ||
    segment.includes('FUT') ||
    segment.includes('OPT') ||
    exchange === 'NFO' ||
    exchange === 'BFO' ||
    exchange === 'MCX' ||
    exchange === 'CDS'
  ) {
    return false;
  }

  // Instrument type derivative hints
  if (instrumentType === 'FUT' || instrumentType === 'CE' || instrumentType === 'PE') return false;

  const looksLikeOptionSymbol = /\d(?:\.\d+)?(CE|PE)$/.test(symbol);
  const looksLikeFutureSymbol = /\dFUT$/.test(symbol);
  const looksLikeCallPutWord = /(CALL|PUT)$/.test(symbol);

  // If symbol looks like derivative contract code, treat as derivative
  if (
    looksLikeOptionSymbol ||
    looksLikeFutureSymbol ||
    looksLikeCallPutWord
  ) {
    return false;
  }

  // If there's a natural instrument expiry, it's a derivative
  const instrumentExpiry = orderOrInstrument.instrumentExpiry
    || orderOrInstrument.instrument_expiry
    || orderOrInstrument.meta?.selectedStock?.expiry
    || orderOrInstrument.expireDate;
  if (instrumentExpiry) {
    const d = new Date(instrumentExpiry);
    if (!Number.isNaN(d.getTime())) return false;
  }

  return true;
}

/**
 * Compute the equity 7-day expiry timestamp.
 * Expiry = placedAt + 6 calendar days (purchase day = day 1), at market close (15:15 IST).
 * e.g. placed Friday → expires Thursday (7 days inclusive, closed at 3:15 PM IST).
 */
export function computeEquity7DayExpiry(placedAt) {
  const placed = new Date(placedAt || Date.now());
  const expiry = new Date(placed);
  // Subtract 1 because the placement day counts as day 1.
  // e.g. placed on Friday = day 1, expires on Thursday = day 7 (+6 calendar days).
  expiry.setDate(expiry.getDate() + EQUITY_VALIDITY_DAYS - 1);

  return setISTTime(expiry, MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE);
}

/**
 * Resolve the validity mode and expiry for an order being placed.
 *
 * @param {Object} opts
 * @param {string} opts.product - MIS, CNC, NRML
 * @param {string} opts.exchange - NSE, BSE, NFO, MCX
 * @param {string} opts.segment - EQUITY, F&O, etc.
 * @param {string} opts.symbol - Trading symbol
 * @param {string|Date} [opts.instrumentExpiry] - Natural instrument expiry (for derivatives)
 * @param {Date} [opts.placedAt] - Order placement time
 * @returns {{ mode: string, startsAt: Date, expiresAt: Date }}
 */
export function resolveOrderValidity({ product, exchange, segment, symbol, instrumentExpiry, placedAt }) {
  const productUp = String(product || '').toUpperCase();
  const now = placedAt ? new Date(placedAt) : new Date();
  const ex = String(exchange || '').toUpperCase();
  const seg = String(segment || '').toUpperCase();
  const isMcx = ex === 'MCX' || ex.includes('MCX') || seg.includes('MCX');
  const closeHour = isMcx ? MCX_CLOSE_HOUR : MARKET_CLOSE_HOUR;
  const closeMinute = isMcx ? MCX_CLOSE_MINUTE : MARKET_CLOSE_MINUTE;

  // MIS = intraday, expires at market close same day
  if (productUp === 'MIS') {
    return {
      mode: 'INTRADAY_DAY',
      startsAt: now,
      expiresAt: setISTTime(now, closeHour, closeMinute),
    };
  }

  // If there's a natural instrument expiry (derivatives), use it
  if (instrumentExpiry) {
    const expDate = new Date(instrumentExpiry);
    if (!Number.isNaN(expDate.getTime())) {
      return {
        mode: 'INSTRUMENT_EXPIRY',
        startsAt: now,
        expiresAt: setISTTime(expDate, closeHour, closeMinute),
      };
    }
  }

  // Cash equity with CNC/NRML = 7-day validity
  const isCashEquity = isCashEquityInstrument({ exchange, segment, symbol });
  if (isCashEquity && (productUp === 'CNC' || productUp === 'NRML')) {
    return {
      mode: 'EQUITY_7D',
      startsAt: now,
      expiresAt: computeEquity7DayExpiry(now),
    };
  }

  // CNC/NRML derivative without instrument expiry data — assign 7-day validity as fallback.
  // This covers F&O orders placed without an explicit expiry (missing from instrument data).
  if (productUp === 'CNC' || productUp === 'NRML') {
    return {
      mode: 'EQUITY_7D',
      startsAt: now,
      expiresAt: computeEquity7DayExpiry(now),
    };
  }

  // Shouldn't reach here, but fallback to intraday
  return {
    mode: 'INTRADAY_DAY',
    startsAt: now,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  };
}

/**
 * Check if a broker can extend the validity of an order.
 * Returns { ok: boolean, reason?: string }
 */
export function canBrokerExtendValidity(order, now = new Date()) {
  if (!order) return { ok: false, reason: 'Order not found' };

  const status = String(order.status || order.order_status || '').toUpperCase();
  const activeStatuses = ['OPEN', 'EXECUTED', 'HOLD', 'PENDING'];
  if (!activeStatuses.includes(status)) {
    return { ok: false, reason: `Order is ${status}, not active` };
  }

  const mode = order.validity_mode;
  if (mode !== 'EQUITY_7D') {
    return { ok: false, reason: 'Only equity 7-day orders can be extended' };
  }

  const expiresAt = order.validity_expires_at ? new Date(order.validity_expires_at) : null;
  if (!expiresAt) {
    return { ok: false, reason: 'Order has no expiry date' };
  }

  // Must be within extension window (default 24 hours before expiry)
  const windowStart = new Date(expiresAt.getTime() - EXTENSION_WINDOW_HOURS * 60 * 60 * 1000);
  if (now < windowStart) {
    const hoursUntilWindow = Math.ceil((windowStart - now) / (60 * 60 * 1000));
    return { ok: false, reason: `Extension available ${hoursUntilWindow}h before expiry` };
  }

  return { ok: true };
}

/**
 * Extend an order's validity by the given number of days.
 * Mutates the order document (caller must save).
 *
 * @param {Object} order - Mongoose order document
 * @param {number} days - Number of days to extend (default 7)
 * @param {{ brokerId: string, brokerIdStr: string }} actor - Who is extending
 * @param {string} reason - Reason for extension
 */
export function extendValidityByDays(order, days = EQUITY_VALIDITY_DAYS, actor = {}, reason = '') {
  const currentExpiry = order.validity_expires_at ? new Date(order.validity_expires_at) : new Date();
  const newExpiry = new Date(currentExpiry);
  newExpiry.setDate(newExpiry.getDate() + days);

  const extensionEntry = {
    from: currentExpiry,
    to: newExpiry,
    extended_by: actor.brokerId || null,
    extended_by_str: actor.brokerIdStr || '',
    reason: reason || `Extended by ${days} days`,
    extended_at: new Date(),
  };

  order.validity_expires_at = newExpiry;
  order.validity_extended_count = (Number(order.validity_extended_count) || 0) + 1;

  if (!Array.isArray(order.validity_extensions)) {
    order.validity_extensions = [];
  }
  order.validity_extensions.push(extensionEntry);

  return { previousExpiry: currentExpiry, newExpiry, extension: extensionEntry };
}

/**
 * Check if an order's validity has expired.
 */
export function isValidityExpired(order, now = new Date()) {
  const expiresAt = order.validity_expires_at ? new Date(order.validity_expires_at) : null;
  if (!expiresAt) return false;
  return now >= expiresAt;
}

/**
 * Check if an order is near expiry (within the extension window).
 */
export function isNearExpiry(order, now = new Date()) {
  const expiresAt = order.validity_expires_at ? new Date(order.validity_expires_at) : null;
  if (!expiresAt) return false;
  const windowStart = new Date(expiresAt.getTime() - EXTENSION_WINDOW_HOURS * 60 * 60 * 1000);
  return now >= windowStart && now < expiresAt;
}
