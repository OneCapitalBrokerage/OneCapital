// Routes/instruments.js - KITE VERSION
// Updated to use Kite instrument schema (instrument_token, name, lot_size, etc.)

import { Router } from "express";
import Instrument from "../Model/InstrumentModel.js";
import { getCache, setCache } from "../services/redisCache.js";

const router = Router();

// ==================== SEARCH OPTIMIZATION CACHE ====================
const searchCache = new Map();
const SEARCH_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const SEARCH_CACHE_VERSION = "v3";
const SEARCH_RESULT_LIMIT = 200;
const DEFAULT_SEARCH_SEGMENTS = ["NSE", "BSE", "NFO-FUT", "BFO-FUT", "MCX-FUT", "NFO-OPT", "BFO-OPT", "MCX-OPT"];
const FAR_FUTURE_DATE = new Date("2099-12-31T23:59:59.999Z");

const searchAnalytics = new Map();
const ANALYTICS_WINDOW = 60 * 60 * 1000; // 1 hour

function trackSearch(query, category, resultsCount) {
    const key = `${query.toLowerCase()}:${category}`;
    const now = Date.now();
    if (!searchAnalytics.has(key)) {
        searchAnalytics.set(key, { query, category, count: 0, lastSearched: now, avgResults: 0 });
    }
    const stats = searchAnalytics.get(key);
    stats.count++;
    stats.lastSearched = now;
    stats.avgResults = Math.round((stats.avgResults * (stats.count - 1) + resultsCount) / stats.count);
}

function getTopSearches(limit = 20) {
    const now = Date.now();
    return Array.from(searchAnalytics.entries())
        .filter(([_, stats]) => (now - stats.lastSearched) < ANALYTICS_WINDOW)
        .map(([key, stats]) => ({ key, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

// Cache cleanup interval
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
        if (now - value.timestamp > SEARCH_CACHE_TTL) searchCache.delete(key);
    }
    console.log(`[Cache Cleanup] Search: ${searchCache.size} entries`);
}, 5 * 60 * 1000);

// ==================== KITE SEGMENT MAPPING ====================
// Kite segments: NFO-FUT, NFO-OPT, BFO-FUT, BFO-OPT, MCX-FUT, MCX-OPT, NSE, BSE, INDICES
// Kite instrument_type: FUT, CE, PE, EQ

// Map category filter to Kite segment patterns
function getSegmentFilter(category) {
    switch (category) {
        case "F&O":
            return { $in: ["NFO-FUT", "NFO-OPT", "BFO-FUT", "BFO-OPT"] };
        case "Commodity":
            return { $in: ["MCX-FUT", "MCX-OPT", "CDS-FUT", "CDS-OPT"] };
        case "Index":
        case "NSE_INDEX":
            return { $in: ["INDICES"] };
        case "Equity":
            return { $in: ["NSE", "BSE"] };
        case "All":
        default:
            // Default: F&O + Commodity (excluding indices and equity for trading)
            return { $in: ["NSE","BSE","NFO-FUT", "NFO-OPT", "BFO-FUT", "BFO-OPT", "MCX-FUT", "MCX-OPT"] };
    }
}

// Check if instrument is a futures contract
function isFutures(instrument_type) {
    return instrument_type === "FUT";
}

// Check if instrument is an options contract
function isOptions(instrument_type) {
    return ["CE", "PE"].includes(instrument_type);
}

// ------------------------------------------------------------
// Smart query parsing – extracts optional segment and type tokens
// ------------------------------------------------------------
// Supported segment tokens: NSE, BSE, MCX
// Supported type tokens: FUT (futures), OPT (options)
// Example queries:
//   "RELIANCE NSE FUT" → keyword: "RELIANCE", segments: ["NSE","NFO-FUT","NFO-OPT"], type: "FUT"
//   "BANKNIFTY MCX OPT" → keyword: "BANKNIFTY", segments: ["MCX-FUT","MCX-OPT"], type: "OPT"
//   "INFY" → keyword: "INFY", segments: all (default), type: any
// Returns an object { keyword, segmentFilter, typeFilter }
function parseSmartQuery(rawQuery) {
    const normalizedQuery = String(rawQuery || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");
    const tokens = normalizedQuery ? normalizedQuery.split(/\s+/) : [];

    const segmentMap = {
        NSE: ["NSE", "NFO-FUT", "NFO-OPT"],
        BSE: ["BSE", "BFO-FUT", "BFO-OPT"],
        NFO: ["NFO-FUT", "NFO-OPT"],
        BFO: ["BFO-FUT", "BFO-OPT"],
        MCX: ["MCX-FUT", "MCX-OPT"],
        EQUITY: ["NSE", "BSE"],
        EQUITIES: ["NSE", "BSE"],
        FUTURES: ["NFO-FUT", "BFO-FUT", "MCX-FUT"],
        OPTIONS: ["NFO-OPT", "BFO-OPT", "MCX-OPT"]
    };
    const typeMap = {
        EQ: "EQ",
        EQUITY: "EQ",
        FUT: "FUT",
        FUTURE: "FUT",
        FUTURES: "FUT",
        OPT: ["CE", "PE"],
        OPTION: ["CE", "PE"],
        OPTIONS: ["CE", "PE"]
    };

    const segmentTokens = [];
    const typeTokens = [];
    const keywordParts = [];

    for (const t of tokens) {
        if (segmentMap[t]) {
            segmentTokens.push(t);
            continue;
        }
        if (typeMap[t]) {
            typeTokens.push(t);
            continue;
        }
        keywordParts.push(t);
    }

    const keyword = keywordParts.join(" ").trim() || normalizedQuery;

    // Build segment filter – if any segment token present, include all related segments
    let segmentFilter;
    if (segmentTokens.length > 0) {
        const segments = [];
        segmentTokens.forEach((tok) => segments.push(...segmentMap[tok]));
        segmentFilter = { $in: Array.from(new Set(segments)) };
    } else {
        segmentFilter = { $in: DEFAULT_SEARCH_SEGMENTS };
    }

    // Build type filter – if any type token present, restrict instrument_type accordingly
    let typeFilter = {};
    if (typeTokens.length > 0) {
        const conditions = typeTokens.map((tok) => {
            const val = typeMap[tok];
            if (Array.isArray(val)) {
                return { instrument_type: { $in: val } };
            }
            return { instrument_type: val };
        });
        typeFilter = { $or: conditions };
    }

    return { keyword, segmentFilter, typeFilter };
}

function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeRegexes(regexList = []) {
    const seen = new Set();
    const deduped = [];
    for (const regex of regexList) {
        const key = regex.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(regex);
    }
    return deduped;
}

function buildRegexProfile(keyword) {
    const normalized = String(keyword || "").trim().replace(/\s+/g, " ");
    const compact = normalized.replace(/\s+/g, "");
    const escaped = escapeRegex(normalized);
    const escapedCompact = escapeRegex(compact);
    const hasCompactVariant = compact.length > 0 && compact !== normalized;
    const allowContains = compact.length > 3;

    const profile = {
        allowContains,
        symbolExact: [new RegExp(`^${escaped}$`, "i")],
        symbolPrefix: [new RegExp(`^${escaped}`, "i")],
        symbolContains: [new RegExp(escaped, "i")],
        nameExact: [new RegExp(`^${escaped}$`, "i")],
        namePrefix: [new RegExp(`^${escaped}`, "i")],
        nameWord: [new RegExp(`\\b${escaped}`, "i")],
        nameContains: [new RegExp(escaped, "i")]
    };

    if (hasCompactVariant) {
        profile.symbolExact.push(new RegExp(`^${escapedCompact}$`, "i"));
        profile.symbolPrefix.push(new RegExp(`^${escapedCompact}`, "i"));
        profile.symbolContains.push(new RegExp(escapedCompact, "i"));
        profile.nameContains.push(new RegExp(escapedCompact, "i"));
    }

    profile.symbolExact = dedupeRegexes(profile.symbolExact);
    profile.symbolPrefix = dedupeRegexes(profile.symbolPrefix);
    profile.symbolContains = dedupeRegexes(profile.symbolContains);
    profile.nameExact = dedupeRegexes(profile.nameExact);
    profile.namePrefix = dedupeRegexes(profile.namePrefix);
    profile.nameWord = dedupeRegexes(profile.nameWord);
    profile.nameContains = dedupeRegexes(profile.nameContains);

    return profile;
}

function buildRegexOrClauses(field, regexes = []) {
    return regexes.map((regex) => ({ [field]: regex }));
}

function buildRegexMatchExpr(fieldPath, regexes = []) {
    return {
        $or: regexes.map((regex) => ({
            $regexMatch: {
                input: { $ifNull: [fieldPath, ""] },
                regex
            }
        }))
    };
}

function buildBucketPriorityExpr() {
    return {
        $switch: {
            branches: [
                {
                    // Highest priority: NSE cash equities
                    case: { $eq: ["$segment", "NSE"] },
                    then: 0
                },
                {
                    // Then equity/index futures
                    case: { $eq: ["$segment", "NFO-FUT"] },
                    then: 1
                },
                {
                    case: { $eq: ["$segment", "BFO-FUT"] },
                    then: 2
                },
                {
                    // Then BSE cash equities
                    case: { $eq: ["$segment", "BSE"] },
                    then: 3
                },
                {
                    // Then commodity futures
                    case: { $eq: ["$segment", "MCX-FUT"] },
                    then: 4
                },
                {
                    // Options lower priority
                    case: { $eq: ["$segment", "NFO-OPT"] },
                    then: 5
                },
                {
                    case: { $eq: ["$segment", "BFO-OPT"] },
                    then: 6
                },
                {
                    case: { $eq: ["$segment", "MCX-OPT"] },
                    then: 7
                },
                {
                    case: { $eq: ["$segment", "CDS-FUT"] },
                    then: 8
                },
                {
                    case: { $eq: ["$segment", "CDS-OPT"] },
                    then: 9
                }
            ],
            default: 99
        }
    };
}

export { parseSmartQuery };

// ==================== SEARCH ENDPOINT ====================
router.get("/search", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        // Note: We're no longer using the category parameter as we're doing smart parsing
        if (!q) return res.json([]);

        const { keyword, segmentFilter, typeFilter } = parseSmartQuery(q);
        if (!keyword) return res.json([]);

        const regexProfile = buildRegexProfile(keyword);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const keywordClauses = [
            ...buildRegexOrClauses("tradingsymbol", regexProfile.symbolExact),
            ...buildRegexOrClauses("tradingsymbol", regexProfile.symbolPrefix),
            ...buildRegexOrClauses("name", regexProfile.nameExact),
            ...buildRegexOrClauses("name", regexProfile.namePrefix),
            ...buildRegexOrClauses("name", regexProfile.nameWord),
        ];
        if (regexProfile.allowContains) {
            keywordClauses.push(...buildRegexOrClauses("tradingsymbol", regexProfile.symbolContains));
            keywordClauses.push(...buildRegexOrClauses("name", regexProfile.nameContains));
        }
        if (keywordClauses.length === 0) return res.json([]);

        const freshnessClause = {
            $or: [
                // Cash equities don't expire; include by segment.
                { segment: { $in: ["NSE", "BSE"] } },
                // Derivatives must be live/forward contracts.
                { segment: { $in: ["NFO-FUT", "BFO-FUT", "MCX-FUT", "CDS-FUT"] }, expiry: { $gte: startOfToday } },
                { segment: { $in: ["NFO-OPT", "BFO-OPT", "MCX-OPT", "CDS-OPT"] }, expiry: { $gte: startOfToday } }
            ]
        };

        const matchClauses = [
            { segment: segmentFilter },
            { $or: keywordClauses },
            freshnessClause
        ];
        if (Object.keys(typeFilter).length > 0) {
            matchClauses.push(typeFilter);
        }
        const baseMatch = { $and: matchClauses };

        const matchPriorityBranches = [
            { case: buildRegexMatchExpr("$tradingsymbol", regexProfile.symbolExact), then: 0 },
            { case: buildRegexMatchExpr("$name", regexProfile.nameExact), then: 1 },
            { case: buildRegexMatchExpr("$tradingsymbol", regexProfile.symbolPrefix), then: 2 },
            { case: buildRegexMatchExpr("$name", regexProfile.namePrefix), then: 3 },
            { case: buildRegexMatchExpr("$name", regexProfile.nameWord), then: 4 },
        ];
        if (regexProfile.allowContains) {
            matchPriorityBranches.push(
                { case: buildRegexMatchExpr("$tradingsymbol", regexProfile.symbolContains), then: 5 },
                { case: buildRegexMatchExpr("$name", regexProfile.nameContains), then: 6 }
            );
        }

        // Cache check - using parsed filters and cache version for deterministic ranking updates
        const cacheKey = `search:${SEARCH_CACHE_VERSION}:${q.toLowerCase()}:${JSON.stringify(segmentFilter)}:${JSON.stringify(typeFilter)}:${regexProfile.allowContains ? "contains" : "strict"}`;
        const now = Date.now();

        const redisCache = await getCache(cacheKey);
        if (redisCache) {
            console.log(`[Search Redis Cache HIT] "${q}" - ${redisCache.length} results`);
            // trackSearch(q, "Smart", redisCache.length);
            return res.json(redisCache);
        }

        const memoryCached = searchCache.get(cacheKey);
        if (memoryCached && (now - memoryCached.timestamp) < SEARCH_CACHE_TTL) {
            console.log(`[Search Memory Cache HIT] "${q}" - ${memoryCached.results.length} results`);
            // trackSearch(q, "Smart", memoryCached.results.length);
            return res.json(memoryCached.results);
        }

        const searchResults = await Instrument.aggregate([
            { $match: baseMatch },
            {
                $addFields: {
                    bucketPriority: buildBucketPriorityExpr(),
                    matchPriority: {
                        $switch: {
                            branches: matchPriorityBranches,
                            default: 99
                        }
                    },
                    expirySort: {
                        $cond: [
                            { $in: ["$instrument_type", ["FUT", "CE", "PE"]] },
                            { $ifNull: ["$expiry", FAR_FUTURE_DATE] },
                            FAR_FUTURE_DATE
                        ]
                    }
                }
            },
            { $match: { bucketPriority: { $lt: 90 }, matchPriority: { $lt: 90 } } },
            { $sort: { bucketPriority: 1, matchPriority: 1, expirySort: 1, tradingsymbol: 1 } },
            {
                $group: {
                    _id: { segment: "$segment", tradingsymbol: "$tradingsymbol" },
                    doc: { $first: "$$ROOT" }
                }
            },
            { $replaceRoot: { newRoot: "$doc" } },
            // Important: $group does not preserve prior sort order reliably.
            // Re-apply deterministic ranking so options do not float to top.
            { $sort: { bucketPriority: 1, matchPriority: 1, expirySort: 1, tradingsymbol: 1 } },
            { $limit: SEARCH_RESULT_LIMIT }
        ]);

        // Format response with Kite fields
        const results = searchResults.map(item => ({
            _id: item._id,
            instrument_token: item.instrument_token,
            exchange_token: item.exchange_token,
            tradingsymbol: item.tradingsymbol,
            name: item.name,
            segment: item.segment,
            exchange: item.exchange,
            instrument_type: item.instrument_type,
            expiry: item.expiry,
            strike: item.strike,
            lot_size: item.lot_size,
            tick_size: item.tick_size,
            last_price: item.last_price
        }));

        console.log(`[Search] Returning ${results.length} results for "${q}" (keyword="${keyword}")`);
        // trackSearch(q, "Smart", results.length);
        // Store the combined, ordered result set in both memory and Redis caches
        // The result shape is an array of instrument objects (already ordered by equities → futures → options)
        searchCache.set(cacheKey, { results, timestamp: Date.now() });
        // Redis cache expects the raw array; we keep the same TTL (120 seconds)
        setCache(cacheKey, results, 120).catch(console.error);
        res.json(results);

    } catch (e) {
        console.error("instruments/search error:", e);
        res.status(500).json({ error: "failed" });
    }
});

// ==================== WATCHLIST ENDPOINT ====================
router.get("/watchlist", async (req, res) => {
    try {
        const start = Date.now();
        const popularKeywords = [
            "NIFTY", "BANKNIFTY", "RELIANCE", "HDFCBANK", "TATASTEEL",
            "SBIN", "ICICIBANK", "INFY", "TCS", "ADANIENT"
        ];

        const currentDate = new Date();
        const results = [];

        for (const keyword of popularKeywords.slice(0, 5)) {
            const futDoc = await Instrument.findOne({
                name: { $regex: new RegExp(`^${keyword}$`, 'i') },
                instrument_type: "FUT",
                expiry: { $gte: currentDate }
            })
                .sort({ expiry: 1 })
                .lean();

            if (futDoc) results.push(futDoc);
        }

        console.log(`[Watchlist API] Loaded ${results.length} instruments in ${Date.now() - start}ms`);
        res.json(results);
    } catch (e) {
        console.error("instruments/watchlist error:", e);
        res.status(500).json({ error: "failed" });
    }
});

// ==================== INDEXES ENDPOINT ====================
router.get("/indexes", async (req, res) => {
    try {
        const cacheKey = 'indexes:all';

        // Check Redis cache first (shared across all instances)
        const redisCached = await getCache(cacheKey);
        if (redisCached) {
            return res.json(redisCached);
        }

        // Check per-process memory cache as L1
        const cached = searchCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
            return res.json(cached.results);
        }

        // Kite: Indices are in segment "INDICES"
        const indexes = await Instrument.find({
            segment: "INDICES"
        })
            .limit(50)
            .lean();

        const results = indexes.map(item => ({
            instrument_token: item.instrument_token,
            tradingsymbol: item.tradingsymbol,
            name: item.name,
            segment: item.segment,
            exchange: item.exchange
        }));

        console.log(`[Indexes] Found ${results.length} index instruments`);
        searchCache.set(cacheKey, { results, timestamp: Date.now() });
        // Cache in Redis for 30 minutes — index list changes only when master data refreshes
        setCache(cacheKey, results, 30 * 60).catch(() => {});
        res.json(results);
    } catch (e) {
        console.error("instruments/indexes error:", e);
        res.status(500).json({ error: "failed" });
    }
});

// ==================== RESOLVE ENDPOINT ====================
router.get("/resolve", async (req, res) => {
    try {
        const { segment, tradingsymbol, name, instrument_type, expiry, strike } = req.query;
        const q = {};
        if (segment) q.segment = segment.toUpperCase();
        if (tradingsymbol) q.tradingsymbol = tradingsymbol.toUpperCase();
        if (name) q.name = name.toUpperCase();
        if (instrument_type) q.instrument_type = instrument_type.toUpperCase();
        if (expiry) q.expiry = new Date(expiry);
        if (strike) q.strike = Number(strike);

        const doc = await Instrument.findOne(q).lean();
        if (!doc) return res.status(404).json({ error: "Instrument not found" });

        res.json({
            instrument_token: doc.instrument_token,
            segment: doc.segment,
            exchange: doc.exchange,
            tradingsymbol: doc.tradingsymbol,
            lot_size: doc.lot_size,
            instrument_type: doc.instrument_type,
            expiry: doc.expiry || null,
        });
    } catch (e) {
        console.error("instruments/resolve error:", e);
        res.status(500).json({ error: "failed" });
    }
});

// ==================== LOOKUP ENDPOINT ====================
router.get("/lookup", async (req, res) => {
    try {
        const { instrument_token, segment } = req.query;

        if (!instrument_token) {
            return res.status(400).json({ error: "instrument_token is required" });
        }

        const query = { instrument_token: String(instrument_token) };
        if (segment) query.segment = segment;

        const instrument = await Instrument.findOne(query)
            .select("instrument_token segment exchange tradingsymbol name instrument_type lot_size expiry")
            .lean();

        if (!instrument) {
            return res.status(404).json({ error: "Instrument not found" });
        }

        res.json(instrument);
    } catch (e) {
        console.error("instruments/lookup error:", e);
        res.status(500).json({ error: "failed" });
    }
});

// ==================== ANALYTICS ENDPOINT ====================
router.get("/analytics", async (req, res) => {
    try {
        const topSearches = getTopSearches(50);
        const cacheStats = {
            memory: {
                searchCache: searchCache.size,
                analyticsTracked: searchAnalytics.size
            }
        };

        res.json({
            topSearches,
            cacheStats,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("instruments/analytics error:", e);
        res.status(500).json({ error: "failed" });
    }
});

export default router;
