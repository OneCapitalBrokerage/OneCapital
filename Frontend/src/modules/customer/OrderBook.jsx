import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import ModifyOrderSheet from './ModifyOrderSheet';
import OrderDetailSheet from './OrderDetailSheet';
import ExitOrderSheet from './ExitOrderSheet';
import { resolveOrderPnl } from '../../utils/calculateBrokerage';
import { useMarketData } from '../../context/SocketContext';
import useCustomerTradingGate from '../../hooks/useCustomerTradingGate';
import { useAuth } from '../../context/AuthContext';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toUpper = (value) => String(value || '').trim().toUpperCase();

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

const isClosedStatus = (status) => status === 'CLOSED';
const isLongTermProduct = (product) => ['CNC', 'NRML'].includes(toUpper(product));

const normalizeRows = (items = []) => {
  return items.map((order) => {
    const placedAt = order.placed_at || order.createdAt || null;
    const timeLabel = placedAt
      ? new Date(placedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '';
    const status = toUpper(order.status || order.order_status);
    return {
      ...order,
      _rowType: 'ORDER',
      id: order.id || order._id || order.orderId,
      orderId: order.orderId || order.id || order._id,
      status,
      order_status: toUpper(order.order_status || order.status),
      symbol: order.symbol || '-',
      exchange: order.exchange || 'NSE',
      product: toUpper(order.product || 'MIS'),
      side: toUpper(order.side || 'BUY'),
      segment: order.segment || '-',
      quantity: toNumber(order.quantity),
      filled_qty: toNumber(order.filled_qty),
      pending_qty: toNumber(order.pending_qty),
      lots: toNumber(order.lots, 0),
      lot_size: toNumber(order.lot_size, 1),
      price: toNumber(order.effective_entry_price ?? order.price ?? order.raw_entry_price),
      effective_entry_price: toNumber(order.effective_entry_price ?? order.price),
      raw_entry_price: toNumber(order.raw_entry_price),
      ltp: toNumber(order.ltp ?? order.last_price ?? order.effective_entry_price ?? order.price),
      effective_exit_price: toNumber(order.effective_exit_price ?? order.raw_exit_price ?? order.exit_price),
      raw_exit_price: toNumber(order.raw_exit_price),
      closed_ltp: toNumber(order.effective_exit_price ?? order.raw_exit_price ?? order.exit_price),
      brokerage: toNumber(order.brokerage),
      realized_pnl: toNumber(order.realized_pnl),
      placed_at: placedAt,
      closed_at: order.closed_at || order.exit_at || null,
      executed_at: order.executed_at || null,
      cancelled_at: order.cancelled_at || null,
      rejected_at: order.rejected_at || null,
      validity_mode: order.validity_mode || null,
      validity_expires_at: order.validity_expires_at || null,
      validity_extended_count: toNumber(order.validity_extended_count),
      status_reason: order.status_reason || null,
      rejection_reason: order.rejection_reason || null,
      exit_reason: order.exit_reason || null,
      can_modify: !!order.can_modify,
      can_exit: !!order.can_exit,
      can_view_detail: order.can_view_detail !== false,
      time: timeLabel,
      jobbin_price: toNumber(order.jobbin_price, 0),
    };
  });
};

const bucketTabs = [
  { key: 'all', label: 'All', countKey: 'all' },
  { key: 'executed', label: 'Executed', countKey: 'executed' },
  { key: 'cancelled_rejected', label: 'Cancelled / Rejected', countKey: 'cancelled_rejected' },
];

const sectionTabs = [
  { key: 'intraday', label: 'Intraday' },
  { key: 'cnc', label: 'CNC' },
];

const statusChipClass = (status) => {
  if (status === 'REJECTED') return 'bg-red-50 text-red-600';
  if (status === 'CANCELLED') return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700';
  if (status === 'CLOSED') return 'bg-gray-100 dark:bg-[#16231d] text-gray-600 dark:text-[#6f8b7f]';
  if (status === 'OPEN') return 'bg-blue-50 text-[#137fec]';
  if (status === 'EXECUTED') return 'bg-green-50 dark:bg-emerald-900/20 text-[#078838] dark:text-emerald-400';
  if (status === 'PENDING' || status.includes('PENDING')) return 'bg-amber-50 dark:bg-amber-900/20 text-amber-600';
  return 'bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa]';
};

const OrderBook = () => {
  const navigate = useNavigate();
  const { ticksRef, subscribe, unsubscribe } = useMarketData();
  const { isCustomerTradeAllowed, marketClosedReason, isTradingAllowed, getClosedMessage } = useCustomerTradingGate();
  const { user } = useAuth();
  const holdingsExitAllowed = user?.holdingsExitAllowed === true;

  const [section, setSection] = useState('intraday');
  const [bucket, setBucket] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    counts: { all: 0, executed: 0, cancelled_rejected: 0 },
    statusCounts: {},
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1,
  });
  const [livePrices, setLivePrices] = useState({});

  const [modifyOrder, setModifyOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [exitOrder, setExitOrder] = useState(null);
  const [exitSheetVersion, setExitSheetVersion] = useState(0);
  const [exitSubmitting, setExitSubmitting] = useState(false);
  const [exitError, setExitError] = useState(null);

  const requestIdRef = useRef(0);
  const subscribedTokensRef = useRef(new Set());
  const prevLivePricesRef = useRef({});

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const fetchOrderBook = useCallback(async ({ pageToLoad = 1, append = false } = {}) => {
    const requestId = ++requestIdRef.current;
    const loadingMoreRequest = append && pageToLoad > 1;
    if (loadingMoreRequest) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await customerApi.getOrderBook({
        section,
        bucket,
        search: debouncedSearch || undefined,
        page: pageToLoad,
        limit: 50,
        sort: 'placed_at_desc',
      });

      if (requestId !== requestIdRef.current) return;

      const mappedRows = normalizeRows(response.items || []);
      setRows((prev) => {
        if (!append) return mappedRows;
        const merged = [...prev, ...mappedRows];
        const seen = new Set();
        return merged.filter((item) => {
          const key = String(item.id || item.orderId);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
      setSummary({
        counts: {
          all: toNumber(response?.summary?.counts?.all),
          executed: toNumber(response?.summary?.counts?.executed),
          cancelled_rejected: toNumber(response?.summary?.counts?.cancelled_rejected),
        },
        statusCounts: response?.summary?.statusCounts || {},
      });
      setPagination({
        page: toNumber(response?.pagination?.page, 1),
        limit: toNumber(response?.pagination?.limit, 50),
        total: toNumber(response?.pagination?.total, mappedRows.length),
        pages: toNumber(response?.pagination?.pages, 1),
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to load order book:', err);
      setError(err.message || 'Failed to load order book.');
      if (!append) {
        setRows([]);
        setPagination({ page: 1, limit: 50, total: 0, pages: 1 });
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [section, bucket, debouncedSearch]);

  useEffect(() => {
    fetchOrderBook({ pageToLoad: 1, append: false });
  }, [fetchOrderBook]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (pagination.page >= pagination.pages) return;
    fetchOrderBook({ pageToLoad: pagination.page + 1, append: true });
  }, [loading, loadingMore, pagination.page, pagination.pages, fetchOrderBook]);

  const liveTokens = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.instrument_token)
          .filter((token) => token != null && token !== '')
          .map((token) => String(token))
      )
    );
  }, [rows]);

  useEffect(() => {
    const nextSet = new Set(liveTokens);
    const prevSet = subscribedTokensRef.current;

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

  const getDisplayLtp = useCallback((order) => {
    const status = toUpper(order.status || order.order_status);
    if (isClosedStatus(status)) {
      return Number(order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? order.ltp ?? order.price ?? 0);
    }

    const token = order.instrument_token;
    if (token != null) {
      const liveLtp = livePrices[String(token)];
      if (liveLtp != null) return Number(liveLtp);
    }
    return Number(order.ltp ?? order.last_price ?? order.effective_entry_price ?? order.price ?? 0);
  }, [livePrices]);

  const isHoldingsExitLockedForOrder = useCallback(
    (order) => isLongTermProduct(order?.product) && !holdingsExitAllowed,
    [holdingsExitAllowed]
  );

  const submitExitOrder = useCallback(async ({ order, quantity, ltp }) => {
    if (!order?.id) {
      return { ok: false, message: 'Unable to exit this order.' };
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

    const liveLtp = Number(ltp ?? order.ltp ?? order.price ?? 0);
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
        came_From: 'OrderBook',
        meta: { from: 'ui_order_book_exit' },
      });
      await fetchOrderBook({ pageToLoad: 1, append: false });
      return { ok: true };
    } catch (err) {
      console.error('Failed to exit order from order book:', err);
      return { ok: false, message: err?.message || 'Failed to exit order.' };
    }
  }, [fetchOrderBook, isHoldingsExitLockedForOrder]);

  const handleExitClick = useCallback((order) => {
    if (isHoldingsExitLockedForOrder(order)) return;
    setExitError(null);
    setExitSheetVersion((prev) => prev + 1);
    setExitOrder(order);
  }, [isHoldingsExitLockedForOrder]);

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

  const hasMore = pagination.page < pagination.pages;
  const totalCount = pagination.total || rows.length;

  return (
    <div className="relative flex h-[100dvh] w-full flex-col bg-[#f6f7f8] dark:bg-[#050806] dark:text-[#e8f3ee] text-[#111418] overflow-hidden">
      <div className="z-20 bg-white dark:bg-[#0b120f] shadow-sm">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-8 w-8 rounded-full bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-200 dark:hover:bg-[#16231d] transition-colors"
              aria-label="Back"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back_ios_new</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-[#111418] dark:text-[#e8f3ee] text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Order Book</h2>
              <p className="text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa] font-medium uppercase tracking-wider">
                {section === 'intraday' ? 'INTRADAY (MIS)' : 'CNC (DELIVERY & CARRYFORWARD)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchOrderBook({ pageToLoad: 1, append: false })}
            className="h-8 w-8 rounded-full bg-[#eaf4ff] dark:bg-[#16231d] text-[#137fec] dark:text-[#34d399] hover:bg-[#dbeeff] dark:hover:bg-[#1e2f28] transition-colors"
            title="Refresh"
            aria-label="Refresh order book"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>

        <div className="px-3 sm:px-4 pb-2.5">
          <label className="flex flex-col h-9 sm:h-10 w-full">
            <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
              <div className="text-[#617589] dark:text-[#9cb7aa] flex border-none bg-[#f0f2f4] dark:bg-[#0b120f] items-center justify-center pl-3 sm:pl-4 rounded-l-lg">
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
              </div>
              <input
                className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-[#111418] dark:text-[#e8f3ee] focus:outline-0 focus:ring-0 border-none bg-[#f0f2f4] dark:bg-[#0b120f] h-full placeholder:text-[#617589] dark:placeholder:text-[#9cb7aa] px-2 sm:px-3 rounded-l-none text-sm font-normal"
                placeholder="Search symbol"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="px-3 sm:px-4 pb-2">
          <div className="grid grid-cols-2 rounded-xl bg-white dark:bg-[#111b17] border border-gray-100 dark:border-[#22352d] overflow-hidden">
            {sectionTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSection(tab.key)}
                className={`h-10 text-xs sm:text-sm font-semibold transition-colors ${
                  section === tab.key ? 'bg-[#137fec] text-white' : 'text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-50 dark:hover:bg-[#16231d]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 sm:px-4 pb-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            {bucketTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setBucket(tab.key)}
                className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                  bucket === tab.key
                    ? 'border-[#137fec] dark:border-[#34d399] bg-[#eaf4ff] dark:bg-[#16231d] text-[#137fec] dark:text-[#34d399]'
                    : 'border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] text-[#617589] dark:text-[#9cb7aa] hover:bg-gray-50 dark:hover:bg-[#16231d]'
                }`}
              >
                <p className="text-[11px] sm:text-xs font-semibold leading-tight">{tab.label}</p>
                <p className="mt-0.5 text-[11px] sm:text-xs font-bold">
                  {toNumber(summary?.counts?.[tab.countKey])}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-2 flex justify-between items-center">
        <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px] sm:text-xs font-medium uppercase tracking-wider">
          {rows.length} Showing · {totalCount} Total
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
                    <div className="h-4 bg-gray-200 dark:bg-[#22352d] rounded w-24"></div>
                    <div className="h-3 bg-gray-200 dark:bg-[#22352d] rounded w-32"></div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="h-4 bg-gray-200 dark:bg-[#22352d] rounded w-20"></div>
                    <div className="h-3 bg-gray-200 dark:bg-[#22352d] rounded w-16"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <span className="material-symbols-outlined text-[64px] text-gray-300 dark:text-[#22352d] mb-4">menu_book</span>
            <p className="text-[#111418] dark:text-[#e8f3ee] text-lg font-semibold mb-2">No orders found</p>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-sm text-center">
              Try switching section or subsection filters.
            </p>
          </div>
        ) : (
          <>
            {rows.map((order) => {
              const status = toUpper(order.status || order.order_status);
              const displayLtp = getDisplayLtp(order);
              const closedRow = isClosedStatus(status);
              const pnlData = resolveOrderPnl({ order, isClosed: closedRow, ltp: displayLtp });
              const isProfit = pnlData.netPnl >= 0;
              const pnlColor = isProfit ? 'text-[#078838] dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
              const canModify = !!order.can_modify;
              const canExit = !!order.can_exit;
              const isHoldingsExitLocked = canExit && isHoldingsExitLockedForOrder(order);
              const isCncActionBlocked = section === 'cnc' && !isTradingAllowed({ exchange: order.exchange, segment: order.segment });
              const showActions = (canModify || canExit) && !isCncActionBlocked;
              const reason = order.status_reason || order.rejection_reason || null;
              const actionGridClass = canModify && canExit ? 'grid-cols-2' : 'grid-cols-1';

              return (
                <div
                  key={order.id}
                  className="mb-1.5 sm:mb-2 rounded-xl bg-white dark:bg-[#111b17] border border-gray-100 dark:border-[#22352d] overflow-hidden transition-all hover:border-[#cfe3f8] dark:hover:border-[#22352d]"
                >
                  <div
                    className="p-3 sm:p-4 cursor-pointer"
                    onClick={() => {
                      if (!order.can_view_detail) return;
                      setDetailOrder({ ...order, ltp: displayLtp });
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col min-w-0 flex-1 pr-3 gap-0.5">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-semibold truncate">{order.symbol}</p>
                          <span className="bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">{order.exchange}</span>
                          <span className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${statusChipClass(status)}`}>
                            {status}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa] truncate">
                          {order.product || '-'} · {order.segment || '-'}
                        </p>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-[#617589] dark:text-[#9cb7aa]">
                          <span className={`font-medium px-1 sm:px-1.5 rounded text-[10px] sm:text-[11px] uppercase ${
                            order.side === 'BUY'
                              ? 'text-[#137fec] bg-[#137fec]/10'
                              : 'text-red-500 bg-red-50'
                          }`}>{order.side || '-'}</span>
                          <span className="size-1 bg-gray-300 dark:bg-[#22352d] rounded-full"></span>
                          <span>{order.quantity} Qty</span>
                          {order.time && (
                            <>
                              <span className="size-1 bg-gray-300 dark:bg-[#22352d] rounded-full"></span>
                              <span>{order.time}</span>
                            </>
                          )}
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
                      <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#16231d] px-2 py-1.5">
                        <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Avg</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">₹{toNumber(order.price).toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#16231d] px-2 py-1.5">
                        <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Filled</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{toNumber(order.filled_qty)}</span>
                      </div>
                      <div className="flex flex-col rounded-lg bg-[#f6f7f8] dark:bg-[#16231d] px-2 py-1.5">
                        <span className="text-[#7a8996] dark:text-[#6f8b7f] uppercase tracking-[0.04em]">Pending</span>
                        <span className="text-[#111418] dark:text-[#e8f3ee] font-medium tabular-nums">{toNumber(order.pending_qty)}</span>
                      </div>
                    </div>

                    {reason && (
                      <div className="mt-2 rounded-lg bg-[#fff7ed] border border-[#ffe2c2] px-2.5 py-2 text-[10px] sm:text-xs text-[#8a5a17]">
                        {reason}
                      </div>
                    )}
                  </div>

                  {showActions && (
                    <div className="border-t border-gray-100 dark:border-[#22352d] px-3 sm:px-4 pt-2.5 pb-3.5">
                      <div className={`grid ${actionGridClass} gap-2.5 w-full`}>
                        {canModify && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModifyOrder({ ...order, ltp: displayLtp });
                            }}
                            className="h-10 w-full px-3 text-center text-sm font-semibold text-white bg-[#137fec] hover:bg-[#0f6fcf] rounded-xl shadow-sm transition-colors"
                          >
                            Modify
                          </button>
                        )}
                        {canExit && (
                          isHoldingsExitLocked ? (
                            <button
                              disabled
                              className="h-10 w-full px-3 flex items-center justify-center gap-1 text-sm font-semibold text-gray-400 dark:text-[#6f8b7f] bg-gray-100 dark:bg-[#16231d] rounded-xl cursor-not-allowed"
                            >
                              <span className="material-symbols-outlined text-[15px]">lock</span>
                              Exit
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExitClick({ ...order, ltp: displayLtp });
                              }}
                              className="h-10 w-full px-3 text-center text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors"
                            >
                              Exit
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                  {isCncActionBlocked && (
                    <div className="px-3 py-2 text-[10px] sm:text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-900/30">
                      {getClosedMessage({ exchange: order.exchange, segment: order.segment }) || marketClosedReason}
                    </div>
                  )}
                </div>
              );
            })}

            {hasMore && (
              <div className="px-1 pb-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full h-10 rounded-xl border border-[#dbe0e6] dark:border-[#22352d] bg-white dark:bg-[#111b17] text-[#137fec] text-sm font-semibold hover:bg-[#f8fbff] dark:hover:bg-[#16231d] disabled:opacity-60 transition-colors"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ModifyOrderSheet
        isOpen={!!modifyOrder}
        order={modifyOrder}
        onClose={() => setModifyOrder(null)}
        onModified={() => fetchOrderBook({ pageToLoad: 1, append: false })}
        marketClosedForCustomer={modifyOrder ? !isTradingAllowed({ exchange: modifyOrder.exchange, segment: modifyOrder.segment }) : false}
        marketClosedReason={modifyOrder ? (getClosedMessage({ exchange: modifyOrder.exchange, segment: modifyOrder.segment }) || marketClosedReason) : ''}
        livePrices={livePrices}
      />

      <OrderDetailSheet
        isOpen={!!detailOrder}
        order={detailOrder}
        tab={isClosedStatus(toUpper(detailOrder?.status || detailOrder?.order_status)) ? 'closed' : 'open'}
        onClose={() => setDetailOrder(null)}
        onRefresh={() => fetchOrderBook({ pageToLoad: 1, append: false })}
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
        marketClosedForCustomer={exitOrder ? !isTradingAllowed({ exchange: exitOrder.exchange, segment: exitOrder.segment }) : false}
        marketClosedReason={exitOrder ? (getClosedMessage({ exchange: exitOrder.exchange, segment: exitOrder.segment }) || marketClosedReason) : marketClosedReason}
      />
    </div>
  );
};

export default OrderBook;
