import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import ModifyOrderSheet from './ModifyOrderSheet';
import OrderDetailSheet from './OrderDetailSheet';
import ExitOrderSheet from './ExitOrderSheet';
import { resolveOrderPnl, getEffectiveEntryPrice } from '../../utils/calculateBrokerage';
import { useMarketData } from '../../context/SocketContext';
import { formatValidityTillLabel } from '../../utils/marketStatus';
import useCustomerTradingGate from '../../hooks/useCustomerTradingGate';
import { useAuth } from '../../context/AuthContext';
import { readSessionCache, writeSessionCache, clearSessionCache } from '../../utils/sessionCache';
import { OrdersWarningBanner } from '../../components/shared/WarningBanner';

const ORDERS_CACHE_KEY = 'orders_tab_v1';
const ORDERS_CACHE_TTL_MS = 30 * 1000;
const ORDERS_REVALIDATE_AFTER_MS = 5 * 1000;
const LIVE_TICK_MAX_AGE_MS = 3 * 1000;
const CLOSED_ORDER_STATUSES = new Set(['CLOSED', 'EXPIRED']);

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const readNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isActionableOrderRow = (order) => {
  return String(order?._rowType || '').toUpperCase() === 'ORDER' && !!order?.id;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const startOfWeek = (d) => {
  const monday = new Date(d);
  const day = monday.getDay();
  const daysSinceMonday = (day + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return startOfDay(monday);
};

const isOrderWithinFilter = (order, filter, activeTab) => {
  if (activeTab !== 'closed') return true;
  if (filter === 'All') return true;
  const status = String(order.status || order.order_status || '').toUpperCase();
  const isClosedOrder = activeTab === 'closed' || CLOSED_ORDER_STATUSES.has(status);
  const rawDate = isClosedOrder
    ? (order.closed_at || order.exit_at || order.placedAt || order.placed_at || order.createdAt)
    : (order.placedAt || order.placed_at || order.createdAt);
  if (!rawDate) return true; // no date → always show
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return true;
  const now = new Date();
  if (filter === 'This Week') {
    return date >= startOfWeek(now) && date <= endOfDay(now);
  }
  if (filter === 'Today') {
    return date >= startOfDay(now) && date <= endOfDay(now);
  }
  if (filter === 'Last 7 Days') {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    return date >= from && date <= endOfDay(now);
  }
  if (filter === 'Last 30 Days') {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    return date >= from && date <= endOfDay(now);
  }
  return true;
};

const sanitizeCachedOrderRow = (order) => {
  const status = String(order?.status || order?.order_status || '').toUpperCase();
  if (CLOSED_ORDER_STATUSES.has(status)) return order;
  return {
    ...order,
    ltp: null,
    last_price: null,
  };
};

const sanitizeOrdersStateForCache = (state) => ({
  openOrders: (state?.openOrders || []).map(sanitizeCachedOrderRow),
  closedOrders: (state?.closedOrders || []).map(sanitizeCachedOrderRow),
  holdings: (state?.holdings || []).map(sanitizeCachedOrderRow),
});

const Orders = () => {
  const navigate = useNavigate();
  const { ticksRef, tickUpdatedAtRef, subscribe, unsubscribe, isConnected } = useMarketData();
  const { isCustomerTradeAllowed, marketClosedReason, isTradingAllowed, getClosedMessage } = useCustomerTradingGate();
  const { user } = useAuth();
  const holdingsExitAllowed = user?.holdingsExitAllowed === true;
  const [activeTab, setActiveTab] = useState('open');
  const [selectedFilter, setSelectedFilter] = useState('This Week');
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [livePrices, setLivePrices] = useState({});

  // Data states
  const [openOrders, setOpenOrders] = useState([]);
  const [closedOrders, setClosedOrders] = useState([]);
  const [holdings, setHoldings] = useState([]);

  // Sheet states
  const [modifyOrder, setModifyOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [exitOrder, setExitOrder] = useState(null);
  const [exitSheetVersion, setExitSheetVersion] = useState(0);
  const [exitSubmitting, setExitSubmitting] = useState(false);
  const [exitError, setExitError] = useState(null);
  const subscribedTokensRef = useRef(new Set());
  const prevLivePricesRef = useRef({});
  const hasConnectedOnceRef = useRef(false);

  const filters = ['This Week', 'All', 'Today', 'Last 7 Days', 'Last 30 Days', 'Custom'];

  const applyOrdersState = useCallback((nextState) => {
    setOpenOrders(nextState?.openOrders || []);
    setClosedOrders(nextState?.closedOrders || []);
    setHoldings(nextState?.holdings || []);
  }, []);

  const fetchOrders = useCallback(async (options = {}) => {
    const { force = false } = options;
    let shouldShowLoading = true;
    let skipNetworkFetch = false;

    if (!force) {
      const cached = readSessionCache(ORDERS_CACHE_KEY, ORDERS_CACHE_TTL_MS);
      if (cached?.data) {
        applyOrdersState(cached.data);
        setError(null);
        setLoading(false);
        shouldShowLoading = false;
        if (cached.ageMs < ORDERS_REVALIDATE_AFTER_MS) {
          skipNetworkFetch = true;
        }
      }
    } else {
      clearSessionCache(ORDERS_CACHE_KEY);
    }

    if (skipNetworkFetch) return;

    if (shouldShowLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const [ordersResponse, holdingsResponse] = await Promise.all([
        customerApi.getOrders(),
        customerApi.getHoldings().catch(() => ({ holdings: [] })),
      ]);
      const allOrders = ordersResponse.orders || ordersResponse.data || [];
      const holdingsData = holdingsResponse.holdings || holdingsResponse.data || [];

      // Map orders preserving ALL raw fields for payloads
      const mappedOrders = allOrders.map((order) => {
        const placedAt = order.placedAt || order.placed_at || order.createdAt;
        const timeLabel = placedAt
          ? new Date(placedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : '';

        // Derive quantity from lots × lot_size as the source of truth.
        // MCX orders use units_per_contract as the lot multiplier.
        const derivedLots = toNumber(order.lots);
        const upc = toNumber(order.units_per_contract);
        const derivedLotSize = upc > 0 ? upc : Math.max(1, toNumber(order.lot_size));
        const derivedQuantity = derivedLots > 0
          ? derivedLots * derivedLotSize
          : toNumber(order.quantity);

        return {
          // Raw fields preserved for API payloads
          ...order,
          _rowType: 'ORDER',
          id: order.id || order._id,
          symbol: order.symbol,
          exchange: order.exchange || 'NSE',
          side: (order.side || '').toUpperCase(),
          quantity: derivedQuantity,
          price: getEffectiveEntryPrice(order),
          raw_entry_price: toNumber(order.raw_entry_price),
          effective_entry_price: getEffectiveEntryPrice(order),
          entry_spread_applied: toNumber(order.entry_spread_applied),
          ltp: toNumber(order.ltp || order.last_price || order.price || 0),
          status: (order.status || order.order_status || '').toUpperCase(),
          time: timeLabel,
          placedAt,
          product: (order.product || '').toUpperCase(),
          instrument_token: order.instrument_token,
          segment: order.segment,
          lots: order.lots,
          lot_size: order.lot_size,
          units_per_contract: upc,
          stop_loss: order.stop_loss || 0,
          target: order.target || 0,
          closed_ltp: toNumber(order.closed_ltp),
          exit_price: toNumber(order.exit_price),
          raw_exit_price: toNumber(order.raw_exit_price),
          effective_exit_price: toNumber(order.effective_exit_price),
          exit_spread_applied: toNumber(order.exit_spread_applied),
          pricing_bucket: order.pricing_bucket || null,
          brokerage: toNumber(order.brokerage),
          brokerage_breakdown: order.brokerage_breakdown || null,
          realized_pnl: readNumber(order.realized_pnl),
          settlement_status: order.settlement_status || null,
          closed_at: order.closed_at,
          exit_reason: order.exit_reason,
          came_From: order.came_From,
          jobbin_price: order.jobbin_price,
          exit_allowed: order.exit_allowed ?? false,
        };
      });

      const hiddenStatuses = new Set(['CANCELLED', 'REJECTED']);
      const closedStatuses = new Set(['CLOSED', 'EXPIRED']);
      const longTermProducts = new Set(['CNC', 'NRML']);

      const open = mappedOrders.filter(
        (o) => o.product === 'MIS' && !closedStatuses.has(o.status) && !hiddenStatuses.has(o.status)
      );

      const closed = mappedOrders
        .filter((o) => closedStatuses.has(o.status))
        .sort((a, b) => {
          const aTime = new Date(a.closed_at || a.exit_at || a.createdAt).getTime();
          const bTime = new Date(b.closed_at || b.exit_at || b.createdAt).getTime();
          return bTime - aTime;
        });

      const holdingOrders = mappedOrders.filter(
        (o) => longTermProducts.has(o.product) && !closedStatuses.has(o.status) && !hiddenStatuses.has(o.status)
      );

      const mappedHoldings = holdingsData.map((h) => {
        const hLots = toNumber(h.lots);
        const hLotSize = Math.max(1, toNumber(h.lot_size));
        const hQuantity = hLots > 0 ? hLots * hLotSize : toNumber(h.quantity);
        return {
          ...h,
          _rowType: 'HOLDING',
          id: h.id || h._id,
          symbol: h.symbol,
          exchange: h.exchange || 'NSE',
          side: (h.side || 'BUY').toUpperCase(),
          quantity: hQuantity,
          price: h.averagePrice || h.avg_price || 0,
          ltp: h.currentPrice ?? h.ltp ?? h.last_price ?? h.averagePrice ?? 0,
          status: 'HOLDING',
          time: '',
          product: (h.product || 'CNC').toUpperCase(),
          instrument_token: h.instrument_token,
          lots: h.lots,
          lot_size: h.lot_size,
        };
      });

      const orderIds = new Set(holdingOrders.map((o) => o.id));
      const uniqueHoldings = mappedHoldings.filter((h) => !orderIds.has(h.id));
      const mergedHoldings = [...holdingOrders, ...uniqueHoldings];

      const nextState = {
        openOrders: open,
        closedOrders: closed,
        holdings: mergedHoldings,
      };
      applyOrdersState(nextState);
      writeSessionCache(ORDERS_CACHE_KEY, sanitizeOrdersStateForCache(nextState));
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setError(err.message || 'Failed to load orders');
    } finally {
      if (shouldShowLoading) {
        setLoading(false);
      }
    }
  }, [applyOrdersState]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!isConnected) return;
    if (!hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      return;
    }
    fetchOrders({ force: true });
  }, [fetchOrders, isConnected]);

  const liveTokens = useMemo(() => {
    const tokens = [...openOrders, ...holdings]
      .map((order) => order.instrument_token || order.instrumentToken)
      .filter((token) => token != null && token !== '')
      .map((token) => String(token));
    return Array.from(new Set(tokens));
  }, [openOrders, holdings]);

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

    if (toSubscribe.length > 0) {
      subscribe(toSubscribe, 'quote');
    }
    if (toUnsubscribe.length > 0) {
      unsubscribe(toUnsubscribe, 'quote');
    }

    subscribedTokensRef.current = nextSet;
  }, [liveTokens, subscribe, unsubscribe]);

  useEffect(() => {
    return () => {
      const tokens = Array.from(subscribedTokensRef.current).map((token) => ({
        instrument_token: token,
      }));
      if (tokens.length > 0) {
        unsubscribe(tokens, 'quote');
      }
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

  const getDisplayLtp = useCallback((order, isClosed = false) => {
    if (isClosed) {
      return Number(order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? order.ltp ?? order.price ?? 0);
    }

    const token = order.instrument_token || order.instrumentToken;
    if (token != null) {
      const liveLtp = livePrices[String(token)];
      if (liveLtp != null) return Number(liveLtp);
    }
    return Number(order.ltp ?? order.last_price ?? order.effective_entry_price ?? order.price ?? 0);
  }, [livePrices]);

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

    // Current backend close path settles full order quantity only.
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
        came_From: activeTab === 'open' ? 'Open' : activeTab === 'holdings' ? 'Hold' : 'Open',
        meta: { from: 'ui_order_exit' },
      });
      await fetchOrders({ force: true });
      return { ok: true };
    } catch (err) {
      console.error('Failed to exit order:', err);
      return { ok: false, message: err?.message || 'Failed to exit order.' };
    }
  }, [activeTab, fetchOrders, getFreshLiveLtp]);

  const handleExitClick = useCallback((order) => {
    if (!isActionableOrderRow(order)) return;
    setExitError(null);
    setExitSheetVersion((prev) => prev + 1);
    setExitOrder(order);
  }, []);

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

  const orders = activeTab === 'open'
    ? openOrders
    : activeTab === 'holdings'
      ? holdings
      : closedOrders;

  const filteredOrders = orders.filter(order =>
    order.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) &&
    isOrderWithinFilter(order, selectedFilter, activeTab)
  );

  const tabConfig = [
    { key: 'open', label: 'Open', count: openOrders.length },
    { key: 'holdings', label: 'Holdings', count: holdings.length },
    { key: 'closed', label: 'Closed', count: closedOrders.length },
  ];

  const activeTitle = activeTab === 'open'
    ? 'Open Orders'
    : activeTab === 'holdings'
      ? 'Holdings'
      : 'Closed Orders';

  const formatSignedMoney = (value) => {
    const n = Number(value || 0);
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return `${sign}₹${Math.abs(n).toFixed(2)}`;
  };

  const formatSignedPct = (value) => {
    const n = Number(value || 0);
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return `${sign}${Math.abs(n).toFixed(2)}%`;
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col bg-[#f6f7f8] dark:bg-[#050806] text-[#111418] dark:text-[#e8f3ee] overflow-hidden">
      <div className="z-20 bg-white dark:bg-[#0b120f] shadow-sm">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <h2 className="text-[#111418] dark:text-[#e8f3ee] text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">{activeTitle}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`h-8 w-8 rounded-full transition-colors ${
                showFilters ? 'bg-[#137fec] text-white' : 'bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-200'
              }`}
              title="Filter"
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/order-book')}
              className="h-8 w-8 rounded-full bg-[#eaf4ff] dark:bg-[#16231d] text-[#137fec] dark:text-[#34d399] hover:bg-[#dbeeff] dark:hover:bg-[#1e2f28] transition-colors"
              title="Order Book"
              aria-label="Open order book"
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 pb-2.5">
          <label className="flex flex-col h-9 sm:h-10 w-full">
            <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
              <div className="text-[#617589] dark:text-[#9cb7aa] flex border-none bg-[#f0f2f4] dark:bg-[#0b120f] items-center justify-center pl-3 sm:pl-4 rounded-l-lg">
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
              </div>
              <input
                className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-[#111418] dark:text-[#e8f3ee] focus:outline-0 focus:ring-0 border-none bg-[#f0f2f4] dark:bg-[#0b120f] h-full placeholder:text-[#617589] dark:placeholder:text-[#6f8b7f] px-2 sm:px-3 rounded-l-none text-sm font-normal"
                placeholder="Search e.g. INFY, RELIANCE"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="px-3 sm:px-4 pb-2.5">
          <div className="flex rounded-xl bg-white dark:bg-[#0b120f] border border-gray-100 dark:border-[#22352d] overflow-hidden">
            {tabConfig.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-center text-xs sm:text-sm font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#137fec] text-white'
                    : 'text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-50 dark:hover:bg-[#16231d]'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        {showFilters && (
          <div className="flex px-3 sm:px-4 gap-1.5 sm:gap-2 pb-2 overflow-x-auto no-scrollbar">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`flex h-7 sm:h-8 shrink-0 items-center justify-center gap-x-1 sm:gap-x-1.5 rounded-full px-2.5 sm:px-3 transition-colors ${
                  selectedFilter === filter
                    ? 'bg-[#137fec] text-white shadow-sm'
                    : 'bg-white dark:bg-[#0b120f] hover:bg-gray-50 dark:hover:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] border border-[#dbe0e6] dark:border-[#22352d]'
                }`}
              >
                {filter === 'Custom' && (
                  <span className="material-symbols-outlined text-[14px] sm:text-[16px]">calendar_month</span>
                )}
                <p className="text-[11px] sm:text-xs font-medium leading-normal whitespace-nowrap">{filter}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Admin Warning Banner */}
      <OrdersWarningBanner />

      <div className="px-3 sm:px-4 pb-2 flex justify-between items-center">
        <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px] sm:text-xs font-medium uppercase tracking-wider">
          {filteredOrders.length} {activeTab === 'holdings' ? 'Holdings' : 'Orders'} {activeTab === 'open' ? 'Open' : activeTab === 'closed' ? 'Closed' : ''}
        </p>
        {error && <p className="text-[10px] sm:text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-24 px-2 sm:px-3">
        {loading ? (
          <div className="pt-1">
            {[1, 2, 3, 4].map((i) => (
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
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <span className="material-symbols-outlined text-[64px] text-gray-300 dark:text-[#22352d] mb-4">receipt_long</span>
            <p className="text-[#111418] dark:text-[#e8f3ee] text-lg font-semibold mb-2">No orders yet</p>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-sm text-center">
              {activeTab === 'holdings' ? 'Your holdings will appear here' : `Your ${activeTab} orders will appear here`}
            </p>
          </div>
        ) : (
          <>
            <div className="px-2 py-2 pb-1">
              <span className="text-xs font-semibold text-gray-400 dark:text-[#6f8b7f]">TODAY</span>
            </div>
            {filteredOrders.map((order) => {
              const isBuySide = order.side === 'BUY';
              const isClosed = activeTab === 'closed';
              const status = String(order.status || order.order_status || '').toUpperCase();
              const isPendingHolding =
                activeTab === 'holdings' &&
                ['PENDING', 'PENDING_APPROVAL', 'TRIGGER_PENDING', 'AMO'].includes(status);
              const isActionableOrder = isActionableOrderRow(order);
              const isHoldingActionBlocked = activeTab === 'holdings' && !isTradingAllowed({ exchange: order.exchange, segment: order.segment });
              const canShowActions =
                (activeTab === 'open' || activeTab === 'holdings') &&
                !isPendingHolding &&
                isActionableOrder &&
                !isHoldingActionBlocked;

              // Calculate P&L for card display
              const displayLtp = getDisplayLtp(order, isClosed);
              const pnlData = resolveOrderPnl({ order, isClosed, ltp: displayLtp });
              const isProfit = pnlData.netPnl >= 0;
              const pnlColor = isProfit ? 'text-[#078838]' : 'text-red-500';

              return (
                <div
                  key={order.id}
                  className="mb-1.5 sm:mb-2 rounded-xl bg-white dark:bg-[#111b17] border border-gray-100 dark:border-[#22352d] overflow-hidden transition-all hover:border-[#cfe3f8]"
                >
                  <div
                    className="p-3 sm:p-4 cursor-pointer"
                    onClick={() => setDetailOrder({ ...order, ltp: displayLtp })}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col min-w-0 flex-1 pr-3 gap-0.5">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-semibold truncate">{order.symbol}</p>
                          <span className="bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">{order.exchange}</span>
                          <span className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                            status === 'CLOSED'
                              ? 'bg-gray-100 dark:bg-[#16231d] text-gray-500 dark:text-[#9cb7aa]'
                              : status.includes('PENDING')
                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'
                                : 'bg-green-50 dark:bg-emerald-900/20 text-[#078838]'
                          }`}>
                            {status}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa] truncate">
                          {order.product || '-'} · {order.segment || '-'}
                        </p>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa]">
                          <span className={`font-medium px-1 sm:px-1.5 rounded text-[10px] sm:text-[11px] uppercase ${
                            isBuySide
                              ? 'text-[#137fec] bg-[#137fec]/10'
                              : 'text-red-500 bg-red-50'
                          }`}>{order.side || '-'}</span>
                          <span className="size-1 bg-gray-300 rounded-full"></span>
                          <span>{order.quantity} {order.units_per_contract > 0 ? 'Units' : 'Qty'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold tabular-nums">
                          ₹{displayLtp?.toFixed(2)}
                        </p>
                        <span className={`text-[10px] sm:text-xs font-medium tabular-nums ${pnlColor}`}>
                          {formatSignedMoney(pnlData.netPnl)} ({formatSignedPct(pnlData.pct)})
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 text-[9px] sm:text-[10px]">
                      <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#111b17] px-2 py-1.5">
                        <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Avg</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">₹{order.price?.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#111b17] px-2 py-1.5">
                        <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">{order.units_per_contract > 0 ? 'Units' : 'Qty'}</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{order.quantity}</span>
                      </div>
                      <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#111b17] px-2 py-1.5">
                        <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Net P&L</span>
                        <span className={`font-medium tabular-nums ${pnlColor}`}>{formatSignedMoney(pnlData.netPnl)}</span>
                      </div>
                    </div>
                  </div>

                  {activeTab === 'holdings' && order.validity_expires_at && order.validity_mode !== 'INTRADAY_DAY' && (
                    <div className="px-3 sm:px-4 pb-1 flex items-center gap-1.5 text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa]">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <span>Valid till {formatValidityTillLabel(order.validity_expires_at, { exchange: order.exchange, segment: order.segment })}</span>
                      {order.validity_extended_count > 0 && (
                        <span className="text-[9px] text-[#617589]">(+{order.validity_extended_count}x extended)</span>
                      )}
                    </div>
                  )}

                  {canShowActions && (
                    <div className="border-t border-gray-100 dark:border-[#22352d] px-3 sm:px-4 pt-2.5 pb-3.5">
                      <div className="grid grid-cols-2 gap-2.5 w-full">
                        <button
                          onClick={(e) => { e.stopPropagation(); setModifyOrder({ ...order, ltp: displayLtp }); }}
                          className="h-10 w-full px-3 text-center text-sm font-semibold text-white bg-[#137fec] hover:bg-[#0f6fcf] rounded-xl shadow-sm transition-colors"
                        >
                          Modify
                        </button>
                        {activeTab === 'holdings' && !order.exit_allowed && !holdingsExitAllowed ? (
                          <button
                            disabled
                            className="h-10 w-full px-3 flex items-center justify-center gap-1 text-sm font-semibold text-gray-400 dark:text-[#6f8b7f] bg-gray-100 dark:bg-[#16231d] rounded-xl cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-[15px]">lock</span>
                            Exit
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExitClick({ ...order, ltp: displayLtp }); }}
                            className="h-10 w-full px-3 text-center text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors"
                          >
                            Exit
                          </button>
                        )}
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
                      {getClosedMessage({ exchange: order.exchange, segment: order.segment }) || marketClosedReason}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Modify Order Bottom Sheet */}
      <ModifyOrderSheet
        isOpen={!!modifyOrder}
        order={modifyOrder}
        onClose={() => setModifyOrder(null)}
        onModified={() => fetchOrders({ force: true })}
        marketClosedForCustomer={modifyOrder ? !isTradingAllowed({ exchange: modifyOrder.exchange, segment: modifyOrder.segment }) : false}
        marketClosedReason={modifyOrder ? getClosedMessage({ exchange: modifyOrder.exchange, segment: modifyOrder.segment }) : ''}
        livePrices={livePrices}
      />

      {/* Order Detail Bottom Sheet (all tabs) */}
      <OrderDetailSheet
        isOpen={!!detailOrder}
        order={detailOrder}
        tab={activeTab}
        onClose={() => setDetailOrder(null)}
        onRefresh={() => fetchOrders({ force: true })}
        livePrices={livePrices}
      />

      {/* Exit Order Bottom Sheet */}
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
        marketClosedForCustomer={exitOrder ? !isTradingAllowed({ exchange: exitOrder.exchange, segment: exitOrder.segment }) : false}
        marketClosedReason={exitOrder ? (getClosedMessage({ exchange: exitOrder.exchange, segment: exitOrder.segment }) || marketClosedReason) : marketClosedReason}
      />
    </div>
  );
};

export default Orders;
