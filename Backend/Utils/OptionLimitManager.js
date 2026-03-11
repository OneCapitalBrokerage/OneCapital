/**
 * OptionLimitManager.js
 * Option premium = single pool of X% of opening balance (intraday + delivery).
 * When an option order is placed, the margin is deducted from the respective bucket
 * (intraday.used_limit for MIS, overnight.available_limit for CNC/NRML).
 * Total option usage across ALL buckets cannot exceed the single combined cap.
 */

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const nonNegative = (value) => Math.max(0, toNumber(value));

const initOptionLimit = (fund, typeKey) => {
    if (!fund.option_limit) fund.option_limit = {};
    if (!fund.option_limit[typeKey]) {
        fund.option_limit[typeKey] = { used_today: 0, last_trade_date: new Date() };
    }
    // Date check — reset if new day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let lastDate = fund.option_limit[typeKey].last_trade_date
        ? new Date(fund.option_limit[typeKey].last_trade_date)
        : null;
    if (lastDate) lastDate.setHours(0, 0, 0, 0);
    if (!lastDate || lastDate.getTime() !== today.getTime()) {
        fund.option_limit[typeKey].used_today = 0;
        fund.option_limit[typeKey].last_trade_date = new Date();
    }
};

export const checkOptionLimit = (fund, product, requiredMargin) => {
    const productNorm = String(product).trim().toUpperCase();
    const isOvernight = productNorm === 'NRML' || productNorm === 'CNC';
    const typeKey = isOvernight ? 'overnight' : 'intraday';

    // Initialize both trackers (for combined usage calculation)
    initOptionLimit(fund, 'intraday');
    initOptionLimit(fund, 'overnight');

    // Single combined cap = X% of opening balance (intraday_limit + delivery_limit)
    const limitPercent = fund.option_limit_percentage !== undefined ? Number(fund.option_limit_percentage) : 10;
    const intradayLimit = nonNegative(fund.intraday?.available_limit);
    // For overnight: available_limit gets decremented by orders, add back today's option usage
    const overnightOptionUsed = fund.option_limit.overnight.used_today || 0;
    const originalOvernightLimit = nonNegative(fund.overnight?.available_limit) + overnightOptionUsed;
    const openingBalance = intradayLimit + originalOvernightLimit;
    const dailyCap = openingBalance * (limitPercent / 100);

    // Total option usage across BOTH buckets
    const intradayOptionUsed = fund.option_limit.intraday.used_today || 0;
    const totalOptionUsed = intradayOptionUsed + overnightOptionUsed;

    // Check combined option cap
    if ((totalOptionUsed + requiredMargin) > dailyCap) {
        return {
            allowed: false,
            message: `Option Premium Limit Exceeded (${limitPercent}% of opening balance). Max: ${dailyCap.toFixed(2)}, Used Today: ${totalOptionUsed.toFixed(2)}, Required: ${requiredMargin.toFixed(2)}`
        };
    }

    // Check that the respective margin bucket has enough room
    let availableMargin;
    if (isOvernight) {
        availableMargin = nonNegative(fund.overnight?.available_limit);
    } else {
        availableMargin = nonNegative(fund.intraday?.available_limit) - nonNegative(fund.intraday?.used_limit);
    }

    if (requiredMargin > availableMargin) {
        const bucketLabel = isOvernight ? 'Delivery' : 'Intraday';
        return {
            allowed: false,
            message: `Insufficient ${bucketLabel} Funds for option order! Required: ${requiredMargin.toFixed(2)}, Available: ${availableMargin.toFixed(2)}`
        };
    }

    return { allowed: true };
};

export const updateOptionUsage = (fund, product, amount) => {
    if (amount <= 0) return;

    const productNorm = String(product).trim().toUpperCase();
    const isOvernight = productNorm === 'NRML' || productNorm === 'CNC';
    const typeKey = isOvernight ? 'overnight' : 'intraday';

    initOptionLimit(fund, typeKey);

    // Track daily option usage per bucket (for combined cap enforcement)
    fund.option_limit[typeKey].used_today = (fund.option_limit[typeKey].used_today || 0) + Number(amount);
    fund.option_limit[typeKey].last_trade_date = new Date();

    // Track total option_premium_used (for display)
    fund.option_premium_used = (toNumber(fund.option_premium_used) || 0) + Number(amount);

    // Deduct from the ACTUAL margin bucket
    if (isOvernight) {
        fund.overnight.available_limit = Math.max(0, toNumber(fund.overnight.available_limit) - Number(amount));
    } else {
        fund.intraday.used_limit = toNumber(fund.intraday.used_limit) + Number(amount);
    }

    if (fund.markModified) {
        fund.markModified('option_limit');
        fund.markModified('option_premium_used');
        fund.markModified(isOvernight ? 'overnight' : 'intraday');
    }

    console.log(`[OptionLimit] Updated ${typeKey}: +${amount}, Margin deducted from ${typeKey}`);
};

export const rollbackOptionUsage = (fund, product, amount) => {
    if (amount <= 0) return;

    const productNorm = String(product).trim().toUpperCase();
    const isOvernight = productNorm === 'NRML' || productNorm === 'CNC';
    const typeKey = isOvernight ? 'overnight' : 'intraday';

    initOptionLimit(fund, typeKey);

    const limitTracker = fund.option_limit[typeKey];
    limitTracker.used_today = Math.max(0, (limitTracker.used_today || 0) - Number(amount));

    // Rollback total option_premium_used
    fund.option_premium_used = Math.max(0, (toNumber(fund.option_premium_used) || 0) - Number(amount));

    // Release margin back to the ACTUAL bucket
    if (isOvernight) {
        fund.overnight.available_limit = toNumber(fund.overnight.available_limit) + Number(amount);
    } else {
        fund.intraday.used_limit = Math.max(0, toNumber(fund.intraday.used_limit) - Number(amount));
    }

    if (fund.markModified) {
        fund.markModified('option_limit');
        fund.markModified('option_premium_used');
        fund.markModified(isOvernight ? 'overnight' : 'intraday');
    }
    console.log(`[OptionLimit] Rollback ${typeKey}: -${amount}, Margin released to ${typeKey}`);
};
