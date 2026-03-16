import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOptionChain } from '../../hooks/useOptionChain';
import { useMarketData } from '../../context/SocketContext';
import OrderBottomSheet from './OrderBottomSheet';
import customerApi from '../../api/customer';
import useCustomerTradingGate from '../../hooks/useCustomerTradingGate';

const STRIKE_OPTIONS = [
  { label: '6 rows', value: 6 },
  { label: '12 rows', value: 12 },
];

const normalizeUnderlyingName = (raw) => {
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const map = {
    'NIFTY 50': 'NIFTY',
    'NIFTY BANK': 'BANKNIFTY',
    'NIFTY FIN SERVICE': 'FINNIFTY',
    'NIFTY MIDCAP 100': 'MIDCPNIFTY',
    'SENSEX 50': 'SENSEX50',
  };
  return map[upper] || upper;
};

const isOptionSegment = (segment) => {
  if (!segment) return false;
  return /^(NFO|BFO|MCX|CDS)/.test(segment);
};

const formatExpiry = (dateStr) => {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const formatCompact = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '--';
  const num = Number(value);
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(1);
};

const formatLtp = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toFixed(2);
};

const OptionChain = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { ticksRef, tickUpdatedAtRef } = useMarketData();
  const { isCustomerTradeAllowed, marketClosedReason, isTradingAllowed, getClosedMessage } = useCustomerTradingGate();

  const state = location.state || {};
  const selectedStock = state.stock || null;
  const initialLtpData = state.ltpData || null;

  // Extract all identifiers from the stock for backend resolution
  const stockTradingsymbol = selectedStock?.symbol || selectedStock?.tradingsymbol || state.tradingsymbol || state.symbol;
  const stockInstrumentToken = selectedStock?.instrumentToken || selectedStock?.instrument_token || state.instrument_token;

  const rawName =
    state.name ||
    state.symbol ||
    state.tradingsymbol ||
    selectedStock?.symbol ||
    selectedStock?.tradingsymbol ||
    selectedStock?.name;

  const isDerivativeSelection = useMemo(() => {
    const segment = String(selectedStock?.segment || selectedStock?.exchange || '').toUpperCase();
    return (
      segment.includes('FUT') ||
      segment.includes('OPT') ||
      segment.startsWith('MCX') ||
      segment.startsWith('NFO') ||
      segment.startsWith('BFO')
    );
  }, [selectedStock?.segment, selectedStock?.exchange]);

  const resolveKey = stockInstrumentToken
    ? `token:${stockInstrumentToken}`
    : `symbol:${stockTradingsymbol || rawName || ''}`;

  // Resolve the underlying name: use backend lookup for derivatives
  const [resolvedUnderlying, setResolvedUnderlying] = useState(null);

  useEffect(() => {
    if (!stockInstrumentToken && !stockTradingsymbol) return;
    if (!isDerivativeSelection) return;

    // For derivatives, do a backend lookup to get the base underlying name
    const lookupParams = {};
    if (stockInstrumentToken) lookupParams.instrument_token = stockInstrumentToken;

    let cancelled = false;

    customerApi.lookupInstrument(lookupParams)
      .then((data) => {
        if (cancelled) return;
        if (data?.name) {
          console.log(`[OptionChain] Resolved underlying: ${data.name} (from token ${stockInstrumentToken})`);
          setResolvedUnderlying({
            resolveKey,
            name: normalizeUnderlyingName(data.name),
            segment: data.segment,
            tradingsymbol: data.tradingsymbol,
          });
        } else {
          // Fallback to normalizing whatever name we have
          setResolvedUnderlying({ resolveKey, name: normalizeUnderlyingName(selectedStock?.name || rawName), segment: null });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedUnderlying({ resolveKey, name: normalizeUnderlyingName(selectedStock?.name || rawName), segment: null });
      });

    return () => { cancelled = true; };
  }, [stockInstrumentToken, stockTradingsymbol, rawName, selectedStock?.name, isDerivativeSelection, resolveKey]);

  const resolvedUnderlyingName =
    resolvedUnderlying?.resolveKey === resolveKey ? resolvedUnderlying?.name : null;
  const underlyingName = isDerivativeSelection
    ? (resolvedUnderlyingName || normalizeUnderlyingName(rawName))
    : normalizeUnderlyingName(rawName);

  const rawSegment = state.segment || selectedStock?.segment || selectedStock?.exchange;
  const segmentParam = useMemo(
    () => (isOptionSegment(rawSegment) ? rawSegment : undefined),
    [rawSegment],
  );

  const [selectedExpiry, setSelectedExpiry] = useState(state.expiry || null);
  const [strikeCount, setStrikeCount] = useState(6);
  const [selection, setSelection] = useState(null);
  const [orderSheet, setOrderSheet] = useState({ open: false, side: 'BUY' });
  const [spotSnapshot, setSpotSnapshot] = useState(null);
  const [addStatus, setAddStatus] = useState(null);
  const addStatusTimerRef = useRef(null);

  const {
    chainData,
    liveByToken,
    spotPrice,
    atmPrice,
    spotInstrumentInfo,
    expiries,
    loading,
    ticksReady,
    error,
    meta,
  } = useOptionChain({
    name: underlyingName,
    segment: segmentParam,
    expiry: selectedExpiry,
    tradingsymbol: stockTradingsymbol,
    instrumentToken: stockInstrumentToken,
    subscriptionType: 'full',
    initialLtp: initialLtpData?.ltp ?? null,
  });

  const displayExpiry = selectedExpiry || meta.expiry || expiries[0] || '';
  const optionSegment = meta.segment || segmentParam || 'NFO-OPT';

  useEffect(() => {
    const timer = setTimeout(() => {
      setSelection(null);
      setOrderSheet({ open: false, side: 'BUY' });
    }, 0);
    return () => clearTimeout(timer);
  }, [underlyingName, selectedExpiry]);

  // Clear stale spotSnapshot when the spot token changes (symbol switch)
  // so header doesn't show stale data from previous instrument.
  useEffect(() => {
    setSpotSnapshot(null);
  }, [spotInstrumentInfo?.token]);

  useEffect(() => {
    const token = spotInstrumentInfo?.token ? String(spotInstrumentInfo.token) : null;
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
      if (tick) {
        setSpotSnapshot(tick);
        lastUpdate = timestamp;
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [spotInstrumentInfo, ticksRef]);

  const headerLtp = useMemo(() => {
    return (
      spotPrice ??
      spotSnapshot?.ltp ??
      spotSnapshot?.last_price ??
      initialLtpData?.ltp ??
      null
    );
  }, [spotPrice, spotSnapshot, initialLtpData]);

  const headerChange = useMemo(() => {
    if (spotSnapshot?.close && headerLtp != null) return headerLtp - spotSnapshot.close;
    return initialLtpData?.change ?? null;
  }, [spotSnapshot, headerLtp, initialLtpData]);

  const headerChangePct = useMemo(() => {
    if (spotSnapshot?.close && headerLtp != null) {
      return (headerChange / spotSnapshot.close) * 100;
    }
    return initialLtpData?.changePercent ?? null;
  }, [spotSnapshot, headerLtp, headerChange, initialLtpData]);

  // Use atmPrice (from hook) for ATM strike calculation so display window
  // always matches the subscribed window. headerLtp is only for header display.
  const currentPrice = atmPrice || 0;

  const { filteredChain, atmStrike } = useMemo(() => {
    if (!chainData?.length) {
      return { filteredChain: [], atmStrike: null };
    }

    // When spot price is unavailable, fall back to the middle of the chain
    // so existing option data stays visible during temporary tick gaps.
    let atmIndex;
    let closestStrike;
    if (currentPrice) {
      closestStrike = chainData[0].strike;
      let minDiff = Math.abs(chainData[0].strike - currentPrice);

      chainData.forEach((row) => {
        const diff = Math.abs(row.strike - currentPrice);
        if (diff < minDiff) {
          minDiff = diff;
          closestStrike = row.strike;
        }
      });

      atmIndex = chainData.findIndex((row) => row.strike === closestStrike);
    } else {
      atmIndex = Math.floor(chainData.length / 2);
      closestStrike = chainData[atmIndex].strike;
    }
    const strikesPerSide = Math.floor(strikeCount / 2);

    let startIndex = Math.max(0, atmIndex - strikesPerSide);
    let endIndex = Math.min(chainData.length, atmIndex + strikesPerSide + 1);

    if (endIndex - startIndex < strikeCount + 1) {
      const missing = strikeCount + 1 - (endIndex - startIndex);
      startIndex = Math.max(0, startIndex - missing);
      endIndex = Math.min(chainData.length, startIndex + strikeCount + 1);
    }

    return {
      filteredChain: chainData.slice(startIndex, endIndex),
      atmStrike: closestStrike,
    };
  }, [chainData, currentPrice, strikeCount]);

  const selectedOption = useMemo(() => {
    if (!selection?.strike || !chainData?.length) return null;
    const row = chainData.find((item) => item.strike === selection.strike);
    if (!row) return null;
    const option = selection.type === 'CE' ? row.call : row.put;
    if (!option) return null;
    return { ...option, strike: row.strike, type: selection.type };
  }, [selection, chainData]);

  const selectedOptionToken = selectedOption?.instrument_token ?? null;
  const selectedOptionSymbol = selectedOption?.tradingsymbol ?? '';
  const selectedOptionLotSize = selectedOption?.lot_size ?? null;

  const orderStock = useMemo(() => {
    if (!selectedOptionToken) return null;
    const exchange = optionSegment.includes('-') ? optionSegment.split('-')[0] : optionSegment;
    return {
      instrumentToken: selectedOptionToken,
      symbol: selectedOptionSymbol,
      name: underlyingName,
      exchange,
      segment: optionSegment,
      lot_size: selectedOptionLotSize,
      expiry: meta.expiry || displayExpiry || null,
    };
  }, [
    selectedOptionToken,
    selectedOptionSymbol,
    selectedOptionLotSize,
    underlyingName,
    optionSegment,
    meta.expiry,
    displayExpiry,
  ]);

  const openOrderSheet = (side) => {
    if (!isTradingAllowed({ segment: optionSegment })) return;
    if (!orderStock) return;
    setOrderSheet({ open: true, side });
  };

  const addSelectedToWatchlist = async () => {
    if (!selectedOption) {
      setAddStatus({ type: 'error', message: 'Select an option strike first.' });
      return;
    }

    const listName = typeof window !== 'undefined'
      ? sessionStorage.getItem('active_watchlist') || 'Watchlist 1'
      : 'Watchlist 1';

    const exchange = optionSegment.includes('-') ? optionSegment.split('-')[0] : optionSegment;

    try {
      const response = await customerApi.updateWatchlist({
        action: 'add',
        symbol: selectedOption.tradingsymbol,
        listName,
        instrumentToken: selectedOption.instrument_token,
        instrumentName: underlyingName,
        exchange,
        segment: optionSegment,
      });

      if (typeof window !== 'undefined' && response?.watchlists) {
        const order = response.watchlists.map((list) => list.name);
        const lists = {};
        response.watchlists.forEach((list) => {
          const listKey = list.name;
          const instruments = (list.instruments || []).map((item) => ({
            id: item.instrumentToken || item.instrument_token || item.symbol,
            symbol: item.symbol,
            name: item.name || item.symbol,
            exchange: item.exchange || item.segment || 'NSE',
            segment: item.segment || null,
            instrument_type: item.instrument_type || null,
            instrumentToken: item.instrumentToken || item.instrument_token,
          }));
          lists[listKey] = instruments;
        });
        sessionStorage.setItem('watchlists_cache', JSON.stringify({ order, lists }));
        sessionStorage.setItem('watchlist_cache_time', Date.now().toString());
        if (lists[listName]) {
          sessionStorage.setItem('watchlist_cache', JSON.stringify(lists[listName]));
        }
      }

      setAddStatus({ type: 'success', message: `Added to ${listName}` });
      clearTimeout(addStatusTimerRef.current);
      addStatusTimerRef.current = setTimeout(() => setAddStatus(null), 2000);
    } catch (err) {
      setAddStatus({ type: 'error', message: err?.message || 'Failed to add to watchlist' });
      clearTimeout(addStatusTimerRef.current);
      addStatusTimerRef.current = setTimeout(() => setAddStatus(null), 2500);
    }
  };

  const closeOrderSheet = () => {
    setOrderSheet({ open: false, side: 'BUY' });
  };

  // Clear addStatus timer on unmount to avoid state updates after component is gone
  useEffect(() => {
    return () => { clearTimeout(addStatusTimerRef.current); };
  }, []);

  if (!underlyingName) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] flex items-center justify-center text-[#617589] dark:text-[#9cb7aa] text-sm">
        Select an instrument to view option chain.
      </div>
    );
  }

  const isPositive = headerChangePct == null ? true : headerChangePct >= 0;

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] text-[#111418] dark:text-[#e8f3ee] flex flex-col overflow-x-hidden">
      <header className="bg-white dark:bg-[#0b120f] border-b border-gray-200 dark:border-[#22352d] shadow-sm">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 pt-3 sm:pt-4 pb-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center justify-center size-9 sm:size-10 rounded-full hover:bg-gray-100 dark:hover:bg-[#16231d] transition-colors shrink-0"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex flex-col min-w-0">
              <h2 className="text-base sm:text-lg font-bold leading-tight truncate">{rawName || underlyingName}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold tabular-nums">
                  {headerLtp != null ? `₹${Number(headerLtp).toFixed(2)}` : '—'}
                </span>
                {headerChangePct != null && (
                  <span
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      isPositive ? 'text-green-600 bg-green-50 dark:bg-emerald-900/20 dark:text-emerald-400' : 'text-red-600 bg-red-50 dark:text-red-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}{headerChangePct.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={addSelectedToWatchlist}
            disabled={!selectedOption}
            className={`text-[#617589] dark:text-[#9cb7aa] hover:text-[#137fec] transition-colors flex items-center gap-1 text-xs font-semibold shrink-0 ${!selectedOption ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Add to Watchlist"
          >
            <span className="material-symbols-outlined text-[20px]">playlist_add</span>
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
        <div className="px-3 sm:px-4 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <div className="flex items-center bg-gray-100 dark:bg-[#16231d] rounded-lg px-2.5 sm:px-3 py-1.5 min-w-0">
              <span className="text-xs font-semibold text-gray-500 dark:text-[#6f8b7f] uppercase mr-2">Exp</span>
              <select
                value={displayExpiry}
                onChange={(event) => setSelectedExpiry(event.target.value)}
                className="text-sm font-medium bg-transparent dark:text-[#e8f3ee] focus:outline-none min-w-0 w-full"
              >
                {expiries.map((exp) => (
                  <option key={exp} value={exp}>
                    {formatExpiry(exp)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center bg-gray-100 dark:bg-[#16231d] rounded-lg px-2.5 sm:px-3 py-1.5 min-w-0">
              <span className="text-xs font-semibold text-gray-500 dark:text-[#6f8b7f] uppercase mr-2">Rows</span>
              <select
                value={strikeCount}
                onChange={(event) => setStrikeCount(Number(event.target.value))}
                className="text-sm font-medium bg-transparent dark:text-[#e8f3ee] focus:outline-none min-w-0 w-full"
              >
                {STRIKE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-gray-500 dark:text-[#6f8b7f]">Spot</span>
            <div className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded text-[#137fec] text-sm font-bold tabular-nums">
              {headerLtp != null ? Number(headerLtp).toFixed(1) : '--'}
            </div>
          </div>
        </div>
        {addStatus && (
          <div className={`px-4 pb-2 text-xs font-medium ${addStatus.type === 'error' ? 'text-red-500' : 'text-green-600 dark:text-emerald-400'}`}>
            {addStatus.message}
          </div>
        )}
      </header>

      <div className="flex-none bg-gray-50 dark:bg-[#0b120f] border-b border-gray-200 dark:border-[#22352d] text-[11px] font-semibold text-gray-500 dark:text-[#6f8b7f] uppercase tracking-wide shadow-sm">
        <div className="grid grid-cols-[1fr_64px_1fr] sm:grid-cols-[1fr_74px_1fr] md:grid-cols-[1fr_90px_1fr]">
          <div className="bg-red-50/50 dark:bg-red-900/10 border-r border-gray-200 dark:border-[#22352d] flex justify-between px-2 py-2.5">
            <div className="w-10 text-center">OI</div>
            <div className="w-10 text-center hidden sm:block">Vol</div>
            <div className="flex-1 text-right pr-2">LTP</div>
          </div>
          <div className="bg-gray-100 dark:bg-[#16231d] text-center py-2.5 flex items-center justify-center text-[#111418] dark:text-[#e8f3ee] font-bold border-r border-gray-200 dark:border-[#22352d]">
            Strike
          </div>
          <div className="bg-green-50/50 dark:bg-emerald-900/10 flex justify-between px-2 py-2.5">
            <div className="flex-1 text-left pl-2">LTP</div>
            <div className="w-10 text-center hidden sm:block">Vol</div>
            <div className="w-10 text-center">OI</div>
          </div>
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-[#0b120f] relative">
        {(loading && !chainData.length) || (!loading && chainData.length > 0 && !ticksReady) ? (
          <div className="h-full flex items-center justify-center text-sm text-[#617589] dark:text-[#9cb7aa]">
            Loading option chain…
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-sm text-red-500">
            {error}
          </div>
        ) : filteredChain.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[#617589] dark:text-[#9cb7aa]">
            No option chain data available.
          </div>
        ) : (
          <div className="flex flex-col pb-6">
            {filteredChain.map((row) => {
              const isATM = row.strike === atmStrike;
              const isCallITM = currentPrice && row.strike < currentPrice;
              const isPutITM = currentPrice && row.strike > currentPrice;
              const isSelectedCall = selection?.strike === row.strike && selection?.type === 'CE';
              const isSelectedPut = selection?.strike === row.strike && selection?.type === 'PE';

              // Merge live tick values from flat map — falls back to static API data.
              const callToken = row.call?.instrument_token ? String(row.call.instrument_token) : null;
              const putToken = row.put?.instrument_token ? String(row.put.instrument_token) : null;
              const callLive = callToken ? liveByToken[callToken] : null;
              const putLive = putToken ? liveByToken[putToken] : null;

              const callLtp = callLive?.ltp ?? row.call?.ltp;
              const callOi = callLive?.oi ?? row.call?.oi;
              const callVolume = callLive?.volume ?? row.call?.volume;
              const putLtp = putLive?.ltp ?? row.put?.ltp;
              const putOi = putLive?.oi ?? row.put?.oi;
              const putVolume = putLive?.volume ?? row.put?.volume;

              return (
                <div
                  key={row.strike}
                  className={`grid grid-cols-[1fr_64px_1fr] sm:grid-cols-[1fr_74px_1fr] md:grid-cols-[1fr_90px_1fr] border-b border-gray-100 dark:border-[#22352d] h-12 sm:h-14 ${isATM ? 'bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-[#16231d]'}`}
                >
                  <button
                    type="button"
                    onClick={() => row.call?.instrument_token && setSelection({ strike: row.strike, type: 'CE' })}
                    className={`border-r border-gray-100 dark:border-[#22352d] flex h-full items-center justify-between px-2 text-sm tabular-nums text-[#111418] dark:text-[#e8f3ee] ${
                      isCallITM ? 'bg-[#fffbeb] dark:bg-amber-900/10' : ''
                    } ${isSelectedCall ? 'ring-1 ring-[#137fec] z-10' : ''}`}
                  >
                    <div className="w-10 text-center text-gray-500 dark:text-[#6f8b7f]">{formatCompact(callOi)}</div>
                    <div className="w-10 text-center text-gray-400 dark:text-[#6f8b7f] hidden md:block">{formatCompact(callVolume)}</div>
                    <div className="flex-1 text-right font-medium pr-2 text-green-600 dark:text-emerald-400">
                      {formatLtp(callLtp)}
                    </div>
                  </button>

                  <div className={`flex items-center justify-center text-sm font-bold tabular-nums border-r border-gray-200 dark:border-[#22352d] ${
                    isATM ? 'bg-[#137fec] text-white' : 'bg-gray-50 dark:bg-[#111b17] text-[#111418] dark:text-[#e8f3ee]'
                  }`}>
                    {row.strike}
                  </div>

                  <button
                    type="button"
                    onClick={() => row.put?.instrument_token && setSelection({ strike: row.strike, type: 'PE' })}
                    className={`flex h-full items-center justify-between px-2 text-sm tabular-nums text-[#111418] dark:text-[#e8f3ee] ${
                      isPutITM ? 'bg-[#fffbeb] dark:bg-amber-900/10' : ''
                    } ${isSelectedPut ? 'ring-1 ring-[#137fec] z-10' : ''}`}
                  >
                    <div className="flex-1 text-left font-medium pl-2 text-red-600 dark:text-red-400">
                      {formatLtp(putLtp)}
                    </div>
                    <div className="w-10 text-center text-gray-400 dark:text-[#6f8b7f] hidden md:block">{formatCompact(putVolume)}</div>
                    <div className="w-10 text-center text-gray-500 dark:text-[#6f8b7f]">{formatCompact(putOi)}</div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="flex-none bg-white dark:bg-[#0b120f] border-t border-gray-200 dark:border-[#22352d] p-3 sm:p-4 pb-5 sm:pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center gap-2 mb-3 px-1 min-w-0">
          <span className="text-xs text-gray-500 dark:text-[#6f8b7f] min-w-0 truncate">
            Selected:{' '}
            <span className="font-bold text-[#111418] dark:text-[#e8f3ee]">
              {selectedOption ? `${selectedOption.strike} ${selectedOption.type === 'CE' ? 'Call' : 'Put'}` : '—'}
            </span>
          </span>
          <span className="text-xs font-bold text-[#111418] dark:text-[#e8f3ee] tabular-nums shrink-0">
            {(() => {
              const live = selectedOptionToken ? liveByToken[selectedOptionToken] : null;
              const ltp = live?.ltp ?? selectedOption?.ltp;
              return `LTP ${ltp != null ? `₹${Number(ltp).toFixed(2)}` : '—'}`;
            })()}
          </span>
        </div>
        {isTradingAllowed({ segment: optionSegment }) ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => openOrderSheet('BUY')}
              disabled={!selectedOption}
              className="flex items-center justify-center h-12 rounded-lg bg-[#137fec] hover:bg-blue-600 text-white font-bold text-base transition-colors shadow-sm disabled:opacity-50"
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => openOrderSheet('SELL')}
              disabled
              className="flex items-center justify-center h-12 rounded-lg bg-gray-200 dark:bg-[#22352d] text-gray-400 dark:text-[#6f8b7f] font-bold text-base shadow-sm cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">lock</span>
              SELL
            </button>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {getClosedMessage({ segment: optionSegment }) || marketClosedReason}
          </p>
        )}
      </footer>

      <OrderBottomSheet
        isOpen={orderSheet.open}
        side={orderSheet.side}
        stock={orderStock}
        ltpData={{ ltp: (selectedOptionToken ? liveByToken[selectedOptionToken]?.ltp : null) ?? selectedOption?.ltp ?? null, change: 0, changePercent: 0 }}
        ticksRef={ticksRef}
        tickUpdatedAtRef={tickUpdatedAtRef}
        orderTypeOverride="OPTION_CHAIN"
        onClose={closeOrderSheet}
        disableTrading={!isTradingAllowed({ exchange: orderStock?.exchange, segment: orderStock?.segment || optionSegment })}
        disableReason={getClosedMessage({ exchange: orderStock?.exchange, segment: orderStock?.segment || optionSegment }) || marketClosedReason}
      />
    </div>
  );
};

export default OptionChain;
