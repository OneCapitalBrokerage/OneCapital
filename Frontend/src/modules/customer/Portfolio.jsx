import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import { calculateOpenPnL, calculateClosedPnL } from '../../utils/calculateBrokerage';
import { useMarketData } from '../../context/SocketContext';
import ModifyOrderSheet from './ModifyOrderSheet';
import OrderDetailSheet from './OrderDetailSheet';
import ExitOrderSheet from './ExitOrderSheet';
import useCustomerTradingGate from '../../hooks/useCustomerTradingGate';
import { useAuth } from '../../context/AuthContext';
import { readSessionCache, writeSessionCache, clearSessionCache } from '../../utils/sessionCache';

const PORTFOLIO_CACHE_KEY = 'portfolio_tab_v2';
const PORTFOLIO_CACHE_TTL_MS = 30 * 1000;
const PORTFOLIO_REVALIDATE_AFTER_MS = 5 * 1000;
const LIVE_TICK_MAX_AGE_MS = 3 * 1000;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const readNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getOrderBrokerage = (order) => {
  const breakdown = order?.brokerage_breakdown || {};
  return {
    entry: readNumber(breakdown?.entry?.amount),
    exit: readNumber(breakdown?.exit?.amount),
    total: readNumber(order?.brokerage ?? breakdown?.total),
  };
};

const getEffectiveEntryPrice = (order) =>
  toNumber(order?.effective_entry_price ?? order?.price);

const getEffectiveExitPrice = (order, fallback = 0) =>
  toNumber(
    order?.effective_exit_price ??
      order?.closed_ltp ??
      order?.exit_price ??
      fallback ??
      getEffectiveEntryPrice(order)
  );

const canUseStoredRealizedPnl = (order) => {
  const hasPricingAudit =
    String(order?.settlement_status || '').toLowerCase() === 'settled' ||
    !!order?.brokerage_breakdown ||
    readNumber(order?.effective_exit_price) !== null ||
    readNumber(order?.raw_exit_price) !== null;
  return hasPricingAudit && readNumber(order?.realized_pnl) !== null;
};

const resolveOrderPnl = ({ order, isClosed, ltp }) => {
  const side = String(order?.side || 'BUY').toUpperCase();
  const qty = toNumber(order?.qty ?? order?.quantity);
  const entryPrice = getEffectiveEntryPrice(order);
  const { entry: entryBrokerage, exit: exitBrokerage, total: totalBrokerage } = getOrderBrokerage(order);
  const openEntryBrokerage = entryBrokerage != null ? entryBrokerage : totalBrokerage;

  if (!isClosed) {
    return calculateOpenPnL({
      side,
      avgPrice: entryPrice,
      ltp,
      qty,
      entryBrokerage: openEntryBrokerage,
    });
  }

  const exitPrice = getEffectiveExitPrice(order, ltp);
  const calculated = calculateClosedPnL({
    side,
    avgPrice: entryPrice,
    exitPrice,
    qty,
    entryBrokerage,
    exitBrokerage,
    totalBrokerage,
  });

  if (!canUseStoredRealizedPnl(order)) return calculated;
  const realizedPnl = readNumber(order?.realized_pnl);

  const pct = entryPrice * qty ? (realizedPnl / (entryPrice * qty)) * 100 : 0;
  return {
    ...calculated,
    netPnl: realizedPnl,
    pct,
  };
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatIstDateOnly = (value) => {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const formatCurrency = (value) =>
  `₹${Math.abs(toNumber(value)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatSignedCurrency = (value) => {
  const n = toNumber(value);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${formatCurrency(n)}`;
};

const formatSignedPercent = (value) => {
  const n = toNumber(value);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toFixed(2)}%`;
};

const isActionableOrderRow = (order) => {
  if (!order?.id) return false;
  const rowType = String(order?._rowType || '').toUpperCase();
  if (rowType) return rowType === 'ORDER';
  return String(order?.source || '').toLowerCase() === 'order';
};
const isLongTermProduct = (product) => ['CNC', 'NRML'].includes(String(product || '').toUpperCase());

const isWithinFilter = ({ date, filter, customFrom, customTo, sessionBoundaryStart }) => {
  if (filter === 'all') return true;

  const effectiveDate = parseDate(date);
  if (!effectiveDate) return false;

  const now = new Date();
  let from = null;
  let to = endOfDay(now);

  if (filter === 'today') {
    from = startOfDay(now);
  } else if (filter === 'session') {
    const parsedBoundary = parseDate(sessionBoundaryStart);
    if (parsedBoundary) {
      from = parsedBoundary;
    } else {
      const monday = new Date(now);
      const day = monday.getDay();
      const daysSinceMonday = (day + 6) % 7;
      monday.setDate(monday.getDate() - daysSinceMonday);
      from = startOfDay(monday);
    }
  } else if (filter === 'last7') {
    from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  } else if (filter === 'last30') {
    from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  } else if (filter === 'custom') {
    from = customFrom ? startOfDay(customFrom) : null;
    to = customTo ? endOfDay(customTo) : null;
    if (!from || !to) return true;
  }

  if (!from || !to) return true;
  return effectiveDate >= from && effectiveDate <= to;
};

const sanitizeCachedPortfolioRow = (item) => {
  if (item?.isClosed) return item;
  return {
    ...item,
    ltp: null,
    last_price: null,
    pnl: null,
    pnlPercent: null,
  };
};

const sanitizePortfolioStateForCache = (state) => ({
  allPositions: (state?.allPositions || []).map(sanitizeCachedPortfolioRow),
  allHoldings: (state?.allHoldings || []).map(sanitizeCachedPortfolioRow),
  allOrdersTotalValue: toNumber(state?.allOrdersTotalValue),
  sessionBoundaryStart: state?.sessionBoundaryStart || '',
  sessionBoundaryType: state?.sessionBoundaryType || 'trading_week_start',
});

const Portfolio = () => {
  const navigate = useNavigate();
  const { ticksRef, tickUpdatedAtRef, subscribe, unsubscribe, isConnected } = useMarketData();
  const { isCustomerTradeAllowed, marketClosedReason } = useCustomerTradingGate();
  const { user } = useAuth();
  const holdingsExitAllowed = user?.holdingsExitAllowed === true;
  const [activeTab, setActiveTab] = useState('positions');
  const [selectedFilter, setSelectedFilter] = useState('session');
  const [listFilter, setListFilter] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sessionBoundaryStart, setSessionBoundaryStart] = useState('');
  const [, setSessionBoundaryType] = useState('trading_week_start');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [livePrices, setLivePrices] = useState({});
  const [modifyOrder, setModifyOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailTab, setDetailTab] = useState('open');
  const [exitOrder, setExitOrder] = useState(null);
  const [exitSheetVersion, setExitSheetVersion] = useState(0);
  const [exitSubmitting, setExitSubmitting] = useState(false);
  const [exitError, setExitError] = useState(null);

  const [allHoldings, setAllHoldings] = useState([]);
  const [allPositions, setAllPositions] = useState([]);
  const [, setAllOrdersTotalValue] = useState(0);
  const subscribedTokensRef = useRef(new Set());
  const prevLivePricesRef = useRef({});
  const hasConnectedOnceRef = useRef(false);

  const filterOptions = [
    { key: 'session', label: 'This Week' },
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Today' },
    { key: 'last7', label: 'Last 7 Days' },
    { key: 'last30', label: 'Last 30 Days' },
    { key: 'custom', label: 'Custom' },
  ];

  const applyPortfolioState = useCallback((nextState) => {
    setAllPositions(nextState?.allPositions || []);
    setAllHoldings(nextState?.allHoldings || []);
    setAllOrdersTotalValue(nextState?.allOrdersTotalValue || 0);
    setSessionBoundaryStart(nextState?.sessionBoundaryStart || '');
    setSessionBoundaryType(nextState?.sessionBoundaryType || 'trading_week_start');
  }, []);

  const fetchPortfolio = useCallback(async (options = {}) => {
    const { force = false } = options;
    let shouldShowLoading = true;
    let skipNetworkFetch = false;

    if (!force) {
      const cached = readSessionCache(PORTFOLIO_CACHE_KEY, PORTFOLIO_CACHE_TTL_MS);
      if (cached?.data) {
        applyPortfolioState(cached.data);
        setError(null);
        setLoading(false);
        shouldShowLoading = false;
        if (cached.ageMs < PORTFOLIO_REVALIDATE_AFTER_MS) {
          skipNetworkFetch = true;
        }
      }
    } else {
      clearSessionCache(PORTFOLIO_CACHE_KEY);
    }

    if (skipNetworkFetch) return;

    if (shouldShowLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const [ordersRes, holdingsRes, balanceRes] = await Promise.all([
        customerApi.getOrders(),
        customerApi.getHoldings().catch(() => ({ holdings: [] })),
        customerApi.getBalance().catch(() => ({})),
      ]);

      const allOrders = ordersRes.orders || ordersRes.data || [];
      const holdingsData = holdingsRes.holdings || holdingsRes.data || [];
      const boundaryStart = balanceRes?.summary?.weekBoundaryStart
        || balanceRes?.settlement?.boundaryStart
        || '';
      const boundaryType = balanceRes?.summary?.weekBoundaryType
        || balanceRes?.settlement?.boundaryType
        || 'trading_week_start';

      const hiddenStatuses = new Set(['CANCELLED', 'REJECTED']);
      const pendingStatuses = new Set(['PENDING', 'HOLD']);
      const closedStatuses = new Set(['CLOSED', 'EXPIRED']);
      const longTermProducts = new Set(['CNC', 'NRML']);

      const normalizedOrders = allOrders.map((order, index) => {
        const status = (order.status || order.order_status || '').toUpperCase();
        const product = (order.product || '').toUpperCase();
        const side = (order.side || '').toUpperCase();
        const qty = toNumber(order.quantity);
        const avgPrice = getEffectiveEntryPrice(order);
        const ltp = toNumber(order.ltp ?? order.last_price ?? order.effective_entry_price ?? order.price);
        const placedAtRaw = order.placedAt || order.placed_at || order.createdAt || order.updatedAt;
        const placedAtDate = parseDate(placedAtRaw);
        const exitAtRaw = order.exit_at || order.closed_at;
        const exitAtDate = parseDate(exitAtRaw);
        const isClosed = closedStatuses.has(status);
        const id = order.id || order._id || `${order.symbol || 'order'}-${index}`;

        return {
          ...order,
          _rowType: 'ORDER',
          id,
          symbol: order.symbol,
          exchange: order.exchange || 'NSE',
          instrument_token: order.instrument_token ?? order.instrumentToken,
          instrumentToken: order.instrumentToken ?? order.instrument_token,
          quantity: qty,
          price: avgPrice,
          side,
          qty,
          avgPrice,
          ltp,
          status,
          order_status: status,
          product,
          placedAt: placedAtRaw,
          placedAtDate,
          exitAtDate,
          // For filtering: closed orders use exit date, open orders use placed date
          filterDate: isClosed ? (exitAtDate || placedAtDate) : placedAtDate,
          isClosed,
          exitReason: order.exit_reason || null,
          raw_entry_price: toNumber(order.raw_entry_price),
          effective_entry_price: avgPrice,
          raw_exit_price: toNumber(order.raw_exit_price),
          effective_exit_price: toNumber(order.effective_exit_price),
          brokerage: toNumber(order.brokerage),
          brokerage_breakdown: order.brokerage_breakdown || null,
          realized_pnl: readNumber(order.realized_pnl),
          settlement_status: order.settlement_status || null,
        };
      });

      const mappedPositions = normalizedOrders
        .filter((order) => order.product === 'MIS' && !hiddenStatuses.has(order.status) && !pendingStatuses.has(order.status))
        .map((order) => {
          if (order.isClosed) {
            const exitPrice = getEffectiveExitPrice(order, order.ltp);
            const pnlData = resolveOrderPnl({
              order,
              isClosed: true,
              ltp: exitPrice,
            });
            return {
              ...order,
              _rowType: 'ORDER',
              ltp: exitPrice,
              pnl: pnlData.netPnl,
              pnlPercent: pnlData.pct,
              source: 'order',
            };
          }

          const pnlData = resolveOrderPnl({
            order,
            isClosed: false,
            ltp: order.ltp,
          });
          return {
            ...order,
            _rowType: 'ORDER',
            pnl: pnlData.netPnl,
            pnlPercent: pnlData.pct,
            source: 'order',
          };
        });

      const holdingsFromOrders = normalizedOrders
        .filter(
          (order) =>
            longTermProducts.has(order.product) &&
            !hiddenStatuses.has(order.status)
        )
        .map((order) => {
          const isClosed = closedStatuses.has(order.status);

          if (isClosed) {
            const exitPrice = getEffectiveExitPrice(order, order.ltp);
            const pnlData = resolveOrderPnl({
              order: { ...order, side: order.side || 'BUY' },
              isClosed: true,
              ltp: exitPrice,
            });
            return {
              ...order,
              _rowType: 'ORDER',
              id: order.id,
              symbol: order.symbol,
              exchange: order.exchange,
              instrument_token: order.instrument_token,
              instrumentToken: order.instrumentToken,
              side: order.side || 'BUY',
              qty: order.qty,
              avgPrice: order.avgPrice,
              ltp: exitPrice,
              pnl: pnlData.netPnl,
              pnlPercent: pnlData.pct,
              status: order.status,
              order_status: order.status,
              product: order.product,
              placedAtDate: order.placedAtDate,
              exitAtDate: order.exitAtDate,
              filterDate: order.filterDate,
              exitReason: order.exitReason,
              isClosed: true,
              source: 'order',
            };
          }

          const pnlData = resolveOrderPnl({
            order: { ...order, side: order.side || 'BUY' },
            isClosed: false,
            ltp: order.ltp,
          });

          return {
            ...order,
            _rowType: 'ORDER',
            id: order.id,
            symbol: order.symbol,
            exchange: order.exchange,
            instrument_token: order.instrument_token,
            instrumentToken: order.instrumentToken,
            side: order.side || 'BUY',
            qty: order.qty,
            avgPrice: order.avgPrice,
            ltp: order.ltp,
            pnl: pnlData.netPnl,
            pnlPercent: pnlData.pct,
            status: order.status,
            order_status: order.status,
            product: order.product,
            placedAtDate: order.placedAtDate,
            filterDate: order.filterDate,
            isClosed: false,
            source: 'order',
          };
        });

      const holdingsFromApi = holdingsData.map((holding, index) => {
        const avgPrice = toNumber(holding.averagePrice ?? holding.avg_price);
        const ltp = toNumber(holding.currentPrice ?? holding.ltp ?? holding.last_price ?? avgPrice);
        const qty = toNumber(holding.quantity);
        const pnlData = calculateOpenPnL({ side: 'BUY', avgPrice, ltp, qty });
        const id = holding.id || holding._id || `${holding.symbol || 'holding'}-${index}`;

        return {
          ...holding,
          _rowType: 'HOLDING',
          id,
          symbol: holding.symbol,
          exchange: holding.exchange || 'NSE',
          instrument_token: holding.instrument_token ?? holding.instrumentToken,
          instrumentToken: holding.instrumentToken ?? holding.instrument_token,
          side: 'BUY',
          quantity: qty,
          price: avgPrice,
          qty,
          avgPrice,
          ltp,
          pnl: pnlData.netPnl,
          pnlPercent: pnlData.pct,
          status: 'HOLDING',
          product: (holding.product || 'CNC').toUpperCase(),
          placedAtDate: parseDate(holding.placed_at || holding.createdAt || holding.updatedAt),
          source: 'api',
        };
      });

      const dedupedHoldings = [];
      const seen = new Set();
      const holdingKey = (item) => {
        const symbolKey = `${String(item.symbol || '').toUpperCase()}|${String(item.exchange || '').toUpperCase()}|${String(item.product || '').toUpperCase()}`;
        if (symbolKey !== '||') return `sym:${symbolKey}`;
        return item.id ? `id:${item.id}` : '';
      };

      holdingsFromOrders.forEach((item) => {
        const key = holdingKey(item);
        if (!key) return;
        if (seen.has(key)) return;
        seen.add(key);
        dedupedHoldings.push(item);
      });

      holdingsFromApi.forEach((item) => {
        const key = holdingKey(item);
        if (!key) return;
        if (seen.has(key)) return;
        seen.add(key);
        dedupedHoldings.push(item);
      });

      const totalOrderValue = [...mappedPositions, ...holdingsFromOrders].reduce(
        (sum, item) => sum + toNumber(item.avgPrice) * toNumber(item.qty),
        0
      );

      const nextState = {
        allPositions: mappedPositions,
        allHoldings: dedupedHoldings,
        allOrdersTotalValue: totalOrderValue,
        sessionBoundaryStart: boundaryStart,
        sessionBoundaryType: boundaryType,
      };
      applyPortfolioState(nextState);
      writeSessionCache(PORTFOLIO_CACHE_KEY, sanitizePortfolioStateForCache(nextState));
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
      setError(err.message || 'Failed to load portfolio');
      setAllOrdersTotalValue(0);
    } finally {
      if (shouldShowLoading) {
        setLoading(false);
      }
    }
  }, [applyPortfolioState]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    if (!isConnected) return;
    if (!hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      return;
    }
    fetchPortfolio({ force: true });
  }, [fetchPortfolio, isConnected]);

  const liveTokens = useMemo(() => {
    const tokens = [...allPositions, ...allHoldings]
      .filter((item) => !item.isClosed)
      .map((item) => item.instrument_token || item.instrumentToken)
      .filter((token) => token != null && token !== '')
      .map((token) => String(token));

    return Array.from(new Set(tokens));
  }, [allPositions, allHoldings]);

  useEffect(() => {
    const nextSet = new Set(liveTokens);
    const previousSet = subscribedTokensRef.current;

    const toSubscribe = [];
    const toUnsubscribe = [];

    nextSet.forEach((token) => {
      if (!previousSet.has(token)) {
        toSubscribe.push({ instrument_token: token });
      }
    });

    previousSet.forEach((token) => {
      if (!nextSet.has(token)) {
        toUnsubscribe.push({ instrument_token: token });
      }
    });

    if (toSubscribe.length > 0) subscribe(toSubscribe, 'quote');
    if (toUnsubscribe.length > 0) unsubscribe(toUnsubscribe, 'quote');

    subscribedTokensRef.current = nextSet;
  }, [liveTokens, subscribe, unsubscribe]);

  useEffect(() => {
    return () => {
      const tokens = Array.from(subscribedTokensRef.current).map((token) => ({ instrument_token: token }));
      if (tokens.length > 0) unsubscribe(tokens, 'quote');
    };
  }, [unsubscribe]);

  useEffect(() => {
    if (liveTokens.length === 0) {
      if (Object.keys(prevLivePricesRef.current).length > 0) {
        prevLivePricesRef.current = {};
        setLivePrices({});
      }
      return;
    }

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

      const next = {};
      liveTokens.forEach((token) => {
        const tick = ticksRef.current?.get(String(token));
        if (!tick) return;
        const ltp = tick.ltp ?? tick.last_price ?? tick.lastPrice ?? tick.close ?? null;
        if (ltp == null) return;
        next[String(token)] = Number(ltp);
      });

      const prev = prevLivePricesRef.current;
      const nextKeys = Object.keys(next);
      const prevKeys = Object.keys(prev);
      let hasChanges = nextKeys.length !== prevKeys.length;
      if (!hasChanges) {
        for (let i = 0; i < nextKeys.length; i += 1) {
          const key = nextKeys[i];
          if (prev[key] !== next[key]) {
            hasChanges = true;
            break;
          }
        }
      }

      if (hasChanges) {
        prevLivePricesRef.current = next;
        setLivePrices(next);
      }

      lastUpdate = timestamp;
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [liveTokens, ticksRef]);

  const pnlFilteredPositions = useMemo(
    () =>
      allPositions.filter((item) =>
        isWithinFilter({
          date: item.filterDate || item.placedAtDate,
          filter: selectedFilter,
          customFrom,
          customTo,
          sessionBoundaryStart,
        })
      ),
    [allPositions, selectedFilter, customFrom, customTo, sessionBoundaryStart]
  );

  const pnlFilteredHoldings = useMemo(
    () =>
      allHoldings.filter((item) => {
        if (!item.isClosed) return true;
        return isWithinFilter({
          date: item.filterDate || item.placedAtDate,
          filter: selectedFilter,
          customFrom,
          customTo,
          sessionBoundaryStart,
        });
      }),
    [allHoldings, selectedFilter, customFrom, customTo, sessionBoundaryStart]
  );

  const listPositions = useMemo(
    () =>
      allPositions
        .filter((item) => {
          if (!item.isClosed) return true;
          return isWithinFilter({
            date: item.filterDate || item.placedAtDate,
            filter: listFilter,
            customFrom: '',
            customTo: '',
            sessionBoundaryStart,
          });
        })
        .sort((a, b) => {
          if (!a.isClosed && b.isClosed) return -1;
          if (a.isClosed && !b.isClosed) return 1;
          if (a.isClosed && b.isClosed) {
            const aTime = (parseDate(a.exitAtDate) || parseDate(a.placedAtDate) || new Date(0)).getTime();
            const bTime = (parseDate(b.exitAtDate) || parseDate(b.placedAtDate) || new Date(0)).getTime();
            return bTime - aTime;
          }
          return 0;
        }),
    [allPositions, listFilter, sessionBoundaryStart]
  );

  const listHoldings = useMemo(
    () =>
      allHoldings
        .filter((item) => {
          if (!item.isClosed) return true;
          return isWithinFilter({
            date: item.filterDate || item.placedAtDate,
            filter: listFilter,
            customFrom: '',
            customTo: '',
            sessionBoundaryStart,
          });
        })
        .sort((a, b) => {
          if (!a.isClosed && b.isClosed) return -1;
          if (a.isClosed && !b.isClosed) return 1;
          if (a.isClosed && b.isClosed) {
            const aTime = (parseDate(a.exitAtDate) || parseDate(a.placedAtDate) || new Date(0)).getTime();
            const bTime = (parseDate(b.exitAtDate) || parseDate(b.placedAtDate) || new Date(0)).getTime();
            return bTime - aTime;
          }
          return 0;
        }),
    [allHoldings, listFilter, sessionBoundaryStart]
  );

  const summary = useMemo(() => {
    // Net P&L across currently filtered rows.
    const computeItemPnl = (item) => {
      const isClosed = !!item.isClosed;
      let displayLtp = toNumber(item.ltp ?? item.last_price ?? item.avgPrice);

      if (!isClosed) {
        const token = item.instrument_token || item.instrumentToken;
        if (token != null) {
          const liveLtp = livePrices[String(token)];
          if (liveLtp != null) displayLtp = toNumber(liveLtp);
        }
      }

      if (isClosed) return toNumber(item.pnl);

      if (item.source === 'order') {
        return resolveOrderPnl({
          order: {
            ...item,
            quantity: toNumber(item.qty),
            qty: toNumber(item.qty),
            price: toNumber(item.avgPrice),
            effective_entry_price: toNumber(item.avgPrice),
          },
          isClosed: false,
          ltp: displayLtp,
        }).netPnl;
      }

      return calculateOpenPnL({
        side: String(item.side || 'BUY').toUpperCase(),
        avgPrice: toNumber(item.avgPrice),
        ltp: displayLtp,
        qty: toNumber(item.qty),
      }).netPnl;
    };

    const allItems = [...pnlFilteredHoldings, ...pnlFilteredPositions];
    const netPnL = allItems.reduce((sum, item) => sum + computeItemPnl(item), 0);
    const totalCostBasis = allItems.reduce(
      (sum, item) => sum + toNumber(item.avgPrice) * toNumber(item.qty),
      0
    );
    const netPnLPercent = totalCostBasis > 0 ? (netPnL / totalCostBasis) * 100 : 0;

    return {
      totalValue: totalCostBasis,
      netPnL,
      netPnLPercent,
    };
  }, [pnlFilteredHoldings, pnlFilteredPositions, livePrices]);

  const netPnlValueToneClass = summary.netPnL >= 0
    ? 'text-emerald-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]'
    : 'text-red-500/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]';

  const displayData = activeTab === 'holdings' ? listHoldings : listPositions;
  const displayRows = useMemo(
    () =>
      displayData.map((item) => {
        const isClosed = !!item.isClosed;
        let displayLtp = toNumber(item.ltp ?? item.last_price ?? item.avgPrice);

        if (!isClosed) {
          const token = item.instrument_token || item.instrumentToken;
          if (token != null) {
            const liveLtp = livePrices[String(token)];
            if (liveLtp != null) {
              displayLtp = toNumber(liveLtp);
            }
          }
        }

        let displayPnl = toNumber(item.pnl);
        let displayPnlPercent = toNumber(item.pnlPercent);

        if (!isClosed) {
          if (item.source === 'order') {
            const pnlData = resolveOrderPnl({
              order: {
                ...item,
                quantity: toNumber(item.qty),
                qty: toNumber(item.qty),
                price: toNumber(item.avgPrice),
                effective_entry_price: toNumber(item.avgPrice),
              },
              isClosed: false,
              ltp: displayLtp,
            });
            displayPnl = pnlData.netPnl;
            displayPnlPercent = pnlData.pct;
          } else {
            const pnlData = calculateOpenPnL({
              side: String(item.side || 'BUY').toUpperCase(),
              avgPrice: toNumber(item.avgPrice),
              ltp: displayLtp,
              qty: toNumber(item.qty),
            });
            displayPnl = pnlData.netPnl;
            displayPnlPercent = pnlData.pct;
          }
        }

        return {
          ...item,
          quantity: toNumber(item.quantity ?? item.qty),
          price: toNumber(item.price ?? item.avgPrice),
          displayLtp,
          displayPnl,
          displayPnlPercent,
        };
      }),
    [displayData, livePrices]
  );

  const toSheetOrder = useCallback((item) => {
    const quantity = toNumber(item.quantity ?? item.qty);
    const status = String(item.status || item.order_status || '').toUpperCase();

    return {
      ...item,
      _rowType: item._rowType || (item.source === 'order' ? 'ORDER' : 'HOLDING'),
      quantity,
      qty: quantity,
      price: toNumber(item.price ?? item.avgPrice),
      ltp: toNumber(item.displayLtp ?? item.ltp ?? item.last_price ?? item.price ?? item.avgPrice),
      status,
      order_status: status,
      lot_size: item.lot_size || item.lotSize,
    };
  }, []);

  const isHoldingsExitLockedForOrder = useCallback(
    (order) => isLongTermProduct(order?.product) && !holdingsExitAllowed,
    [holdingsExitAllowed]
  );

  const getFreshLiveLtp = useCallback((order) => {
    const token = order?.instrument_token || order?.instrumentToken;
    if (token == null || token === '') return null;
    const tokenKey = String(token);
    const updatedAt = tickUpdatedAtRef?.current?.get(tokenKey) || 0;
    if (!updatedAt || (Date.now() - updatedAt) > LIVE_TICK_MAX_AGE_MS) {
      return null;
    }
    const tick = ticksRef.current?.get(tokenKey);
    if (!tick) return null;
    const ltp = tick.ltp ?? tick.last_price ?? tick.lastPrice ?? tick.close ?? null;
    const parsed = Number(ltp);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }, [tickUpdatedAtRef, ticksRef]);

  const submitExitOrder = useCallback(async ({ order, quantity, ltp }) => {
    if (!isActionableOrderRow(order)) {
      return {
        ok: false,
        message: 'This row is a holding snapshot and cannot be exited as an order.',
      };
    }
    if (isHoldingsExitLockedForOrder(order)) {
      return {
        ok: false,
        message: 'Exit is locked for your holdings. Contact your broker.',
      };
    }

    if (Number(quantity) !== Number(order.quantity)) {
      return {
        ok: false,
        message: 'Partial exit is not available yet. Use MAX quantity to exit this order.',
      };
    }

    const liveLtp = getFreshLiveLtp(order);
    if (liveLtp == null) {
      const fallbackLtp = Number(ltp ?? order.ltp ?? order.price ?? 0);
      if (!Number.isFinite(fallbackLtp) || fallbackLtp <= 0) {
        return {
          ok: false,
          message: 'Live quote is unavailable. Please wait for market data and try again.',
        };
      }
      return {
        ok: false,
        message: 'Live quote is stale. Exit is blocked to avoid stale execution. Please retry after quote refresh.',
      };
    }

    const closedLtp = Number(liveLtp.toFixed(4));

    try {
      await customerApi.updateOrder({
        order_id: order.id,
        instrument_token: order.instrument_token,
        symbol: order.symbol,
        side: order.side,
        product: order.product,
        segment: order.segment,
        lots: String(order.lots || 1),
        quantity: Number(order.quantity),
        order_status: 'CLOSED',
        status: 'CLOSED',
        closed_ltp: closedLtp,
        closed_at: new Date().toISOString(),
        exit_reason: 'manual',
        came_From: activeTab === 'holdings' ? 'Hold' : 'Open',
        meta: { from: 'ui_portfolio_exit' },
      });
      await fetchPortfolio({ force: true });
      return { ok: true };
    } catch (err) {
      console.error('Failed to exit order from portfolio:', err);
      return { ok: false, message: err?.message || 'Failed to exit order.' };
    }
  }, [activeTab, fetchPortfolio, getFreshLiveLtp, isHoldingsExitLockedForOrder]);

  const handleExitClick = useCallback((item) => {
    const sheetOrder = toSheetOrder(item);
    if (!isActionableOrderRow(sheetOrder)) return;
    if (isHoldingsExitLockedForOrder(sheetOrder)) return;
    setExitError(null);
    setExitSheetVersion((prev) => prev + 1);
    setExitOrder(sheetOrder);
  }, [isHoldingsExitLockedForOrder, toSheetOrder]);

  const handleExitConfirm = useCallback(async ({ order, quantity, ltp }) => {
    setExitSubmitting(true);
    setExitError(null);
    const result = await submitExitOrder({ order, quantity, ltp });
    if (!result?.ok) {
      setExitError(result?.message || 'Failed to exit order.');
      setExitSubmitting(false);
      return;
    }
    setExitSubmitting(false);
    setExitError(null);
    setExitOrder(null);
  }, [submitExitOrder]);

  return (
    <div className="relative flex h-[100dvh] w-full flex-col bg-[#f6f7f8] dark:bg-[#050806] text-[#111418] dark:text-[#e8f3ee] overflow-hidden">
      {/* Header - clean with filter button replacing back button */}
      <div className="z-20 bg-white dark:bg-[#0b120f] shadow-sm">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <h2 className="text-[#111418] dark:text-[#e8f3ee] text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Portfolio</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`h-8 w-8 rounded-full transition-colors ${
                showFilters ? 'bg-[#137fec] text-white' : 'bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-200 dark:hover:bg-[#1e2f28]'
              }`}
              title="Filter"
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/portfolio/invoice')}
              className="h-8 w-8 rounded-full bg-[#eaf4ff] dark:bg-[#16231d] text-[#137fec] dark:text-[#34d399] hover:bg-[#dbeeff] dark:hover:bg-[#1e2f28] transition-colors"
              title="Open invoice"
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            </button>
          </div>
        </div>

        {/* Filter dropdown */}
        {showFilters && (
          <div className="px-3 sm:px-4 pb-2.5">
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
              {filterOptions.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setSelectedFilter(filter.key)}
                  className={`flex h-7 sm:h-8 shrink-0 items-center justify-center gap-x-1 sm:gap-x-1.5 rounded-full px-2.5 sm:px-3 transition-colors ${
                    selectedFilter === filter.key
                      ? 'bg-[#137fec] text-white shadow-sm'
                      : 'bg-[#f6f7f8] dark:bg-[#0b120f] hover:bg-gray-200 dark:hover:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa]'
                  }`}
                >
                  {filter.key === 'custom' && (
                    <span className="material-symbols-outlined text-[14px] sm:text-[16px]">calendar_month</span>
                  )}
                  <p className="text-[11px] sm:text-xs font-medium leading-normal whitespace-nowrap">{filter.label}</p>
                </button>
              ))}
            </div>
            {selectedFilter === 'custom' && (
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mt-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#617589] dark:text-[#9cb7aa]">From</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 sm:h-10 rounded-lg border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] px-2.5 text-sm text-[#111418] dark:text-[#e8f3ee] outline-none focus:ring-2 focus:ring-[#137fec]/25"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#617589] dark:text-[#9cb7aa]">To</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 sm:h-10 rounded-lg border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] px-2.5 text-sm text-[#111418] dark:text-[#e8f3ee] outline-none focus:ring-2 focus:ring-[#137fec]/25"
                  />
                </label>
              </div>
            )}
            {selectedFilter === 'session' && sessionBoundaryStart && (
              <p className="mt-2 text-[11px] text-[#617589] dark:text-[#9cb7aa]">
                Active from{' '}
                <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">
                  {formatIstDateOnly(sessionBoundaryStart)}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* P&L Card */}
      <div className="px-3 sm:px-4 pt-3">
        <div className="relative overflow-hidden rounded-xl border border-[#2f8eef] bg-gradient-to-br from-[#0f68d7] via-[#137fec] to-[#0b4eaf] p-4 sm:p-5 text-white shadow-[0_14px_32px_rgba(19,127,236,0.35)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/25 to-transparent" />
          <div className="relative">
            <div className="flex justify-between items-start">
              <p className="text-white/85 text-xs sm:text-sm font-medium leading-normal">
                Net P&L ({selectedFilter === 'session' ? 'This Week' : 'Filtered'})
              </p>
              <span className="material-symbols-outlined text-white/75 text-[18px] sm:text-[20px]">insights</span>
            </div>
            {loading ? (
              <div className="animate-pulse mt-2">
                <div className="h-7 sm:h-8 bg-white/30 rounded w-36 sm:w-40 mb-2"></div>
                <div className="h-4 bg-white/25 rounded w-28 sm:w-32"></div>
              </div>
            ) : (
              <>
                <h1 className={`mt-1 text-[26px] sm:text-[32px] font-bold leading-tight tracking-tight ${netPnlValueToneClass}`}>
                  {formatSignedCurrency(summary.netPnL)}
                </h1>
                <p className={`text-xs sm:text-sm font-semibold mt-0.5 ${netPnlValueToneClass}`}>
                  {formatSignedPercent(summary.netPnLPercent)}
                </p>
              </>
            )}

            <div className="mt-3 rounded-lg border border-white/25 bg-white/12 p-2.5 backdrop-blur-[2px]">
              <p className="text-white/80 text-[10px] sm:text-[11px] uppercase tracking-[0.04em]">Total Value (Filtered)</p>
              <p className="text-white text-sm sm:text-base font-semibold mt-1">{formatCurrency(summary.totalValue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings / Positions Tabs - proper full-width tabs below P&L card */}
      <div className="px-3 sm:px-4 pt-3 pb-1 bg-[#f6f7f8] dark:bg-[#050806]">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-xl bg-white dark:bg-[#0b120f] border border-gray-100 dark:border-[#22352d] overflow-hidden">
            <button
              onClick={() => setActiveTab('holdings')}
              className={`flex-1 py-2.5 text-center text-sm font-semibold transition-colors ${
                activeTab === 'holdings'
                  ? 'bg-[#137fec] text-white'
                  : 'text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-50 dark:hover:bg-[#16231d]'
              }`}
            >
              Holdings ({listHoldings.length})
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`flex-1 py-2.5 text-center text-sm font-semibold transition-colors ${
                activeTab === 'positions'
                  ? 'bg-[#137fec] text-white'
                  : 'text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-50 dark:hover:bg-[#16231d]'
              }`}
            >
              Positions ({listPositions.length})
            </button>
          </div>
          <button
            type="button"
            onClick={() => setListFilter(prev => prev === 'today' ? 'session' : 'today')}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-[#0b120f] border border-gray-100 dark:border-[#22352d] text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors"
            title={listFilter === 'today' ? 'Showing today' : 'Showing this week'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {listFilter === 'today' ? 'today' : 'date_range'}
            </span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-2 pt-1 flex justify-between items-center">
        <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px] sm:text-xs font-medium uppercase tracking-wider">
          {displayData.length} {activeTab === 'holdings' ? 'Holdings' : 'Positions'}
        </p>
        {error && <p className="text-[11px] sm:text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-24 px-2 sm:px-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="mb-1.5 sm:mb-2 rounded-xl bg-white dark:bg-[#111b17] border border-gray-100 dark:border-[#22352d] p-3 sm:p-4 animate-pulse">
              <div className="flex justify-between">
                <div className="flex flex-col gap-2">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-3 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))
        ) : displayData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <span className="material-symbols-outlined text-[64px] text-gray-300 dark:text-[#22352d] mb-4">
              {activeTab === 'holdings' ? 'inventory_2' : 'trending_up'}
            </span>
            <p className="text-[#111418] dark:text-[#e8f3ee] text-lg font-semibold mb-2">
              No {activeTab === 'holdings' ? 'holdings' : 'positions'} for this filter
            </p>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-sm text-center">Try changing date range or filter type.</p>
          </div>
        ) : (
          displayRows.map((item) => {
            const status = String(item.status || item.order_status || '').toUpperCase();
            const statusLabel = item.isClosed ? 'CLOSED' : status || 'OPEN';
            const exitAtDate = parseDate(item.exitAtDate);
            const isPendingHolding =
              activeTab === 'holdings' &&
              ['PENDING', 'PENDING_APPROVAL', 'TRIGGER_PENDING', 'AMO', 'HOLD'].includes(status);
            const isActionableOrder = isActionableOrderRow(item);
            const isHoldingActionBlocked = activeTab === 'holdings' && !isCustomerTradeAllowed;
            const isHoldingsExitLocked = activeTab === 'holdings' && isHoldingsExitLockedForOrder(item);
            const canShowActions =
              !item.isClosed &&
              isActionableOrder &&
              !isPendingHolding &&
              !isHoldingActionBlocked;
            const sheetOrder = toSheetOrder(item);

            return (
              <div
                key={item.id}
                className="mb-1.5 sm:mb-2 rounded-xl bg-white dark:bg-[#111b17] border border-gray-100 dark:border-[#22352d] overflow-hidden transition-all hover:border-[#cfe3f8]"
              >
                <div
                  className="p-3 sm:p-4 flex justify-between items-center cursor-pointer"
                  onClick={() => {
                    setDetailOrder(sheetOrder);
                    setDetailTab(item.isClosed ? 'closed' : activeTab === 'holdings' ? 'holdings' : 'open');
                  }}
                >
                  <div className="flex flex-col min-w-0 flex-1 pr-3 gap-0.5">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-semibold leading-tight truncate">{item.symbol}</p>
                      <span className="bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">{item.exchange}</span>
                      <span className={`text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase tracking-wide ${
                        item.isClosed
                          ? 'bg-gray-100 dark:bg-[#16231d] text-gray-500 dark:text-[#9cb7aa]'
                          : status.includes('PENDING') || status === 'HOLD'
                            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700'
                            : 'bg-green-50 dark:bg-emerald-900/20 text-[#078838]'
                      }`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa]">
                      {item.side && (
                        <>
                          <span className={`font-medium px-1 sm:px-1.5 rounded text-[10px] sm:text-[11px] uppercase ${
                            item.side === 'BUY' || item.side === 'LONG'
                              ? 'text-[#137fec] bg-[#137fec]/10'
                              : 'text-red-500 bg-red-50'
                          }`}>{item.side}</span>
                          <span className="size-1 bg-gray-300 rounded-full"></span>
                        </>
                      )}
                      <span>{item.qty} Qty</span>
                      <span className="size-1 bg-gray-300 rounded-full"></span>
                      <span>Avg: ₹{toNumber(item.avgPrice).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold tabular-nums">₹{toNumber(item.displayLtp).toFixed(2)}</p>
                    <p className={`text-[10px] sm:text-xs font-medium tabular-nums ${item.displayPnl >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                      {formatSignedCurrency(item.displayPnl)}
                      <span className="text-[10px] sm:text-xs ml-1">({formatSignedPercent(item.displayPnlPercent)})</span>
                    </p>
                  </div>
                </div>
                <div className={`grid ${item.isClosed ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'} gap-2 px-3 pb-3 text-[9px] sm:text-[10px]`}>
                  <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#111b17] px-2 py-1.5">
                    <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Qty</span>
                    <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{item.qty}</span>
                  </div>
                  <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#111b17] px-2 py-1.5">
                    <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Avg</span>
                    <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">₹{toNumber(item.avgPrice).toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#111b17] px-2 py-1.5">
                    <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Side</span>
                    <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{item.side || '-'}</span>
                  </div>
                  {item.isClosed && (
                    <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#111b17] px-2 py-1.5">
                      <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Exited</span>
                      <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">
                        {exitAtDate ? exitAtDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}
                      </span>
                    </div>
                  )}
                </div>
                {activeTab === 'holdings' && item.validity_expires_at && item.validity_mode !== 'INTRADAY_DAY' && (
                  <div className="px-3 pb-1 flex items-center gap-1.5 text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa]">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                    <span>Valid till {new Date(item.validity_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, 3:15 PM</span>
                    {item.validity_extended_count > 0 && (
                      <span className="text-[9px] text-[#617589]">(+{item.validity_extended_count}x extended)</span>
                    )}
                  </div>
                )}
                {canShowActions && (
                  <div className="border-t border-gray-100 dark:border-[#22352d] px-3 pt-2 pb-3">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModifyOrder(sheetOrder);
                        }}
                        className="h-9 w-full px-2 text-center text-[13px] font-semibold text-white bg-[#137fec] hover:bg-[#0f6fcf] rounded-lg shadow-sm transition-colors"
                      >
                        Modify
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isHoldingsExitLocked) return;
                          handleExitClick(sheetOrder);
                        }}
                        disabled={isHoldingsExitLocked}
                        className={`h-9 w-full px-2 text-center text-[13px] font-semibold rounded-lg shadow-sm transition-colors ${
                          isHoldingsExitLocked
                            ? 'flex items-center justify-center gap-1 text-gray-400 dark:text-[#6f8b7f] bg-gray-100 dark:bg-[#16231d] cursor-not-allowed'
                            : 'text-white bg-red-500 hover:bg-red-600'
                        }`}
                      >
                        {isHoldingsExitLocked && <span className="material-symbols-outlined text-[15px]">lock</span>}
                        Exit
                      </button>
                    </div>
                  </div>
                )}
                {isPendingHolding && (
                  <div className="px-3 py-2 text-[10px] sm:text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-900/30">
                    Pending holding order. Actions are disabled until execution.
                  </div>
                )}
                {isHoldingActionBlocked && !isPendingHolding && (
                  <div className="px-3 py-2 text-[10px] sm:text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-900/30">
                    {marketClosedReason}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ModifyOrderSheet
        isOpen={!!modifyOrder}
        order={modifyOrder}
        onClose={() => setModifyOrder(null)}
        onModified={() => fetchPortfolio({ force: true })}
        marketClosedForCustomer={!isCustomerTradeAllowed}
        livePrices={livePrices}
      />

      <OrderDetailSheet
        isOpen={!!detailOrder}
        order={detailOrder}
        tab={detailTab}
        onClose={() => setDetailOrder(null)}
        onRefresh={() => fetchPortfolio({ force: true })}
        livePrices={livePrices}
      />

      <ExitOrderSheet
        key={`${exitOrder?.id || 'none'}-${exitSheetVersion}`}
        isOpen={!!exitOrder}
        order={exitOrder}
        liveLtpRef={prevLivePricesRef}
        onClose={() => {
          if (exitSubmitting) return;
          setExitOrder(null);
          setExitError(null);
        }}
        onConfirm={handleExitConfirm}
        submitting={exitSubmitting}
        error={exitError}
        marketClosedForCustomer={!isCustomerTradeAllowed}
        marketClosedReason={marketClosedReason}
      />
    </div>
  );
};

export default Portfolio;
