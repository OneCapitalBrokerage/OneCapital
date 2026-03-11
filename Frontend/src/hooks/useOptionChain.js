import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';
import { useMarketData } from '../context/SocketContext';

const SUBSCRIBED_STRIKE_COUNT = 13;

const getTickLtp = (tick) => {
  if (!tick) return null;
  return (
    tick.ltp ??
    tick.last_price ??
    tick.lastPrice ??
    tick.close ??
    null
  );
};

const getTickOi = (tick) => {
  if (!tick) return null;
  return tick.oi ?? tick.open_interest ?? tick.openInterest ?? null;
};

const getTickVolume = (tick) => {
  if (!tick) return null;
  return tick.volume ?? tick.volume_traded ?? tick.volumeTraded ?? null;
};

const normalizeSnapshot = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  return {
    ltp: getTickLtp(raw),
    oi: getTickOi(raw),
    volume: getTickVolume(raw),
  };
};

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const getAtmIndex = (chainArray, referencePrice) => {
  if (!Array.isArray(chainArray) || chainArray.length === 0) return -1;
  const numericPrice = toFiniteNumber(referencePrice);
  if (numericPrice == null) return Math.floor(chainArray.length / 2);

  let closestIndex = 0;
  let minDiff = Number.POSITIVE_INFINITY;
  chainArray.forEach((row, index) => {
    const strike = toFiniteNumber(row?.strike);
    if (strike == null) return;
    const diff = Math.abs(strike - numericPrice);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = index;
    }
  });

  return closestIndex;
};

const getWindowBounds = (total, centerIndex, windowSize = SUBSCRIBED_STRIKE_COUNT) => {
  if (!Number.isFinite(total) || total <= 0) return { start: 0, end: 0 };
  const safeWindow = Math.max(1, Math.min(windowSize, total));
  const safeCenter = Math.max(0, Math.min(total - 1, centerIndex));
  const half = Math.floor(safeWindow / 2);

  let start = Math.max(0, safeCenter - half);
  let end = Math.min(total, start + safeWindow);

  if (end - start < safeWindow) {
    start = Math.max(0, end - safeWindow);
  }

  return { start, end };
};

const buildWindowSubscription = (chainArray, spotInfo, referencePrice) => {
  if (!Array.isArray(chainArray) || chainArray.length === 0) {
    return {
      list: [],
      tokenMap: new Map(),
      spotToken: null,
      signature: '',
    };
  }

  const atmIndex = getAtmIndex(chainArray, referencePrice);
  const { start, end } = getWindowBounds(chainArray.length, atmIndex);
  const windowRows = chainArray.slice(start, end);

  const seen = new Set();
  const optionTokens = [];
  const tokenMap = new Map();

  windowRows.forEach((row) => {
    const callToken = row?.call?.instrument_token != null ? String(row.call.instrument_token) : null;
    const putToken = row?.put?.instrument_token != null ? String(row.put.instrument_token) : null;

    if (callToken && !seen.has(callToken)) {
      seen.add(callToken);
      optionTokens.push(callToken);
      tokenMap.set(callToken, { type: 'call' });
    }
    if (putToken && !seen.has(putToken)) {
      seen.add(putToken);
      optionTokens.push(putToken);
      tokenMap.set(putToken, { type: 'put' });
    }
  });

  const spotToken = spotInfo?.token != null ? String(spotInfo.token) : null;
  const list = optionTokens.map((token) => ({ instrument_token: token }));
  if (spotToken && !seen.has(spotToken)) {
    list.push({ instrument_token: spotToken });
  }

  const signature = `${optionTokens.join(',')}|spot:${spotToken || ''}`;

  return {
    list,
    tokenMap,
    spotToken,
    signature,
  };
};

export const useOptionChain = ({
  name,
  segment,
  expiry,
  tradingsymbol,
  instrumentToken,
  subscriptionType = 'quote',
  initialLtp = null,
}) => {
  const [chainData, setChainData] = useState([]);
  const [spotPrice, setSpotPrice] = useState(null);
  const [spotInstrumentInfo, setSpotInstrumentInfo] = useState(null);
  const [expiries, setExpiries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ underlying: null, segment: null, expiry: null });

  const { ticksRef, subscribe, unsubscribe } = useMarketData();

  const [liveByToken, setLiveByToken] = useState({});

  // ticksReady: false until first live tick batch arrives for this chain.
  // Resets to false on every new fetch so the table never shows stale 0 prices.
  // Falls back to true after 5 seconds in case market is closed / no ticks come.
  const [ticksReady, setTicksReady] = useState(false);
  const ticksReadyRef = useRef(false);
  const ticksReadyTimeoutRef = useRef(null);

  const tokenMapRef = useRef(new Map());
  const subscribedRef = useRef([]);
  const lastFetchKeyRef = useRef(null);
  const spotTokenRef = useRef(null);
  const prevLiveByTokenRef = useRef({});
  const chainRef = useRef([]);
  const spotInfoRef = useRef(null);
  const subscriptionSignatureRef = useRef('');

  const seedFromSnapshot = useCallback(async (list) => {
    if (!Array.isArray(list) || list.length === 0) return;

    try {
      const response = await api.post('/quotes/snapshot', { items: list });
      const snapshot = response?.data;
      if (!snapshot || typeof snapshot !== 'object') return;

      const prev = prevLiveByTokenRef.current;
      const next = { ...prev };
      let hasChanges = false;
      let optionDataReady = false;

      tokenMapRef.current.forEach((_, token) => {
        const normalized = normalizeSnapshot(snapshot[token]);
        if (!normalized) return;
        const { ltp, oi, volume } = normalized;
        if (ltp == null && oi == null && volume == null) return;

        const existing = prev[token];
        if (
          existing?.ltp !== ltp ||
          existing?.oi !== oi ||
          existing?.volume !== volume
        ) {
          next[token] = { ltp, oi, volume };
          hasChanges = true;
        }
        optionDataReady = true;
      });

      if (hasChanges) {
        prevLiveByTokenRef.current = next;
        setLiveByToken(next);
      }

      const spotToken = spotTokenRef.current;
      if (spotToken) {
        const normalizedSpot = normalizeSnapshot(snapshot[spotToken]);
        if (normalizedSpot?.ltp != null) {
          setSpotPrice((prevPrice) => (prevPrice === normalizedSpot.ltp ? prevPrice : normalizedSpot.ltp));
        }
      }

      if (optionDataReady && !ticksReadyRef.current) {
        ticksReadyRef.current = true;
        if (ticksReadyTimeoutRef.current) clearTimeout(ticksReadyTimeoutRef.current);
        setTicksReady(true);
      }
    } catch {
      // Snapshot seed is best-effort; live ticks will still update normally.
    }
  }, []);

  const unsubscribeFromOptions = useCallback(() => {
    if (subscribedRef.current.length) {
      unsubscribe(subscribedRef.current, subscriptionType);
      subscribedRef.current = [];
    }
    tokenMapRef.current.clear();
    spotTokenRef.current = null;
    subscriptionSignatureRef.current = '';
  }, [subscriptionType, unsubscribe]);

  const syncWindowSubscription = useCallback((chainArray, spotInfo, referencePrice) => {
    const {
      list,
      tokenMap,
      spotToken,
      signature,
    } = buildWindowSubscription(chainArray, spotInfo, referencePrice);

    if (signature === subscriptionSignatureRef.current) {
      tokenMapRef.current = tokenMap;
      spotTokenRef.current = spotToken;
      return [];
    }

    const prevMap = new Map(
      subscribedRef.current.map((item) => [String(item.instrument_token), item]),
    );
    const nextMap = new Map(
      list.map((item) => [String(item.instrument_token), item]),
    );

    const toSubscribe = [];
    nextMap.forEach((item, token) => {
      if (!prevMap.has(token)) toSubscribe.push(item);
    });

    const toUnsubscribe = [];
    prevMap.forEach((item, token) => {
      if (!nextMap.has(token)) toUnsubscribe.push(item);
    });

    if (toSubscribe.length) {
      subscribe(toSubscribe, subscriptionType);
    }
    if (toUnsubscribe.length) {
      unsubscribe(toUnsubscribe, subscriptionType);
    }

    tokenMapRef.current = tokenMap;
    spotTokenRef.current = spotToken;
    subscribedRef.current = list;
    subscriptionSignatureRef.current = signature;
    return toSubscribe;
  }, [subscribe, subscriptionType, unsubscribe]);

  const fetchOptionChain = useCallback(async () => {
    if (!name && !tradingsymbol && !instrumentToken) return;
    const params = {};
    if (name) params.name = name;
    if (segment) params.segment = segment;
    if (expiry) params.expiry = expiry;
    if (tradingsymbol) params.tradingsymbol = tradingsymbol;
    if (instrumentToken) params.instrument_token = instrumentToken;

    const fetchKey = `${name}|${tradingsymbol || ''}|${segment || 'auto'}|${expiry || 'nearest'}`;
    if (lastFetchKeyRef.current === fetchKey) return;

    setLoading(true);
    setError(null);

    // Reset ticks-ready on every new fetch — never show 0-price table
    setTicksReady(false);
    ticksReadyRef.current = false;
    if (ticksReadyTimeoutRef.current) clearTimeout(ticksReadyTimeoutRef.current);

    try {
      const response = await api.get('/option-chain', { params });
      const payload = response?.data?.data;
      const chain = payload?.chain || [];
      const nextSpotInfo = payload?.spotInstrumentInfo || null;

      setChainData(chain);
      chainRef.current = chain;
      // Reset live data map when chain reloads so stale tokens don't linger.
      prevLiveByTokenRef.current = {};
      setLiveByToken({});
      setSpotInstrumentInfo(nextSpotInfo);
      spotInfoRef.current = nextSpotInfo;
      setMeta({
        underlying: payload?.underlying || name,
        segment: payload?.segment || segment || null,
        expiry: payload?.expiry || expiry || null,
      });
      setSpotPrice(null);

      lastFetchKeyRef.current = fetchKey;

      unsubscribeFromOptions();
      if (chain.length) {
        const newlySubscribed = syncWindowSubscription(chain, nextSpotInfo, initialLtp);
        if (newlySubscribed.length) {
          seedFromSnapshot(newlySubscribed);
        }
        // 5-second fallback: if no ticks arrive (market closed, weekend),
        // show the table anyway rather than blocking the user forever.
        ticksReadyTimeoutRef.current = setTimeout(() => {
          if (!ticksReadyRef.current) {
            ticksReadyRef.current = true;
            setTicksReady(true);
          }
        }, 5000);
      } else {
        // Empty chain — nothing to wait for
        subscriptionSignatureRef.current = '';
        ticksReadyRef.current = true;
        setTicksReady(true);
      }
    } catch (err) {
      setError(err?.response?.data?.details || err?.message || 'Failed to fetch option chain');
      setChainData([]);
      chainRef.current = [];
      // On error, unblock so error message shows
      ticksReadyRef.current = true;
      setTicksReady(true);
    } finally {
      setLoading(false);
    }
  }, [name, segment, expiry, tradingsymbol, instrumentToken, syncWindowSubscription, unsubscribeFromOptions, initialLtp, seedFromSnapshot]);

  const fetchExpiries = useCallback(async () => {
    if (!name && !tradingsymbol && !instrumentToken) return;
    try {
      const params = {};
      if (name) params.name = name;
      if (segment) params.segment = segment;
      if (tradingsymbol) params.tradingsymbol = tradingsymbol;
      if (instrumentToken) params.instrument_token = instrumentToken;
      const response = await api.get('/option-chain/expiries', { params });
      const data = response?.data?.data;
      setExpiries(data?.expiries || []);
    } catch {
      setExpiries([]);
    }
  }, [name, segment, tradingsymbol, instrumentToken]);

  useEffect(() => {
    if (!name && !tradingsymbol && !instrumentToken) return undefined;
    fetchOptionChain();
    fetchExpiries();
    return () => {
      unsubscribeFromOptions();
      if (ticksReadyTimeoutRef.current) clearTimeout(ticksReadyTimeoutRef.current);
    };
  }, [name, segment, expiry, tradingsymbol, instrumentToken, fetchOptionChain, fetchExpiries, unsubscribeFromOptions]);

  useEffect(() => {
    if (!chainRef.current.length) return;
    const newlySubscribed = syncWindowSubscription(chainRef.current, spotInfoRef.current, spotPrice);
    if (newlySubscribed.length) {
      seedFromSnapshot(newlySubscribed);
    }
  }, [spotPrice, syncWindowSubscription, seedFromSnapshot]);

  // Keep liveByToken in sync with ticks via RAF loop.
  // This replaces the chain-array-mutation approach: we update a flat token→values
  // map instead of cloning the whole chain array on every tick cycle.
  // chainData remains stable (no reference changes), so all memos derived from it
  // stay cached. The component merges live values at render time.
  useEffect(() => {
    let animationFrameId;
    let lastUpdate = 0;
    const THROTTLE_MS = 33.33;

    const updateLoop = (timestamp) => {
      if (document.visibilityState === 'hidden') {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      if (timestamp - lastUpdate < THROTTLE_MS) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      if (!tokenMapRef.current.size) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      const ticks = ticksRef.current;
      const prev = prevLiveByTokenRef.current;
      let hasChanges = false;
      const next = { ...prev };

      tokenMapRef.current.forEach((_, token) => {
        const tick = ticks.get(token);
        if (!tick) return;

        const nextLtp = getTickLtp(tick);
        const nextOi = getTickOi(tick);
        const nextVolume = getTickVolume(tick);

        if (nextLtp == null && nextOi == null && nextVolume == null) return;

        const existing = prev[token];
        if (
          existing?.ltp !== nextLtp ||
          existing?.oi !== nextOi ||
          existing?.volume !== nextVolume
        ) {
          next[token] = { ltp: nextLtp, oi: nextOi, volume: nextVolume };
          hasChanges = true;
        }
      });

      if (hasChanges) {
        prevLiveByTokenRef.current = next;
        setLiveByToken(next);
        lastUpdate = timestamp;

        // First tick batch arrived — mark live prices as ready
        if (!ticksReadyRef.current) {
          ticksReadyRef.current = true;
          if (ticksReadyTimeoutRef.current) clearTimeout(ticksReadyTimeoutRef.current);
          setTicksReady(true);
        }
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [ticksRef]);

  useEffect(() => {
    const token = spotTokenRef.current;
    if (!token) return undefined;

    let animationFrameId;
    let lastUpdate = 0;
    const THROTTLE_MS = 33.33;

    const updateLoop = (timestamp) => {
      if (timestamp - lastUpdate < THROTTLE_MS) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      const tick = ticksRef.current.get(token);
      const nextLtp = getTickLtp(tick);
      if (nextLtp != null) {
        setSpotPrice((prev) => (prev === nextLtp ? prev : nextLtp));
        lastUpdate = timestamp;
        // NOTE: ticksReady is NOT set here. Spot tick arriving before option ticks
        // would unlock the table with all option cells still at API fallback (0).
        // ticksReady is set only when option token data arrives (see option RAF loop above).
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [ticksRef, spotInstrumentInfo]);

  // Unified ATM price used for both subscription centering and display slicing.
  // Must match the priority used in syncWindowSubscription so visible strikes
  // always equal the subscribed window.
  const atmPrice = spotPrice ?? initialLtp ?? null;

  return {
    chainData,
    liveByToken,
    spotPrice,
    atmPrice,
    spotInstrumentInfo,
    expiries,
    loading,
    ticksReady,
    error,
    refetch: fetchOptionChain,
    meta,
  };
};
