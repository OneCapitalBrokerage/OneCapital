import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import { useMarketData } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import OrderBottomSheet from './OrderBottomSheet';
import useCustomerTradingGate from '../../hooks/useCustomerTradingGate';
import { InlineWarningBanner } from '../../components/shared/WarningBanner';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const areMapsEqual = (prevMap, nextMap, itemComparator) => {
  const prevKeys = Object.keys(prevMap);
  const nextKeys = Object.keys(nextMap);
  if (prevKeys.length !== nextKeys.length) return false;

  for (let i = 0; i < nextKeys.length; i += 1) {
    const key = nextKeys[i];
    if (!hasOwn(prevMap, key)) return false;
    if (!itemComparator(prevMap[key], nextMap[key])) return false;
  }

  return true;
};

const isSameQuote = (prev, next) => (
  (prev?.ltp ?? null) === (next?.ltp ?? null) &&
  (prev?.change ?? null) === (next?.change ?? null) &&
  (prev?.changePercent ?? null) === (next?.changePercent ?? null)
);

const isSameSearchQuote = (prev, next) => (
  (prev?.ltp ?? null) === (next?.ltp ?? null) &&
  (prev?.percentChange ?? null) === (next?.percentChange ?? null)
);

const normalizeIdentityPart = (value) => String(value || '').trim().toUpperCase();

const getInstrumentIdentityKey = (item) => {
  if (!item) return null;
  const token = String(item.instrumentToken || item.instrument_token || '').trim();
  if (token) return `token:${token}`;

  const symbol = normalizeIdentityPart(item.symbol || item.tradingsymbol || item.tradingSymbol || item.name);
  const segment = normalizeIdentityPart(item.segment);
  const exchange = normalizeIdentityPart(item.exchange);

  if (symbol && segment) return `symseg:${symbol}|${segment}`;
  if (symbol && exchange) return `symex:${symbol}|${exchange}`;
  if (symbol) return `sym:${symbol}`;
  return null;
};

const DEFAULT_WATCHLIST_TRACE_LIMIT = 120;
const WATCHLIST_TAB_LONG_PRESS_MS = 550;
const WATCHLIST_TAB_LONG_PRESS_MOVE_PX = 12;
const PRIMARY_INDEX_CONFIG = [
  { token: '256265', names: ['NIFTY 50'] },
  { token: '260105', names: ['NIFTY BANK', 'BANKNIFTY'] },
  { token: '265', names: ['SENSEX'] },
];

const readWatchlistTraceEnabled = () => {
  if (import.meta.env.VITE_WATCHLIST_RENDER_TRACE === 'false') return false;
  if (import.meta.env.VITE_WATCHLIST_RENDER_TRACE === 'true') return true;
  if (typeof window === 'undefined') return true;
  try {
    const override = window.localStorage.getItem('WATCHLIST_RENDER_TRACE');
    if (override === 'false') return false;
    if (override === 'true') return true;
  } catch {
    // Ignore localStorage read errors.
  }
  return true;
};

const readWatchlistTraceLimit = () => {
  const envRaw = Number.parseInt(import.meta.env.VITE_WATCHLIST_RENDER_TRACE_LIMIT || '', 10);
  if (Number.isFinite(envRaw) && envRaw > 0) return envRaw;
  if (typeof window === 'undefined') return DEFAULT_WATCHLIST_TRACE_LIMIT;
  try {
    const localRaw = Number.parseInt(window.localStorage.getItem('WATCHLIST_RENDER_TRACE_LIMIT') || '', 10);
    if (Number.isFinite(localRaw) && localRaw > 0) return localRaw;
  } catch {
    // Ignore localStorage read errors.
  }
  return DEFAULT_WATCHLIST_TRACE_LIMIT;
};

const readWatchlistTraceTokenFilter = () => {
  const envValue = String(import.meta.env.VITE_WATCHLIST_RENDER_TRACE_TOKENS || '').trim();
  let raw = envValue;
  if (!raw && typeof window !== 'undefined') {
    try {
      raw = String(window.localStorage.getItem('WATCHLIST_RENDER_TRACE_TOKENS') || '').trim();
    } catch {
      raw = '';
    }
  }
  if (!raw) return null;
  const tokens = raw
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!tokens.length) return null;
  return new Set(tokens);
};

const Watchlist = () => {
  const CACHE_TTL_MS = 2 * 60 * 1000;
  const WATCHLIST_REVALIDATE_AFTER_MS = 10 * 1000;
  const PRICE_THROTTLE_MS = 33.33;
  const SEARCH_DEBOUNCE_MS = 300;
  const SEARCH_SUBSCRIBE_DEBOUNCE_MS = 400;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Watchlist 1');
  const [activeIndexToken, setActiveIndexToken] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [marketDepthSheet, setMarketDepthSheet] = useState({ open: false, stock: null });
  const [orderSheet, setOrderSheet] = useState({ open: false, side: 'BUY', stock: null, ltpData: null });
  const [loading, setLoading] = useState(true);
  const [pendingDeleteTab, setPendingDeleteTab] = useState(null);
  const [isDeletingWatchlist, setIsDeletingWatchlist] = useState(false);

  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { ticksRef, tickUpdatedAtRef, subscribe, unsubscribe, isConnected } = useMarketData();
  const { isCustomerTradeAllowed, marketClosedReason, isTradingAllowed, getClosedMessage } = useCustomerTradingGate();
  const apiBase = useMemo(() => {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
    return base.replace(/\/$/, '');
  }, []);

  const isOptionInstrument = useCallback((item) => {
    if (!item) return false;
    const segment = String(item.segment || item.exchange || '').toUpperCase();
    if (segment.includes('OPT')) return true;
    const instrumentType = String(item.instrument_type || '').toUpperCase();
    return instrumentType === 'CE' || instrumentType === 'PE';
  }, []);
  
  // Data states - populated from API
  const [indexInstruments, setIndexInstruments] = useState([]);
  const [watchlists, setWatchlists] = useState({});
  const [watchlistOrder, setWatchlistOrder] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [prices, setPrices] = useState({});

  const activeTabRef = useRef(activeTab);
  const pricesRef = useRef({});
  const snapshotsRef = useRef({});
  const instrumentResolveCacheRef = useRef(new Map());
  const instrumentResolveInFlightRef = useRef(new Map());
  const stocksRef = useRef([]);
  const indexesRef = useRef([]);
  const subscribedFullRef = useRef(new Set());
  const subscribedQuoteRef = useRef(new Set());
  const hasConnectedOnceRef = useRef(false);

  // Search states
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [livePrices, setLivePrices] = useState({});
  const searchSnapshotsRef = useRef({});
  const searchPricesRef = useRef({});
  const searchSubscriptionsRef = useRef([]);
  const activeAbortControllerRef = useRef(null);
  const searchResultsRef = useRef(searchResults);
  const watchlistTraceEnabledRef = useRef(readWatchlistTraceEnabled());
  const watchlistTraceLimitRef = useRef(readWatchlistTraceLimit());
  const watchlistTraceTokensRef = useRef(readWatchlistTraceTokenFilter());
  const watchlistTraceCountRef = useRef(0);
  const watchlistLastSeqByTokenRef = useRef(new Map());
  const watchlistPendingRenderRef = useRef(null);
  const tabLongPressTimerRef = useRef(null);
  const tabLongPressStateRef = useRef({ tab: null, startX: 0, startY: 0, triggered: false });
  const suppressTabClickRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('active_watchlist', activeTab);
  }, [activeTab]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  useEffect(() => {
    indexesRef.current = indexInstruments;
  }, [indexInstruments]);

  useEffect(() => {
    setMarketDepthSheet({ open: false, stock: null });
  }, [selectedStock]);

  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);

  useEffect(() => {
    watchlistTraceEnabledRef.current = readWatchlistTraceEnabled();
    watchlistTraceLimitRef.current = readWatchlistTraceLimit();
    watchlistTraceTokensRef.current = readWatchlistTraceTokenFilter();
    watchlistTraceCountRef.current = 0;
    watchlistLastSeqByTokenRef.current.clear();

    if (!watchlistTraceEnabledRef.current) return;
    const tokenFilter = watchlistTraceTokensRef.current;
    const filterLabel = tokenFilter ? Array.from(tokenFilter).join(',') : 'ALL';
    console.log(
      `[WatchlistTrace] active. limit=${watchlistTraceLimitRef.current}, tokenFilter=${filterLabel}`
    );
  }, []);

  const clearTabLongPress = useCallback(() => {
    if (tabLongPressTimerRef.current) {
      window.clearTimeout(tabLongPressTimerRef.current);
      tabLongPressTimerRef.current = null;
    }
    tabLongPressStateRef.current = { tab: null, startX: 0, startY: 0, triggered: false };
  }, []);

  useEffect(() => () => clearTabLongPress(), [clearTabLongPress]);

  const shouldTraceToken = useCallback((tokenKey) => {
    const filter = watchlistTraceTokensRef.current;
    if (!filter) return true;
    return filter.has(String(tokenKey));
  }, []);

  const normalizeQuote = useCallback((quote) => {
    if (!quote) return { ltp: null, change: 0, changePercent: 0 };
    const ltp = quote.ltp ?? quote.close ?? 0;
    const change = quote.netChange ?? quote.change ?? 0;
    let changePercent = quote.percentChange;
    if (changePercent == null && quote.close) {
      changePercent = (change / quote.close) * 100;
    }
    return { ltp, change, changePercent: changePercent ?? 0 };
  }, []);

  const formatPrice = (value) => {
    if (value == null || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  const formatIndexNumber = (value) => {
    if (value == null || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatIndexSignedNumber = (value) => {
    if (value == null || Number.isNaN(Number(value))) return '--';
    const numeric = Number(value);
    const abs = Math.abs(numeric).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (numeric === 0) return abs;
    return `${numeric > 0 ? '+' : '-'}${abs}`;
  };

  const selectPrimaryIndexes = useCallback((items) => {
    const list = Array.isArray(items) ? items : [];
    const selected = [];
    const selectedTokens = new Set();

    const getToken = (item) => String(item?.instrument_token || item?.instrumentToken || '').trim();
    const getName = (item) => String(item?.tradingsymbol || item?.name || '').trim().toUpperCase();
    const pushUnique = (item) => {
      if (!item) return;
      const token = getToken(item);
      if (!token || selectedTokens.has(token)) return;
      selected.push(item);
      selectedTokens.add(token);
    };

    PRIMARY_INDEX_CONFIG.forEach(({ token, names }) => {
      const byToken = list.find((item) => getToken(item) === token);
      if (byToken) {
        pushUnique(byToken);
        return;
      }
      const byName = list.find((item) => names.includes(getName(item)));
      pushUnique(byName);
    });

    return selected;
  }, []);

  const buildResolveKey = (item) => {
    const symbol = String(
      item?.symbol ||
      item?.tradingsymbol ||
      item?.tradingSymbol ||
      item?.name ||
      ''
    ).trim().toUpperCase();
    const segment = String(item?.exchange || item?.segment || 'NSE').trim().toUpperCase();
    if (!symbol) return null;
    return `${segment}:${symbol}`;
  };

  const resolveInstrument = useCallback(async (item) => {
    if (item.instrumentToken || item.instrument_token) {
      return {
        ...item,
        instrumentToken: item.instrumentToken || item.instrument_token,
      };
    }

    const key = buildResolveKey(item);
    if (!key) return item;

    const cachedResolved = instrumentResolveCacheRef.current.get(key);
    if (cachedResolved) {
      return { ...item, ...cachedResolved };
    }

    let inFlightPromise = instrumentResolveInFlightRef.current.get(key);
    if (!inFlightPromise) {
      inFlightPromise = (async () => {
        try {
          const symbol =
            item.symbol ||
            item.tradingsymbol ||
            item.tradingSymbol ||
            item.name;
          const resolved = await customerApi.resolveInstrument({
            tradingsymbol: symbol,
            segment: item.exchange || item.segment || 'NSE',
          });
          const normalizedResolved = {
            instrumentToken: resolved?.instrument_token || null,
            exchange: item.exchange || resolved?.exchange || 'NSE',
            segment: item.segment || resolved?.segment || item.exchange || 'NSE',
            instrument_type: item.instrument_type || resolved?.instrument_type || null,
            lot_size: item.lot_size || resolved?.lot_size || null,
            expiry: item.expiry || resolved?.expiry || null,
          };
          if (normalizedResolved.instrumentToken) {
            instrumentResolveCacheRef.current.set(key, normalizedResolved);
            return normalizedResolved;
          }
          return null;
        } catch {
          return null;
        } finally {
          instrumentResolveInFlightRef.current.delete(key);
        }
      })();

      instrumentResolveInFlightRef.current.set(key, inFlightPromise);
    }

    const resolvedFromLookup = await inFlightPromise;
    if (!resolvedFromLookup) return item;
    return { ...item, ...resolvedFromLookup };
  }, []);

  const getExchangeDisplayName = (segment, instrumentType) => {
    if (segment === 'INDICES') return 'Index';
    if (segment === 'NSE') return 'NSE Equity';
    if (segment === 'BSE') return 'BSE Equity';
    if (segment === 'NFO-FUT') return 'NSE Futures';
    if (segment === 'NFO-OPT') return 'NSE Options';
    if (segment === 'BFO-FUT') return 'BSE Futures';
    if (segment === 'BFO-OPT') return 'BSE Options';
    if (segment === 'MCX-FUT') return 'MCX Futures';
    if (segment === 'MCX-OPT') return 'MCX Options';
    if (segment === 'CDS-FUT') return 'Currency Futures';
    if (segment === 'CDS-OPT') return 'Currency Options';
    if (instrumentType === 'FUT') return 'Futures';
    if (['CE', 'PE'].includes(instrumentType)) return 'Options';
    return segment || 'Unknown';
  };

  const formatSearchResults = useCallback((instruments) => {
    if (!Array.isArray(instruments)) return [];
    const EXCLUDED_SEGMENTS = ['INDICES', 'CDS-FUT', 'CDS-OPT'];

    return instruments
      .filter((item) => !EXCLUDED_SEGMENTS.includes(item.segment))
      .map((item) => ({
        id: String(item.instrument_token),
        instrument_token: String(item.instrument_token),
        symbol: item.tradingsymbol || item.name || 'Unknown',
        name: item.name || item.tradingsymbol || 'Unknown',
        exchange: item.exchange || item.segment || 'NSE',
        displayExchange: getExchangeDisplayName(item.segment, item.instrument_type),
        segment: item.segment,
        instrument_type: item.instrument_type || null,
        lot_size: item.lot_size || null,
        expiry: item.expiry || null,
        canon_key: item.canon_key,
      }));
  }, []);

  const formatWatchlistItems = useCallback(async (items) => {
    const safeItems = Array.isArray(items) ? items : [];
    const resolved = await Promise.all(safeItems.map(resolveInstrument));
    const formatted = resolved.map((item) => ({
      id: item.instrumentToken || item.instrument_token || item.symbol,
      symbol: item.symbol || item.tradingsymbol || item.tradingSymbol || item.name,
      name: item.name || item.tradingsymbol || item.tradingSymbol || item.symbol,
      exchange: item.exchange || item.segment || 'NSE',
      segment: item.segment || item.exchange || null,
      instrument_type: item.instrument_type || null,
      lot_size: item.lot_size || null,
      expiry: item.expiry || null,
      instrumentToken: item.instrumentToken || item.instrument_token,
    }));
    return Array.from(new Map(formatted.map((item) => [item.id, item])).values());
  }, [resolveInstrument]);

  const getDepthData = useCallback((stock) => {
    if (!stock) return null;
    const token = String(stock.instrumentToken || stock.instrument_token || '');
    if (!token) return null;
    const snap = snapshotsRef.current[token] || {};
    const tick = ticksRef.current?.get(token) || {};
    const combined = { ...snap, ...tick };
    return {
      ltp: combined.ltp ?? combined.close ?? null,
      depth: combined.depth || null,
      bestBidPrice: combined.bestBidPrice ?? null,
      bestAskPrice: combined.bestAskPrice ?? null,
    };
  }, [ticksRef]);

  const getMarketDepthToken = useCallback(
    (item) => String(item?.instrumentToken || item?.instrument_token || '').trim(),
    []
  );

  const getOhlcData = useCallback((stock) => {
    if (!stock) return { open: null, high: null, close: null };
    const token = String(stock.instrumentToken || stock.instrument_token || '');
    if (!token) return { open: null, high: null, close: null };
    const snap = snapshotsRef.current[token] || {};
    const tick = ticksRef.current?.get(token) || {};
    const combined = { ...snap, ...tick };
    const ohlc = combined.ohlc || {};
    return {
      open: combined.open ?? ohlc.open ?? null,
      high: combined.high ?? ohlc.high ?? null,
      low: combined.low ?? ohlc.low ?? null,
      close: combined.close ?? ohlc.close ?? null,
    };
  }, [ticksRef]);

  const MarketDepthView = ({ data }) => {
    const depth = data?.depth;
    const ltp = data?.ltp;
    const bestBidPrice = data?.bestBidPrice;
    const bestAskPrice = data?.bestAskPrice;

    if (!depth || !depth.buy || !depth.sell) {
      return (
        <div className="flex flex-col items-center justify-center p-4 text-[#617589] text-xs">
          <span className="inline-block h-5 w-5 rounded-full border-2 border-[#8aa0b5] border-t-transparent animate-spin mb-2" />
          <p className="text-[11px] text-[#9aa6b2]">Loading market depth...</p>
        </div>
      );
    }

    const buyDepth = [...depth.buy]
      .sort((a, b) => b.price - a.price)
      .slice(0, 5);
    const sellDepth = [...depth.sell]
      .sort((a, b) => a.price - b.price)
      .slice(0, 5)
      .reverse();

    const allQuantities = [
      ...buyDepth.map((i) => i.quantity || 0),
      ...sellDepth.map((i) => i.quantity || 0),
    ];
    const maxQty = Math.max(...allQuantities, 1);
    const spread =
      bestAskPrice != null && bestBidPrice != null
        ? (Number(bestAskPrice) - Number(bestBidPrice)).toFixed(2)
        : '--';

    return (
      <div className="bg-white dark:bg-[#111b17] rounded-b-xl overflow-hidden border-t border-[#dbe0e6] dark:border-[#22352d]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#dbe0e6] dark:border-[#22352d] bg-[#f6f7f8] dark:bg-[#111b17]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#137fec]">stacked_line_chart</span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[#111418] dark:text-[#e8f3ee]">Market Depth</span>
              <span className="text-[10px] text-[#617589]">Top 5 levels · Live orders only</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-[#617589]">LTP</span>
              <span className="text-xs font-semibold text-[#111418] dark:text-[#e8f3ee]">
                {ltp != null ? Number(ltp).toFixed(2) : '--'}
              </span>
            </div>
            <div className="h-8 w-px bg-[#dbe0e6] dark:bg-[#0b120f]" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-[#617589]">Spread</span>
              <span className="text-xs font-semibold text-[#111418] dark:text-[#e8f3ee]">{spread}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-0 border-b border-[#dbe0e6] dark:border-[#22352d]">
          <div className="border-r border-[#dbe0e6] dark:border-[#22352d]">
            <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-[#078838] bg-[#ecf8f2] dark:bg-[#112019]">
              <span>Bid</span>
              <span className="text-[#617589] font-medium">Qty / Orders</span>
            </div>
            <div className="divide-y divide-[#edf0f3] dark:divide-[#22352d]">
              {buyDepth.length > 0 ? buyDepth.map((row) => (
                <div key={`bid-${row.price}-${row.quantity}`} className="relative px-3 py-2 text-[11px]">
                  <div
                    className="absolute inset-y-0 right-0 bg-[#dff3e8]"
                    style={{ width: `${(row.quantity || 0) / maxQty * 100}%` }}
                  />
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="font-semibold text-[#078838]">{Number(row.price).toFixed(2)}</span>
                    <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">
                      {row.quantity?.toLocaleString() || 0}
                    </span>
                    <span className="text-[#617589] tabular-nums">
                      {row.orders || row.order || row.orders_count || 0}
                    </span>
                  </div>
                </div>
              )) : (
                <div className="py-4 text-center text-[#9aa6b2] text-[10px]">No bid orders</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-red-500 bg-[#fff0f0] dark:bg-[#251312]">
              <span>Ask</span>
              <span className="text-[#617589] font-medium">Qty / Orders</span>
            </div>
            <div className="divide-y divide-[#edf0f3] dark:divide-[#22352d]">
              {sellDepth.length > 0 ? sellDepth.map((row) => (
                <div key={`ask-${row.price}-${row.quantity}`} className="relative px-3 py-2 text-[11px]">
                  <div
                    className="absolute inset-y-0 left-0 bg-[#ffe2e2]"
                    style={{ width: `${(row.quantity || 0) / maxQty * 100}%` }}
                  />
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="font-semibold text-red-500">{Number(row.price).toFixed(2)}</span>
                    <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">
                      {row.quantity?.toLocaleString() || 0}
                    </span>
                    <span className="text-[#617589] tabular-nums">
                      {row.orders || row.order || row.orders_count || 0}
                    </span>
                  </div>
                </div>
              )) : (
                <div className="py-4 text-center text-[#9aa6b2] text-[10px]">No ask orders</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Fetch watchlist data
  const fetchWatchlist = useCallback(async (options = {}) => {
    const { force = false } = options;
    const preferredTab = activeTabRef.current;
    let shouldShowLoading = true;
    let skipNetworkFetch = false;
    const now = Date.now();

    if (!force) {
      const cachedWatchlists = sessionStorage.getItem('watchlists_cache');
      const cachedWatchlist = sessionStorage.getItem('watchlist_cache');
      const cachedIndexes = sessionStorage.getItem('indexes_cache');
      const cacheTime = Number(sessionStorage.getItem('watchlist_cache_time'));
      const cacheAgeMs = Number.isFinite(cacheTime) ? (now - cacheTime) : Number.POSITIVE_INFINITY;

      if (cacheAgeMs < CACHE_TTL_MS) {
        if (cachedWatchlists && cachedIndexes) {
          const cachedPayload = JSON.parse(cachedWatchlists);
          const cachedIndexItems = selectPrimaryIndexes(JSON.parse(cachedIndexes));
          const mergedWatchlists = cachedPayload?.lists || {};
          const order = cachedPayload?.order || Object.keys(mergedWatchlists);
          const nextActive = mergedWatchlists[preferredTab]
            ? preferredTab
            : order[0] || 'Watchlist 1';
          setWatchlists(mergedWatchlists);
          setWatchlistOrder(order);
          setActiveTab(nextActive);
          setStocks(mergedWatchlists[nextActive] || []);
          setIndexInstruments(cachedIndexItems);
          setLoading(false);
          shouldShowLoading = false;
          if (cacheAgeMs < WATCHLIST_REVALIDATE_AFTER_MS) {
            skipNetworkFetch = true;
          }
        } else if (cachedWatchlist && cachedIndexes) {
          const cachedWatchlistItems = JSON.parse(cachedWatchlist);
          const cachedIndexItems = selectPrimaryIndexes(JSON.parse(cachedIndexes));
          const mergedWatchlists = { 'Watchlist 1': cachedWatchlistItems };
          const nextActive = mergedWatchlists[preferredTab] ? preferredTab : 'Watchlist 1';
          setWatchlists(mergedWatchlists);
          setWatchlistOrder(['Watchlist 1']);
          setActiveTab(nextActive);
          setStocks(mergedWatchlists[nextActive] || cachedWatchlistItems);
          setIndexInstruments(cachedIndexItems);
          setLoading(false);
          shouldShowLoading = false;
          if (cacheAgeMs < WATCHLIST_REVALIDATE_AFTER_MS) {
            skipNetworkFetch = true;
          }
        }
      }
    }

    if (skipNetworkFetch) return;

    if (shouldShowLoading) {
      setLoading(true);
    }
    try {
      const [indexResponse, watchlistResponse] = await Promise.all([
        customerApi.getIndexes(),
        customerApi.getWatchlist(),
      ]);

      const indexItems = Array.isArray(indexResponse) ? indexResponse : [];
      const apiWatchlists = Array.isArray(watchlistResponse?.watchlists)
        ? watchlistResponse.watchlists
        : null;

      const importantIndexes = selectPrimaryIndexes(indexItems);

      setIndexInstruments(importantIndexes);

      let mergedWatchlists = {};
      let order = [];

      if (apiWatchlists) {
        const formattedLists = await Promise.all(
          apiWatchlists.map(async (list) => {
            const items = await formatWatchlistItems(list.instruments || []);
            return { name: list.name || 'Watchlist 1', items };
          })
        );

        formattedLists.forEach((list) => {
          mergedWatchlists[list.name] = list.items;
          order.push(list.name);
        });
      } else {
        const watchlistItems = watchlistResponse?.watchlist || watchlistResponse?.data || watchlistResponse || [];
        const formatted = await formatWatchlistItems(watchlistItems);
        mergedWatchlists = { 'Watchlist 1': formatted };
        order = ['Watchlist 1'];
      }

      const nextActive = mergedWatchlists[preferredTab]
        ? preferredTab
        : order[0] || 'Watchlist 1';

      setWatchlists(mergedWatchlists);
      setWatchlistOrder(order);
      setActiveTab(nextActive);
      setStocks(mergedWatchlists[nextActive] || []);

      sessionStorage.setItem('watchlists_cache', JSON.stringify({ order, lists: mergedWatchlists }));
      sessionStorage.setItem('indexes_cache', JSON.stringify(importantIndexes));
      sessionStorage.setItem('watchlist_cache_time', now.toString());
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
    } finally {
      if (shouldShowLoading) {
        setLoading(false);
      }
    }
  }, [CACHE_TTL_MS, WATCHLIST_REVALIDATE_AFTER_MS, formatWatchlistItems, selectPrimaryIndexes]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  useEffect(() => {
    if (watchlists[activeTab]) {
      setStocks(watchlists[activeTab]);
    }
  }, [activeTab, watchlists]);

  // Search effect with debounce + cache
  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) {
      if (searchSubscriptionsRef.current.length > 0) {
        unsubscribe(searchSubscriptionsRef.current, 'quote');
        searchSubscriptionsRef.current = [];
      }
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
      setSearchResults(null);
      searchSnapshotsRef.current = {};
      if (Object.keys(searchPricesRef.current).length > 0) {
        searchPricesRef.current = {};
        setLivePrices({});
      }
      setIsSearching(false);
      return;
    }

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    setIsSearching(true);

    const handle = setTimeout(() => {
      (async () => {
        const cacheKey = `search_${term.toLowerCase()}`;
        const CACHE_TTL = 2 * 60 * 1000;

        try {
          const cached = sessionStorage.getItem(cacheKey);
          const cacheTime = sessionStorage.getItem(`${cacheKey}_time`);
          if (cached && cacheTime) {
            const age = Date.now() - Number(cacheTime);
            if (age < CACHE_TTL) {
              const cachedResults = JSON.parse(cached);
              if (!abortController.signal.aborted) {
                setSearchResults(formatSearchResults(cachedResults));
                setIsSearching(false);
                return;
              }
            }
          }
        } catch {
          // ignore cache errors
        }

        try {
          const url = `${apiBase}/instruments/search?q=${encodeURIComponent(term)}`;
          const response = await fetch(url, { credentials: 'include', signal: abortController.signal });
          if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Search failed: ${response.status} ${text}`);
          }
          const data = await response.json();
          const results = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];

          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(results));
            sessionStorage.setItem(`${cacheKey}_time`, Date.now().toString());
          } catch {
            // ignore cache write errors
          }

          if (!abortController.signal.aborted) {
            setSearchResults(formatSearchResults(results));
            setIsSearching(false);
          }
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.error('Search failed:', err);
          if (!abortController.signal.aborted) {
            setSearchResults([]);
            setIsSearching(false);
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      abortController.abort();
    };
  }, [apiBase, formatSearchResults, searchQuery, unsubscribe]);

  // Subscribe to live quotes for search results
  useEffect(() => {
    if (!searchResults || isSearching) return;

    const handle = setTimeout(() => {
      const subscribeSearchResults = async () => {
        const prevSet = new Set(
          searchSubscriptionsRef.current.map((item) => String(item.instrument_token))
        );
        const nextSet = new Set(
          searchResults.map((result) => String(result.instrument_token)).filter(Boolean)
        );

        const toSubscribe = [];
        const toUnsubscribe = [];

        nextSet.forEach((token) => {
          if (!prevSet.has(token)) toSubscribe.push({ instrument_token: token });
        });
        prevSet.forEach((token) => {
          if (!nextSet.has(token)) toUnsubscribe.push({ instrument_token: token });
        });

        if (toSubscribe.length > 0) subscribe(toSubscribe, 'quote');
        if (toUnsubscribe.length > 0) unsubscribe(toUnsubscribe, 'quote');

        searchSubscriptionsRef.current = Array.from(nextSet).map((token) => ({
          instrument_token: token,
        }));

        if (searchSubscriptionsRef.current.length === 0) {
          searchSnapshotsRef.current = {};
          if (Object.keys(searchPricesRef.current).length > 0) {
            searchPricesRef.current = {};
            setLivePrices({});
          }
          return;
        }

        if (toUnsubscribe.length > 0) {
          const nextSnapshots = { ...searchSnapshotsRef.current };
          toUnsubscribe.forEach(({ instrument_token: token }) => {
            delete nextSnapshots[String(token)];
          });
          searchSnapshotsRef.current = nextSnapshots;
        }

        if (toSubscribe.length === 0) return;

        try {
          const snapshot = await customerApi.getQuotesSnapshot(toSubscribe);
          const mergedSnapshots = { ...searchSnapshotsRef.current };
          Object.entries(snapshot || {}).forEach(([token, value]) => {
            if (token === '__snapshot_info') return;
            mergedSnapshots[token] = value;
          });
          searchSnapshotsRef.current = mergedSnapshots;
        } catch (err) {
          console.error('Failed to fetch search snapshots:', err);
        }
      };

      subscribeSearchResults();
    }, SEARCH_SUBSCRIBE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [isSearching, searchResults, subscribe, unsubscribe]);

  useEffect(() => {
    return () => {
      if (searchSubscriptionsRef.current.length > 0) {
        unsubscribe(searchSubscriptionsRef.current, 'quote');
      }
    };
  }, [unsubscribe]);

  useEffect(() => {
    let animationFrameId;
    let lastUpdate = 0;
    const THROTTLE_MS = 33.33;

    const updateLoop = (timestamp) => {
      if (timestamp - lastUpdate < THROTTLE_MS) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      if (!ticksRef.current || !searchResultsRef.current) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      const ticksMap = ticksRef.current;
      const currentResults = searchResultsRef.current;
      const num = (v) => (v == null || v === '' ? null : Number(v));
      const newPrices = {};
      let hasUpdates = false;

      currentResults.forEach((stock) => {
        const tickKey = String(stock.instrument_token);
        const snap = searchSnapshotsRef.current[tickKey] || {};
        const tick = ticksMap.get(tickKey) || {};
        const combined = { ...snap, ...tick };

        const ltp = num(combined.ltp);
        const open = num(combined.open);
        const close = num(combined.close);
        let percentChange = num(combined.percentChange);

        if (percentChange == null && ltp != null) {
          if (close != null && close !== 0) percentChange = ((ltp - close) / close) * 100;
          else if (open != null && open !== 0) percentChange = ((ltp - open) / open) * 100;
        }

        newPrices[stock.id] = { ltp, percentChange };
        hasUpdates = true;
      });

      if (hasUpdates) {
        if (!areMapsEqual(searchPricesRef.current, newPrices, isSameSearchQuote)) {
          searchPricesRef.current = newPrices;
          setLivePrices(newPrices);
        }
      }
      lastUpdate = timestamp;

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [ticksRef]);

  // Subscribe to union of ALL watchlist tabs (not just active tab)
  // to eliminate subscribe/unsubscribe churn on tab switch.
  const stockSubscriptionTokens = useMemo(() => {
    const allTokens = new Set();
    Object.values(watchlists).forEach((list) => {
      list.forEach((s) => {
        const t = s.instrumentToken || s.instrument_token;
        if (t) allTokens.add(String(t));
      });
    });
    return Array.from(allTokens);
  }, [watchlists]);

  const indexSubscriptionTokens = useMemo(
    () => Array.from(new Set(
      indexInstruments
        .map((i) => i.instrument_token || i.instrumentToken)
        .filter(Boolean)
        .map((token) => String(token))
    )),
    [indexInstruments]
  );

  const hasAnySubscriptionTokens = stockSubscriptionTokens.length > 0 || indexSubscriptionTokens.length > 0;

  const fetchSnapshots = useCallback(async (items) => {
    if (!items.length) return;
    try {
      const response = await customerApi.getQuotesSnapshot(items);
      if (!response) return;
      const merged = { ...snapshotsRef.current };
      Object.entries(response).forEach(([key, value]) => {
        if (key === '__snapshot_info') return;
        merged[key] = value;
      });
      snapshotsRef.current = merged;
    } catch (err) {
      console.error('Failed to fetch snapshots:', err);
    }
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    if (!hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      return;
    }
    const subscribedTokens = Array.from(new Set([
      ...subscribedFullRef.current,
      ...subscribedQuoteRef.current,
    ])).map((token) => ({
      instrument_token: token,
    }));
    if (subscribedTokens.length > 0) {
      fetchSnapshots(subscribedTokens);
    }
  }, [fetchSnapshots, isConnected]);

  useEffect(() => {
    const nextSet = new Set(stockSubscriptionTokens);
    const prevSet = subscribedFullRef.current;
    const toSubscribe = [];
    const toUnsubscribe = [];

    nextSet.forEach((token) => {
      if (!prevSet.has(token)) {
        toSubscribe.push({ instrument_token: token });
      }
    });

    prevSet.forEach((token) => {
      if (!nextSet.has(token)) {
        toUnsubscribe.push({ instrument_token: token });
      }
    });

    if (toSubscribe.length > 0) {
      subscribe(toSubscribe, 'full');
      fetchSnapshots(toSubscribe);
    }

    if (toUnsubscribe.length > 0) {
      unsubscribe(toUnsubscribe, 'full');
    }

    subscribedFullRef.current = nextSet;
  }, [fetchSnapshots, stockSubscriptionTokens, subscribe, unsubscribe]);

  useEffect(() => {
    const nextSet = new Set(indexSubscriptionTokens);
    const prevSet = subscribedQuoteRef.current;
    const toSubscribe = [];
    const toUnsubscribe = [];

    nextSet.forEach((token) => {
      if (!prevSet.has(token)) {
        toSubscribe.push({ instrument_token: token });
      }
    });

    prevSet.forEach((token) => {
      if (!nextSet.has(token)) {
        toUnsubscribe.push({ instrument_token: token });
      }
    });

    if (toSubscribe.length > 0) {
      subscribe(toSubscribe, 'quote');
      fetchSnapshots(toSubscribe);
    }

    if (toUnsubscribe.length > 0) {
      unsubscribe(toUnsubscribe, 'quote');
    }

    subscribedQuoteRef.current = nextSet;
  }, [fetchSnapshots, indexSubscriptionTokens, subscribe, unsubscribe]);

  useEffect(() => {
    if (!hasAnySubscriptionTokens && Object.keys(pricesRef.current).length > 0) {
      pricesRef.current = {};
      setPrices({});
    }
  }, [hasAnySubscriptionTokens]);

  useEffect(() => {
    if (!marketDepthSheet.open || !marketDepthSheet.stock) return undefined;
    const token = getMarketDepthToken(marketDepthSheet.stock);
    if (!token) return undefined;
    // Stocks are already subscribed in full mode — just fetch snapshots for immediate data.
    const payload = [{ instrument_token: token }];
    fetchSnapshots(payload);
    return undefined;
  }, [fetchSnapshots, getMarketDepthToken, marketDepthSheet.open, marketDepthSheet.stock]);

  useEffect(() => {
    return () => {
      const fullTokens = Array.from(subscribedFullRef.current).map((token) => ({
        instrument_token: token,
      }));
      const quoteTokens = Array.from(subscribedQuoteRef.current).map((token) => ({
        instrument_token: token,
      }));
      if (fullTokens.length > 0) {
        unsubscribe(fullTokens, 'full');
      }
      if (quoteTokens.length > 0) {
        unsubscribe(quoteTokens, 'quote');
      }
    };
  }, [unsubscribe]);

  useEffect(() => {
    let animationFrameId;
    let lastUpdate = 0;

    const updateLoop = (timestamp) => {
      if (timestamp - lastUpdate < PRICE_THROTTLE_MS) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      const currentStocks = stocksRef.current;
      const currentIndexes = indexesRef.current;
      const ticksMap = ticksRef.current;
      const byId = {};
      let hasUpdates = false;

      const tokens = [
        ...currentStocks.map((s) => s.instrumentToken || s.instrument_token).filter(Boolean),
        ...currentIndexes.map((i) => i.instrument_token || i.instrumentToken).filter(Boolean),
      ];

      tokens.forEach((token) => {
        const key = String(token);
        const snap = snapshotsRef.current[key] || {};
        const tick = ticksMap?.get(key) || {};
        const combined = { ...snap, ...tick };
        if (Object.keys(combined).length === 0) return;
        const normalized = normalizeQuote(combined);
        byId[key] = normalized;
        hasUpdates = true;
      });

      if (hasUpdates) {
        if (!areMapsEqual(pricesRef.current, byId, isSameQuote)) {
          const prevPrices = pricesRef.current;
          const changedKeys = Object.keys(byId).filter((key) => !isSameQuote(prevPrices[key], byId[key]));
          const rafBuiltTs = Date.now();

          if (
            watchlistTraceEnabledRef.current &&
            watchlistTraceCountRef.current < watchlistTraceLimitRef.current &&
            changedKeys.length > 0
          ) {
            const traceEntries = [];
            for (const key of changedKeys) {
              if (watchlistTraceCountRef.current + traceEntries.length >= watchlistTraceLimitRef.current) {
                break;
              }
              if (!shouldTraceToken(key)) continue;

              const tick = ticksMap?.get(key);
              if (!tick) continue;
              const trace = tick.__trace || {};

              const seqRaw = Number(trace.seq);
              const serverReceiveTsRaw = Number(trace.serverReceiveTs);
              const serverEmitTsRaw = Number(trace.serverEmitTs);
              const exchangeTsRaw = Number(trace.exchangeTsMs);
              const lastTradeTsRaw = Number(trace.lastTradeTsMs);
              const sourceToServerRaw = Number(trace.sourceToServerMs);
              const roomSizeAtEmitRaw = Number(trace.roomSizeAtEmit);
              const clientReceiveTsRaw = Number(tickUpdatedAtRef.current?.get(key) || 0);

              const seq = Number.isFinite(seqRaw) ? seqRaw : null;
              const serverReceiveTs = Number.isFinite(serverReceiveTsRaw) ? serverReceiveTsRaw : null;
              const serverEmitTs = Number.isFinite(serverEmitTsRaw) ? serverEmitTsRaw : null;
              const exchangeTsMs = Number.isFinite(exchangeTsRaw) ? exchangeTsRaw : null;
              const lastTradeTsMs = Number.isFinite(lastTradeTsRaw) ? lastTradeTsRaw : null;
              const sourceToServerMs = Number.isFinite(sourceToServerRaw) ? sourceToServerRaw : null;
              const roomSizeAtEmit = Number.isFinite(roomSizeAtEmitRaw) ? roomSizeAtEmitRaw : null;
              const clientReceiveTs = Number.isFinite(clientReceiveTsRaw) && clientReceiveTsRaw > 0
                ? clientReceiveTsRaw
                : null;

              let seqGap = null;
              if (seq != null) {
                const prevSeq = watchlistLastSeqByTokenRef.current.get(key);
                seqGap = prevSeq != null ? seq - prevSeq : 0;
                watchlistLastSeqByTokenRef.current.set(key, seq);
              }

              traceEntries.push({
                token: key,
                ltp: byId[key]?.ltp ?? null,
                change: byId[key]?.change ?? null,
                changePercent: byId[key]?.changePercent ?? null,
                seq,
                seqGap,
                serverReceiveTs,
                serverEmitTs,
                exchangeTsMs,
                lastTradeTsMs,
                sourceToServerMs,
                roomSizeAtEmit,
                clientReceiveTs,
                wireMs: serverEmitTs != null && clientReceiveTs != null ? clientReceiveTs - serverEmitTs : null,
                receiveToRafMs: clientReceiveTs != null ? rafBuiltTs - clientReceiveTs : null,
                sourceToRafMs: exchangeTsMs != null ? rafBuiltTs - exchangeTsMs : null,
                totalToRafMs: serverReceiveTs != null ? rafBuiltTs - serverReceiveTs : null,
                visibilityAtRaf: typeof document !== 'undefined' ? document.visibilityState : 'na',
              });
            }
            watchlistPendingRenderRef.current = traceEntries.length > 0
              ? { rafBuiltTs, entries: traceEntries }
              : null;
          } else {
            watchlistPendingRenderRef.current = null;
          }

          pricesRef.current = byId;
          setPrices(byId);
        }
      }
      lastUpdate = timestamp;

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [PRICE_THROTTLE_MS, normalizeQuote, shouldTraceToken, tickUpdatedAtRef, ticksRef]);

  useEffect(() => {
    if (!watchlistTraceEnabledRef.current) return;
    const pending = watchlistPendingRenderRef.current;
    if (!pending || !Array.isArray(pending.entries) || pending.entries.length === 0) return;

    const renderCommitTs = Date.now();
    for (const entry of pending.entries) {
      if (watchlistTraceCountRef.current >= watchlistTraceLimitRef.current) break;
      const receiveToRenderMs = entry.clientReceiveTs != null ? renderCommitTs - entry.clientReceiveTs : null;
      const totalToRenderMs = entry.serverReceiveTs != null ? renderCommitTs - entry.serverReceiveTs : null;
      const rafToRenderMs = renderCommitTs - pending.rafBuiltTs;
      const sourceToRenderMs = entry.exchangeTsMs != null ? renderCommitTs - entry.exchangeTsMs : null;
      const renderTracePayload = {
        idx: watchlistTraceCountRef.current + 1,
        ...entry,
        rafBuiltTs: pending.rafBuiltTs,
        renderCommitTs,
        rafToRenderMs,
        receiveToRenderMs,
        sourceToRenderMs,
        totalToRenderMs,
        visibilityAtRender: typeof document !== 'undefined' ? document.visibilityState : 'na',
      };
      console.log(`[WatchlistTraceJSON] ${JSON.stringify(renderTracePayload)}`);
      watchlistTraceCountRef.current += 1;
    }

    watchlistPendingRenderRef.current = null;
  }, [prices]);

  const indexCards = useMemo(() => {
    return indexInstruments.map((item) => {
      const token = String(item.instrument_token || item.instrumentToken);
      const quote = prices[token] || {};
      const tick = ticksRef.current?.get(token) || {};
      const snapshot = snapshotsRef.current[token] || {};
      const combined = { ...snapshot, ...tick };
      const close = combined.close ?? null;
      const ltp = quote.ltp ?? combined.ltp ?? null;
      const priceChange = combined.netChange
        ?? quote.change
        ?? (ltp != null && close != null ? ltp - close : null);
      const changePercent = combined.percentChange
        ?? quote.changePercent
        ?? (priceChange != null && close ? (priceChange / close) * 100 : null);

      return {
        token,
        name: item.tradingsymbol || item.name,
        symbol: item.tradingsymbol || item.name,
        exchange: item.exchange || 'NSE',
        segment: item.segment || 'INDICES',
        value: ltp,
        ltp,
        open: combined.open ?? null,
        high: combined.high ?? null,
        low: combined.low ?? null,
        close,
        priceChange,
        changePercent,
      };
    });
  }, [indexInstruments, prices, ticksRef]);

  const activeIndexCard = useMemo(
    () => indexCards.find((card) => card.token === activeIndexToken) || null,
    [activeIndexToken, indexCards]
  );
  const activeIndexNavigationStock = useMemo(() => {
    if (!activeIndexCard) return null;
    const symbol = activeIndexCard.symbol || activeIndexCard.name;
    return {
      id: activeIndexCard.token,
      symbol,
      tradingsymbol: symbol,
      name: activeIndexCard.name || symbol,
      exchange: activeIndexCard.exchange || 'NSE',
      segment: activeIndexCard.segment || 'INDICES',
      instrumentToken: activeIndexCard.token,
      instrument_token: activeIndexCard.token,
    };
  }, [activeIndexCard]);
  const activeIndexLtpData = useMemo(() => {
    if (!activeIndexCard) return null;
    return {
      ltp: activeIndexCard.ltp ?? null,
      change: activeIndexCard.priceChange ?? null,
      changePercent: activeIndexCard.changePercent ?? null,
    };
  }, [activeIndexCard]);

  useEffect(() => {
    if (!activeIndexToken) return;
    const stillExists = indexCards.some((card) => card.token === activeIndexToken);
    if (!stillExists) setActiveIndexToken(null);
  }, [activeIndexToken, indexCards]);

  useEffect(() => {
    if (!activeIndexToken) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setActiveIndexToken(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeIndexToken]);

  // Remove stock from watchlist
  const handleRemoveStock = async (stockToRemove) => {
    const symbol = stockToRemove?.symbol || '';
    const identityKey = getInstrumentIdentityKey(stockToRemove);
    if (!symbol || !identityKey) return;

    try {
      await customerApi.removeFromWatchlist(symbol, activeTab, {
        instrumentToken: stockToRemove?.instrumentToken || stockToRemove?.instrument_token || '',
        segment: stockToRemove?.segment || '',
        exchange: stockToRemove?.exchange || '',
      });
      const updated = stocks.filter((s) => getInstrumentIdentityKey(s) !== identityKey);
      const mergedWatchlists = { ...watchlists, [activeTab]: updated };
      if (selectedStock && getInstrumentIdentityKey(selectedStock) === identityKey) {
        setSelectedStock(null);
      }
      const removedToken = getMarketDepthToken(stockToRemove);
      const depthToken = getMarketDepthToken(marketDepthSheet.stock);
      if (removedToken && depthToken && removedToken === depthToken) {
        setMarketDepthSheet({ open: false, stock: null });
      }
      setWatchlists(mergedWatchlists);
      setStocks(updated);
      sessionStorage.setItem('watchlists_cache', JSON.stringify({ order: watchlistOrder, lists: mergedWatchlists }));
      sessionStorage.setItem('watchlist_cache_time', Date.now().toString());
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
    }
  };

  const handleOrderPlaced = useCallback(() => {
    // Keep local state and live subscriptions intact; avoid a full watchlist refetch.
  }, []);

  const watchlistTabs = watchlistOrder.length > 0
    ? watchlistOrder
    : (Object.keys(watchlists).length > 0 ? Object.keys(watchlists) : ['Watchlist 1']);
  const watchlistInstrumentKeys = useMemo(
    () => new Set(stocks.map((stock) => getInstrumentIdentityKey(stock)).filter(Boolean)),
    [stocks]
  );
  const isSearchActive = searchQuery.trim().length >= 2;
  const showSearchPanel = searchQuery.trim().length > 0;

  const handleStockClick = (stock) => {
    setSelectedStock(selectedStock?.id === stock.id ? null : stock);
  };

  const closeMarketDepthSheet = useCallback(() => {
    setMarketDepthSheet({ open: false, stock: null });
  }, []);

  const handleToggleMarketDepth = useCallback((stock) => {
    const token = getMarketDepthToken(stock);
    if (!token) return;
    setMarketDepthSheet((prev) => {
      const prevToken = getMarketDepthToken(prev.stock);
      if (prev.open && prevToken === token) {
        return { open: false, stock: null };
      }
      return { open: true, stock };
    });
  }, [getMarketDepthToken]);

  const openOrderSheet = (side, stock, ltpData) => {
    if (!isCustomerTradeAllowed) return;
    setOrderSheet({ open: true, side, stock, ltpData });
  };

  const closeOrderSheet = () => {
    setOrderSheet({ open: false, side: 'BUY', stock: null, ltpData: null });
  };

  const handleAddToWatchlist = async (stock) => {
    if (!stock?.symbol) return;
    const identityKey = getInstrumentIdentityKey(stock);
    if (identityKey && watchlistInstrumentKeys.has(identityKey)) return;

    try {
      await customerApi.updateWatchlist({
        action: 'add',
        symbol: stock.symbol,
        listName: activeTab,
        instrumentToken: stock.instrument_token || stock.instrumentToken,
        instrumentName: stock.name,
        exchange: stock.exchange,
        segment: stock.segment,
        instrument_type: stock.instrument_type || null,
        lot_size: stock.lot_size || null,
        expiry: stock.expiry || null,
      });

      const added = {
        id: stock.instrument_token || stock.symbol,
        symbol: stock.symbol,
        name: stock.name || stock.symbol,
        exchange: stock.exchange || 'NSE',
        segment: stock.segment || stock.exchange || null,
        instrument_type: stock.instrument_type || null,
        lot_size: stock.lot_size || null,
        expiry: stock.expiry || null,
        instrumentToken: stock.instrument_token || stock.instrumentToken,
      };

      const updated = [...stocks, added];
      const mergedWatchlists = { ...watchlists, [activeTab]: updated };
      setWatchlists(mergedWatchlists);
      setStocks(updated);
      sessionStorage.setItem('watchlists_cache', JSON.stringify({ order: watchlistOrder, lists: mergedWatchlists }));
      sessionStorage.setItem('watchlist_cache_time', Date.now().toString());
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to add to watchlist:', err);
    }
  };

  const handleCreateWatchlist = async () => {
    const maxLists = 5;
    if (watchlistTabs.length >= maxLists) return;

    const existing = new Set(watchlistTabs);
    let nextName = null;
    for (let i = 1; i <= maxLists; i += 1) {
      const candidate = `Watchlist ${i}`;
      if (!existing.has(candidate)) {
        nextName = candidate;
        break;
      }
    }

    if (!nextName) return;

    try {
      await customerApi.createWatchlist(nextName);
      const updatedOrder = [...watchlistTabs, nextName];
      const mergedWatchlists = { ...watchlists, [nextName]: [] };
      setWatchlists(mergedWatchlists);
      setWatchlistOrder(updatedOrder);
      setActiveTab(nextName);
      setStocks([]);
      sessionStorage.setItem('watchlists_cache', JSON.stringify({ order: updatedOrder, lists: mergedWatchlists }));
      sessionStorage.setItem('watchlist_cache_time', Date.now().toString());
    } catch (err) {
      console.error('Failed to create watchlist:', err);
    }
  };

  const deleteWatchlistByName = useCallback(async (tabName) => {
    if (!tabName || tabName === 'Watchlist 1') return;

    try {
      const response = await customerApi.deleteWatchlist(tabName);
      const apiWatchlists = Array.isArray(response?.watchlists) ? response.watchlists : null;

      let mergedWatchlists = { ...watchlists };
      let updatedOrder = watchlistTabs.filter((name) => name !== tabName);

      if (apiWatchlists) {
        mergedWatchlists = {};
        updatedOrder = [];
        const formattedLists = await Promise.all(
          apiWatchlists.map(async (list) => {
            const items = await formatWatchlistItems(list.instruments || []);
            return { name: list.name || 'Watchlist 1', items };
          })
        );

        formattedLists.forEach((list) => {
          mergedWatchlists[list.name] = list.items;
          updatedOrder.push(list.name);
        });
      } else {
        delete mergedWatchlists[tabName];
      }

      if (!updatedOrder.length) {
        updatedOrder = ['Watchlist 1'];
      }
      if (!mergedWatchlists['Watchlist 1']) {
        mergedWatchlists['Watchlist 1'] = [];
      }
      if (!updatedOrder.includes('Watchlist 1')) {
        updatedOrder = ['Watchlist 1', ...updatedOrder];
      }

      const nextActive = activeTab === tabName
        ? (mergedWatchlists['Watchlist 1'] ? 'Watchlist 1' : updatedOrder[0] || 'Watchlist 1')
        : (mergedWatchlists[activeTab] ? activeTab : (updatedOrder[0] || 'Watchlist 1'));

      const nextStocks = mergedWatchlists[nextActive] || [];

      setWatchlists(mergedWatchlists);
      setWatchlistOrder(updatedOrder);
      setActiveTab(nextActive);
      setStocks(nextStocks);
      setSelectedStock(null);
      setMarketDepthSheet({ open: false, stock: null });
      sessionStorage.setItem('watchlists_cache', JSON.stringify({ order: updatedOrder, lists: mergedWatchlists }));
      sessionStorage.setItem('watchlist_cache_time', Date.now().toString());
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
      throw err;
    }
  }, [activeTab, formatWatchlistItems, watchlistTabs, watchlists]);

  const getPointerCoordinates = (event) => ({
    x: Number(event?.clientX ?? 0),
    y: Number(event?.clientY ?? 0),
  });

  const handleTabPointerDown = useCallback((tabName, event) => {
    if (tabName === 'Watchlist 1') return;
    if (isDeletingWatchlist) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    clearTabLongPress();
    const { x, y } = getPointerCoordinates(event);
    tabLongPressStateRef.current = { tab: tabName, startX: x, startY: y, triggered: false };

    tabLongPressTimerRef.current = window.setTimeout(() => {
      tabLongPressStateRef.current.triggered = true;
      suppressTabClickRef.current = tabName;
      setPendingDeleteTab(tabName);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    }, WATCHLIST_TAB_LONG_PRESS_MS);
  }, [clearTabLongPress, isDeletingWatchlist]);

  const handleTabPointerMove = useCallback((tabName, event) => {
    const state = tabLongPressStateRef.current;
    if (!tabLongPressTimerRef.current) return;
    if (state.tab !== tabName) return;

    const { x, y } = getPointerCoordinates(event);
    const movedX = Math.abs(x - state.startX);
    const movedY = Math.abs(y - state.startY);
    if (movedX > WATCHLIST_TAB_LONG_PRESS_MOVE_PX || movedY > WATCHLIST_TAB_LONG_PRESS_MOVE_PX) {
      clearTabLongPress();
    }
  }, [clearTabLongPress]);

  const handleTabPointerUp = useCallback((tabName, event) => {
    const state = tabLongPressStateRef.current;
    if (state.tab !== tabName) return;

    const wasTriggered = state.triggered;
    clearTabLongPress();
    if (wasTriggered) {
      suppressTabClickRef.current = tabName;
      event.preventDefault();
      event.stopPropagation();
    }
  }, [clearTabLongPress]);

  const handleTabPointerCancel = useCallback((tabName) => {
    if (tabLongPressStateRef.current.tab !== tabName) return;
    clearTabLongPress();
  }, [clearTabLongPress]);

  const handleTabClick = useCallback((tabName) => {
    if (suppressTabClickRef.current === tabName) {
      suppressTabClickRef.current = null;
      return;
    }
    setActiveTab(tabName);
  }, []);

  const handleTabContextMenu = useCallback((tabName, event) => {
    if (tabName === 'Watchlist 1') return;
    event.preventDefault();
    event.stopPropagation();
    suppressTabClickRef.current = tabName;
    setPendingDeleteTab(tabName);
  }, []);

  const handleConfirmDeleteWatchlist = useCallback(async () => {
    if (!pendingDeleteTab || pendingDeleteTab === 'Watchlist 1' || isDeletingWatchlist) return;
    setIsDeletingWatchlist(true);
    try {
      await deleteWatchlistByName(pendingDeleteTab);
      setPendingDeleteTab(null);
    } finally {
      setIsDeletingWatchlist(false);
    }
  }, [deleteWatchlistByName, isDeletingWatchlist, pendingDeleteTab]);

  const handleCancelDeleteWatchlist = useCallback(() => {
    if (isDeletingWatchlist) return;
    setPendingDeleteTab(null);
  }, [isDeletingWatchlist]);

  return (
    <div className="relative flex min-h-screen min-h-[100dvh] w-full flex-col bg-[#f6f7f8] dark:bg-[#050806] text-[#111418] dark:text-[#e8f3ee] overflow-x-hidden">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#050806] shadow-sm">
        {/* Search Bar */}
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
          <label className="flex flex-col h-9 sm:h-10 flex-1 min-w-0">
            <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
              <div className="text-[#617589] dark:text-[#9cb7aa] flex border-none bg-[#f0f2f4] dark:bg-[#0b120f] items-center justify-center pl-3 sm:pl-4 rounded-l-lg">
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
              </div>
              <input
                className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-[#111418] dark:text-[#e8f3ee] focus:outline-0 focus:ring-0 border-none bg-[#f0f2f4] dark:bg-[#0b120f] h-full placeholder:text-[#617589] dark:placeholder:text-gray-500 px-2 sm:px-3 rounded-l-none text-sm font-normal"
                placeholder="Search & Add"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </label>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex shrink-0 items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-[#eaf4ff] dark:bg-[#16231d] text-[#137fec] dark:text-[#34d399] hover:opacity-80 transition-opacity"
          >
            {authUser?.profilePhoto ? (
              <img
                src={authUser.profilePhoto}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">person</span>
            )}
          </button>
        </div>

        {/* Index Cards */}
        <div className="flex px-3 sm:px-4 gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-2">
          {indexCards.length === 0 ? (
            <>
              <div className="flex min-w-[120px] sm:min-w-[140px] flex-1 flex-col justify-center gap-1 rounded-lg p-2.5 sm:p-3 border border-[#dbe0e6] dark:border-[#22352d] bg-white dark:bg-[#111b17] shadow-sm animate-pulse">
                <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-14 sm:w-16"></div>
                <div className="h-4 sm:h-5 bg-gray-200 rounded w-20 sm:w-24 mt-1"></div>
                <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-16 sm:w-20 mt-1"></div>
              </div>
              <div className="flex min-w-[120px] sm:min-w-[140px] flex-1 flex-col justify-center gap-1 rounded-lg p-2.5 sm:p-3 border border-[#dbe0e6] dark:border-[#22352d] bg-white dark:bg-[#111b17] shadow-sm animate-pulse">
                <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-14 sm:w-16"></div>
                <div className="h-4 sm:h-5 bg-gray-200 rounded w-20 sm:w-24 mt-1"></div>
                <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-16 sm:w-20 mt-1"></div>
              </div>
            </>
          ) : (
            indexCards.map((index) => {
              const isPositive = (index.priceChange ?? 0) >= 0;
              const isActive = activeIndexToken === index.token;
              return (
                <button
                  key={index.token || index.name}
                  type="button"
                  onClick={() => setActiveIndexToken((prev) => (prev === index.token ? null : index.token))}
                  className={`flex min-w-[160px] sm:min-w-[180px] flex-1 flex-col justify-center gap-0.5 sm:gap-1 rounded-lg p-2.5 sm:p-3 border text-left bg-white dark:bg-[#111b17] shadow-sm transition-colors ${
                    isActive
                      ? 'border-[#137fec] dark:border-[#10b981]'
                      : 'border-[#dbe0e6] dark:border-[#22352d] hover:bg-[#f7fafc] dark:hover:bg-[#16231d]'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">
                        {index.name}
                      </p>
                    </div>
                    <span className={`material-symbols-outlined ${isPositive ? 'text-[#078838]' : 'text-red-500'} text-[14px] sm:text-[16px]`}>
                      {isPositive ? 'trending_up' : 'trending_down'}
                    </span>
                  </div>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-base sm:text-lg font-bold leading-tight tabular-nums">
                    {formatIndexNumber(index.value)}
                  </p>
                  <p className={`${isPositive ? 'text-[#078838]' : 'text-red-500'} text-[10px] sm:text-xs font-medium leading-normal tabular-nums`}>
                    {formatIndexSignedNumber(index.priceChange)} ({formatIndexSignedNumber(index.changePercent)}%)
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Search Results Panel */}
      {showSearchPanel && (
        <div className="flex-1 px-2 sm:px-3 pb-20 pt-2">
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#111418]"></div>
              <span className="ml-3 text-[#617589] text-sm">Searching...</span>
            </div>
          )}

          {!isSearching && searchQuery.trim().length < 2 && (
            <p className="text-center text-[#617589] text-sm py-6">
              Type at least 2 characters to search
            </p>
          )}

          {!isSearching && isSearchActive && searchResults && searchResults.length === 0 && (
            <p className="text-center text-[#617589] text-sm py-6">
              No symbols matched your search.
            </p>
          )}

          {!isSearching && isSearchActive && searchResults && searchResults.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:gap-2">
              {searchResults.map((stock) => {
                const priceData = livePrices[stock.id] || {};
                const ltp = priceData.ltp;
                const percentChange = priceData.percentChange;
                const isPositive = percentChange != null ? percentChange >= 0 : null;
                const inWatchlist = watchlistInstrumentKeys.has(getInstrumentIdentityKey(stock));
                return (
                  <div
                    key={stock.id}
                    className="flex items-center justify-between p-3 sm:p-4 bg-white dark:bg-[#111b17] rounded-xl border border-gray-100 dark:border-[#22352d]"
                  >
                    <div className="flex flex-col min-w-0 flex-1 pr-3">
                      <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-semibold truncate">{stock.symbol}</p>
                      <p className="text-[#617589] dark:text-[#9cb7aa] text-xs truncate">
                        {stock.displayExchange || stock.exchange || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold tabular-nums">
                          {ltp != null ? `₹${ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                        </p>
                        <p className={`${isPositive === null ? 'text-[#617589]' : isPositive ? 'text-[#078838]' : 'text-red-500'} text-[10px] sm:text-xs font-medium tabular-nums`}>
                          {percentChange != null ? `${isPositive ? '+' : ''}${percentChange.toFixed(2)}%` : '—'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddToWatchlist(stock)}
                        disabled={inWatchlist}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                          inWatchlist
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-[#eaf4ff] dark:bg-[#16231d] text-[#137fec] dark:text-[#34d399] hover:bg-[#dbeeff] dark:hover:bg-[#1e2f28]'
                        }`}
                      >
                        {inWatchlist ? 'ADDED' : 'ADD'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Admin Warning Banner (inline) */}
      {!showSearchPanel && <InlineWarningBanner />}

      {/* Watchlist Tabs */}
      {!showSearchPanel && (
        <div className="flex px-3 sm:px-4 gap-1.5 sm:gap-2 py-2 sm:py-3 overflow-x-auto no-scrollbar bg-[#f6f7f8] dark:bg-[#050806]">
          {watchlistTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                type="button"
                key={tab}
                onClick={() => handleTabClick(tab)}
                onPointerDown={(event) => handleTabPointerDown(tab, event)}
                onPointerMove={(event) => handleTabPointerMove(tab, event)}
                onPointerUp={(event) => handleTabPointerUp(tab, event)}
                onPointerCancel={() => handleTabPointerCancel(tab)}
                onPointerLeave={() => handleTabPointerCancel(tab)}
                onContextMenu={(event) => handleTabContextMenu(tab, event)}
                title={tab === 'Watchlist 1' ? tab : `${tab} (hold to delete)`}
                className={`flex shrink-0 items-center rounded-full h-7 sm:h-8 text-xs sm:text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#137fec] dark:bg-[#10b981] text-white'
                    : 'bg-white dark:bg-[#0b120f] text-[#617589] dark:text-[#9cb7aa] border border-[#dbe0e6] dark:border-[#22352d] hover:bg-gray-50 dark:hover:bg-[#16231d]'
                }`}
              >
                <span className="px-3 sm:px-4">{tab}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleCreateWatchlist}
            className="flex shrink-0 items-center justify-center rounded-full px-2.5 sm:px-3 h-7 sm:h-8 text-sm font-medium bg-white dark:bg-[#0b120f] text-[#617589] dark:text-[#9cb7aa] border border-dashed border-[#dbe0e6] dark:border-[#22352d] hover:bg-gray-50 dark:hover:bg-[#16231d]"
          >
            <span className="material-symbols-outlined text-[16px] sm:text-[18px]">add</span>
          </button>
        </div>
      )}

      {/* Stock List */}
      {!showSearchPanel && (
        <div className="flex-1 px-2 sm:px-3 pb-20">
          {loading ? (
          <div className="flex flex-col gap-1.5 sm:gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 sm:p-4 bg-white dark:bg-[#111b17] rounded-xl border border-gray-100 dark:border-[#22352d] animate-pulse">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <div className="h-3.5 sm:h-4 bg-gray-200 rounded w-20 sm:w-24"></div>
                  <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-14 sm:w-16"></div>
                </div>
                <div className="flex flex-col items-end gap-1.5 sm:gap-2">
                  <div className="h-3.5 sm:h-4 bg-gray-200 rounded w-16 sm:w-20"></div>
                  <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-12 sm:w-14"></div>
                </div>
              </div>
            ))}
          </div>
        ) : stocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
            <span className="material-symbols-outlined text-[48px] sm:text-[64px] text-gray-300 mb-3 sm:mb-4">bookmark_border</span>
            <p className="text-[#111418] dark:text-[#e8f3ee] text-base sm:text-lg font-semibold mb-1.5 sm:mb-2 text-center">No stocks in watchlist</p>
            <p className="text-[#617589] text-xs sm:text-sm text-center">Search and add stocks to track them here</p>
          </div>
        ) : (
          stocks.map((stock) => {
            const tokenKey = stock.instrumentToken ? String(stock.instrumentToken) : stock.symbol;
            const quote = prices[tokenKey] || {};
            const ltp = quote.ltp ?? stock.ltp;
            const change = quote.change ?? stock.change;
            const changePercent = quote.changePercent ?? stock.changePercent;
            const ohlc = getOhlcData(stock);
            const isPositive = change >= 0;
            const isSelected = selectedStock?.id === stock.id;
            const isOption = isOptionInstrument(stock);
            const depthToken = getMarketDepthToken(stock);
            const isDepthOpenForStock =
              marketDepthSheet.open && getMarketDepthToken(marketDepthSheet.stock) === depthToken;
            return (
              <div
                key={stock.id}
                onClick={() => handleStockClick(stock)}
                className={`mb-1.5 sm:mb-2 rounded-xl overflow-hidden bg-white dark:bg-[#111b17] border transition-all cursor-pointer ${
                  isSelected ? 'border-[#137fec] shadow-md' : 'border-gray-100 dark:border-[#22352d]'
                }`}
              >
                <div className="flex items-center justify-between p-3 sm:p-4 min-h-[60px] sm:min-h-[72px]">
                  <div className="flex flex-col min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-semibold truncate">{stock.symbol}</p>
                      <span className="bg-gray-100 dark:bg-[#0b120f] text-[#617589] text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shrink-0">{stock.exchange}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa] truncate mt-0.5">
                      {stock.name || stock.symbol}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold tabular-nums">₹{ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <p className={`${isPositive ? 'text-[#078838]' : 'text-red-500'} text-[10px] sm:text-xs font-medium tabular-nums`}>
                      {isPositive ? '+' : ''}{change?.toFixed(2)} ({isPositive ? '+' : ''}{changePercent?.toFixed(2)}%)
                    </p>
                  </div>
                </div>
                {isSelected && (
                  <div className="border-t border-gray-100 dark:border-[#22352d]">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 py-2 border-b border-gray-100 dark:border-[#22352d] bg-[#f6f7f8] dark:bg-[#16231d] text-[9px] sm:text-[10px]">
                      <div className="flex flex-col">
                        <span className="text-[#7a8996] uppercase tracking-[0.04em] font-medium">Open</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums leading-tight">
                          {formatPrice(ohlc.open)}
                        </span>
                      </div>
                      <div className="flex flex-col items-start sm:items-center">
                        <span className="text-[#7a8996] uppercase tracking-[0.04em] font-medium">High</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums leading-tight">
                          {formatPrice(ohlc.high)}
                        </span>
                      </div>
                      <div className="flex flex-col items-start sm:items-center">
                        <span className="text-[#7a8996] uppercase tracking-[0.04em] font-medium">Low</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums leading-tight">
                          {formatPrice(ohlc.low)}
                        </span>
                      </div>
                      <div className="flex flex-col items-start sm:items-end">
                        <span className="text-[#7a8996] uppercase tracking-[0.04em] font-medium">Close</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums leading-tight">
                          {formatPrice(ohlc.close)}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 dark:border-[#22352d] px-3 sm:px-4 pt-2.5 pb-3.5">
                      {isCustomerTradeAllowed ? (
                        <div className="grid grid-cols-2 gap-2.5 w-full">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openOrderSheet('BUY', stock, { ltp, change, changePercent });
                            }}
                            className="h-10 w-full px-3 text-center text-sm font-semibold text-white bg-[#137fec] hover:bg-[#0f6fcf] rounded-xl shadow-sm transition-colors"
                          >
                            BUY
                          </button>
                          <button
                            type="button"
                            disabled={isOption}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (isOption) return;
                              openOrderSheet('SELL', stock, { ltp, change, changePercent });
                            }}
                            className={`h-10 w-full px-3 text-center text-sm font-semibold rounded-xl shadow-sm transition-colors ${
                              isOption
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'text-white bg-red-500 hover:bg-red-600'
                            }`}
                          >
                            {isOption && (
                              <span className="material-symbols-outlined text-[14px] align-[-2px] mr-1">lock</span>
                            )}
                            SELL
                          </button>
                        </div>
                      ) : (
                        <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          {marketClosedReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-[#22352d] bg-white dark:bg-[#111b17]">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate('/chart', {
                              state: {
                                stock,
                                ltpData: { ltp, change, changePercent },
                              },
                            });
                          }}
                          className="flex items-center gap-2 text-[11px] font-medium text-[#617589] hover:text-[#137fec]"
                        >
                          <span className="material-symbols-outlined text-[16px]">show_chart</span>
                          Chart
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate('/option-chain', {
                              state: {
                                stock,
                                ltpData: { ltp, change, changePercent },
                              },
                            });
                          }}
                          className="flex items-center gap-2 text-[11px] font-medium text-[#617589] hover:text-[#137fec]"
                        >
                          <span className="material-symbols-outlined text-[16px]">list_alt</span>
                          Option Chain
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleMarketDepth(stock);
                          }}
                          className={`flex items-center gap-2 text-[11px] font-medium ${
                            isDepthOpenForStock ? 'text-[#137fec]' : 'text-[#617589]'
                          } hover:text-[#137fec]`}
                        >
                          <span className="material-symbols-outlined text-[16px]">layers</span>
                          Market Depth
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveStock(stock);
                        }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-red-500 hover:text-red-600"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        </div>
      )}
      {pendingDeleteTab && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          onClick={handleCancelDeleteWatchlist}
        >
          <div
            className="w-full max-w-[320px] rounded-2xl border border-[#dbe0e6] dark:border-[#22352d] bg-white dark:bg-[#111b17] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#edf0f3] dark:border-[#22352d]">
              <p className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">Delete Watchlist</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-[#617589] dark:text-[#9cb7aa]">
                Delete <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">{pendingDeleteTab}</span>? This cannot be undone.
              </p>
            </div>
            <div className="px-3 pb-3 pt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelDeleteWatchlist}
                disabled={isDeletingWatchlist}
                className="h-8 px-3 rounded-lg text-xs font-medium border border-[#dbe0e6] dark:border-[#22352d] text-[#617589] dark:text-[#9cb7aa] hover:bg-[#f6f7f8] dark:hover:bg-[#16231d] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteWatchlist}
                disabled={isDeletingWatchlist}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60"
              >
                {isDeletingWatchlist ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {marketDepthSheet.open && marketDepthSheet.stock && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={closeMarketDepthSheet}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full rounded-t-2xl border-t border-[#dbe0e6] dark:border-[#22352d] bg-white dark:bg-[#111b17] shadow-2xl max-h-[75vh] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-[#dbe0e6] dark:bg-[#22352d]" />
            <div className="px-4 pb-3 pt-2 border-b border-[#dbe0e6] dark:border-[#22352d] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-semibold truncate">
                  {marketDepthSheet.stock.symbol || marketDepthSheet.stock.name}
                </p>
                <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa]">
                  {(marketDepthSheet.stock.exchange || marketDepthSheet.stock.segment || 'NSE').toUpperCase()} · Live Depth
                </p>
              </div>
              <button
                type="button"
                onClick={closeMarketDepthSheet}
                className="h-8 w-8 rounded-full border border-[#dbe0e6] dark:border-[#22352d] text-[#617589] dark:text-[#9cb7aa] flex items-center justify-center"
                aria-label="Close market depth"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(75vh-64px)]">
              <MarketDepthView data={getDepthData(marketDepthSheet.stock)} />
            </div>
          </div>
        </div>
      )}
      {activeIndexCard && activeIndexNavigationStock && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          onClick={() => setActiveIndexToken(null)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full rounded-t-2xl border-t border-[#dbe0e6] dark:border-[#22352d] bg-white dark:bg-[#111b17] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-[#dbe0e6] dark:bg-[#22352d]" />
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-semibold truncate">
                    {activeIndexCard.name}
                  </p>
                  <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa]">
                    {activeIndexNavigationStock.exchange} · {activeIndexNavigationStock.segment}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveIndexToken(null)}
                  className="h-8 w-8 rounded-full border border-[#dbe0e6] dark:border-[#22352d] text-[#617589] dark:text-[#9cb7aa] flex items-center justify-center"
                  aria-label="Close index details"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="mt-3">
                <p className="text-[#111418] dark:text-[#e8f3ee] text-2xl font-bold tabular-nums leading-none">
                  {formatIndexNumber(activeIndexCard.value)}
                </p>
                <p className={`${(activeIndexCard.priceChange ?? 0) >= 0 ? 'text-[#078838]' : 'text-red-500'} mt-1 text-sm font-medium tabular-nums`}>
                  {formatIndexSignedNumber(activeIndexCard.priceChange)} ({formatIndexSignedNumber(activeIndexCard.changePercent)}%)
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5e9ee] dark:border-[#22352d] bg-[#f6f7f8] dark:bg-[#16231d] p-3 text-[11px] sm:text-xs">
                <p className="text-[#617589] dark:text-[#9cb7aa]">
                  Open: <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{formatIndexNumber(activeIndexCard.open)}</span>
                </p>
                <p className="text-[#617589] dark:text-[#9cb7aa]">
                  High: <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{formatIndexNumber(activeIndexCard.high)}</span>
                </p>
                <p className="text-[#617589] dark:text-[#9cb7aa]">
                  Low: <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{formatIndexNumber(activeIndexCard.low)}</span>
                </p>
                <p className="text-[#617589] dark:text-[#9cb7aa]">
                  Close: <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{formatIndexNumber(activeIndexCard.close)}</span>
                </p>
                <p className="col-span-2 text-[#617589] dark:text-[#9cb7aa]">
                  Price Chg: <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{formatIndexSignedNumber(activeIndexCard.priceChange)}</span>
                </p>
              </div>

              <div className="mt-4 flex items-center gap-4 border-t border-[#e5e9ee] dark:border-[#22352d] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndexToken(null);
                    navigate('/chart', {
                      state: {
                        stock: activeIndexNavigationStock,
                        ltpData: activeIndexLtpData,
                      },
                    });
                  }}
                  className="flex items-center gap-2 text-[11px] font-medium text-[#617589] hover:text-[#137fec]"
                >
                  <span className="material-symbols-outlined text-[16px]">show_chart</span>
                  Chart
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndexToken(null);
                    navigate('/option-chain', {
                      state: {
                        stock: activeIndexNavigationStock,
                        ltpData: activeIndexLtpData,
                      },
                    });
                  }}
                  className="flex items-center gap-2 text-[11px] font-medium text-[#617589] hover:text-[#137fec]"
                >
                  <span className="material-symbols-outlined text-[16px]">list_alt</span>
                  Option Chain
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <OrderBottomSheet
        isOpen={orderSheet.open}
        side={orderSheet.side}
        stock={orderSheet.stock}
        ltpData={orderSheet.ltpData}
        ticksRef={ticksRef}
        tickUpdatedAtRef={tickUpdatedAtRef}
        onClose={closeOrderSheet}
        onOrderPlaced={handleOrderPlaced}
        disableTrading={!isCustomerTradeAllowed}
        disableReason={marketClosedReason}
      />
    </div>
  );
};

export default Watchlist;
