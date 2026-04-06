/**
 * OptionLimitManager.js
 * 
 * Option premium buckets are STANDALONE pools derived from parent bucket limits.
 * They do NOT deduct from intraday/delivery buckets.
 * 
 * Equity Options (NFO-OPT, BFO-OPT):
 * - Bucket: option_premium
 * - Limit = X% of (intraday.available_limit + overnight.available_limit)
 * - MIS and CNC options share the same pool
 * 
 * MCX Options (MCX-OPT):
 * - Bucket: commodity_option
 * - Limit = X% of (commodity_intraday.available_limit + commodity_delivery.available_limit)
 * - MIS and CNC options share the same pool
 */

import { isMCX } from './mcx/resolver.js';

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const nonNegative = (value) => Math.max(0, toNumber(value));

/**
 * Helper to detect if a symbol is an option
 * @param {string} symbol - Trading symbol
 * @returns {boolean}
 */
export const isOptionSymbol = (symbol) => {
    if (!symbol) return false;
    const s = String(symbol).toUpperCase();
    return s.endsWith('CE') || s.endsWith('PE') || s.endsWith('CALL') || s.endsWith('PUT');
};

/**
 * Calculate option premium limit for equity options
 * @param {Object} fund - Fund document
 * @returns {{ base: number, limitPercent: number, limit: number, used: number, remaining: number }}
 */
export const getEquityOptionLimitInfo = (fund) => {
    const intradayAvailable = nonNegative(fund.intraday?.available_limit);
    const overnightAvailable = nonNegative(fund.overnight?.available_limit);
    const base = intradayAvailable + overnightAvailable;
    
    // Prefer new schema field, fallback to legacy
    const limitPercent = fund.option_premium?.limit_percentage ?? fund.option_limit_percentage ?? 10;
    const limit = base * (limitPercent / 100);
    
    // Prefer new schema field, fallback to legacy
    const used = nonNegative(fund.option_premium?.used ?? fund.option_premium_used ?? 0);
    const remaining = Math.max(0, limit - used);
    
    return { base, limitPercent, limit, used, remaining };
};

/**
 * Calculate option premium limit for MCX options
 * @param {Object} fund - Fund document
 * @returns {{ base: number, limitPercent: number, limit: number, used: number, remaining: number }}
 */
export const getMcxOptionLimitInfo = (fund) => {
    const commodityIntradayAvailable = nonNegative(fund.commodity_intraday?.available_limit);
    const commodityDeliveryAvailable = nonNegative(fund.commodity_delivery?.available_limit);
    const base = commodityIntradayAvailable + commodityDeliveryAvailable;
    
    const limitPercent = fund.commodity_option?.limit_percentage ?? 10;
    const limit = base * (limitPercent / 100);
    const used = nonNegative(fund.commodity_option?.used);
    const remaining = Math.max(0, limit - used);
    
    return { base, limitPercent, limit, used, remaining };
};

/**
 * Check if an option order can be placed within limits
 * @param {Object} fund - Fund document
 * @param {string} product - Product type (MIS, CNC, NRML) - not used for bucket selection, only for logging
 * @param {number} requiredMargin - Margin required for the order
 * @param {Object} opts - Additional options
 * @param {string} opts.exchange - Exchange (e.g., 'NFO', 'MCX')
 * @param {string} opts.segment - Segment
 * @returns {{ allowed: boolean, message?: string }}
 */
export const checkOptionLimit = (fund, product, requiredMargin, { exchange, segment } = {}) => {
    const mcx = isMCX({ exchange, segment });

    if (mcx) {
        // MCX Options - use commodity_option bucket
        const info = getMcxOptionLimitInfo(fund);
        
        if ((info.used + requiredMargin) > info.limit) {
            return {
                allowed: false,
                message: `Commodity Option Premium Limit Exceeded (${info.limitPercent}% of commodity margin). Limit: ${info.limit.toFixed(2)}, Used: ${info.used.toFixed(2)}, Required: ${requiredMargin.toFixed(2)}`,
            };
        }
        
        return { allowed: true };
    }

    // Equity Options - use option_premium bucket
    const info = getEquityOptionLimitInfo(fund);
    
    if ((info.used + requiredMargin) > info.limit) {
        return {
            allowed: false,
            message: `Option Premium Limit Exceeded (${info.limitPercent}% of opening balance). Limit: ${info.limit.toFixed(2)}, Used: ${info.used.toFixed(2)}, Required: ${requiredMargin.toFixed(2)}`,
        };
    }

    return { allowed: true };
};

/**
 * Reserve margin for an option order (deducts from option bucket only)
 * @param {Object} fund - Fund document (mutated in-memory, caller must save)
 * @param {string} product - Product type (MIS, CNC, NRML)
 * @param {number} amount - Margin to reserve
 * @param {Object} opts - Additional options
 * @param {string} opts.exchange - Exchange
 * @param {string} opts.segment - Segment
 */
export const updateOptionUsage = (fund, product, amount, { exchange, segment } = {}) => {
    if (amount <= 0) return;

    const mcx = isMCX({ exchange, segment });

    if (mcx) {
        // MCX Options - deduct from commodity_option.used only
        if (!fund.commodity_option) {
            fund.commodity_option = { limit_percentage: 10, used: 0 };
        }
        fund.commodity_option.used = nonNegative(fund.commodity_option.used) + Number(amount);
        
        if (fund.markModified) fund.markModified('commodity_option');
        console.log(`[OptionLimit] MCX option reserved: +${amount}, Total used: ${fund.commodity_option.used}`);
        return;
    }

    // Equity Options - deduct from option_premium.used only
    if (!fund.option_premium) {
        fund.option_premium = { 
            limit_percentage: fund.option_limit_percentage ?? 10, 
            used: 0 
        };
    }
    fund.option_premium.used = nonNegative(fund.option_premium.used) + Number(amount);
    
    // Also update legacy field for backward compatibility
    fund.option_premium_used = nonNegative(fund.option_premium_used) + Number(amount);

    if (fund.markModified) {
        fund.markModified('option_premium');
        fund.markModified('option_premium_used');
    }
    console.log(`[OptionLimit] Equity option reserved: +${amount}, Total used: ${fund.option_premium.used}`);
};

/**
 * Release margin when an option order is closed, cancelled, or rejected
 * @param {Object} fund - Fund document (mutated in-memory, caller must save)
 * @param {string} product - Product type (MIS, CNC, NRML)
 * @param {number} amount - Margin to release
 * @param {Object} opts - Additional options
 * @param {string} opts.exchange - Exchange
 * @param {string} opts.segment - Segment
 */
export const rollbackOptionUsage = (fund, product, amount, { exchange, segment } = {}) => {
    if (amount <= 0) return;

    const mcx = isMCX({ exchange, segment });

    if (mcx) {
        // MCX Options - release from commodity_option.used
        if (!fund.commodity_option) {
            fund.commodity_option = { limit_percentage: 10, used: 0 };
        }
        fund.commodity_option.used = Math.max(0, nonNegative(fund.commodity_option.used) - Number(amount));
        
        if (fund.markModified) fund.markModified('commodity_option');
        console.log(`[OptionLimit] MCX option released: -${amount}, Total used: ${fund.commodity_option.used}`);
        return;
    }

    // Equity Options - release from option_premium.used
    if (!fund.option_premium) {
        fund.option_premium = { 
            limit_percentage: fund.option_limit_percentage ?? 10, 
            used: 0 
        };
    }
    fund.option_premium.used = Math.max(0, nonNegative(fund.option_premium.used) - Number(amount));
    
    // Also update legacy field for backward compatibility
    fund.option_premium_used = Math.max(0, nonNegative(fund.option_premium_used) - Number(amount));

    if (fund.markModified) {
        fund.markModified('option_premium');
        fund.markModified('option_premium_used');
    }
    console.log(`[OptionLimit] Equity option released: -${amount}, Total used: ${fund.option_premium.used}`);
};

/**
 * Get the option bucket name for an order
 * @param {Object} opts - Options
 * @param {string} opts.exchange - Exchange
 * @param {string} opts.segment - Segment
 * @returns {'option_premium' | 'commodity_option'}
 */
export const getOptionBucket = ({ exchange, segment } = {}) => {
    return isMCX({ exchange, segment }) ? 'commodity_option' : 'option_premium';
};
