import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';

const MARKET_CLOSED_TEXT = 'Market Closed. Open From 9:15AM To 3:15PM On Working Days';
const LIVE_TICK_MAX_AGE_MS = 3 * 1000;

const computeValidity = (productType, expiry) => {
  const now = new Date();

  if (productType === 'MIS') {
    const endOfDay = new Date(now);
    endOfDay.setHours(15, 15, 0, 0);
    return { type: 'DAY', expiresAt: endOfDay.toISOString() };
  }

  // Derivative with instrument expiry
  if (expiry) {
    const expiryDate = new Date(expiry);
    if (!Number.isNaN(expiryDate.getTime())) {
      expiryDate.setHours(15, 15, 0, 0);
      return { type: 'EXPIRY', expiresAt: expiryDate.toISOString() };
    }
  }

  // Equity longterm: 7 calendar days from now, at market close
  const equity7d = new Date(now);
  equity7d.setDate(equity7d.getDate() + 7);
  equity7d.setHours(15, 15, 0, 0);
  return { type: 'EQUITY_7D', expiresAt: equity7d.toISOString() };
};

const extractValidPrice = (data, isBuy = true) => {
  if (!data) return null;
  if (data.ltp != null && data.ltp > 0) return data.ltp;
  if (isBuy && data.bestAskPrice != null && data.bestAskPrice > 0) return data.bestAskPrice;
  if (!isBuy && data.bestBidPrice != null && data.bestBidPrice > 0) return data.bestBidPrice;
  if (isBuy && data.bestBidPrice != null && data.bestBidPrice > 0) return data.bestBidPrice;
  if (!isBuy && data.bestAskPrice != null && data.bestAskPrice > 0) return data.bestAskPrice;
  if (data.close != null && data.close > 0) return data.close;
  return null;
};

const OrderBottomSheet = ({
  isOpen,
  side,
  stock,
  ltpData,
  ticksRef,
  tickUpdatedAtRef,
  onClose,
  onOrderPlaced,
  orderTypeOverride,
  disableTrading = false,
  disableReason = '',
}) => {
  const [productType, setProductType] = useState('MIS');
  const [orderType, setOrderType] = useState('MARKET');
  const [qty, setQty] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [funds, setFunds] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [resolvedLotSize, setResolvedLotSize] = useState(null);
  const [resolvedExpiry, setResolvedExpiry] = useState(null);
  const latestTickRef = useRef(null);
  const lastLiveRef = useRef({ price: null, change: null, changePercent: null });
  const [liveMeta, setLiveMeta] = useState({ price: null, change: null, changePercent: null });

  const navigate = useNavigate();
  const instrumentToken = stock?.instrumentToken || stock?.instrument_token || null;
  const lotSize = stock?.lot_size || stock?.lotSize || resolvedLotSize || 1;
  const instrumentExpiry = stock?.expiry || resolvedExpiry || null;
  const safeSide = side || 'BUY';
  const isBuy = safeSide === 'BUY';
  const isLongTerm = productType === 'CNC';
  const isOrderTypeLocked = (type) => isLongTerm && (type === 'SL' || type === 'TGT');

  useEffect(() => {
    if (!isOpen || !instrumentToken || !ticksRef?.current) {
      latestTickRef.current = null;
      setLiveMeta({ price: null, change: null, changePercent: null });
      lastLiveRef.current = { price: null, change: null, changePercent: null };
      return undefined;
    }

    let animationFrameId;
    let lastUpdate = 0;
    const THROTTLE_MS = 33.33;

    const updateLoop = (timestamp) => {
      if (timestamp - lastUpdate < THROTTLE_MS) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      const tick = ticksRef.current.get(String(instrumentToken)) || null;
      latestTickRef.current = tick;

      if (tick) {
        const nextPrice = extractValidPrice(tick, isBuy);
        const close = tick.close ?? tick.prev_close ?? null;
        const nextChange =
          nextPrice != null && close != null
            ? Number(nextPrice) - Number(close)
            : null;
        const nextChangePercent =
          nextChange != null && Number(close)
            ? (Number(nextChange) / Number(close)) * 100
            : null;

        const prev = lastLiveRef.current;
        const hasChanged = prev.price !== nextPrice
          || prev.change !== nextChange
          || prev.changePercent !== nextChangePercent;

        if (hasChanged) {
          const nextMeta = {
            price: nextPrice,
            change: nextChange,
            changePercent: nextChangePercent,
          };
          lastLiveRef.current = nextMeta;
          setLiveMeta(nextMeta);
        }
      }

      lastUpdate = timestamp;
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isOpen, instrumentToken, isBuy, ticksRef]);

  const livePrice = useMemo(() => {
    return liveMeta.price ?? ltpData?.ltp ?? null;
  }, [liveMeta.price, ltpData]);

  const change = liveMeta.change ?? ltpData?.change ?? 0;
  const changePercent = liveMeta.changePercent ?? ltpData?.changePercent ?? 0;

  const safeLots = useMemo(() => {
    const n = Number(qty);
    if (qty === '' || !Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }, [qty]);

  const totalQty = useMemo(() => {
    if (!safeLots) return 0;
    return safeLots * (Number(lotSize) || 1);
  }, [safeLots, lotSize]);

  const estimatedMargin = useMemo(() => {
    if (!livePrice || !totalQty) return 0;
    return Number((Number(livePrice) * Number(totalQty)).toFixed(2));
  }, [livePrice, totalQty]);

  // Detect option instruments from segment or symbol suffix
  const isOption = useMemo(() => {
    const seg = String(stock?.segment || '').toUpperCase();
    const sym = String(stock?.symbol || '').toUpperCase();
    return seg.includes('OPT') || sym.endsWith('CE') || sym.endsWith('PE') || sym.endsWith('CALL') || sym.endsWith('PUT');
  }, [stock?.segment, stock?.symbol]);

  const availableBalance = useMemo(() => {
    if (!funds) return 0;
    // Options use ONLY the option premium balance
    if (isOption) {
      return funds?.trading?.optionPremium?.remaining ?? 0;
    }
    if (productType === 'MIS') {
      return funds?.balance?.intraday?.free ?? 0;
    }
    return funds?.balance?.overnight?.available ?? 0;
  }, [funds, productType, isOption]);

  // Reset form state when sheet opens with a new stock/side
  useEffect(() => {
    if (!isOpen) return;
    setProductType('MIS');
    setOrderType(orderTypeOverride || 'MARKET');
    setQty('');
    setPriceInput('');
    setTriggerPrice('');
    setTargetPrice('');
    setFeedback(null);
    setResolvedLotSize(null);
    setResolvedExpiry(null);

    // Fetch lot_size/expiry from instrument when local stock data is incomplete
    const hasLotSize = stock?.lot_size || stock?.lotSize;
    const hasExpiry = !!stock?.expiry;
    if ((!hasLotSize || !hasExpiry) && instrumentToken) {
      customerApi.lookupInstrument({ instrument_token: instrumentToken })
        .then((data) => {
          if (data?.lot_size) setResolvedLotSize(Number(data.lot_size));
          if (data?.expiry) setResolvedExpiry(data.expiry);
        })
        .catch(() => {});
    }
  }, [isOpen, instrumentToken, side, orderTypeOverride, stock?.lot_size, stock?.lotSize, stock?.expiry]);

  useEffect(() => {
    if (!isOpen) return;
    const loadFunds = async () => {
      try {
        const response = await customerApi.getBalance();
        setFunds(response);
      } catch (err) {
        console.error('Failed to fetch funds:', err);
      }
    };
    loadFunds();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const isMarketLike = orderType === 'MARKET' || orderType === 'OPTION_CHAIN';
    if (isMarketLike) {
      if (livePrice != null) {
        setPriceInput(Number(livePrice).toFixed(2));
      }
    }
  }, [isOpen, orderType, livePrice]);

  useEffect(() => {
    if (productType !== 'CNC') return;
    if (orderType === 'SL' || orderType === 'TGT') {
      setOrderType('MARKET');
      setTriggerPrice('');
      setTargetPrice('');
    }
  }, [productType, orderType]);

  if (!isOpen || !stock) return null;

  const handlePlaceOrder = async () => {
    if (disableTrading) {
      setFeedback({
        type: 'error',
        message: disableReason || MARKET_CLOSED_TEXT,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    if (!safeLots || !totalQty) {
      setFeedback({ type: 'error', message: 'Please enter the number of lots to place this order.' });
      setSubmitting(false);
      return;
    }
    if (!instrumentToken) {
      setFeedback({ type: 'error', message: 'Instrument token missing. Please re-open order sheet.' });
      setSubmitting(false);
      return;
    }

    if (isLongTerm && (orderType === 'SL' || orderType === 'TGT')) {
      setFeedback({
        type: 'error',
        message: 'SL and Target orders are locked for Longterm (CNC). Use Market order.',
      });
      setSubmitting(false);
      return;
    }

    const tokenKey = instrumentToken ? String(instrumentToken) : null;
    const freshTickRaw = tokenKey ? (ticksRef?.current?.get(tokenKey) || null) : null;
    const updatedAt = tokenKey ? Number(tickUpdatedAtRef?.current?.get(tokenKey) || 0) : 0;
    const tickAgeMs = updatedAt > 0 ? (Date.now() - updatedAt) : Number.POSITIVE_INFINITY;
    const hasFreshTick = !!freshTickRaw && (
      !tickUpdatedAtRef?.current ||
      (updatedAt > 0 && tickAgeMs <= LIVE_TICK_MAX_AGE_MS)
    );
    const freshTick = hasFreshTick ? freshTickRaw : null;
    const freshPrice =
      extractValidPrice(freshTick, isBuy) ??
      (hasFreshTick ? extractValidPrice(latestTickRef.current, isBuy) : null);

    let orderPrice = Number(priceInput);
    const isMarketLike = orderType === 'MARKET' || orderType === 'OPTION_CHAIN';
    if (isMarketLike && (!hasFreshTick || freshPrice == null || Number(freshPrice) <= 0)) {
      setFeedback({
        type: 'error',
        message: 'Live quote is stale or unavailable. Please wait for a fresh tick before placing this order.',
      });
      setSubmitting(false);
      return;
    }
    if (isMarketLike) {
      orderPrice = freshPrice ?? (livePrice != null ? Number(livePrice) : 0);
    }

    if (!orderPrice || orderPrice <= 0) {
      setFeedback({ type: 'error', message: 'Price unavailable. Please try again.' });
      setSubmitting(false);
      return;
    }

    const validity = computeValidity(productType, instrumentExpiry);

    const orderTypePayload = orderType === 'TGT' ? 'LIMIT' : orderType;

    try {
      const response = await customerApi.placeOrder({
        instrument_token: instrumentToken,
        symbol: stock.symbol,
        exchange: stock.exchange || stock.segment || 'NSE',
        segment: stock.segment || stock.exchange || 'NSE',
        side: isBuy ? 'BUY' : 'SELL',
        product: productType === 'MIS' ? 'MIS' : 'CNC',
        price: orderPrice,
        quantity: totalQty,
        lots: Number(safeLots) || 0,
        lot_size: Number(lotSize) || 1,
        order_type: orderTypePayload,
        expiry: instrumentExpiry,
        trigger_price: orderType === 'SL' ? Number(triggerPrice || 0) : 0,
        target: orderType === 'TGT' ? Number(targetPrice || 0) : 0,
        meta: {
          orderType,
          validity,
          triggerPrice,
          targetPrice,
          selectedStock: {
            symbol: stock?.symbol,
            exchange: stock?.exchange || stock?.segment || 'NSE',
            segment: stock?.segment || stock?.exchange || 'NSE',
            instrument_token: instrumentToken,
            lot_size: Number(lotSize) || 1,
            expiry: instrumentExpiry,
          },
        },
      });

      const orderData = response?.order || {};
      const requiresApproval =
        orderData?.requires_approval ??
        orderData?.requiresApproval ??
        (productType !== 'MIS');

      navigate('/order-confirmation', {
        state: {
          referenceId: orderData?._id || orderData?.id || response?.orderId || response?.id,
          orderId:
            orderData?.order_id ||
            orderData?.orderId ||
            orderData?.broker_order_id ||
            orderData?.exchange_order_id ||
            orderData?._id ||
            orderData?.id ||
            response?.orderId ||
            response?.id,
          symbol: stock.symbol,
          name: stock.name,
          exchange: stock.exchange || 'NSE',
          segment: stock.segment || stock.exchange || 'EQUITY',
          price: Number(orderData?.price || orderPrice),
          side: isBuy ? 'BUY' : 'SELL',
          quantity: Number(orderData?.quantity || totalQty),
          orderType: orderData?.order_type || orderTypePayload,
          productType,
          placedAt: orderData?.placed_at || orderData?.placedAt || orderData?.createdAt || new Date().toISOString(),
          status: orderData?.status || (requiresApproval ? 'PENDING' : 'EXECUTED'),
          ltp: livePrice,
          change,
          changePercent,
          requiresApproval: Boolean(requiresApproval),
        },
      });
      if (typeof onOrderPlaced === 'function') onOrderPlaced();
      onClose?.();
    } catch (err) {
      const message = err?.message || 'Order failed. Please try again.';
      setFeedback({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  const metaTextClass = isBuy ? 'text-blue-100' : 'text-red-100';
  const accentColor = isBuy ? 'text-[#137fec]' : 'text-red-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white dark:bg-[#111b17] rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300 mx-auto">
        <div className={`${isBuy ? 'bg-[#137fec]' : 'bg-red-500'} px-4 py-3 text-white`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold tracking-tight">{isBuy ? 'BUY' : 'SELL'} {stock.symbol}</h3>
              <div className={`flex items-center gap-2 mt-1 ${metaTextClass} text-xs`}>
                <span className="font-medium bg-white/20 px-1 rounded text-xs">{stock.exchange || 'NSE'}</span>
                <span>{livePrice != null ? `₹${Number(livePrice).toFixed(2)}` : '—'}</span>
                <span className="font-medium">
                  {change >= 0 ? '+' : ''}{Number(change).toFixed(2)} ({changePercent >= 0 ? '+' : ''}{Number(changePercent).toFixed(2)}%)
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1" />
          </div>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto max-h-[75vh]">
          <div>
            <div className="flex p-1 bg-gray-100 dark:bg-[#0b120f] rounded-lg">
              <button
                type="button"
                onClick={() => setProductType('MIS')}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all border ${productType === 'MIS'
                  ? `bg-white dark:bg-[#16231d] ${accentColor} shadow-sm border-gray-200 dark:border-[#22352d]`
                  : 'text-gray-500 dark:text-[#9cb7aa] border-transparent'
                }`}
              >
                Intraday <span className="text-[10px] font-normal text-gray-500 ml-1">MIS</span>
              </button>
              <button
                type="button"
                onClick={() => setProductType('CNC')}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all border ${productType === 'CNC'
                  ? `bg-white dark:bg-[#16231d] ${accentColor} shadow-sm border-gray-200 dark:border-[#22352d]`
                  : 'text-gray-500 dark:text-[#9cb7aa] border-transparent'
                }`}
              >
                Longterm <span className="text-[10px] font-normal ml-1">CNC</span>
              </button>
            </div>
          </div>

          {!orderTypeOverride && (
            <div className="flex gap-4 w-full px-1">
              {['MARKET', 'SL', 'TGT'].map((type) => (
                <label
                  key={type}
                  className={`flex items-center gap-2 group ${isOrderTypeLocked(type) ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                >
                  <input
                    className={`w-4 h-4 ${isBuy ? 'text-[#137fec] focus:ring-[#137fec]' : 'text-red-500 focus:ring-red-500'} border-gray-300`}
                    name="order_type"
                    type="radio"
                    value={type}
                    checked={orderType === type}
                    disabled={isOrderTypeLocked(type)}
                    onChange={() => {
                      if (isOrderTypeLocked(type)) return;
                      setOrderType(type);
                    }}
                  />
                  <span className={`text-sm flex items-center gap-1 ${orderType === type ? 'font-bold text-gray-900 dark:text-[#e8f3ee]' : 'text-gray-500 dark:text-[#9cb7aa]'}`}>
                    {isOrderTypeLocked(type) && (
                      <span className="material-symbols-outlined text-[14px]">lock</span>
                    )}
                    {type}
                  </span>
                </label>
              ))}
            </div>
          )}

          {isLongTerm && !orderTypeOverride && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 font-medium flex items-start gap-2">
              <span className="material-symbols-outlined text-[14px] mt-[1px]">lock</span>
              <span>SL and Target orders are locked for Longterm (CNC).</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lots</label>
              <div className="relative">
                <input
                  className={`w-full bg-white dark:bg-[#0b120f] border border-gray-300 dark:border-[#22352d] rounded-lg px-3 py-2.5 text-base font-semibold text-gray-900 dark:text-[#e8f3ee] focus:ring-2 ${isBuy ? 'focus:ring-[#137fec]' : 'focus:ring-red-500'} focus:border-transparent outline-none transition-shadow text-center placeholder:text-gray-400 placeholder:font-normal`}
                  type="number"
                  min="1"
                  placeholder="0"
                  value={qty}
                  onChange={(event) => setQty(event.target.value)}
                />
              </div>
              {lotSize > 1 && qty !== '' && safeLots > 0 && (
                <p className="text-[10px] text-gray-400 text-center">{totalQty} qty ({safeLots} × {lotSize})</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</label>
              <input
                className={`w-full ${(orderType === 'MARKET' || orderType === 'OPTION_CHAIN')
                  ? 'bg-gray-50 dark:bg-[#0b120f]/50 text-gray-400 cursor-not-allowed'
                  : 'bg-white dark:bg-[#0b120f] text-gray-900 dark:text-[#e8f3ee]'} border border-gray-300 dark:border-[#22352d] rounded-lg px-3 py-2.5 text-base font-semibold focus:ring-2 ${isBuy ? 'focus:ring-[#137fec]' : 'focus:ring-red-500'} focus:border-transparent outline-none transition-shadow text-center`}
                type="number"
                value={priceInput}
                disabled={orderType === 'MARKET' || orderType === 'OPTION_CHAIN'}
                onChange={(event) => setPriceInput(event.target.value)}
              />
            </div>
          </div>

          {orderType === 'SL' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stop-Loss Price (INR)</label>
              <input
                className={`w-full bg-white dark:bg-[#0b120f] border border-gray-300 dark:border-[#22352d] rounded-lg px-3 py-2.5 text-base font-semibold text-gray-900 dark:text-[#e8f3ee] focus:ring-2 ${isBuy ? 'focus:ring-[#137fec]' : 'focus:ring-red-500'} focus:border-transparent outline-none transition-shadow text-center`}
                type="number"
                placeholder="Trigger Price"
                value={triggerPrice}
                onChange={(event) => setTriggerPrice(event.target.value)}
              />
            </div>
          )}

          {orderType === 'TGT' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target Price (INR)</label>
              <input
                className={`w-full bg-white dark:bg-[#0b120f] border border-gray-300 dark:border-[#22352d] rounded-lg px-3 py-2.5 text-base font-semibold text-gray-900 dark:text-[#e8f3ee] focus:ring-2 ${isBuy ? 'focus:ring-[#137fec]' : 'focus:ring-red-500'} focus:border-transparent outline-none transition-shadow text-center`}
                type="number"
                placeholder="Target Price"
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between py-2 border-t border-b border-gray-100 dark:border-[#22352d]">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lot Size</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-[#e8f3ee]">{lotSize}</span>
          </div>

          {isLongTerm && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                Valid till
              </span>
              <span className="text-xs font-semibold text-gray-900 dark:text-[#e8f3ee]">
                {(() => {
                  const v = computeValidity(productType, instrumentExpiry);
                  const d = new Date(v.expiresAt);
                  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ', 3:15 PM';
                })()}
              </span>
            </div>
          )}

          {feedback && (
            <div className={`text-sm font-medium ${feedback.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
              {feedback.message}
            </div>
          )}

          {disableTrading && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
              {disableReason || MARKET_CLOSED_TEXT}
            </div>
          )}

          <div className="space-y-4 pb-8 sm:pb-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">
                Margin required: <span className="text-gray-900 dark:text-[#e8f3ee] font-semibold">₹{estimatedMargin.toFixed(2)}</span>
              </span>
              <span className={accentColor}>
                {isOption ? 'Option Premium' : 'Available'}: ₹{Number(availableBalance || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex gap-3">
              {!disableTrading && (
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                  className={`flex-1 ${isBuy ? 'bg-[#137fec] hover:bg-blue-600 shadow-blue-200 dark:shadow-[0_12px_24px_rgba(16,185,129,0.28)]' : 'bg-red-500 hover:bg-red-600 shadow-red-200 dark:shadow-[0_12px_24px_rgba(248,113,113,0.3)]'} text-white font-bold py-3.5 rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60`}
                >
                  {submitting ? 'PLACING...' : `PLACE ${isBuy ? 'BUY' : 'SELL'} ORDER`}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className={`${disableTrading ? 'flex-1' : ''} px-5 py-3.5 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-[#16231d] rounded-lg transition-colors`}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderBottomSheet;
