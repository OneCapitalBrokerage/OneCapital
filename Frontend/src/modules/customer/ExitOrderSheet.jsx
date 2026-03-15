import { useEffect, useMemo, useState } from 'react';
import { resolveOrderPnl, getEffectiveEntryPrice } from '../../utils/calculateBrokerage';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toMoney = (value, fractionDigits = 2) => `₹${toNumber(value).toLocaleString('en-IN', {
  minimumFractionDigits: fractionDigits,
  maximumFractionDigits: fractionDigits,
})}`;
const MARKET_CLOSED_TEXT = 'Market Closed. Open From 9:15AM To 3:15PM On Working Days';

const ExitOrderSheet = ({
  isOpen,
  order,
  onClose,
  onConfirm,
  submitting = false,
  error = null,
  marketClosedForCustomer = false,
  marketClosedReason = MARKET_CLOSED_TEXT,
  liveLtpRef = null,
}) => {
  const maxQuantity = Math.max(0, Math.floor(toNumber(order?.quantity, 0)));
  const snapshotLtp = useMemo(
    () => toNumber(order?.ltp ?? order?.last_price ?? order?.price, 0),
    [order?.ltp, order?.last_price, order?.price]
  );
  const instrumentToken = useMemo(() => {
    const token = order?.instrument_token ?? order?.instrumentToken;
    if (token == null || token === '') return null;
    return String(token);
  }, [order?.instrument_token, order?.instrumentToken]);
  const [liveLtp, setLiveLtp] = useState(snapshotLtp);
  const ltp = toNumber(liveLtp, snapshotLtp);
  const avgPrice = getEffectiveEntryPrice(order);
  const symbol = order?.symbol || '';
  const exchange = (order?.exchange || 'NSE').toUpperCase();
  const side = (order?.side || 'BUY').toUpperCase();
  const product = String(order?.product || '').toUpperCase();
  const isLongTermHolding = product === 'CNC' || product === 'NRML';
  const isExitBlockedByMarketClose = marketClosedForCustomer && isLongTermHolding;
  const [quantityInput, setQuantityInput] = useState(String(maxQuantity || ''));
  const [orderType, setOrderType] = useState('MARKET');
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    let animationFrameId;
    let lastUpdate = 0;
    const THROTTLE_MS = 33.33;

    const updateLoop = (timestamp) => {
      if (timestamp - lastUpdate >= THROTTLE_MS) {
        const refValue = instrumentToken ? liveLtpRef?.current?.[instrumentToken] : null;
        const parsed = Number(refValue);
        const nextLtp = Number.isFinite(parsed) ? parsed : snapshotLtp;
        setLiveLtp((prev) => (prev === nextLtp ? prev : nextLtp));
        lastUpdate = timestamp;
      }
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isOpen, instrumentToken, liveLtpRef, snapshotLtp]);

  const exitQuantity = useMemo(() => {
    const parsed = Number(quantityInput);
    if (!Number.isFinite(parsed)) return 0;
    return Math.floor(parsed);
  }, [quantityInput]);

  const ltpPct = useMemo(() => {
    if (!avgPrice) return 0;
    return ((ltp - avgPrice) / avgPrice) * 100;
  }, [ltp, avgPrice]);

  const pnlData = useMemo(
    () => resolveOrderPnl({ order, isClosed: false, ltp }),
    [order, ltp]
  );

  const isProfit = pnlData.netPnl >= 0;
  const estimatedValue = exitQuantity > 0 ? exitQuantity * ltp : 0;
  const isOrderTypeSupported = orderType === 'MARKET';

  if (!isOpen || !order) return null;

  const setHalfQuantity = () => {
    if (maxQuantity <= 1) {
      setQuantityInput(String(maxQuantity));
      return;
    }
    setQuantityInput(String(Math.max(1, Math.floor(maxQuantity / 2))));
    setLocalError(null);
  };

  const setMaxQuantity = () => {
    setQuantityInput(String(maxQuantity));
    setLocalError(null);
  };

  const validate = () => {
    if (isExitBlockedByMarketClose) {
      return marketClosedReason || MARKET_CLOSED_TEXT;
    }
    if (!Number.isFinite(exitQuantity) || exitQuantity <= 0) {
      return 'Enter a valid quantity to exit.';
    }
    if (exitQuantity > maxQuantity) {
      return `Quantity cannot exceed max available (${maxQuantity}).`;
    }
    if (!isOrderTypeSupported) {
      return 'SL (Limit) exit is not enabled yet. Use Market to continue.';
    }
    return null;
  };

  const handleConfirm = async () => {
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    await onConfirm?.({
      order,
      quantity: exitQuantity,
      orderType,
      ltp,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#111b17] rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden mx-auto max-h-[70vh] flex flex-col">
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 dark:bg-[#22352d] rounded-full" />
        </div>

        <div className="px-4 pt-3 pb-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-start justify-between">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[#111418] dark:text-[#e8f3ee] text-base sm:text-lg font-bold truncate">{symbol}</h3>
                <span className="text-[10px] font-bold bg-gray-100 text-[#617589] dark:text-[#9cb7aa] px-1.5 py-0.5 rounded uppercase">{exchange}</span>
              </div>
              <p className="mt-1 text-[#617589] dark:text-[#9cb7aa] text-xs sm:text-sm font-medium">
                LTP: <span className="font-bold text-[#111418] dark:text-[#e8f3ee]">{toMoney(ltp, 2)}</span>{' '}
                <span className={ltpPct >= 0 ? 'text-[#078838] font-semibold' : 'text-red-500 font-semibold'}>
                  ({ltpPct >= 0 ? '+' : ''}{ltpPct.toFixed(1)}%)
                </span>
              </p>
            </div>
            <button onClick={onClose} className="text-[#617589] dark:text-[#9cb7aa] hover:text-[#111418] p-1 -mr-1">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[#28935a] text-[10px] font-bold uppercase tracking-[0.06em]">Live P&amp;L</p>
              <p className={`mt-1 text-xl sm:text-2xl font-extrabold ${isProfit ? 'text-[#078838]' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}{toMoney(pnlData.netPnl, 2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px] font-semibold">Avg. Price</p>
              <p className="mt-1 text-[#2d8a56] text-lg sm:text-xl font-extrabold">{toMoney(avgPrice, 2)}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[#2b3a4a] dark:text-[#e8f3ee] text-sm font-bold">{(order?.units_per_contract || 0) > 0 ? 'Units to Exit' : 'Quantity to Exit'}</p>
              <p className="text-[#909dab] dark:text-[#9cb7aa] text-xs font-semibold">Max Available: {maxQuantity}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#16231d] p-1.5 flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max={maxQuantity || undefined}
                value={quantityInput}
                onChange={(e) => {
                  setQuantityInput(e.target.value);
                  setLocalError(null);
                }}
                className="flex-1 bg-transparent border-0 outline-none px-2.5 py-2 text-lg sm:text-xl font-bold text-[#111418] dark:text-[#e8f3ee]"
              />
              <button
                type="button"
                onClick={setHalfQuantity}
                className="min-w-[56px] sm:min-w-[64px] h-10 rounded-lg border border-gray-200 dark:border-[#22352d] text-xs font-bold text-[#2b3a4a] dark:text-[#9cb7aa] bg-white dark:bg-[#16231d] hover:bg-gray-50 dark:hover:bg-[#1e2f28]"
              >
                HALF
              </button>
              <button
                type="button"
                onClick={setMaxQuantity}
                className="min-w-[56px] sm:min-w-[64px] h-10 rounded-lg border border-orange-200 dark:border-orange-900/40 text-xs font-bold text-[#d66b1b] dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30"
              >
                MAX
              </button>
            </div>
          </div>

          <div>
            <p className="text-[#2b3a4a] dark:text-[#e8f3ee] text-sm font-bold mb-1.5">Order Type</p>
            <div className="grid grid-cols-2 rounded-xl bg-[#f1f3f7] dark:bg-[#16231d] p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setOrderType('MARKET');
                  setLocalError(null);
                }}
                className={`h-10 rounded-lg text-xs font-bold transition-colors ${
                  orderType === 'MARKET'
                    ? 'bg-white dark:bg-[#1e2f28] text-[#111418] dark:text-[#e8f3ee] shadow-sm'
                    : 'text-[#7a8794] dark:text-[#9cb7aa] hover:bg-white/60 dark:hover:bg-[#1e2f28]'
                }`}
              >
                Market
              </button>
              <button
                type="button"
                onClick={() => setOrderType('SL_LIMIT')}
                className={`h-10 rounded-lg text-xs font-bold transition-colors ${
                  orderType === 'SL_LIMIT'
                    ? 'bg-white dark:bg-[#1e2f28] text-[#111418] dark:text-[#e8f3ee] shadow-sm'
                    : 'text-[#7a8794] dark:text-[#9cb7aa] hover:bg-white/60 dark:hover:bg-[#1e2f28]'
                }`}
              >
                SL (Limit)
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-[#f8f3df] border border-[#f0e3b0] p-3 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[#cc7c00] text-[18px] mt-0.5">schedule</span>
            <p className="text-xs font-medium text-[#866126] leading-snug">
              {orderType === 'MARKET'
                ? 'Market is currently Live. Your order will be executed instantly at the best available market price.'
                : 'SL (Limit) exit is not enabled yet. Switch to Market to continue.'}
            </p>
          </div>

          <div className="pt-3 border-t border-gray-200 dark:border-[#22352d] flex items-center justify-between">
            <p className="text-xs sm:text-sm font-semibold text-[#647386]">Estimated Value</p>
            <p className="text-base sm:text-lg font-extrabold text-[#111418] dark:text-[#e8f3ee]">{toMoney(estimatedValue, 2)}</p>
          </div>

          {(localError || error) && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-xs font-medium">
              {localError || error}
            </div>
          )}

          {isExitBlockedByMarketClose && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 text-xs font-medium">
              {marketClosedReason || MARKET_CLOSED_TEXT}
            </div>
          )}

          {!isExitBlockedByMarketClose ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="h-11 w-full rounded-xl bg-[#f35a0f] hover:bg-[#e14f08] disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(243,90,15,0.35)]"
            >
              {submitting ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">logout</span>
              )}
              {submitting ? 'Exiting...' : side === 'BUY' || side === 'SELL' ? 'Confirm & Exit Position' : 'Confirm Exit'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full rounded-xl bg-[#eef1f4] dark:bg-[#16231d] text-[#4d5b67] dark:text-[#9cb7aa] font-bold text-sm"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExitOrderSheet;
