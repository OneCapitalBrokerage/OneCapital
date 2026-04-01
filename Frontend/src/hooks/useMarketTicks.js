import { io } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';

const STALE_TICK_MS = 10 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
const DEFAULT_TICK_TRACE_LIMIT = 5;

const readTraceEnabled = () => {
  // Trace is enabled by default during latency diagnostics.
  if (import.meta.env.VITE_MARKET_TICK_TRACE === 'false') return false;
  if (import.meta.env.VITE_MARKET_TICK_TRACE === 'true') return true;
  if (typeof window === 'undefined') return true;
  try {
    const override = window.localStorage.getItem('MARKET_TICK_TRACE');
    if (override === 'false') return false;
    if (override === 'true') return true;
  } catch {
    // Ignore localStorage read errors.
  }
  return true;
};

const readTraceLimit = () => {
  const envRaw = Number.parseInt(import.meta.env.VITE_MARKET_TICK_TRACE_LIMIT || '', 10);
  if (Number.isFinite(envRaw) && envRaw > 0) return envRaw;
  if (typeof window !== 'undefined') {
    try {
      const localRaw = Number.parseInt(window.localStorage.getItem('MARKET_TICK_TRACE_LIMIT') || '', 10);
      if (Number.isFinite(localRaw) && localRaw > 0) return localRaw;
    } catch {
      // Ignore localStorage read errors.
    }
  }
  return DEFAULT_TICK_TRACE_LIMIT;
};

const normalizeList = (list = []) => {
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const token =
      item?.instrument_token ??
      item?.instrumentToken ??
      item?.token ??
      item ??
      null;
    if (token == null) return;
    const key = String(token);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ instrument_token: token });
  });
  return out;
};

export const useMarketTicks = (url, opts = {}) => {
  const socketRef = useRef(null);
  const ticksRef = useRef(new Map());
  const tickUpdatedAtRef = useRef(new Map());
  const subscriptionBucketsRef = useRef(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const optsRef = useRef(opts);
  const traceEnabledRef = useRef(readTraceEnabled());
  const traceLimitRef = useRef(readTraceLimit());
  const tracedCountRef = useRef(0);

  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const registerTokens = useCallback((normalized, subscriptionType) => {
    const type = String(subscriptionType || 'full');
    const buckets = subscriptionBucketsRef.current;
    if (!buckets.has(type)) {
      buckets.set(type, new Map());
    }
    const typeTokenMap = buckets.get(type);
    const newlyActivated = [];
    normalized.forEach((item) => {
      const key = String(item.instrument_token);
      const prevCount = typeTokenMap.get(key) || 0;
      typeTokenMap.set(key, prevCount + 1);
      if (prevCount === 0) {
        newlyActivated.push(item);
      }
    });
    return newlyActivated;
  }, []);

  const unregisterTokens = useCallback((normalized, subscriptionType) => {
    const type = String(subscriptionType || 'full');
    const buckets = subscriptionBucketsRef.current;
    const typeTokenMap = buckets.get(type);
    if (!typeTokenMap) return [];

    const noLongerNeededByType = [];

    normalized.forEach((item) => {
      const key = String(item.instrument_token);
      const prevCount = typeTokenMap.get(key) || 0;
      if (prevCount <= 1) {
        typeTokenMap.delete(key);
        if (prevCount > 0) {
          noLongerNeededByType.push(item);
        }
      } else {
        typeTokenMap.set(key, prevCount - 1);
      }
    });

    if (typeTokenMap.size === 0) {
      buckets.delete(type);
    }
    return noLongerNeededByType;
  }, []);

  const isTokenActive = useCallback((tokenKey) => {
    const key = String(tokenKey);
    const buckets = subscriptionBucketsRef.current;
    for (const typeTokenMap of buckets.values()) {
      if (typeTokenMap.has(key)) return true;
    }
    return false;
  }, []);

  const refreshSubscriptions = useCallback(() => {
    if (!socketRef.current?.connected) return;

    const buckets = subscriptionBucketsRef.current;
    for (const [type, typeTokenMap] of buckets.entries()) {
      if (!typeTokenMap || typeTokenMap.size === 0) continue;
      const payload = Array.from(typeTokenMap.keys()).map((token) => ({
        instrument_token: token,
      }));
      socketRef.current.emit('subscribe', payload, type);
    }
  }, []);

  const subscribe = useCallback((list, subscriptionType = 'full') => {
    const normalized = normalizeList(list);
    if (normalized.length === 0) return;

    const newlyActivated = registerTokens(normalized, subscriptionType);

    // Emit only when this token becomes active for this subscription type.
    if (socketRef.current?.connected && newlyActivated.length > 0) {
      socketRef.current.emit('subscribe', newlyActivated, subscriptionType);
    }
  }, [registerTokens]);

  const unsubscribe = useCallback((list, subscriptionType = 'full') => {
    const normalized = normalizeList(list);
    if (normalized.length === 0) return;

    const noLongerNeededByType = unregisterTokens(normalized, subscriptionType);

    // Inform server whenever this subscription type no longer needs a token.
    // Server can downgrade mode (e.g., full -> quote) even if token remains active in another type.
    if (socketRef.current?.connected && noLongerNeededByType.length > 0) {
      socketRef.current.emit('unsubscribe', noLongerNeededByType, subscriptionType);
    }
    normalized.forEach((item) => {
      const key = String(item.instrument_token);
      if (!isTokenActive(key)) {
        ticksRef.current.delete(key);
        tickUpdatedAtRef.current.delete(key);
      }
    });
  }, [isTokenActive, unregisterTokens]);

  useEffect(() => {
    if (!url) return undefined;

    const socket = io(url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      timeout: 5000,
      ...optsRef.current,
    });

    socketRef.current = socket;

    const onConnect = () => {
      setIsConnected(true);
      refreshSubscriptions();
      traceEnabledRef.current = readTraceEnabled();
      traceLimitRef.current = readTraceLimit();
      tracedCountRef.current = 0;
      if (traceEnabledRef.current) {
        console.log(`[TickTrace] active. Logging first ${traceLimitRef.current} market_update event(s).`);
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onMarketUpdate = (update) => {
      if (!update || update.instrument_token == null) return;
      // Strip invalid LTP — preserve previously cached good LTP via shallow merge
      if (update.ltp !== undefined && !(update.ltp > 0)) {
        delete update.ltp;
      }
      const clientReceiveTs = Date.now();
      const key = String(update.instrument_token);
      const existing = ticksRef.current.get(key) || {};
      ticksRef.current.set(key, { ...existing, ...update });
      tickUpdatedAtRef.current.set(key, clientReceiveTs);

      if (!traceEnabledRef.current) return;
      if (tracedCountRef.current >= traceLimitRef.current) return;

      const trace = update.__trace || {};
      const seqRaw = Number(trace.seq);
      const serverReceiveTsRaw = Number(trace.serverReceiveTs);
      const serverEmitTsRaw = Number(trace.serverEmitTs);
      const exchangeTsRaw = Number(trace.exchangeTsMs);
      const lastTradeTsRaw = Number(trace.lastTradeTsMs);
      const sourceToServerRaw = Number(trace.sourceToServerMs);
      const roomSizeAtEmitRaw = Number(trace.roomSizeAtEmit);
      const seq = Number.isFinite(seqRaw) ? seqRaw : null;
      const serverReceiveTs = Number.isFinite(serverReceiveTsRaw) ? serverReceiveTsRaw : null;
      const serverEmitTs = Number.isFinite(serverEmitTsRaw) ? serverEmitTsRaw : null;
      const exchangeTsMs = Number.isFinite(exchangeTsRaw) ? exchangeTsRaw : null;
      const lastTradeTsMs = Number.isFinite(lastTradeTsRaw) ? lastTradeTsRaw : null;
      const sourceToServerMs = Number.isFinite(sourceToServerRaw) ? sourceToServerRaw : null;
      const roomSizeAtEmit = Number.isFinite(roomSizeAtEmitRaw) ? roomSizeAtEmitRaw : null;
      const serverProcessMs =
        serverReceiveTs != null && serverEmitTs != null
          ? serverEmitTs - serverReceiveTs
          : null;
      const wireMs =
        serverEmitTs != null
          ? clientReceiveTs - serverEmitTs
          : null;
      const totalMs =
        serverReceiveTs != null
          ? clientReceiveTs - serverReceiveTs
          : null;
      const sourceToClientMs =
        exchangeTsMs != null
          ? clientReceiveTs - exchangeTsMs
          : null;

      tracedCountRef.current += 1;
      const tracePayload = {
        idx: tracedCountRef.current,
        token: key,
        seq,
        mode: update.mode ?? null,
        ltp: update.ltp ?? null,
        serverReceiveTs,
        serverEmitTs,
        exchangeTsMs,
        lastTradeTsMs,
        sourceToServerMs,
        sourceToClientMs,
        roomSizeAtEmit,
        clientReceiveTs,
        serverProcessMs,
        wireMs,
        totalMs,
        visibility: typeof document !== 'undefined' ? document.visibilityState : 'na',
      };
      console.log(`[TickTraceJSON] ${JSON.stringify(tracePayload)}`);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('market_update', onMarketUpdate);
    socket.on('index_update', onMarketUpdate);
    socket.on('ticker_update', onMarketUpdate);
    socket.on('quote_update', onMarketUpdate);
    socket.on('oi_update', onMarketUpdate);
    socket.on('prev_close_update', onMarketUpdate);
    socket.on('market_status_update', onMarketUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('market_update', onMarketUpdate);
      socket.off('index_update', onMarketUpdate);
      socket.off('ticker_update', onMarketUpdate);
      socket.off('quote_update', onMarketUpdate);
      socket.off('oi_update', onMarketUpdate);
      socket.off('prev_close_update', onMarketUpdate);
      socket.off('market_status_update', onMarketUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshSubscriptions, url]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();
      ticksRef.current.forEach((_value, key) => {
        if (isTokenActive(key)) return;
        const lastSeen = tickUpdatedAtRef.current.get(key) || 0;
        if (now - lastSeen >= STALE_TICK_MS) {
          ticksRef.current.delete(key);
          tickUpdatedAtRef.current.delete(key);
        }
      });
    }, PRUNE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isTokenActive]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (!socketRef.current?.connected) {
          socketRef.current?.connect();
        } else {
          refreshSubscriptions();
        }
      }
    };

    const handleFocus = () => {
      if (socketRef.current?.connected) {
        refreshSubscriptions();
      } else {
        socketRef.current?.connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshSubscriptions]);

  return {
    ticksRef,
    tickUpdatedAtRef,
    subscribe,
    unsubscribe,
    isConnected,
    refreshSubscriptions,
    socketRef,
  };
};
