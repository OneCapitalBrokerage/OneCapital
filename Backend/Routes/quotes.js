// Routes/quotes.js - KITE VERSION
// Uses instrument_token as the primary identifier
import express from "express";
import { getFeedInstance } from "../services/feedState.js";
import { getKiteLTP } from "../services/kiteQuote.js";

const router = express.Router();
const FEED_OWNER_ENABLED = process.env.ENABLE_WS_FEED !== "false";
const DEFAULT_WORKER_SNAPSHOT_URL = process.env.WORKER_SNAPSHOT_URL || "http://127.0.0.1:8082/api/quotes/snapshot";
const ENABLE_SNAPSHOT_LTP_FALLBACK = process.env.ENABLE_SNAPSHOT_LTP_FALLBACK !== "false";
const SNAPSHOT_LTP_FALLBACK_MAX_TOKENS = Number(process.env.SNAPSHOT_LTP_FALLBACK_MAX_TOKENS || 120);

const resolveLtpFallbackHit = (ltpMap, token) => {
  if (!ltpMap || typeof ltpMap !== "object") return null;
  const direct = ltpMap[String(token)];
  if (direct && (direct.last_price != null || direct.ltp != null)) return direct;

  // Some responses may key by instrument string; fallback by matching payload token field.
  for (const value of Object.values(ltpMap)) {
    if (!value || typeof value !== "object") continue;
    const payloadToken = String(
      value.instrument_token ??
      value.instrumentToken ??
      value.token ??
      "",
    );
    if (payloadToken && payloadToken === String(token)) {
      return value;
    }
  }
  return null;
};

const fetchWorkerSnapshot = async (items, authHeader) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const headers = { "content-type": "application/json" };
    if (authHeader) {
      headers.authorization = authHeader;
    }
    const response = await fetch(DEFAULT_WORKER_SNAPSHOT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ items }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Worker snapshot HTTP ${response.status}`);
    }

    const data = await response.json();
    return data && typeof data === "object" ? data : {};
  } finally {
    clearTimeout(timeout);
  }
};

// POST /api/quotes/snapshot
// body: { items: [{ instrument_token }, ...] }
router.post("/snapshot", async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const tokens = items.map(i => String(i.instrument_token));
    const lmf = getFeedInstance();

    // Split mode (API instance): no local feed cache exists.
    // Proxy snapshot to worker process that owns KiteWebSocket + cache.
    if (!lmf?.getSnapshot && !FEED_OWNER_ENABLED) {
      const authHeader =
        req.headers.authorization ||
        (req.cookies?.accessToken ? `Bearer ${req.cookies.accessToken}` : "");
      try {
        const workerData = await fetchWorkerSnapshot(items, authHeader);
        return res.json(workerData);
      } catch (proxyErr) {
        console.error("[Snapshot] Worker proxy failed:", proxyErr.message);
      }
    }

    // 1) try cached snapshot from live feed
    const cached = lmf?.getSnapshot?.(tokens) || {};
    // build response using cached where present
    const out = {};
    for (const token of tokens) {
      const v = cached[String(token)];
      if (v) {
        out[String(token)] = {
          instrument_token: token,
          ltp: v.ltp,
          open: v.open,
          high: v.high,
          low: v.low,
          close: v.close,
          volume: v.volume,
          oi: v.oi,
          bestBidPrice: v.bestBidPrice,
          bestBidQuantity: v.bestBidQuantity,
          bestAskPrice: v.bestAskPrice,
          bestAskQuantity: v.bestAskQuantity,
          lastTradeQty: v.lastTradeQty,
          lastTradeTime: v.lastTradeTime,
          avgPrice: v.avgPrice,
          netChange: v.netChange,
          percentChange: v.percentChange,
          change: v.change,
          depth: v.depth || null, // Full market depth (5 levels buy/sell)
        };
      }
    }

    // 2) find tokens that are missing or appear empty
    const missing = tokens.filter(token => {
      const v = out[String(token)];
      return !v || (v.ltp == null && v.close == null && v.netChange == null && v.percentChange == null);
    });

    // 3) best-effort fallback to Kite LTP API for missing instruments.
    // Useful during market-closed / low-tick windows when WS cache is empty.
    if (ENABLE_SNAPSHOT_LTP_FALLBACK && missing.length > 0 && missing.length <= SNAPSHOT_LTP_FALLBACK_MAX_TOKENS) {
      try {
        const ltpMap = await getKiteLTP(missing);
        missing.forEach((token) => {
          const hit = resolveLtpFallbackHit(ltpMap, token);
          const ltp = hit?.last_price ?? hit?.ltp ?? null;
          if (ltp == null) return;

          const prev = out[String(token)] || { instrument_token: token };
          out[String(token)] = {
            ltp,
            open: prev.open ?? null,
            high: prev.high ?? null,
            low: prev.low ?? null,
            close: prev.close ?? null,
            volume: prev.volume ?? null,
            oi: prev.oi ?? null,
            bestBidPrice: prev.bestBidPrice ?? null,
            bestBidQuantity: prev.bestBidQuantity ?? null,
            bestAskPrice: prev.bestAskPrice ?? null,
            bestAskQuantity: prev.bestAskQuantity ?? null,
            lastTradeQty: prev.lastTradeQty ?? null,
            lastTradeTime: prev.lastTradeTime ?? null,
            avgPrice: prev.avgPrice ?? null,
            netChange: prev.netChange ?? null,
            percentChange: prev.percentChange ?? null,
            change: prev.change ?? null,
            depth: prev.depth ?? null,
            instrument_token: token,
          };
        });
      } catch (fallbackErr) {
        console.warn("[Snapshot] LTP fallback failed:", fallbackErr.message);
      }
    }

    // 4) recompute still-missing after fallback
    const stillMissing = tokens.filter(token => {
      const v = out[String(token)];
      return !v || (v.ltp == null && v.close == null && v.netChange == null && v.percentChange == null);
    });

    // If data is missing, it means these instruments haven't been subscribed to the WebSocket feed yet.
    if (stillMissing.length) {
      console.log(`[Snapshot] ${stillMissing.length} instruments not found in cache. They may not be subscribed to the feed yet.`);
      for (const token of stillMissing) {
        if (!out[String(token)]) {
          out[String(token)] = {
            instrument_token: token,
            ltp: null, open: null, high: null, low: null, close: null, volume: null, oi: null,
            bestBidPrice: null, bestBidQuantity: null, bestAskPrice: null, bestAskQuantity: null,
            lastTradeQty: null, lastTradeTime: null, avgPrice: null, netChange: null, percentChange: null,
            depth: null, // Market depth not available
          };
        }
      }
      out.__snapshot_info = `${stillMissing.length} instruments not in cache. Ensure they are subscribed via WebSocket.`;
    }

    return res.json(out);
  } catch (err) {
    console.error("snapshot route error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

export default router;
