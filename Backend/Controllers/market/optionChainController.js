// Controllers/market/optionChainController.js
// Option Chain Controller - Uses Kite instruments database and Quote API

import {
    getExpiryListDetailed as kiteGetExpiryListDetailed,
    getNearestExpiry,
    getOptionChain as kiteGetOptionChain,
    getOptionSegment,
    normalizeToOptionSegment,
    getOptionSegmentCandidates
} from '../../services/kiteOptionChain.js';
import Instrument from '../../Model/InstrumentModel.js';

const toUpper = (value) => String(value || '').trim().toUpperCase();

const dedupeUpper = (values = []) => {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const normalized = toUpper(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
};

const isIndexSegment = (segment) => {
    const normalized = toUpper(segment);
    if (!normalized) return false;
    return (
        normalized === 'INDICES' ||
        normalized === 'NSE_INDEX' ||
        normalized === 'BSE_INDEX' ||
        normalized.endsWith('_INDEX') ||
        normalized.endsWith('-INDEX')
    );
};

const resolvePreferredOptionSegment = ({
    inputSegment,
    resolvedSegment,
    resolvedExchange,
    underlyingName,
} = {}) => {
    if (inputSegment) {
        return normalizeToOptionSegment(inputSegment);
    }

    if (isIndexSegment(resolvedSegment)) {
        if (resolvedExchange) {
            return normalizeToOptionSegment(resolvedExchange);
        }
        return getOptionSegment(underlyingName);
    }

    if (resolvedSegment) {
        return normalizeToOptionSegment(resolvedSegment);
    }

    if (resolvedExchange) {
        return normalizeToOptionSegment(resolvedExchange);
    }

    return getOptionSegment(underlyingName);
};

/**
 * Resolve the base underlying name from query params.
 * Accepts name, tradingsymbol, or instrument_token and returns
 * { resolvedName, resolvedSegment, resolvedExchange }.
 * This handles the case where a user clicks "Option Chain" on a futures instrument
 * like "GOLDM26MARFUT" — we need to extract the base name "GOLDM".
 */
async function resolveUnderlying(query) {
    const { name, tradingsymbol, instrument_token } = query;
    const queryName = toUpper(name);
    const queryTradingsymbol = toUpper(tradingsymbol);
    let doc = null;

    // 1. Try resolving via instrument_token (most reliable)
    if (instrument_token) {
        doc = await Instrument.findOne({ instrument_token: String(instrument_token) })
            .select('name segment exchange tradingsymbol instrument_type expiry')
            .lean();
        if (doc?.name) {
            console.log(`[resolveUnderlying] Resolved via instrument_token ${instrument_token} → name: ${doc.name}, segment: ${doc.segment}`);
        }
    }

    // 2. Try resolving via tradingsymbol (e.g., "GOLDM26MARFUT")
    if (!doc && tradingsymbol) {
        doc = await Instrument.findOne({ tradingsymbol: queryTradingsymbol })
            .select('name segment exchange tradingsymbol instrument_type expiry')
            .lean();
        if (doc?.name) {
            console.log(`[resolveUnderlying] Resolved via tradingsymbol ${tradingsymbol} → name: ${doc.name}, segment: ${doc.segment}`);
        }
    }

    // 3. Check if the name itself might be a tradingsymbol (contains digits → likely a full symbol)
    if (!doc && name && /\d/.test(name)) {
        doc = await Instrument.findOne({ tradingsymbol: queryName })
            .select('name segment exchange tradingsymbol instrument_type expiry')
            .lean();
        if (doc?.name) {
            console.log(`[resolveUnderlying] Name "${name}" looks like tradingsymbol → resolved to: ${doc.name}`);
        }
    }

    const resolvedName = toUpper(doc?.name) || queryName || queryTradingsymbol || null;
    const nameCandidates = dedupeUpper([
        doc?.tradingsymbol,
        queryTradingsymbol,
        doc?.name,
        queryName,
    ]);

    return {
        resolvedName,
        resolvedSegment: doc?.segment || null,
        resolvedExchange: doc?.exchange || null,
        instrument: doc || null,
        nameCandidates,
    };
}

/**
 * Get option chain data
 * Query params:
 *   - name: Underlying name (e.g., "NIFTY", "HDFCBANK", "GOLD")
 *   - tradingsymbol: Full trading symbol (e.g., "GOLDM26MARFUT") - used for resolution
 *   - instrument_token: Instrument token - used for resolution
 *   - segment: Option segment (optional, auto-detected)
 *   - expiry: Expiry date in YYYY-MM-DD format (optional, defaults to nearest)
 */
async function getOptionChain(req, res) {
    try {
        const { name, segment, expiry, tradingsymbol, instrument_token } = req.query;

        // Validate - need at least one identifier
        if (!name && !tradingsymbol && !instrument_token) {
            return res.status(400).json({
                error: 'Missing required parameter',
                details: 'name, tradingsymbol, or instrument_token is required'
            });
        }

        // Resolve the base underlying name from whatever params we got
        const {
            resolvedName: underlyingName,
            resolvedSegment,
            resolvedExchange,
            nameCandidates,
        } = await resolveUnderlying({ name, tradingsymbol, instrument_token });

        if (!underlyingName) {
            return res.status(400).json({
                error: 'Could not resolve underlying',
                details: `Could not resolve underlying name from: name=${name}, tradingsymbol=${tradingsymbol}, instrument_token=${instrument_token}`
            });
        }

        console.log('[OptionChainController] Request:', {
            underlyingName,
            segment,
            resolvedSegment,
            resolvedExchange,
            expiry,
            tradingsymbol,
            instrument_token,
        });

        const preferredSegment = resolvePreferredOptionSegment({
            inputSegment: segment,
            resolvedSegment,
            resolvedExchange,
            underlyingName,
        });
        const optionSegmentCandidates = getOptionSegmentCandidates({
            segment: preferredSegment,
            underlyingName,
        });
        console.log(
            '[OptionChainController] Using segment candidates:',
            optionSegmentCandidates,
            '(input was:', segment, ', resolved:', resolvedSegment, ')'
        );

        // If no expiry provided, get earliest available
        let targetExpiry = expiry;
        let expiryResolution = null;
        if (!targetExpiry) {
            expiryResolution = await kiteGetExpiryListDetailed(
                underlyingName,
                optionSegmentCandidates,
                { nameCandidates }
            );
            targetExpiry = getNearestExpiry(expiryResolution.expiries);

            if (!targetExpiry) {
                return res.status(404).json({
                    error: 'No active expiries found',
                    details: `No future expiry dates found for ${underlyingName}`
                });
            }
            console.log('[OptionChainController] Using nearest expiry:', targetExpiry);
        }

        // Build option chain
        const optionChainData = await kiteGetOptionChain(
            underlyingName,
            optionSegmentCandidates,
            targetExpiry,
            { nameCandidates }
        );

        if (!optionChainData.chain || optionChainData.chain.length === 0) {
            return res.status(404).json({
                error: 'No option chain data found',
                details: `No options found for ${underlyingName} expiry ${targetExpiry}`
            });
        }

        const finalSegment = optionChainData.resolvedSegment
            || expiryResolution?.resolvedSegment
            || optionSegmentCandidates[0]
            || preferredSegment;
        const finalUnderlying = optionChainData.resolvedName
            || expiryResolution?.resolvedName
            || underlyingName;

        console.log('[OptionChainController] Success:', {
            totalStrikes: optionChainData.totalStrikes,
            spotInstrumentInfo: optionChainData.spotInstrumentInfo,
            resolvedSegment: finalSegment,
            resolvedName: finalUnderlying,
        });

        // Return response (same format as before for frontend compatibility)
        return res.json({
            ok: true,
            data: {
                underlying: finalUnderlying,
                segment: finalSegment,
                expiry: targetExpiry,
                spotInstrumentInfo: optionChainData.spotInstrumentInfo,
                chain: optionChainData.chain,
                meta: {
                    totalStrikes: optionChainData.totalStrikes,
                    timestamp: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        console.error('[OptionChainController] Error:', error);
        return res.status(500).json({
            error: 'Failed to fetch option chain',
            details: error.message
        });
    }
}

/**
 * Get list of available expiry dates for an underlying
 * Query params:
 *   - name: Underlying name (e.g., "NIFTY", "HDFCBANK")
 *   - tradingsymbol: Full trading symbol (e.g., "GOLDM26MARFUT") - used for resolution
 *   - instrument_token: Instrument token - used for resolution
 *   - segment: Option segment (optional)
 */
async function getExpiryList(req, res) {
    try {
        const { name, segment, tradingsymbol, instrument_token } = req.query;

        if (!name && !tradingsymbol && !instrument_token) {
            return res.status(400).json({
                error: 'Missing required parameter',
                details: 'name, tradingsymbol, or instrument_token is required'
            });
        }

        // Resolve the base underlying name
        const {
            resolvedName: underlyingName,
            resolvedSegment,
            resolvedExchange,
            nameCandidates,
        } = await resolveUnderlying({ name, tradingsymbol, instrument_token });

        if (!underlyingName) {
            return res.status(400).json({
                error: 'Could not resolve underlying',
                details: `Could not resolve underlying name from provided params`
            });
        }

        const preferredSegment = resolvePreferredOptionSegment({
            inputSegment: segment,
            resolvedSegment,
            resolvedExchange,
            underlyingName,
        });
        const optionSegmentCandidates = getOptionSegmentCandidates({
            segment: preferredSegment,
            underlyingName,
        });

        console.log('[ExpiryListController] Request:', { underlyingName, optionSegmentCandidates, inputSegment: segment });

        const expiryResolution = await kiteGetExpiryListDetailed(
            underlyingName,
            optionSegmentCandidates,
            { nameCandidates }
        );
        const expiries = expiryResolution.expiries || [];
        const nearestExpiry = getNearestExpiry(expiries);

        console.log('[ExpiryListController] Found', expiries.length, 'expiries');

        return res.json({
            ok: true,
            data: {
                expiries,
                nearest: nearestExpiry,
                count: expiries.length,
                segment: expiryResolution.resolvedSegment || optionSegmentCandidates[0] || preferredSegment,
                underlying: expiryResolution.resolvedName || underlyingName,
            }
        });

    } catch (error) {
        console.error('[ExpiryListController] Error:', error);
        return res.status(500).json({
            error: 'Failed to fetch expiry list',
            details: error.message
        });
    }
}

/**
 * Lookup the instrument_token for an option contract
 * Query params:
 *   - name: Underlying name (e.g., "NIFTY", "HDFCBANK")
 *   - strike: Strike price (number)
 *   - optionType: "CE" or "PE"
 *   - expiry: Expiry date in YYYY-MM-DD format
 */
async function getOptionSecurityId(req, res) {
    try {
        const { name, strike, optionType, expiry } = req.query;

        if (!name || !strike || !optionType || !expiry) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'name, strike, optionType, and expiry are required'
            });
        }

        const underlyingName = name.toUpperCase();
        const optionSegment = getOptionSegment(underlyingName);

        console.log('[getOptionSecurityId] Looking up:', { underlyingName, strike, optionType, expiry });

        // Parse expiry date for range query
        const expiryDate = new Date(expiry);
        const expiryStart = new Date(expiryDate);
        expiryStart.setHours(0, 0, 0, 0);
        const expiryEnd = new Date(expiryDate);
        expiryEnd.setHours(23, 59, 59, 999);

        // Find the option contract
        const instrument = await Instrument.findOne({
            name: underlyingName,
            strike: Number(strike),
            instrument_type: optionType.toUpperCase(),
            expiry: { $gte: expiryStart, $lte: expiryEnd },
            segment: optionSegment
        }).lean();

        if (!instrument) {
            console.log('[getOptionSecurityId] No instrument found');
            return res.status(404).json({
                error: 'Option contract not found',
                details: `No option found for ${underlyingName} ${strike} ${optionType} expiring ${expiry}`
            });
        }

        console.log('[getOptionSecurityId] Found:', instrument.tradingsymbol);

        return res.json({
            ok: true,
            data: {
                instrument_token: instrument.instrument_token,
                tradingsymbol: instrument.tradingsymbol,
                segment: instrument.segment,
                lot_size: instrument.lot_size,
                tick_size: instrument.tick_size
            }
        });

    } catch (error) {
        console.error('[getOptionSecurityId] Error:', error);
        return res.status(500).json({
            error: 'Failed to lookup option',
            details: error.message
        });
    }
}

export { getOptionChain, getExpiryList, getOptionSecurityId };
