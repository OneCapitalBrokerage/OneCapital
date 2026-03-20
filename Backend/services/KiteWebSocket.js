// services/KiteWebSocket.js
// Kite Connect WebSocket wrapper using official kiteconnectjs library

import crypto from 'crypto';
import { KiteTicker } from 'kiteconnect';
import { getIO } from "../sockets/io.js";
import { onMarketTick } from "../Utils/OrderManager.js";
import KiteCredential from "../Model/KiteCredentialModel.js";

// Helper to generate a short fingerprint from access_token for comparison
const tokenFingerprint = (accessToken) => {
  if (!accessToken) return null;
  return crypto.createHash('sha256').update(accessToken).digest('hex').substring(0, 16);
};

const roomFor = (token) => `sec:${token}`;
const MODE_PRIORITY = Object.freeze({
  ltp: 1,
  quote: 2,
  full: 3
});

const normalizeMode = (mode) => {
  const raw = String(mode || '').toLowerCase();
  return MODE_PRIORITY[raw] ? raw : 'full';
};

const hasKnownMode = (mode) => {
  if (typeof mode !== 'string') return false;
  return Boolean(MODE_PRIORITY[String(mode).toLowerCase()]);
};

const modePriority = (mode) => {
  if (!hasKnownMode(mode)) return 0;
  return MODE_PRIORITY[String(mode).toLowerCase()];
};

const isModeEqual = (leftMode, rightMode) => {
  if (!hasKnownMode(leftMode) && !hasKnownMode(rightMode)) return true;
  if (!hasKnownMode(leftMode) || !hasKnownMode(rightMode)) return false;
  return modePriority(leftMode) === modePriority(rightMode);
};

const higherMode = (leftMode, rightMode) => {
  if (!hasKnownMode(leftMode)) return normalizeMode(rightMode);
  if (!hasKnownMode(rightMode)) return normalizeMode(leftMode);
  return modePriority(leftMode) >= modePriority(rightMode)
    ? normalizeMode(leftMode)
    : normalizeMode(rightMode);
};

export class KiteWebSocket {
  constructor() {
    this.ticker = null;
    this.subscribedTokens = new Set();
    this.tokenModes = new Map();
    this.subscriptionQueue = [];
    this.last = new Map();
    this.isConnected = false;
    this.tickTraceEnabled = process.env.MARKET_TICK_TRACE !== 'false';
    const traceLogLimitRaw = Number.parseInt(process.env.MARKET_TICK_TRACE_LOG_LIMIT || '5', 10);
    this.tickTraceLogLimit = Number.isFinite(traceLogLimitRaw) && traceLogLimitRaw > 0 ? traceLogLimitRaw : 5;
    this.tickTraceLogged = 0;
    this.tickTraceSeqByToken = new Map();
    this._reconnectReplay = null;
    // Token rotation support: prevent duplicate reconnects and track current token
    this._currentTokenFingerprint = null;
    this._reconnectLock = false;
  }

  get ns() {
    return getIO().of("/market");
  }

  /**
   * Set new access token (for token refresh)
   */
  setToken(newToken) {
    // Token is stored in database now
    this.accessToken = newToken;
  }

  /**
   * Connect to Kite WebSocket - fetches credentials from database
   */
  async connect() {
    try {
      // Fetch credentials from database
      const credential = await KiteCredential.findOne({ is_active: true }).lean();

      if (!credential) {
        console.error("[KiteWS] FATAL: No active Kite credentials found in database.");
        console.error("   Please login via /api/kite/login-url first.");
        return;
      }

      const { api_key, access_token } = credential;

      if (!api_key || !access_token) {
        console.error("[KiteWS] FATAL: Kite API key or access token missing in database.");
        console.error("   Please login via /api/kite/login-url to get a valid token.");
        return;
      }

      // Check if token is expired
      if (credential.token_expiry && new Date(credential.token_expiry) < new Date()) {
        console.error("[KiteWS] WARNING: Access token has expired.");
        console.error("   Please login again via /api/kite/login-url");
      }

      // Track token fingerprint to detect changes
      const newFingerprint = tokenFingerprint(access_token);
      this._currentTokenFingerprint = newFingerprint;

      // Initialize KiteTicker
      this.ticker = new KiteTicker({
        api_key: api_key,
        access_token: access_token,
        reconnect: true,
        max_retry: 50,
        max_delay: 60
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Connect
      console.log("[KiteWS] Connecting to Kite WebSocket...");
      console.log(`[KiteWS]   User: ${credential.user_id || 'unknown'}`);
      console.log(`[KiteWS]   Token fingerprint: ${newFingerprint}`);
      console.log(`[KiteWS]   Token expires: ${credential.token_expiry ? new Date(credential.token_expiry).toLocaleString() : 'unknown'}`);
      this.ticker.connect();

    } catch (error) {
      console.error("[KiteWS] Error connecting:", error.message);
    }
  }

  setupEventHandlers() {
    // On successful connection
    this.ticker.on('connect', () => {
      console.log("[KiteWS] ✅ Connected successfully");
      this.isConnected = true;
      this.reconnectAttempts = 0; // Reset on successful connection

      // Process queued subscriptions (accumulated while disconnected)
      if (this.subscriptionQueue.length > 0) {
        console.log(`[KiteWS] Processing ${this.subscriptionQueue.length} queued subscriptions`);
        const queue = [...this.subscriptionQueue];
        this.subscriptionQueue = [];

        queue.forEach(({ tokens, mode }) => {
          this.subscribeTokens(tokens, mode);
        });
      }

      // Replay subscriptions from before disconnect. The fresh ticker has
      // nothing subscribed, so we must clear local state and re-subscribe.
      if (this._reconnectReplay) {
        const { tokens, modes } = this._reconnectReplay;
        this._reconnectReplay = null;

        // Clear stale local state — the new connection starts empty
        this.subscribedTokens.clear();
        this.tokenModes.clear();

        // Group saved tokens by mode for efficient batch subscribe
        const byMode = {};
        for (const token of tokens) {
          const mode = modes.get(token) || 'full';
          (byMode[mode] ??= []).push(token);
        }
        let replayedCount = 0;
        for (const [mode, tokenList] of Object.entries(byMode)) {
          this.subscribeTokens(tokenList, mode);
          replayedCount += tokenList.length;
        }
        console.log(`[KiteWS] 🔄 Replayed ${replayedCount} tokens after reconnect (modes: ${Object.keys(byMode).join(', ')})`);
      }
    });

    // On tick data received
    this.ticker.on('ticks', (ticks) => {
      ticks.forEach(tick => this.processTick(tick));
    });

    // On disconnection — save subscription state for replay on reconnect
    this.ticker.on('disconnect', (error) => {
      console.warn("[KiteWS] ❌ Disconnected:", error?.message || error);
      this.isConnected = false;

      // Snapshot current subscriptions so they can be replayed after reconnect.
      // The fresh ticker connection has no subscriptions, but subscribedTokens
      // still holds the old set — without replay, subscribeTokens() would skip
      // them because of the "already subscribed" filter.
      if (this.subscribedTokens.size > 0) {
        this._reconnectReplay = {
          tokens: new Set(this.subscribedTokens),
          modes: new Map(this.tokenModes),
        };
        console.log(`[KiteWS] Saved ${this.subscribedTokens.size} tokens for reconnect replay`);
      }
    });

    // On error - check for auth errors
    this.ticker.on('error', (error) => {
      const errorMsg = error?.message || String(error);
      console.error("[KiteWS] Error:", errorMsg);

      // Check for authentication errors (403, token expired, etc.)
      if (errorMsg.includes('403') || errorMsg.includes('Forbidden') ||
        errorMsg.includes('token') || errorMsg.includes('unauthorized')) {
        console.error("[KiteWS] ⚠️ Authentication error detected - will attempt auto-login");
        this.handleAuthError();
      }
    });

    // On reconnection attempt
    this.ticker.on('reconnect', (reconnect_count, reconnect_interval) => {
      console.log(`[KiteWS] 🔄 Reconnecting: attempt ${reconnect_count}, interval ${reconnect_interval}s`);
    });

    // On max reconnection attempts reached - DON'T CRASH, HANDLE GRACEFULLY
    this.ticker.on('noreconnect', () => {
      console.warn("[KiteWS] ⚠️ Max reconnection attempts reached by KiteTicker.");
      console.log("[KiteWS] 🔄 Will attempt to refresh token and reconnect in 60 seconds...");
      this.isConnected = false;

      // Schedule a recovery attempt - don't crash the server
      this.scheduleRecovery();
    });

    // On order update (postback)
    this.ticker.on('order_update', (order) => {
      console.log("[KiteWS] 📦 Order update received:", order?.order_id || order);
      this.ns.emit("order_update", order);
    });

    // On close
    this.ticker.on('close', (reason) => {
      console.warn("[KiteWS] Connection closed:", reason?.code || reason);
      this.isConnected = false;
    });

    // On raw message (optional - for debugging)
    this.ticker.on('message', (data) => {
      // Uncomment for debugging: console.log("[KiteWS] Raw message:", data);
    });
  }

  /**
   * Handle authentication errors by triggering auto-login
   */
  async handleAuthError() {
    try {
      console.log("[KiteWS] 🔐 Attempting auto-login due to auth error...");

      // Dynamic import to avoid circular dependency
      const { runAutoLogin } = await import('./AutoLoginService.js');
      const result = await runAutoLogin();

      if (result.success) {
        console.log("[KiteWS] ✅ Auto-login successful, reconnecting...");
        await this.reconnectWithNewCredentials();
      } else {
        console.error("[KiteWS] ❌ Auto-login failed:", result.error);
        // Schedule another attempt later
        this.scheduleRecovery(300000); // 5 minutes
      }
    } catch (error) {
      console.error("[KiteWS] Error during auth recovery:", error.message);
      this.scheduleRecovery(300000); // 5 minutes
    }
  }

  /**
   * Schedule a recovery attempt without crashing the server
   */
  scheduleRecovery(delayMs = 60000) {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }

    console.log(`[KiteWS] ⏰ Scheduling recovery attempt in ${delayMs / 1000} seconds...`);

    this.recoveryTimeout = setTimeout(async () => {
      console.log("[KiteWS] 🔄 Running scheduled recovery...");
      await this.reconnectWithNewCredentials();
    }, delayMs);
  }

  /**
   * Reconnect with fresh credentials from database.
   * Called after token rotation to reload the new access_token.
   * Uses a lock to prevent concurrent reconnects and fingerprint check to avoid no-op reconnects.
   */
  async reconnectWithNewCredentials() {
    // Prevent concurrent reconnect calls
    if (this._reconnectLock) {
      console.log("[KiteWS] 🔒 Reconnect already in progress, skipping duplicate call");
      return;
    }

    try {
      this._reconnectLock = true;

      // Check if token actually changed by comparing fingerprints
      const credential = await KiteCredential.findOne({ is_active: true }).lean();
      if (!credential || !credential.access_token) {
        console.warn("[KiteWS] No active credentials found, cannot reconnect");
        return;
      }

      const newFingerprint = tokenFingerprint(credential.access_token);
      const oldFingerprint = this._currentTokenFingerprint;

      if (newFingerprint === oldFingerprint && this.isConnected) {
        console.log(`[KiteWS] Token unchanged (fingerprint: ${newFingerprint}), skipping reconnect`);
        return;
      }

      console.log(`[KiteWS] 🔄 Token rotation detected: ${oldFingerprint || 'none'} -> ${newFingerprint}`);

      // Close existing connection if any
      if (this.ticker) {
        try {
          this.ticker.disconnect();
        } catch (e) {
          // Ignore close errors
        }
        this.ticker = null;
      }

      this.isConnected = false;

      // Wait a bit before reconnecting
      await new Promise(r => setTimeout(r, 2000));

      // Connect with fresh credentials
      console.log("[KiteWS] 🔄 Connecting with fresh credentials...");
      await this.connect();

    } catch (error) {
      console.error("[KiteWS] Error during reconnection:", error.message);
      // Don't crash - schedule another attempt
      this.scheduleRecovery(120000); // 2 minutes
    } finally {
      this._reconnectLock = false;
    }
  }

  /**
   * Subscribe to instruments
   * @param {Array} list - Array of objects with instrument_token property
   * @param {string} mode - 'ltp', 'quote', or 'full' (default: 'full')
   */
  subscribe(list, mode = 'full') {
    if (!Array.isArray(list) || !list.length) return;
    const normalizedMode = normalizeMode(mode);

    // Extract instrument tokens (convert to integers)
    const tokens = [...new Set(list
      .map(inst => {
        // Support both instrument_token and securityId for backward compatibility
        const token = inst.instrument_token || inst.securityId;
        return parseInt(token);
      })
      .filter(token => !isNaN(token) && token > 0))];

    if (!tokens.length) {
      console.warn("[KiteWS] No valid instrument tokens provided");
      return;
    }

    // If not connected, queue the subscription
    if (!this.isConnected || !this.ticker) {
      console.log(`[KiteWS] Not connected. Queueing ${tokens.length} tokens`);
      this.subscriptionQueue.push({ tokens, mode: normalizedMode });

      // Attempt to connect if ticker not initialized
      if (!this.ticker) {
        this.connect();
      }
      return;
    }

    this.subscribeTokens(tokens, normalizedMode);
  }

  subscribeTokens(tokens, mode = 'full') {
    const uniqueTokens = [...new Set(tokens)];
    const normalizedMode = normalizeMode(mode);
    // 1. Filter new tokens that need subscription
    const newTokens = uniqueTokens.filter(t => !this.subscribedTokens.has(t));
    const modeBuckets = {
      ltp: [],
      quote: [],
      full: []
    };

    uniqueTokens.forEach((token) => {
      const currentMode = this.tokenModes.get(token);
      // Subscribe requests are treated as upgrade-only so one low-mode subscriber
      // cannot downgrade another active full/quote consumer.
      const targetMode = currentMode ? higherMode(currentMode, normalizedMode) : normalizedMode;
      if (!isModeEqual(currentMode, targetMode)) {
        modeBuckets[targetMode].push(token);
      }
    });

    try {
      // Subscribe to NEW tokens only
      if (newTokens.length > 0) {
        console.log(`[KiteWS] Subscribing to ${newTokens.length} new tokens`);
        this.ticker.subscribe(newTokens);
        newTokens.forEach(token => this.subscribedTokens.add(token));
      }

      // 2. Set mode only for tokens whose effective mode changed.
      const modeMap = {
        'ltp': this.ticker.modeLTP,
        'quote': this.ticker.modeQuote,
        'full': this.ticker.modeFull
      };
      Object.keys(modeBuckets).forEach((modeKey) => {
        const targetTokens = modeBuckets[modeKey];
        if (!targetTokens.length) return;
        const tickerMode = modeMap[modeKey] || this.ticker.modeFull;
        this.ticker.setMode(tickerMode, targetTokens);
        targetTokens.forEach((token) => this.tokenModes.set(token, modeKey));
        console.log(`[KiteWS] Set mode '${modeKey}' for ${targetTokens.length} tokens`);
      });
    } catch (error) {
      console.error("[KiteWS] Subscription error:", error?.message || error);
    }
  }

  /**
   * Unsubscribe from instruments
   * @param {Array} list - Array of objects with instrument_token property
   */
  unsubscribe(list) {
    if (!Array.isArray(list) || !list.length) return;
    if (!this.isConnected || !this.ticker) return;

    const tokens = [...new Set(list
      .map(inst => {
        const token = inst.instrument_token || inst.securityId;
        return parseInt(token);
      })
      .filter(token => !isNaN(token) && this.subscribedTokens.has(token)))];

    if (!tokens.length) return;

    console.log(`[KiteWS] Unsubscribing from ${tokens.length} tokens`);

    try {
      this.ticker.unsubscribe(tokens);
      tokens.forEach(token => {
        this.subscribedTokens.delete(token);
        this.tokenModes.delete(token);
      });

      console.log(`[KiteWS] ✅ Unsubscribed. Remaining: ${this.subscribedTokens.size}`);
    } catch (error) {
      console.error("[KiteWS] Unsubscribe error:", error?.message || error);
    }
  }

  /**
   * Change mode for subscribed instruments
   * @param {Array} list - Array of objects with instrument_token property
   * @param {string} mode - 'ltp', 'quote', or 'full'
   */
  setMode(list, mode = 'full') {
    if (!Array.isArray(list) || !list.length) return;
    if (!this.isConnected || !this.ticker) return;
    const normalizedMode = normalizeMode(mode);

    const tokens = [...new Set(list
      .map(inst => {
        const token = inst.instrument_token || inst.securityId;
        return parseInt(token);
      })
      .filter(token => !isNaN(token)))];

    const modeChangeTokens = tokens.filter((token) => {
      const currentMode = this.tokenModes.get(token);
      return !isModeEqual(currentMode, normalizedMode);
    });

    if (!modeChangeTokens.length) return;

    console.log(`[KiteWS] Setting mode '${normalizedMode}' for ${modeChangeTokens.length} tokens`);

    try {
      const modeMap = {
        'ltp': this.ticker.modeLTP,
        'quote': this.ticker.modeQuote,
        'full': this.ticker.modeFull
      };
      const tickerMode = modeMap[normalizedMode] || this.ticker.modeFull;
      this.ticker.setMode(tickerMode, modeChangeTokens);
      modeChangeTokens.forEach((token) => this.tokenModes.set(token, normalizedMode));
    } catch (error) {
      console.error("[KiteWS] Set mode error:", error?.message || error);
    }
  }

  /**
   * Process incoming tick data - Kite format (no Dhan backward compatibility)
   */
  processTick(tick) {
    const token = String(tick.instrument_token);
    const serverReceiveTs = this.tickTraceEnabled ? Date.now() : null;
    const exchangeTsMs = tick?.exchange_timestamp instanceof Date
      ? tick.exchange_timestamp.getTime()
      : (tick?.exchange_timestamp ? Number(new Date(tick.exchange_timestamp).getTime()) : null);
    const lastTradeTsMs = tick?.last_trade_time instanceof Date
      ? tick.last_trade_time.getTime()
      : (tick?.last_trade_time ? Number(new Date(tick.last_trade_time).getTime()) : null);

    // Calculate net change and percent change
    const ltp = tick.last_price || 0;
    const close = tick.ohlc?.close || 0;
    const netChange = close > 0 ? ltp - close : 0;
    const percentChange = close > 0 ? ((ltp - close) / close) * 100 : 0;

    // Build normalized payload with Kite fields
    const payload = {
      instrument_token: tick.instrument_token,
      mode: tick.mode,
      ltp: ltp,
      tradable: tick.tradable,
      change: tick.change || 0,
      netChange: netChange,
      percentChange: percentChange
    };

    // Add mode-specific fields
    if (tick.mode === 'quote' || tick.mode === 'full') {
      Object.assign(payload, {
        lastTradeQty: tick.last_traded_quantity,
        avgPrice: tick.average_traded_price,
        volume: tick.volume_traded,
        totalBuyQty: tick.total_buy_quantity,
        totalSellQty: tick.total_sell_quantity,
        open: tick.ohlc?.open,
        high: tick.ohlc?.high,
        low: tick.ohlc?.low,
        close: tick.ohlc?.close
      });
    }

    if (tick.mode === 'full') {
      Object.assign(payload, {
        lastTradeTime: tick.last_trade_time,
        exchangeTimestamp: tick.exchange_timestamp,
        oi: tick.oi,
        oiDayHigh: tick.oi_day_high,
        oiDayLow: tick.oi_day_low,
        depth: tick.depth
      });

      // Extract best bid/ask from depth
      if (tick.depth) {
        payload.bestBidPrice = tick.depth.buy?.[0]?.price || null;
        payload.bestBidQuantity = tick.depth.buy?.[0]?.quantity || null;
        payload.bestAskPrice = tick.depth.sell?.[0]?.price || null;
        payload.bestAskQuantity = tick.depth.sell?.[0]?.quantity || null;
      }
    }

    if (this.tickTraceEnabled) {
      const currentSeq = this.tickTraceSeqByToken.get(token) || 0;
      const nextSeq = currentSeq + 1;
      this.tickTraceSeqByToken.set(token, nextSeq);
      const serverEmitTs = Date.now();
      const roomSizeAtEmit = this.ns.adapter.rooms.get(roomFor(token))?.size || 0;
      payload.__trace = {
        seq: nextSeq,
        serverReceiveTs,
        serverEmitTs,
        exchangeTsMs: Number.isFinite(exchangeTsMs) ? exchangeTsMs : null,
        lastTradeTsMs: Number.isFinite(lastTradeTsMs) ? lastTradeTsMs : null,
        sourceToServerMs: Number.isFinite(exchangeTsMs) ? serverReceiveTs - exchangeTsMs : null,
        roomSizeAtEmit,
      };
      if (this.tickTraceLogged < this.tickTraceLogLimit) {
        const { sourceToServerMs } = payload.__trace;
        console.log(
          `[KiteWS TRACE] token=${token} seq=${nextSeq} srvRecv=${serverReceiveTs} srvEmit=${serverEmitTs} srvDeltaMs=${serverEmitTs - serverReceiveTs} sourceToServerMs=${sourceToServerMs ?? 'na'} roomSize=${roomSizeAtEmit} mode=${tick.mode} ltp=${ltp}`
        );
        this.tickTraceLogged += 1;
      }
    }

    // Update cache
    this.last.set(token, { ...this.last.get(token), ...payload });

    // Emit to Socket.IO room (room key = instrument_token)
    const marketChannel = this.ns.to(roomFor(token)).compress(false);
    marketChannel.emit("market_update", payload);

    // Trigger OrderManager callback for stop-loss/target monitoring
    if (ltp > 0) {
      onMarketTick({ token, ltp });
    }
  }

  /**
   * Get snapshot of cached data
   * @param {Array} ids - Array of instrument tokens
   * @returns {Object} Map of token -> data
   */
  getSnapshot(ids = []) {
    const out = {};
    for (const id of ids) {
      out[String(id)] = this.last.get(String(id)) || this._empty();
    }
    return out;
  }

  _empty() {
    return {
      ltp: null,
      open: null,
      high: null,
      low: null,
      close: null,
      volume: null,
      oi: null,
      bestBidPrice: null,
      bestBidQuantity: null,
      bestAskPrice: null,
      bestAskQuantity: null,
      lastTradeQty: null,
      lastTradeTime: null,
      avgPrice: null,
      change: null
    };
  }

  /**
   * Close WebSocket connection
   */
  close() {
    if (this.ticker) {
      console.log("[KiteWS] Closing connection...");
      try {
        this.ticker.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.ticker = null;
      this.isConnected = false;
      this.subscribedTokens.clear();
      this.tokenModes.clear();
      this.tickTraceSeqByToken.clear();
      this.tickTraceLogged = 0;
    }
  }

  /**
   * Check if connected
   */
  connected() {
    return this.isConnected;
  }
}

// Export singleton-style initializer for consistency with existing codebase
let kiteWSInstance = null;

export function initializeKiteWebSocket() {
  if (!kiteWSInstance) {
    kiteWSInstance = new KiteWebSocket();
  }
  return kiteWSInstance;
}

export function getKiteWebSocket() {
  return kiteWSInstance;
}
