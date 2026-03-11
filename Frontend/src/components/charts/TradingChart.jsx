import { useEffect, useMemo, useRef, useCallback } from 'react';
import { createChart, CrosshairMode, LineSeries, TickMarkType } from 'lightweight-charts';

const IST_TIME_ZONE = 'Asia/Kolkata';

const IST_CROSSHAIR_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const IST_TIME_LABEL_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const IST_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  day: '2-digit',
  month: 'short',
});

const IST_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  month: 'short',
  year: '2-digit',
});

const IST_YEAR_LABEL_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
});

const toUnixSeconds = (value) => {
  if (value == null) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.floor(Math.abs(value) > 1e12 ? value / 1000 : value);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return null;

    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
      const numeric = Number(normalized);
      if (!Number.isFinite(numeric)) return null;
      return Math.floor(Math.abs(numeric) > 1e12 ? numeric / 1000 : numeric);
    }

    const timestampMs = new Date(normalized).getTime();
    if (!Number.isFinite(timestampMs)) return null;
    return Math.floor(timestampMs / 1000);
  }

  if (typeof value === 'object' && value !== null) {
    const year = Number(value.year);
    const month = Number(value.month);
    const day = Number(value.day);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return Math.floor(Date.UTC(year, month - 1, day) / 1000);
    }
  }

  return null;
};

const normalizeLineData = (candles) => {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const byTime = new Map();

  candles.forEach((candle) => {
    const time = toUnixSeconds(candle?.[0]);
    const value = Number(candle?.[4]);
    if (time == null || !Number.isFinite(value)) return;
    byTime.set(time, value);
  });

  return Array.from(byTime.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
};

const isDarkMode = () =>
  typeof document !== 'undefined' &&
  document.documentElement.classList.contains('dark');

// Intervals that show intraday candles — time (HH:MM) must be visible on x-axis
const INTRADAY_KEYS = new Set(['1m', '3m', '5m', '10m', '15m', '30m', '1H']);

const TradingChart = ({ candles = [], intervalKey = '5m', livePrice = null, onCrosshairMove }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const priceLineRef = useRef(null);
  // Use a ref for the callback to avoid stale closures inside the mount useEffect
  const onCrosshairMoveRef = useRef(onCrosshairMove);
  useEffect(() => { onCrosshairMoveRef.current = onCrosshairMove; }, [onCrosshairMove]);

  const lineData = useMemo(() => normalizeLineData(candles), [candles]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const dark = isDarkMode();

    // autoSize: true handles all resizing internally via its own ResizeObserver.
    // Do NOT add a manual ResizeObserver alongside it — they conflict and cause
    // the canvas to render at wrong pixel dimensions, misaligning lines and axes.
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: dark ? '#111b17' : '#ffffff' },
        textColor: dark ? '#9cb7aa' : '#617589',
      },
      grid: {
        vertLines: { color: dark ? '#22352d' : '#f0f2f4' },
        horzLines: { color: dark ? '#22352d' : '#f0f2f4' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: dark ? '#6f8b7f' : '#95a6b5',
          width: 1,
          labelBackgroundColor: '#137fec',
        },
        horzLine: {
          color: dark ? '#6f8b7f' : '#95a6b5',
          width: 1,
          labelBackgroundColor: '#137fec',
        },
      },
      rightPriceScale: {
        borderColor: dark ? '#22352d' : '#f0f2f4',
        entireTextOnly: true,
      },
      localization: {
        locale: 'en-IN',
        timeFormatter: (time) => {
          const seconds = toUnixSeconds(time);
          if (seconds == null) return '';
          return IST_CROSSHAIR_FORMATTER.format(new Date(seconds * 1000));
        },
      },
      timeScale: {
        borderColor: dark ? '#22352d' : '#f0f2f4',
        timeVisible: true,
        secondsVisible: false,
        // Right padding so the live price label doesn't clip the last data point
        rightOffset: 12,
        // Prevent scrolling past data edges
        fixLeftEdge: true,
        minBarSpacing: 3,
        tickMarkFormatter: (time, tickMarkType) => {
          const seconds = toUnixSeconds(time);
          if (seconds == null) return null;

          const date = new Date(seconds * 1000);
          if (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds) {
            return IST_TIME_LABEL_FORMATTER.format(date);
          }
          if (tickMarkType === TickMarkType.DayOfMonth) {
            return IST_DAY_LABEL_FORMATTER.format(date);
          }
          if (tickMarkType === TickMarkType.Month) {
            return IST_MONTH_LABEL_FORMATTER.format(date);
          }
          if (tickMarkType === TickMarkType.Year) {
            return IST_YEAR_LABEL_FORMATTER.format(date);
          }
          return null;
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#137fec',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lastValueVisible: true,
      // Disable the built-in price line — we create a manual one for the live price
      // to avoid two overlapping horizontal lines at the same value
      priceLineVisible: false,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    // Subscribe to crosshair move so parent can update OHLC stats to the hovered candle
    const handleCrosshairMove = (param) => {
      if (!param.time || !param.point) {
        // Crosshair left chart area — clear hovered candle
        onCrosshairMoveRef.current?.(null);
        return;
      }
      // param.time is the UTCTimestamp (Unix seconds) of the data point under the crosshair
      onCrosshairMoveRef.current?.(param.time);
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (lineSeriesRef.current && priceLineRef.current) {
        try { lineSeriesRef.current.removePriceLine(priceLineRef.current); } catch (_) {}
        priceLineRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      lineSeriesRef.current = null;
    };
  }, []);

  // Set data and fit content whenever candles change
  useEffect(() => {
    if (!lineSeriesRef.current) return;
    lineSeriesRef.current.setData(lineData);
    if (lineData.length > 1) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [lineData]);

  // Show time (HH:MM) on x-axis for intraday intervals, dates only for daily
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      timeVisible: INTRADAY_KEYS.has(intervalKey),
      secondsVisible: false,
    });
  }, [intervalKey]);

  // Overlay live price as a single clean horizontal line
  useEffect(() => {
    const lineSeries = lineSeriesRef.current;
    if (!lineSeries) return;

    if (priceLineRef.current) {
      try { lineSeries.removePriceLine(priceLineRef.current); } catch (_) {}
      priceLineRef.current = null;
    }

    const price = Number(livePrice);
    if (!Number.isFinite(price) || lineData.length === 0) return;

    // Extend the line tip to the live price at the last known timestamp
    const lastTime = lineData[lineData.length - 1].time;
    lineSeries.update({ time: lastTime, value: price });

    priceLineRef.current = lineSeries.createPriceLine({
      price,
      color: '#137fec',
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: 'LTP',
    });
  }, [lineData, livePrice]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default TradingChart;
