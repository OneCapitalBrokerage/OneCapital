import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useMarketData } from '../../context/SocketContext';
import OrderBottomSheet from './OrderBottomSheet';
import TradingChart from '../../components/charts/TradingChart';
import useCustomerTradingGate from '../../hooks/useCustomerTradingGate';

// All 8 Kite historical intervals with smart date ranges.
// Days are chosen so candle count stays within Kite's ~2000 candle limit per request.
// type: 'intraday' → uses getIntradayData endpoint + shows time on x-axis
// type: 'day'      → uses getChartData endpoint + shows dates only on x-axis
const INTERVALS = [
  { key: '1m',  label: '1m',  interval: '1',   type: 'intraday', days: 3   },
  { key: '3m',  label: '3m',  interval: '3',   type: 'intraday', days: 7   },
  { key: '5m',  label: '5m',  interval: '5',   type: 'intraday', days: 10  },
  { key: '10m', label: '10m', interval: '10',  type: 'intraday', days: 20  },
  { key: '15m', label: '15m', interval: '15',  type: 'intraday', days: 30  },
  { key: '30m', label: '30m', interval: '30',  type: 'intraday', days: 60  },
  { key: '1H',  label: '1H',  interval: '60',  type: 'intraday', days: 90  },
  { key: '1D',  label: '1D',  interval: 'day', type: 'day',      days: 365 },
];
const DEFAULT_INTERVAL = '5m';

const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const IST_HEADER_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const pad = (value) => String(value).padStart(2, '0');

const toIstPseudoDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + IST_OFFSET_MS);
};

const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const getRangeForInterval = (intervalKey) => {
  const cfg = INTERVALS.find(i => i.key === intervalKey) || INTERVALS.find(i => i.key === DEFAULT_INTERVAL);
  const now = toIstPseudoDate();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - cfg.days);
  // Date-only format — backend (kiteHistorical.js) automatically appends
  // 09:15:00 for start and 15:30:00 for end, giving correct market-hours ranges.
  return { from: formatDate(start), to: formatDate(now), type: cfg.type, interval: cfg.interval };
};

const toNumber = (value) => (value == null ? null : Number(value));

const ChartView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { subscribe, unsubscribe, ticksRef, tickUpdatedAtRef } = useMarketData();
  const { isCustomerTradeAllowed, marketClosedReason } = useCustomerTradingGate();

  const state = location.state || {};
  const stock = state.stock || null;
  const ltpData = state.ltpData || null;

  const instrumentToken = stock?.instrumentToken || stock?.instrument_token || null;
  const symbol = stock?.symbol || stock?.tradingsymbol || stock?.name || '';
  const exchange = stock?.exchange || stock?.segment || 'NSE';
  const isIndexInstrument = useMemo(() => {
    const segment = String(stock?.segment || '').toUpperCase();
    const exchangeValue = String(stock?.exchange || '').toUpperCase();
    return (
      segment === 'INDICES' ||
      segment === 'NSE_INDEX' ||
      segment === 'BSE_INDEX' ||
      segment.endsWith('_INDEX') ||
      segment.endsWith('-INDEX') ||
      exchangeValue === 'INDICES' ||
      exchangeValue === 'NSE_INDEX' ||
      exchangeValue === 'BSE_INDEX'
    );
  }, [stock]);
  const isOption = useMemo(() => {
    const segment = String(stock?.segment || stock?.exchange || '').toUpperCase();
    return segment.includes('OPT');
  }, [stock]);

  const [selectedInterval, setSelectedInterval] = useState(DEFAULT_INTERVAL);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [customParams, setCustomParams] = useState(null); // set when user applies custom range

  // Custom panel form state — default to last 10 days with 5m interval
  const [customFrom, setCustomFrom] = useState(() => formatDate(new Date(toIstPseudoDate().getTime() - 10 * 24 * 60 * 60 * 1000)));
  const [customTo, setCustomTo] = useState(() => formatDate(toIstPseudoDate()));
  const [customIntervalValue, setCustomIntervalValue] = useState('5');

  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [liveTick, setLiveTick] = useState(null);
  const [orderSheet, setOrderSheet] = useState({ open: false, side: 'BUY' });

  useEffect(() => {
    if (!instrumentToken) return undefined;
    const list = [{ instrument_token: instrumentToken }];
    subscribe(list, 'full');
    return () => unsubscribe(list, 'full');
  }, [instrumentToken, subscribe, unsubscribe]);

  useEffect(() => {
    if (!instrumentToken) return undefined;

    let animationFrameId;
    let lastUpdate = 0;
    const THROTTLE_MS = 33.33;

    const updateLoop = (timestamp) => {
      if (timestamp - lastUpdate < THROTTLE_MS) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      const tick = ticksRef.current.get(String(instrumentToken));
      if (tick) {
        setLiveTick(tick);
        lastUpdate = timestamp;
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [instrumentToken, ticksRef]);

  useEffect(() => {
    if (!instrumentToken) return;

    // Resolve which params to use — preset or custom
    let params;
    if (selectedInterval === 'custom') {
      if (!customParams) return; // custom selected but not yet applied
      params = customParams;
    } else {
      params = getRangeForInterval(selectedInterval);
    }

    const { from, to, type, interval } = params;
    const controller = new AbortController();
    let isActive = true;

    const fetchChart = async () => {
      setLoading(true);
      setError(null);
      try {
        const endpoint = type === 'intraday' ? '/chart/getIntradayData' : '/chart/getChartData';
        const response = await api.get(endpoint, {
          params: { instrument_token: instrumentToken, from, to, interval },
          signal: controller.signal,
        });
        if (!isActive) return;
        setCandles(response?.data?.data?.candles || []);
      } catch (err) {
        if (controller.signal.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
          return;
        }
        if (!isActive) return;
        setError(err?.message || 'Failed to load chart data');
        setCandles([]);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    fetchChart();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [instrumentToken, selectedInterval, customParams]);

  // Unix seconds of whichever candle the crosshair is currently over (null = no hover)
  const [hoveredTime, setHoveredTime] = useState(null);

  const chartStats = useMemo(() => {
    if (!candles.length) {
      return {
        open: null,
        high: null,
        low: null,
        close: null,
        volume: null,
        avg: null,
      };
    }

    const opens = candles[0]?.[1];
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let close = candles[candles.length - 1]?.[4];
    let sumClose = 0;

    candles.forEach((candle) => {
      const [, , highVal, lowVal, closeVal, vol] = candle;
      high = Math.max(high, highVal);
      low = Math.min(low, lowVal);
      sumClose += closeVal;
      volume += vol || 0;
    });

    return {
      open: opens,
      high,
      low,
      close,
      volume,
      avg: candles.length ? sumClose / candles.length : null,
    };
  }, [candles]);

  // Find the candle that matches the crosshair's timestamp (Unix seconds)
  const hoveredCandle = useMemo(() => {
    if (hoveredTime == null || !candles.length) return null;
    return candles.find(c => Math.floor(Number(c[0]) / 1000) === hoveredTime) ?? null;
  }, [hoveredTime, candles]);

  // Stats shown below chart: hovered candle's OHLCV when crosshair is active,
  // overall range summary when idle
  const displayStats = useMemo(() => {
    if (hoveredCandle) {
      return {
        open:   hoveredCandle[1],
        high:   hoveredCandle[2],
        low:    hoveredCandle[3],
        close:  hoveredCandle[4],
        volume: hoveredCandle[5],
        avg:    null,
        isHovered: true,
      };
    }
    return { ...chartStats, isHovered: false };
  }, [hoveredCandle, chartStats]);

  const liveLtp = toNumber(liveTick?.ltp ?? liveTick?.last_price ?? ltpData?.ltp ?? chartStats.close);
  const prevClose = toNumber(liveTick?.close ?? chartStats.open ?? chartStats.close);
  const change = liveLtp != null && prevClose != null ? liveLtp - prevClose : null;
  const changePct = liveLtp != null && prevClose ? (change / prevClose) * 100 : null;

  if (!instrumentToken) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] flex items-center justify-center text-[#617589] dark:text-[#9cb7aa] text-sm">
        Select an instrument to view chart.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] dark:text-[#e8f3ee] text-[#111418] flex flex-col">
      <header className="flex items-center bg-white dark:bg-[#0b120f] px-4 py-3 border-b border-gray-100 dark:border-[#22352d]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex size-10 items-center justify-center text-[#111418] dark:text-[#e8f3ee] hover:bg-gray-100 dark:hover:bg-[#16231d] rounded-full transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="ml-2 flex flex-col flex-1">
          <h2 className="text-[#111418] dark:text-[#e8f3ee] text-lg font-bold leading-tight tracking-tight">{symbol}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-gray-100 dark:bg-[#16231d] text-gray-600 dark:text-[#6f8b7f] px-1.5 py-0.5 rounded">
              {exchange}
            </span>
            <span className="text-xs text-gray-400 dark:text-[#6f8b7f]">{stock?.segment || 'EQ'}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {!isIndexInstrument && (
            isCustomerTradeAllowed ? (
              <>
                <button
                  type="button"
                  onClick={() => setOrderSheet({ open: true, side: 'BUY' })}
                  className="h-9 px-4 rounded-full bg-[#137fec] text-white text-xs font-semibold shadow-sm hover:bg-blue-600 transition-colors"
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isOption) return;
                    setOrderSheet({ open: true, side: 'SELL' });
                  }}
                  disabled={isOption}
                  className={`h-9 px-4 rounded-full text-xs font-semibold shadow-sm transition-colors ${
                    isOption
                      ? 'bg-gray-200 dark:bg-[#22352d] text-gray-400 dark:text-[#6f8b7f] cursor-not-allowed'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  {isOption && (
                    <span className="material-symbols-outlined text-[14px] mr-1 align-[-1px]">lock</span>
                  )}
                  SELL
                </button>
              </>
            ) : (
              <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">{marketClosedReason}</span>
            )
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        <div className="px-4 pt-6 pb-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[#111418] dark:text-[#e8f3ee] text-[32px] font-bold leading-tight tracking-tight">
              {liveLtp != null ? `₹${Number(liveLtp).toFixed(2)}` : '—'}
            </h1>
            {changePct != null && (
              <span className={`flex items-center text-sm font-semibold ${changePct >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                <span className="material-symbols-outlined text-sm mr-0.5">
                  {changePct >= 0 ? 'arrow_drop_up' : 'arrow_drop_down'}
                </span>
                {change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}` : '--'} ({changePct >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%)
              </span>
            )}
          </div>
          <p className="text-gray-400 dark:text-[#6f8b7f] text-xs mt-1">
            As of {IST_HEADER_TIME_FORMATTER.format(new Date())} IST
          </p>
        </div>

        {/* Interval pill selector — horizontally scrollable */}
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex gap-1.5 px-4 py-2 w-max">
            {INTERVALS.map((iv) => (
              <button
                key={iv.key}
                type="button"
                onClick={() => {
                  setSelectedInterval(iv.key);
                  setShowCustomPanel(false);
                  setCustomParams(null);
                }}
                className={`h-8 px-3 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                  selectedInterval === iv.key && selectedInterval !== 'custom'
                    ? 'bg-[#137fec] text-white shadow-sm'
                    : 'bg-[#f0f2f4] dark:bg-[#111b17] text-gray-500 dark:text-[#6f8b7f]'
                }`}
              >
                {iv.label}
              </button>
            ))}
            {/* Custom range button */}
            <button
              type="button"
              onClick={() => setShowCustomPanel((p) => !p)}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
                selectedInterval === 'custom'
                  ? 'bg-[#137fec] text-white shadow-sm'
                  : 'bg-[#f0f2f4] dark:bg-[#111b17] text-gray-500 dark:text-[#6f8b7f]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">date_range</span>
              Custom
            </button>
          </div>
        </div>

        {/* Custom date/interval panel */}
        {showCustomPanel && (
          <div className="mx-4 mb-2 p-3 rounded-xl bg-[#f6f7f8] dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d]">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500 dark:text-[#6f8b7f] uppercase tracking-wide">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  max={customTo || formatDate(toIstPseudoDate())}
                  className="h-8 px-2 rounded-lg bg-white dark:bg-[#0b120f] border border-gray-200 dark:border-[#22352d] text-xs text-[#111418] dark:text-[#e8f3ee] focus:outline-none focus:ring-1 focus:ring-[#137fec]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500 dark:text-[#6f8b7f] uppercase tracking-wide">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  min={customFrom}
                  max={formatDate(toIstPseudoDate())}
                  className="h-8 px-2 rounded-lg bg-white dark:bg-[#0b120f] border border-gray-200 dark:border-[#22352d] text-xs text-[#111418] dark:text-[#e8f3ee] focus:outline-none focus:ring-1 focus:ring-[#137fec]"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] font-medium text-gray-500 dark:text-[#6f8b7f] uppercase tracking-wide">Interval</label>
                <select
                  value={customIntervalValue}
                  onChange={(e) => setCustomIntervalValue(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-white dark:bg-[#0b120f] border border-gray-200 dark:border-[#22352d] text-xs text-[#111418] dark:text-[#e8f3ee] focus:outline-none focus:ring-1 focus:ring-[#137fec]"
                >
                  <option value="1">1 min</option>
                  <option value="3">3 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="60">1 hour</option>
                  <option value="day">Daily</option>
                </select>
              </div>
              <button
                type="button"
                disabled={!customFrom || !customTo || customFrom > customTo}
                onClick={() => {
                  const type = customIntervalValue === 'day' ? 'day' : 'intraday';
                  setCustomParams({ from: customFrom, to: customTo, interval: customIntervalValue, type });
                  setSelectedInterval('custom');
                  setShowCustomPanel(false);
                }}
                className="self-end h-8 px-4 rounded-lg bg-[#137fec] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        <div className="relative w-full h-[320px] bg-white dark:bg-[#111b17] mt-2 border-y border-gray-100 dark:border-[#22352d]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-[#617589] dark:text-[#9cb7aa]">Loading chart…</div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-500">{error}</div>
          ) : candles.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-[#617589] dark:text-[#9cb7aa]">No chart data.</div>
          ) : (
            <TradingChart
              candles={candles}
              intervalKey={
                selectedInterval === 'custom'
                  ? (customParams?.type === 'intraday' ? '5m' : '1D')
                  : selectedInterval
              }
              livePrice={liveLtp}
              onCrosshairMove={setHoveredTime}
            />
          )}
        </div>

        {/* Hint shown only when not hovering */}
        {!displayStats.isHovered && (
          <p className="text-center text-[10px] text-gray-400 dark:text-[#6f8b7f] pt-1 pb-0">
            Hold &amp; drag on the chart to explore price history
          </p>
        )}

        <div className="p-4 grid grid-cols-2 gap-4 gap-y-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-[#6f8b7f]">Open</span>
            <span className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">
              {displayStats.open != null ? Number(displayStats.open).toFixed(2) : '--'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-[#6f8b7f]">High</span>
            <span className="text-sm font-semibold text-[#078838] dark:text-emerald-400">
              {displayStats.high != null ? Number(displayStats.high).toFixed(2) : '--'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-[#6f8b7f]">Low</span>
            <span className="text-sm font-semibold text-red-500">
              {displayStats.low != null ? Number(displayStats.low).toFixed(2) : '--'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-[#6f8b7f]">
              {displayStats.isHovered ? 'Close' : 'Prev. Close'}
            </span>
            <span className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">
              {displayStats.isHovered
                ? (displayStats.close != null ? Number(displayStats.close).toFixed(2) : '--')
                : (prevClose != null ? Number(prevClose).toFixed(2) : '--')}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-[#6f8b7f]">Volume</span>
            <span className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">
              {displayStats.volume != null ? Number(displayStats.volume).toLocaleString('en-IN') : '--'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-[#6f8b7f]">
              {displayStats.isHovered ? 'Candle' : 'Avg. Trade Price'}
            </span>
            <span className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">
              {displayStats.isHovered
                ? `O·H·L·C`
                : (displayStats.avg != null ? Number(displayStats.avg).toFixed(2) : '--')}
            </span>
          </div>
        </div>
      </main>

      {!isIndexInstrument && (
        <OrderBottomSheet
          isOpen={orderSheet.open}
          side={orderSheet.side}
          stock={stock}
          ltpData={{ ltp: liveLtp, change: change ?? 0, changePercent: changePct ?? 0 }}
          ticksRef={ticksRef}
          tickUpdatedAtRef={tickUpdatedAtRef}
          onClose={() => setOrderSheet({ open: false, side: 'BUY' })}
          disableTrading={!isCustomerTradeAllowed}
          disableReason={marketClosedReason}
        />
      )}
    </div>
  );
};

export default ChartView;
