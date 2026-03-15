// sockets/io.js
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getFeedInstance } from "../services/feedState.js";
import { isBlacklisted } from "../Controllers/common/AuthController.js";
import UserWatchlistModel from "../Model/UserWatchlistModel.js";

// --- Runtime flags for global token retention ---
const ENABLE_WATCHLIST_WARM = process.env.ENABLE_WATCHLIST_WARM !== 'false';
const WATCHLIST_WARM_DEBUG = process.env.WATCHLIST_WARM_DEBUG === 'true';

let ioInstance = null;
let feedSubscriber = null;
let feedUnsubscriber = null;
let feedModeSetter = null;
let marketNamespace = null;

// Split mode: Redis client used by API instances to forward subscribe commands
// to wolf-worker over the 'kite:subscribe' pub/sub channel.
// This is subscribe-command-only — NOT used for tick data. Zero tick latency impact.
let subCommandPublisher = null;

const normalizeTokenList = (list = []) => {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const raw = item?.instrument_token ?? item?.instrumentToken ?? item?.token ?? item;
    const token = Number.parseInt(raw, 10);
    if (!Number.isFinite(token) || token <= 0) continue;
    const key = String(token);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
};

const toInstrumentList = (tokens = []) => tokens.map((token) => ({ instrument_token: token }));
const roomForToken = (token) => `sec:${token}`;

// Token refcounts retained by backend systems (for example: SL/target trigger engine)
// token -> retainCount
const systemTokenRefs = new Map();

const publishSubscribe = (tokens = [], subscriptionType = 'full') => {
  if (!tokens.length) return;
  if (feedSubscriber) {
    // Single-instance or worker: call lmf.subscribe() directly.
    feedSubscriber(toInstrumentList(tokens), subscriptionType);
    return;
  }
  if (subCommandPublisher) {
    // Split mode API: forward to worker.
    subCommandPublisher.publish(
      'kite:subscribe',
      JSON.stringify({ list: toInstrumentList(tokens), subscriptionType })
    ).catch(err => console.error('[SubBridge] Publish failed:', err.message));
  }
};

const publishUnsubscribe = (tokens = []) => {
  if (!tokens.length) return;
  if (feedUnsubscriber) {
    // Single-instance or worker: call lmf.unsubscribe() directly.
    feedUnsubscriber(toInstrumentList(tokens));
    return;
  }
  if (subCommandPublisher) {
    // Split mode API: forward to worker.
    subCommandPublisher.publish(
      'kite:unsubscribe',
      JSON.stringify({ list: toInstrumentList(tokens) })
    ).catch(err => console.error('[SubBridge] Unsub publish failed:', err.message));
  }
};

const publishSetMode = (tokens = [], mode = 'quote') => {
  if (!tokens.length) return;
  if (feedModeSetter) {
    // Single-instance or worker: call lmf.setMode() directly.
    feedModeSetter(toInstrumentList(tokens), mode);
    return;
  }
  if (subCommandPublisher) {
    // Split mode API: forward mode-change command to worker.
    subCommandPublisher.publish(
      'kite:set_mode',
      JSON.stringify({ list: toInstrumentList(tokens), mode })
    ).catch(err => console.error('[SubBridge] set_mode publish failed:', err.message));
  }
};

const isRoomEmpty = (token) => {
  if (!marketNamespace) return true;
  const roomSockets = marketNamespace.adapter.rooms.get(roomForToken(token));
  return !roomSockets || roomSockets.size === 0;
};

const isSystemRetained = (token) => (systemTokenRefs.get(String(token)) || 0) > 0;

const collectUnsubscribableTokens = (tokens = []) => {
  const out = [];
  for (const token of tokens) {
    if (isSystemRetained(token)) continue;
    if (!isRoomEmpty(token)) continue;
    if (ENABLE_WATCHLIST_WARM && isGloballyRetained(token)) continue;
    out.push(token);
  }
  return out;
};

const scheduleConditionalUnsubscribe = (tokens = []) => {
  if (!tokens.length) return;
  setImmediate(() => {
    const toUnsubscribe = collectUnsubscribableTokens(tokens);
    if (!toUnsubscribe.length) return;
    console.log(`[io.js] Unsubscribing ${toUnsubscribe.length} token(s) with no room/system retention`);
    publishUnsubscribe(toUnsubscribe);
  });
};

// Track token refcounts per socket:
// socketId -> Map<token, count>
const socketSubscriptions = new Map();
// Track full-mode refs per socket so we can downgrade back to quote when full refs drop to zero.
// socketId -> Map<token, fullRefCount>
const socketFullSubscriptions = new Map();
// Global full-mode refs across sockets: token -> fullRefCount
const globalFullTokenRefs = new Map();

// --- Global always-on token retention ---
// Tokens subscribed to Kite permanently, regardless of connected users.
const globalRetainedTokens = new Set();
const INDEX_TOKENS = ['256265', '260105', '265']; // NIFTY 50, NIFTY BANK, SENSEX
const INDEX_TOKEN_SET = new Set(INDEX_TOKENS);

// Landing-page warm tokens — backend-owned fixed set, always kept alive like index tokens
const LANDING_TOKENS = ['259849', '738561', '408065', '2953217', '341249', '969473']; // NIFTY IT, RELIANCE, INFY, TCS, HDFC BANK, WIPRO
const LANDING_TOKEN_SET = new Set(LANDING_TOKENS);

const isGloballyRetained = (token) => globalRetainedTokens.has(String(token));
const isIndexToken = (token) => INDEX_TOKEN_SET.has(String(token));

export function setFeedSubscriber(fn) { feedSubscriber = fn; }
export function setFeedUnsubscriber(fn) { feedUnsubscriber = fn; }
export function setFeedModeSetter(fn) { feedModeSetter = fn; }
export function setSubCommandPublisher(client) { subCommandPublisher = client; }

export function retainSystemTokens(list, subscriptionType = 'quote') {
  const tokens = normalizeTokenList(list);
  if (tokens.length === 0) return;

  const toSubscribe = [];
  for (const token of tokens) {
    const prev = systemTokenRefs.get(token) || 0;
    const next = prev + 1;
    systemTokenRefs.set(token, next);
    if (prev === 0) toSubscribe.push(token);
  }

  if (toSubscribe.length > 0) {
    console.log(`[io.js] Retaining ${toSubscribe.length} system token(s)`);
    publishSubscribe(toSubscribe, subscriptionType);
  }
}

export function releaseSystemTokens(list) {
  const tokens = normalizeTokenList(list);
  if (tokens.length === 0) return;

  const maybeUnsubscribe = [];
  for (const token of tokens) {
    const prev = systemTokenRefs.get(token) || 0;
    if (prev <= 1) {
      if (prev > 0) {
        systemTokenRefs.delete(token);
        maybeUnsubscribe.push(token);
      }
    } else {
      systemTokenRefs.set(token, prev - 1);
    }
  }

  if (maybeUnsubscribe.length > 0) {
    console.log(`[io.js] Released ${maybeUnsubscribe.length} system token(s)`);
    scheduleConditionalUnsubscribe(maybeUnsubscribe);
  }
}

export function getSystemRetainedTokenCount() {
  return systemTokenRefs.size;
}

// --- Global token retention ---

/**
 * Sync the global always-on token set from all customer watchlists + index tokens.
 * Called at boot and after any watchlist mutation.
 * Diffs against current set and subscribes/unsubscribes only the changes.
 */
export async function syncGlobalWatchlistTokens() {
  if (!ENABLE_WATCHLIST_WARM) return;

  const indexTokenSet = new Set(INDEX_TOKENS);

  const watchlists = await UserWatchlistModel.find({})
    .select('instruments.instrumentToken')
    .lean();

  // Separate stock tokens (full mode) from index tokens (quote mode)
  const stockTokens = new Set();
  for (const wl of watchlists) {
    for (const inst of (wl.instruments || [])) {
      const t = inst?.instrumentToken;
      if (t && !indexTokenSet.has(String(t))) stockTokens.add(String(t));
    }
  }

  const newSet = new Set([...indexTokenSet, ...stockTokens, ...LANDING_TOKEN_SET]);

  // Diff against current set
  const toAdd = [];
  for (const t of newSet) {
    if (!globalRetainedTokens.has(t)) toAdd.push(t);
  }
  const toRemove = [];
  for (const t of globalRetainedTokens) {
    if (!newSet.has(t)) toRemove.push(t);
  }

  // Subscribe stocks in full mode, indexes in quote mode
  const addStocks = toAdd.filter(t => !indexTokenSet.has(t));
  const addIndexes = toAdd.filter(t => indexTokenSet.has(t));

  if (addStocks.length > 0) {
    publishSubscribe(addStocks, 'full');
  }
  if (addIndexes.length > 0) {
    publishSubscribe(addIndexes, 'quote');
  }
  if (toRemove.length > 0) {
    publishUnsubscribe(toRemove);
  }

  // Ensure existing stock tokens already retained are set to full mode
  // (handles upgrade from previous quote-mode warm subscription after restart)
  const existingStocksToUpgrade = [...stockTokens].filter(t => globalRetainedTokens.has(t));
  if (existingStocksToUpgrade.length > 0) {
    publishSetMode(existingStocksToUpgrade, 'full');
  }

  globalRetainedTokens.clear();
  for (const t of newSet) globalRetainedTokens.add(t);

  if (newSet.size > 2500) {
    console.warn(`[GlobalRetain] WARNING: ${newSet.size} tokens approaching Kite 3000 limit`);
  }

  console.log(`[GlobalRetain] Synced: ${globalRetainedTokens.size} token(s) — ${stockTokens.size} watchlist(full) + ${indexTokenSet.size} indexes(quote) + ${LANDING_TOKENS.length} landing(full) (${toAdd.length > 0 ? '+' + toAdd.length : ''}${toRemove.length > 0 ? ' -' + toRemove.length : ''})`);
}

export function getIO() {
  if (!ioInstance) {
    throw new Error("Socket.IO has not been initialized!");
  }
  return ioInstance;
}

export async function createIO(server) {
  // --- CORS SETUP ---
  const isProduction = process.env.NODE_ENV === "production";
  const devOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
  ];
  const envOrigins = (config.origin || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const allowedOriginSet = new Set([
    ...(isProduction ? [] : devOrigins),
    ...envOrigins,
  ]);

  const io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOriginSet.has(origin)) return callback(null, true);
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"]
    },
    transports: ["websocket", "polling"],
  });
  // -------------------

  // --- Redis adapter for multi-instance room sync ---
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log("[Socket.IO] ✅ Redis adapter attached");
    } catch (err) {
      console.warn("[Socket.IO] Redis adapter failed, using in-memory adapter:", err.message);
    }
  }

  ioInstance = io;

  const market = io.of("/market");
  marketNamespace = market;

  // --- Socket auth middleware ---
  // Verifies JWT from handshake, stores customer identity on socket.data.
  // Non-customer and unauthenticated sockets are allowed through (skip warm retention).
  market.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token || null;
    if (!token) {
      // Allow unauthenticated connections (they just won't get warm retention)
      socket.data.role = null;
      return next();
    }

    try {
      if (typeof isBlacklisted === 'function' && await isBlacklisted(token)) {
        return next(new Error('Session expired'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) {
        socket.data.role = null;
        return next();
      }

      socket.data.role = decoded.role || null;
      if (decoded.role === 'customer') {
        socket.data.customerId = decoded.customer_id || null;
        socket.data.brokerId = decoded.stringBrokerId || null;
        if (socket.data.customerId && socket.data.brokerId) {
          socket.data.customerKey = `${socket.data.customerId}:${socket.data.brokerId}`;
        }
      }
      next();
    } catch (err) {
      // JWT verification failed — still allow connection, just no warm retention
      socket.data.role = null;
      next();
    }
  });

  market.on("connection", (socket) => {
    console.log("📡 Market client connected:", socket.id);

    // Initialize subscription tracking for this socket
    socketSubscriptions.set(socket.id, new Map());
    socketFullSubscriptions.set(socket.id, new Map());

    // --- Support Chat Room Setup ---
    // Auto-join customers to their support room
    if (socket.data.role === 'customer' && socket.data.customerId) {
      const customerRoom = `support:customer:${socket.data.customerId}`;
      socket.join(customerRoom);
      console.log(`[Support] Customer ${socket.data.customerId} joined room: ${customerRoom}`);
    }
    // Auto-join admins to the admin support room
    if (socket.data.role === 'admin') {
      socket.join('support:admin');
      console.log(`[Support] Admin ${socket.id} joined room: support:admin`);
    }

    // Support typing event handler
    socket.on('support:typing', (data) => {
      const { session_id, is_typing } = data;
      if (!session_id) return;
      
      if (socket.data.role === 'customer' && socket.data.customerId) {
        // Customer typing -> notify admin
        market.to('support:admin').emit('support:typing', {
          session_id,
          is_typing,
          role: 'customer',
        });
      } else if (socket.data.role === 'admin') {
        // Admin typing -> need to find customer room (handled in controller via req)
        // This is a fallback if using socket directly
        market.emit('support:typing', {
          session_id,
          is_typing,
          role: 'admin',
        });
      }
    });

    socket.on("subscribe", (list, subscriptionType = 'full') => {
      const tokens = normalizeTokenList(list);
      if (tokens.length === 0) return;
      const normalizedType = String(subscriptionType || 'full').toLowerCase();

      const tokenCounts = socketSubscriptions.get(socket.id);
      const fullTokenCounts = socketFullSubscriptions.get(socket.id);
      if (!tokenCounts) return;

      // Get feed instance to send cached data to new socket
      const feed = getFeedInstance();

      for (const token of tokens) {
        // Use instrument_token for room names (Kite format)
        const room = roomForToken(token);

        // Track this socket's subscription with refcount
        const prevCount = tokenCounts.get(token) || 0;
        const nextCount = prevCount + 1;
        tokenCounts.set(token, nextCount);

        if (normalizedType === 'full' && fullTokenCounts) {
          const prevFullCount = fullTokenCounts.get(token) || 0;
          fullTokenCounts.set(token, prevFullCount + 1);
          const globalPrevFull = globalFullTokenRefs.get(token) || 0;
          globalFullTokenRefs.set(token, globalPrevFull + 1);
        }

        // Join the room only on first subscription for this socket+token
        if (prevCount === 0) {
          socket.join(room);
        }

        // INSTANT DATA: Send cached data to this socket immediately
        // This ensures new/refreshed sockets get data without waiting for next tick
        if (feed?.last?.has(token)) {
          const cachedData = feed.last.get(token);
          if (cachedData && cachedData.ltp != null) {
            socket.emit("market_update", cachedData);
          }
        }
      }

      // Forward subscribe command AFTER room join to avoid missing first ticks
      // on split setup (worker may start emitting immediately).
      publishSubscribe(tokens, normalizedType);
    });

    socket.on("unsubscribe", (list, subscriptionType = 'full') => {
      const tokens = normalizeTokenList(list);
      if (tokens.length === 0) return;
      const normalizedType = String(subscriptionType || 'full').toLowerCase();

      const tokenCounts = socketSubscriptions.get(socket.id);
      const fullTokenCounts = socketFullSubscriptions.get(socket.id);
      if (!tokenCounts) return;
      const maybeUnsubscribe = [];
      const maybeDowngradeToQuote = new Set();

      for (const token of tokens) {
        // Use instrument_token for room names (Kite format)
        const room = roomForToken(token);

        const prevCount = tokenCounts.get(token) || 0;
        if (prevCount <= 0) continue;

        const nextCount = prevCount - 1;
        if (nextCount > 0) {
          tokenCounts.set(token, nextCount);
        } else {
          tokenCounts.delete(token);

          // Leave the room only when this socket no longer needs token
          socket.leave(room);
          maybeUnsubscribe.push(token);
        }

        if (normalizedType === 'full' && fullTokenCounts) {
          const prevFullCount = fullTokenCounts.get(token) || 0;
          if (prevFullCount > 0) {
            const nextFullCount = prevFullCount - 1;
            if (nextFullCount > 0) {
              fullTokenCounts.set(token, nextFullCount);
            } else {
              fullTokenCounts.delete(token);
            }

            const prevGlobalFull = globalFullTokenRefs.get(token) || 0;
            if (prevGlobalFull > 0) {
              const nextGlobalFull = prevGlobalFull - 1;
              if (nextGlobalFull > 0) {
                globalFullTokenRefs.set(token, nextGlobalFull);
              } else {
                globalFullTokenRefs.delete(token);
                // No client needs full mode now; downgrade only if NOT a globally retained stock.
                // Globally retained stocks stay in full mode to avoid upgrade churn on next connect.
                if (!isGloballyRetained(token) || isIndexToken(token)) {
                  if (!isRoomEmpty(token) || isSystemRetained(token)) {
                    maybeDowngradeToQuote.add(token);
                  }
                }
              }
            }
          }
        }
      }

      if (maybeDowngradeToQuote.size > 0) {
        const tokensToDowngrade = Array.from(maybeDowngradeToQuote);
        console.log(`[io.js] Downgrading ${tokensToDowngrade.length} token(s) to quote mode`);
        publishSetMode(tokensToDowngrade, 'quote');
      }

      scheduleConditionalUnsubscribe(maybeUnsubscribe);
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ socket disconnected:", socket.id, reason);

      // Get tokens this socket was subscribed to
      const tokenCounts = socketSubscriptions.get(socket.id) || new Map();
      const fullTokenCounts = socketFullSubscriptions.get(socket.id) || new Map();
      const tokens = Array.from(tokenCounts.keys());
      socketSubscriptions.delete(socket.id);
      socketFullSubscriptions.delete(socket.id);

      const maybeDowngradeToQuote = new Set();
      for (const [token, releasedFullCountRaw] of fullTokenCounts.entries()) {
        const releasedFullCount = Number(releasedFullCountRaw) || 0;
        if (releasedFullCount <= 0) continue;
        const prevGlobalFull = globalFullTokenRefs.get(token) || 0;
        if (prevGlobalFull <= 0) continue;
        const nextGlobalFull = prevGlobalFull - releasedFullCount;
        if (nextGlobalFull > 0) {
          globalFullTokenRefs.set(token, nextGlobalFull);
        } else {
          globalFullTokenRefs.delete(token);
          // Skip downgrade for globally retained stock tokens — keep them in full mode
          if (!isGloballyRetained(token) || isIndexToken(token)) {
            if (!isRoomEmpty(token) || isSystemRetained(token)) {
              maybeDowngradeToQuote.add(token);
            }
          }
        }
      }

      if (maybeDowngradeToQuote.size > 0) {
        const tokensToDowngrade = Array.from(maybeDowngradeToQuote);
        console.log(`[io.js] Downgrading ${tokensToDowngrade.length} token(s) to quote mode after disconnect`);
        publishSetMode(tokensToDowngrade, 'quote');
      }

      if (tokens.length === 0) return;

      // Global retention prevents Kite unsubscription for watchlist tokens
      // even when all sockets disconnect — collectUnsubscribableTokens checks isGloballyRetained.
      scheduleConditionalUnsubscribe(tokens);
    });
  });

  return { io, market };
}
