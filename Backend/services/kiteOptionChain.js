// Backend/services/kiteOptionChain.js
// Option Chain service using Kite instruments database and Quote API

import Instrument from '../Model/InstrumentModel.js';
import { getKiteQuote } from './kiteQuote.js';
import { getCache, setCache } from './redisCache.js';

/**
 * Index underlying to spot price token mapping
 * These are the INDICES segment tokens for known index underlyings
 */
const INDEX_UNDERLYING_MAP = {
    // NSE Indices
    'NIFTY': { tradingsymbol: 'NIFTY 50', token: '256265', exchange: 'NSE' },
    'BANKNIFTY': { tradingsymbol: 'NIFTY BANK', token: '260105', exchange: 'NSE' },
    'FINNIFTY': { tradingsymbol: 'NIFTY FIN SERVICE', token: '257801', exchange: 'NSE' },
    'MIDCPNIFTY': { tradingsymbol: 'NIFTY MIDCAP 100', token: '256777', exchange: 'NSE' },

    // BSE Indices
    'SENSEX': { tradingsymbol: 'SENSEX', token: '265', exchange: 'BSE' },
    'BANKEX': { tradingsymbol: 'BANKEX', token: '274441', exchange: 'BSE' },
    'SENSEX50': { tradingsymbol: 'SENSEX 50', token: null, exchange: 'BSE' }, // Lookup needed
};

const INDEX_ALIAS_MAP = (() => {
    const aliasMap = new Map();
    const addAlias = (from, to) => {
        const source = String(from || '').trim().toUpperCase();
        const target = String(to || '').trim().toUpperCase();
        if (!source || !target || source === target) return;
        if (!aliasMap.has(source)) aliasMap.set(source, new Set());
        aliasMap.get(source).add(target);
    };

    for (const [underlying, info] of Object.entries(INDEX_UNDERLYING_MAP)) {
        addAlias(underlying, info?.tradingsymbol);
        addAlias(info?.tradingsymbol, underlying);
    }

    return aliasMap;
})();

/**
 * Map option segment to the corresponding equity segment for stock underlyings
 */
const OPTION_TO_EQUITY_SEGMENT = {
    'NFO-OPT': 'NSE',
    'NFO-FUT': 'NSE',
    'BFO-OPT': 'BSE',
    'BFO-FUT': 'BSE',
};

/**
 * Map any segment to its corresponding OPTION segment
 * This is used when a user clicks on a FUT and wants to see the option chain
 */
const SEGMENT_TO_OPTION_SEGMENT = {
    'NSE': 'NFO-OPT',
    'BSE': 'BFO-OPT',
    'NFO': 'NFO-OPT',
    'BFO': 'BFO-OPT',
    'MCX': 'MCX-OPT',
    'CDS': 'CDS-OPT',
    'NCO': 'NCO-OPT',
    'NFO-OPT': 'NFO-OPT',
    'NFO-FUT': 'NFO-OPT',
    'BFO-OPT': 'BFO-OPT',
    'BFO-FUT': 'BFO-OPT',
    'MCX-OPT': 'MCX-OPT',
    'MCX-FUT': 'MCX-OPT',
    'CDS-OPT': 'CDS-OPT',
    'CDS-FUT': 'CDS-OPT',
    'NCO-OPT': 'NCO-OPT',
    'NCO-FUT': 'NCO-OPT',
};

/**
 * Normalize segment to option segment
 * e.g., NFO-FUT -> NFO-OPT, BFO-FUT -> BFO-OPT
 */
export function normalizeToOptionSegment(segment) {
    const seg = String(segment || '').trim().toUpperCase();
    if (!seg) return 'NFO-OPT';
    if (SEGMENT_TO_OPTION_SEGMENT[seg]) return SEGMENT_TO_OPTION_SEGMENT[seg];
    if (seg.endsWith('-OPT')) return seg;
    return 'NFO-OPT';
}

const toUpper = (value) => String(value || '').trim().toUpperCase();

const dedupeStrings = (values = []) => {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const v = toUpper(value);
        if (!v || seen.has(v)) continue;
        seen.add(v);
        result.push(v);
    }
    return result;
};

const sortAndFormatExpiries = (expiries = []) => (
    expiries
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b)
        .map((date) => date.toISOString().split('T')[0])
);

const getIndexAliasCandidates = (name) => Array.from(INDEX_ALIAS_MAP.get(toUpper(name)) || []);

async function resolveNameCandidates(primaryName, extraNames = []) {
    const seed = dedupeStrings([primaryName, ...(extraNames || [])]);
    if (seed.length === 0) return [];

    // Cache key: sorted seed names so order doesn't matter
    const cacheKey = `namecandidates:${[...seed].sort().join(',')}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const expanded = new Set(seed);
    for (const candidate of seed) {
        for (const alias of getIndexAliasCandidates(candidate)) {
            expanded.add(alias);
        }
    }

    const lookupQueue = Array.from(expanded);
    for (const candidate of lookupQueue) {
        const docsByTradingsymbol = await Instrument.find({ tradingsymbol: candidate })
            .select('name tradingsymbol segment instrument_type')
            .limit(10)
            .lean();
        const docsByName = await Instrument.find({ name: candidate })
            .select('name tradingsymbol segment instrument_type')
            .limit(25)
            .lean();
        const docs = [...(docsByTradingsymbol || []), ...(docsByName || [])];

        for (const doc of docs || []) {
            if (doc?.name) expanded.add(toUpper(doc.name));
            const segment = toUpper(doc?.segment);
            const instrumentType = toUpper(doc?.instrument_type);
            if (
                doc?.tradingsymbol &&
                instrumentType !== 'CE' &&
                instrumentType !== 'PE' &&
                !segment.endsWith('-OPT')
            ) {
                expanded.add(toUpper(doc.tradingsymbol));
            }
        }
    }

    const result = Array.from(expanded);
    // Name candidates for an underlying never change intra-day — cache for 6 hours
    setCache(cacheKey, result, 6 * 60 * 60).catch(() => {});
    return result;
}

function buildSegmentCandidates(segmentOrSegments, underlyingName) {
    const upperUnderlying = toUpper(underlyingName);
    const input = Array.isArray(segmentOrSegments)
        ? segmentOrSegments
        : [segmentOrSegments];

    const normalized = dedupeStrings(
        input
            .filter(Boolean)
            .map((seg) => normalizeToOptionSegment(seg))
    );

    if (normalized.length > 0) {
        // Strict segment family matching: do not cross NSE/BSE (or other) families.
        return normalized;
    }

    return [normalizeToOptionSegment(getOptionSegment(upperUnderlying))];
}

export function getOptionSegmentCandidates({ segment, underlyingName } = {}) {
    return buildSegmentCandidates(segment, underlyingName);
}

/**
 * Get spot price for an underlying
 * Handles indices, stocks, and MCX commodities
 *
 * @param {string} underlyingName - e.g., "NIFTY", "HDFCBANK", "GOLD"
 * @param {string} segment - e.g., "NFO-OPT", "BFO-OPT", "MCX-OPT"
 * @returns {Promise<number|null>} Spot price or null if not found
 */
export async function getSpotPrice(underlyingName, segment, opts = {}) {
    try {
        const nameCandidates = await resolveNameCandidates(underlyingName, opts.nameCandidates || []);
        const lookupNames = nameCandidates.length ? nameCandidates : dedupeStrings([underlyingName]);

        // 1. Check if it's a known INDEX
        const indexInfo = INDEX_UNDERLYING_MAP[toUpper(underlyingName)];
        if (indexInfo && indexInfo.token) {
            console.log(`[KiteOptionChain] Getting spot for index: ${underlyingName} -> token ${indexInfo.token}`);
            const quote = await getKiteQuote([indexInfo.token]);
            return quote?.[indexInfo.token]?.last_price || null;
        }

        // 2. For STOCK OPTIONS (NFO-OPT/BFO-OPT), get equity price
        const equitySegment = OPTION_TO_EQUITY_SEGMENT[segment];
        if (equitySegment) {
            console.log(`[KiteOptionChain] Getting spot for stock: ${underlyingName} in ${equitySegment}`);
            const stock = await Instrument.findOne({
                segment: equitySegment,
                $or: [
                    { tradingsymbol: { $in: lookupNames } },
                    { name: { $in: lookupNames } },
                ],
            }).lean();

            if (stock) {
                const quote = await getKiteQuote([stock.instrument_token]);
                return quote?.[stock.instrument_token]?.last_price || null;
            }
        }

        // 3. For MCX (Commodities) - use near month future as spot reference
        if (segment && segment.startsWith('MCX')) {
            console.log(`[KiteOptionChain] Getting spot for MCX: ${underlyingName} from near month future`);
            const nearFuture = await Instrument.findOne({
                segment: 'MCX-FUT',
                $or: [
                    { name: { $in: lookupNames } },
                    { tradingsymbol: { $in: lookupNames } },
                ],
                expiry: { $gte: new Date() }
            }).sort({ expiry: 1 }).lean();

            if (nearFuture) {
                const quote = await getKiteQuote([nearFuture.instrument_token]);
                return quote?.[nearFuture.instrument_token]?.last_price || null;
            }
        }

        console.warn(`[KiteOptionChain] Could not find spot price for: ${underlyingName} (${segment})`);
        return null;

    } catch (error) {
        console.error('[KiteOptionChain] Error getting spot price:', error.message);
        return null;
    }
}

/**
 * Get spot instrument info for an underlying
 * Handles indices, stocks, and MCX commodities
 *
 * @param {string} underlyingName - e.g., "NIFTY", "HDFCBANK", "GOLD"
 * @param {string} segment - e.g., "NFO-OPT", "BFO-OPT", "MCX-OPT"
 * @returns {Promise<Object|null>} Spot instrument info or null if not found
 */
export async function getSpotInstrumentInfo(underlyingName, segment, opts = {}) {
    try {
        const nameCandidates = await resolveNameCandidates(underlyingName, opts.nameCandidates || []);
        const lookupNames = nameCandidates.length ? nameCandidates : dedupeStrings([underlyingName]);

        // 1. Check if it's a known INDEX
        const indexInfo = INDEX_UNDERLYING_MAP[toUpper(underlyingName)];
        if (indexInfo && indexInfo.token) {
            console.log(`[KiteOptionChain] Getting spot instrument for index: ${underlyingName} -> token ${indexInfo.token}`);
            return {
                token: indexInfo.token,
                type: 'index',
                tradingsymbol: indexInfo.tradingsymbol,
                exchange: indexInfo.exchange
            };
        }

        // 2. For STOCK OPTIONS (NFO-OPT/BFO-OPT), get equity instrument info
        const equitySegment = OPTION_TO_EQUITY_SEGMENT[segment];
        if (equitySegment) {
            console.log(`[KiteOptionChain] Getting spot instrument for stock: ${underlyingName} in ${equitySegment}`);
            const stock = await Instrument.findOne({
                segment: equitySegment,
                $or: [
                    { tradingsymbol: { $in: lookupNames } },
                    { name: { $in: lookupNames } },
                ],
            }).lean();

            if (stock) {
                return {
                    token: stock.instrument_token,
                    type: 'stock',
                    tradingsymbol: stock.tradingsymbol,
                    exchange: stock.exchange,
                    lot_size: stock.lot_size
                };
            }
        }

        // 3. For MCX (Commodities) - use near month future as spot reference
        if (segment && segment.startsWith('MCX')) {
            console.log(`[KiteOptionChain] Getting spot instrument for MCX: ${underlyingName} from near month future`);
            const nearFuture = await Instrument.findOne({
                segment: 'MCX-FUT',
                $or: [
                    { name: { $in: lookupNames } },
                    { tradingsymbol: { $in: lookupNames } },
                ],
                expiry: { $gte: new Date() }
            }).sort({ expiry: 1 }).lean();

            if (nearFuture) {
                return {
                    token: nearFuture.instrument_token,
                    type: 'commodity_future',
                    tradingsymbol: nearFuture.tradingsymbol,
                    exchange: nearFuture.exchange,
                    lot_size: nearFuture.lot_size
                };
            }
        }

        console.warn(`[KiteOptionChain] Could not find spot instrument for: ${underlyingName} (${segment})`);
        return null;

    } catch (error) {
        console.error('[KiteOptionChain] Error getting spot instrument info:', error.message);
        return null;
    }
}

/**
 * Get list of available expiry dates for an underlying
 * 
 * @param {string} underlyingName - e.g., "NIFTY", "HDFCBANK", "AXIS BANK"
 * @param {string|string[]} segmentOrSegments - e.g., "NFO-OPT", "BFO-OPT", "MCX-OPT"
 * @param {Object} [opts]
 * @param {string[]} [opts.nameCandidates]
 * @returns {Promise<{expiries:string[],resolvedSegment:string,resolvedName:string}>}
 */
export async function getExpiryListDetailed(underlyingName, segmentOrSegments = 'NFO-OPT', opts = {}) {
    try {
        const segmentCandidates = buildSegmentCandidates(segmentOrSegments, underlyingName);

        // Cache expiry list — expiries are set at market open and don't change intra-day
        const today = new Date().toISOString().split('T')[0];
        const expiryCacheKey = `expiries:${toUpper(underlyingName)}:${segmentCandidates.join(',')}:${today}`;
        const cachedExpiries = await getCache(expiryCacheKey);
        if (cachedExpiries) return cachedExpiries;

        const nameCandidates = await resolveNameCandidates(underlyingName, opts.nameCandidates || []);
        const lookupNames = nameCandidates.length ? nameCandidates : dedupeStrings([underlyingName]);

        console.log(
            `[KiteOptionChain] Getting expiries for: ${underlyingName} | segments=${segmentCandidates.join(',')} | names=${lookupNames.join(',')}`
        );

        // Use start of today (midnight UTC) to include same-day expiries
        // Expiries are stored as midnight UTC, so comparing with current time
        // would exclude today's expiry after midnight has passed
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);

        for (const segment of segmentCandidates) {
            const filter = {
                name: { $in: lookupNames },
                segment,
                expiry: { $gte: startOfToday },
            };
            const expiries = await Instrument.distinct('expiry', filter);

            if (expiries && expiries.length > 0) {
                const sortedExpiries = sortAndFormatExpiries(expiries);
                const matched = await Instrument.findOne(filter)
                    .select('name')
                    .lean();

                const resolvedName = toUpper(matched?.name) || lookupNames[0] || toUpper(underlyingName);
                console.log(
                    `[KiteOptionChain] Expiries resolved via name="${resolvedName}" segment="${segment}" count=${sortedExpiries.length}`
                );
                const expiryResult = { expiries: sortedExpiries, resolvedSegment: segment, resolvedName };
                // Cache until midnight (expiries don't change intra-day)
                setCache(expiryCacheKey, expiryResult, 8 * 60 * 60).catch(() => {});
                return expiryResult;
            }
        }

        console.warn(`[KiteOptionChain] No expiries found for ${underlyingName}`);
        return {
            expiries: [],
            resolvedSegment: segmentCandidates[0] || normalizeToOptionSegment(segmentOrSegments),
            resolvedName: lookupNames[0] || toUpper(underlyingName),
        };

    } catch (error) {
        console.error('[KiteOptionChain] Error getting expiry list:', error.message);
        return {
            expiries: [],
            resolvedSegment: Array.isArray(segmentOrSegments)
                ? normalizeToOptionSegment(segmentOrSegments[0])
                : normalizeToOptionSegment(segmentOrSegments),
            resolvedName: toUpper(underlyingName),
        };
    }
}

/**
 * Backward-compatible expiry list API.
 * Returns array only.
 */
export async function getExpiryList(underlyingName, segmentOrSegments = 'NFO-OPT', opts = {}) {
    const result = await getExpiryListDetailed(underlyingName, segmentOrSegments, opts);
    return result.expiries || [];
}

/**
 * Get nearest expiry date from a list of expiries
 * 
 * @param {string[]} expiries - Array of expiry dates
 * @returns {string|null} Nearest expiry in YYYY-MM-DD format
 */
export function getNearestExpiry(expiries) {
    if (!expiries || expiries.length === 0) return null;
    return expiries[0]; // Already sorted, first is nearest
}

/**
 * Build option chain data for an underlying and expiry
 * 
 * @param {string} underlyingName - e.g., "NIFTY", "HDFCBANK"
 * @param {string|string[]} segment - e.g., "NFO-OPT", "BFO-OPT"
 * @param {string} expiry - Expiry date in YYYY-MM-DD format
 * @param {Object} [opts]
 * @param {string[]} [opts.nameCandidates]
 * @returns {Promise<Object>} Option chain payload with chain and resolved metadata
 */
export async function getOptionChain(underlyingName, segment = 'NFO-OPT', expiry, opts = {}) {
    try {
        console.log(`[KiteOptionChain] Building chain for: ${underlyingName} (${segment}) expiry: ${expiry}`);

        // Cache the strike structure — instrument_tokens, lot sizes, tradingsymbols don't change intra-day.
        // LTPs are NOT in this response — frontend subscribes to them via WebSocket separately.
        const chainCacheKey = `optchain:${toUpper(underlyingName)}:${toUpper(String(segment))}:${expiry}`;
        const cachedChain = await getCache(chainCacheKey);
        if (cachedChain) return cachedChain;

        // Parse expiry date for range query (to handle timezone differences)
        const expiryDate = new Date(expiry);
        const expiryStart = new Date(expiryDate);
        expiryStart.setHours(0, 0, 0, 0);
        const expiryEnd = new Date(expiryDate);
        expiryEnd.setHours(23, 59, 59, 999);

        const segmentCandidates = buildSegmentCandidates(segment, underlyingName);
        const nameCandidates = await resolveNameCandidates(underlyingName, opts.nameCandidates || []);
        const lookupNames = nameCandidates.length ? nameCandidates : dedupeStrings([underlyingName]);

        let resolvedSegment = null;
        let resolvedName = null;
        let options = [];

        for (const segmentCandidate of segmentCandidates) {
            const query = {
                name: { $in: lookupNames },
                segment: segmentCandidate,
                expiry: { $gte: expiryStart, $lte: expiryEnd },
                instrument_type: { $in: ['CE', 'PE'] },
            };

            const matchedOptions = await Instrument.find(query).lean();
            if (!matchedOptions || matchedOptions.length === 0) {
                continue;
            }

            resolvedSegment = segmentCandidate;
            options = matchedOptions;

            const availableNames = new Set(
                matchedOptions
                    .map((opt) => toUpper(opt?.name))
                    .filter(Boolean)
            );
            resolvedName = lookupNames.find((candidate) => availableNames.has(candidate))
                || toUpper(matchedOptions[0]?.name)
                || lookupNames[0]
                || toUpper(underlyingName);
            break;
        }

        if (!options || options.length === 0) {
            console.warn(`[KiteOptionChain] No options found for ${underlyingName} ${expiry}`);
            return {
                chain: [],
                spotPrice: null,
                totalStrikes: 0,
                resolvedSegment: segmentCandidates[0] || normalizeToOptionSegment(segment),
                resolvedName: lookupNames[0] || toUpper(underlyingName),
            };
        }

        console.log(`[KiteOptionChain] Found ${options.length} option contracts`);

        // Group by strike price
        const strikeMap = new Map();

        for (const opt of options) {
            const strike = opt.strike;
            if (!strikeMap.has(strike)) {
                strikeMap.set(strike, { strike, call: null, put: null });
            }

            const row = strikeMap.get(strike);
            const optionData = {
                instrument_token: opt.instrument_token,
                tradingsymbol: opt.tradingsymbol,
                lot_size: opt.lot_size,
                tick_size: opt.tick_size,
                ltp: null, // Populated by frontend via WebSocket — null = pending
                oi: null,
                volume: null,
            };

            if (opt.instrument_type === 'CE') {
                row.call = optionData;
            } else if (opt.instrument_type === 'PE') {
                row.put = optionData;
            }
        }

        // Convert map to sorted array
        const chain = Array.from(strikeMap.values())
            .sort((a, b) => a.strike - b.strike);

        // Get spot instrument info
        const spotInstrumentInfo = await getSpotInstrumentInfo(resolvedName, resolvedSegment, {
            nameCandidates: lookupNames,
        });

        console.log(`[KiteOptionChain] Built chain with ${chain.length} strikes, spot instrument:`, spotInstrumentInfo);

        const chainResult = {
            chain,
            spotInstrumentInfo,
            totalStrikes: chain.length,
            resolvedSegment: resolvedSegment || normalizeToOptionSegment(segment),
            resolvedName: resolvedName || lookupNames[0] || toUpper(underlyingName),
        };
        // Cache strike structure for 10 minutes — contracts don't change mid-session
        setCache(chainCacheKey, chainResult, 10 * 60).catch(() => {});
        return chainResult;

    } catch (error) {
        console.error('[KiteOptionChain] Error building option chain:', error.message);
        throw error;
    }
}

/**
 * Determine the option segment for a given underlying
 * 
 * @param {string} underlyingName - e.g., "NIFTY", "SENSEX", "GOLD"
 * @returns {string} Option segment e.g., "NFO-OPT", "BFO-OPT", "MCX-OPT"
 */
export function getOptionSegment(underlyingName) {
    // BSE indices
    if (['SENSEX', 'BANKEX', 'SENSEX50'].includes(underlyingName)) {
        return 'BFO-OPT';
    }

    // MCX commodities
    const mcxUnderlyings = ['GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'CRUDEOIL', 'CRUDEOILM',
        'NATURALGAS', 'NATGASMINI', 'COPPER', 'ZINC'];
    if (mcxUnderlyings.includes(underlyingName)) {
        return 'MCX-OPT';
    }

    // Default to NFO (NSE F&O)
    return 'NFO-OPT';
}
