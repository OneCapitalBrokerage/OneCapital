import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import { getMcxSpec } from '../../utils/mcxSpecs';

const MARKET_CLOSED_TEXT = 'Market Closed. Open From 9:15AM To 3:15PM On Working Days';

const ModifyOrderSheet = ({
  isOpen,
  order,
  onClose,
  onModified,
  apiUpdateOrder,
  apiGetBalance,
  onConvertToHold,
  onExtendValidity,
  onAdjustHolding,
  brokerMode,
  marketClosedForCustomer = false,
  marketClosedReason = '',
  livePrices = {},
}) => {
  const toPositiveNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const [addLots, setAddLots] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [funds, setFunds] = useState(null);

  // Broker-only holdings correction state
  const [correctionQty, setCorrectionQty] = useState('');
  const [correctionLots, setCorrectionLots] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState(null);

  const navigate = useNavigate();

  const isBuy = order?.side === 'BUY';
  const currentQty = toPositiveNumber(order?.quantity);
  const rawLots = toPositiveNumber(order?.lots);
  const upc = toPositiveNumber(order?.units_per_contract);
  const rawLotSize = toPositiveNumber(order?.lot_size || order?.lotSize);
  const inferredLotSize = upc > 0 ? upc : (rawLotSize || (rawLots > 0 ? currentQty / rawLots : 0));
  const lotSize = Math.max(1, Math.round(inferredLotSize || 1));
  const isMcx = useMemo(() => {
    const ex = String(order?.exchange || '').toUpperCase();
    const seg = String(order?.segment || '').toUpperCase();
    return ex.includes('MCX') || seg.includes('MCX') || upc > 0;
  }, [order?.exchange, order?.segment, upc]);
  const mcxSpec = useMemo(() => {
    if (!isMcx) return null;
    return getMcxSpec(order?.name) || getMcxSpec(order?.symbol) || getMcxSpec(order?.tradingsymbol || order?.trading_symbol);
  }, [isMcx, order?.name, order?.symbol, order?.tradingsymbol, order?.trading_symbol]);
  const isMcxOrder = isMcx;
  const currentLots = rawLots > 0 ? rawLots : Math.round(currentQty / lotSize);
  const currentPrice = order?.price || 0;
  const ltp = (livePrices[order?.instrument_token] ?? order?.ltp ?? order?.last_price ?? currentPrice) || 0;
  const symbol = order?.symbol || '';
  const product = (order?.product || 'MIS').toUpperCase();
  const isLongTerm = product === 'CNC' || product === 'NRML';
  const slTargetLocked = isLongTerm && !brokerMode;
  const marketClosedHoldingBlocked = marketClosedForCustomer && isLongTerm && !brokerMode;

  // Detect option orders
  const isOption = useMemo(() => {
    const seg = String(order?.segment || '').toUpperCase();
    const sym = String(order?.symbol || '').toUpperCase();
    return seg.includes('OPT') || sym.endsWith('CE') || sym.endsWith('PE') || sym.endsWith('CALL') || sym.endsWith('PUT');
  }, [order?.segment, order?.symbol]);

  // Gate: show broker-only holdings correction section
  const showHoldingsCorrection = brokerMode && isLongTerm
    && order?.id && !order?.isAggregated && !order?.is_aggregated
    && ['OPEN', 'EXECUTED', 'HOLD', 'PENDING'].includes((order?.status || '').toUpperCase());

  useEffect(() => {
    if (!isOpen) return;
    setAddLots('');
    setSlPrice(order?.stop_loss > 0 ? String(order.stop_loss) : '');
    setTargetPrice(order?.target > 0 ? String(order.target) : '');
    setEditPrice(brokerMode && order?.price ? String(order.price) : '');
    setFeedback(null);
    setCorrectionQty('');
    setCorrectionLots('');
    setCorrectionFeedback(null);
  }, [isOpen, order, brokerMode]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchBalance = apiGetBalance || customerApi.getBalance;
    fetchBalance()
      .then(setFunds)
      .catch(() => {});
  }, [isOpen, apiGetBalance]);

  const parsedAddLots = useMemo(() => {
    const n = Number(addLots);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }, [addLots]);

  const addQty = parsedAddLots * lotSize;
  const newTotalQty = currentQty + addQty;
  const newTotalLots = currentLots + parsedAddLots;

  const requiredMargin = useMemo(() => {
    if (parsedAddLots <= 0) return 0;
    return addQty * ltp;
  }, [parsedAddLots, addQty, ltp]);

  const availableBalance = useMemo(() => {
    if (!funds) return 0;
    // MCX options use commodity option premium
    if (isOption && isMcx) {
      return (funds?.trading?.commodityOptionPremium?.remaining ?? 0);
    }
    // Options use ONLY the option premium balance
    if (isOption) {
      return (funds?.trading?.optionPremium?.remaining ?? funds?.balance?.optionPremium?.remaining ?? 0);
    }
    if (product === 'MIS') {
      return (funds?.balance?.intraday?.free ?? funds?.balance?.intraday?.available_limit ?? 0);
    }
    // MCX CNC/NRML uses commodity delivery bucket
    if (isMcx) {
      return (funds?.trading?.commodityDelivery?.remaining ?? 0);
    }
    return (funds?.balance?.overnight?.available ?? funds?.balance?.overnight?.available_limit ?? 0);
  }, [funds, product, isOption, isMcx]);

  if (!isOpen || !order) return null;

  const handleHoldingsCorrection = async () => {
    const parsedCorrQty = parseInt(correctionQty, 10);
    const parsedCorrLots = parseInt(correctionLots, 10);
    if (!Number.isFinite(parsedCorrQty) || parsedCorrQty <= 0) {
      setCorrectionFeedback({ type: 'error', message: 'Quantity must be a positive integer.' });
      return;
    }
    if (!Number.isFinite(parsedCorrLots) || parsedCorrLots <= 0) {
      setCorrectionFeedback({ type: 'error', message: 'Lots must be a positive integer.' });
      return;
    }
    if (lotSize > 1 && parsedCorrQty % lotSize !== 0) {
      setCorrectionFeedback({ type: 'error', message: `Quantity must be divisible by lot size (${lotSize}).` });
      return;
    }
    if (Math.round(parsedCorrQty / lotSize) !== parsedCorrLots) {
      setCorrectionFeedback({ type: 'error', message: `Quantity (${parsedCorrQty}) and lots (${parsedCorrLots}) are inconsistent with lot size (${lotSize}).` });
      return;
    }
    if (!onAdjustHolding) {
      setCorrectionFeedback({ type: 'error', message: 'Adjustment handler not available.' });
      return;
    }
    setCorrectionSubmitting(true);
    setCorrectionFeedback(null);
    try {
      await onAdjustHolding(order, { quantity: parsedCorrQty, lots: parsedCorrLots });
      setCorrectionFeedback({ type: 'success', message: 'Holdings corrected.' });
      if (typeof onModified === 'function') onModified();
      setTimeout(() => onClose?.(), 800);
    } catch (err) {
      setCorrectionFeedback({
        type: 'error',
        message: err?.response?.data?.message || err?.message || 'Correction failed.',
      });
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const resolvedClosedText = marketClosedReason || MARKET_CLOSED_TEXT;

  const validate = () => {
    if (marketClosedHoldingBlocked) {
      return resolvedClosedText;
    }

    const sl = Number(slPrice);
    const tgt = Number(targetPrice);

    if (!slTargetLocked) {
      if (sl > 0) {
        if (isBuy && sl >= ltp) return 'Stop Loss must be below LTP for BUY';
        if (!isBuy && sl <= ltp) return 'Stop Loss must be above LTP for SELL';
      }

      if (tgt > 0) {
        if (isBuy && tgt <= ltp) return 'Target must be above LTP for BUY';
        if (!isBuy && tgt >= ltp) return 'Target must be below LTP for SELL';
      }
    }

    if (parsedAddLots > 0 && requiredMargin > availableBalance) {
      return `Insufficient funds. Need ₹${requiredMargin.toFixed(2)}, have ₹${availableBalance.toFixed(2)}`;
    }

    return null;
  };

  const handleSubmit = async () => {
    if (marketClosedHoldingBlocked) {
      setFeedback({ type: 'error', message: resolvedClosedText });
      return;
    }

    const error = validate();
    if (error) {
      setFeedback({ type: 'error', message: error });
      return;
    }

    const nextStopLoss = slTargetLocked ? Number(order.stop_loss || 0) : (Number(slPrice) || 0);
    const nextTarget = slTargetLocked ? Number(order.target || 0) : (Number(targetPrice) || 0);
    const slChanged = !slTargetLocked && nextStopLoss !== (order.stop_loss || 0);
    const tgtChanged = !slTargetLocked && nextTarget !== (order.target || 0);
    const parsedEditPrice = Number(editPrice);
    const priceChanged = brokerMode && Number.isFinite(parsedEditPrice) && parsedEditPrice > 0 && parsedEditPrice !== currentPrice;
    const hasChanges = parsedAddLots > 0 || slChanged || tgtChanged || priceChanged;
    if (!hasChanges) {
      setFeedback({ type: 'error', message: 'No changes to apply.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const lotsChanged = parsedAddLots > 0;

    try {
      const payload = {
        order_id: order.id,
        instrument_token: order.instrument_token,
        symbol: order.symbol,
        side: order.side,
        product: order.product,
        segment: order.segment,
        quantity: newTotalQty,
        lots: String(newTotalLots),
        stop_loss: nextStopLoss,
        target: nextTarget,
        order_status: order.status || order.order_status,
        meta: { from: brokerMode ? 'broker_modify_order' : 'ui_modify_order' },
      };

      // Broker explicit price edit takes priority
      if (priceChanged) {
        payload.price = parsedEditPrice;
         if (brokerMode) payload.broker_price_override = true;
      } else if (lotsChanged) {
        // Send raw LTP for new lots — backend applies spread and computes weighted average
        payload.price = ltp;
        payload.old_price = currentPrice;
        payload.old_quantity = currentQty;
      }

      // CNC/NRML orders with qty changes need broker re-approval
      if (isLongTerm && lotsChanged) {
        payload.requires_reapproval = true;
      }

      const updateFn = apiUpdateOrder || customerApi.updateOrder;
      const response = await updateFn(payload);

      if (typeof onModified === 'function') onModified();

      if (lotsChanged) {
        const updatedOrder = response?.order || {};
        const newAvgPrice = updatedOrder.effective_entry_price ?? updatedOrder.price ?? 0;
        navigate('/order-confirmation', {
          state: {
            referenceId: order.id,
            orderId: order.id,
            symbol: order.symbol,
            name: order.name || order.symbol,
            exchange: order.exchange,
            segment: order.segment,
            price: newAvgPrice,
            side: order.side,
            quantity: newTotalQty,
            orderType: order.order_type || order.orderType || 'MARKET',
            productType: order.product,
            requiresApproval: isLongTerm && lotsChanged,
            placedAt: new Date().toISOString(),
            status: isLongTerm ? 'PENDING' : (order.status || order.order_status),
            isModified: true,
            ltp,
            newAvgPrice,
          },
        });
      } else {
        setFeedback({ type: 'success', message: 'Order modified!' });
        setTimeout(() => onClose?.(), 800);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.message || err?.message || 'Failed to modify order.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const incrementLots = () => setAddLots(String(parsedAddLots + 1));
  const decrementLots = () => { if (parsedAddLots > 0) setAddLots(String(parsedAddLots - 1)); };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#111b17] rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden mx-auto">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 dark:bg-[#22352d] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 pt-3 pb-3 flex items-center justify-between border-b border-gray-100 dark:border-[#22352d]">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold">{symbol}</h3>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isBuy ? 'text-[#137fec] bg-[#137fec]/10' : 'text-red-500 bg-red-50'
            }`}>{isBuy ? 'BUY' : 'SELL'}</span>
            <span className="text-[10px] font-medium text-[#617589] dark:text-[#9cb7aa] bg-gray-100 dark:bg-[#16231d] px-1.5 py-0.5 rounded">{product}</span>
          </div>
          <button onClick={onClose} className="text-[#617589] dark:text-[#9cb7aa] hover:text-[#111418] dark:text-[#e8f3ee] p-1 -mr-1">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Position Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#f6f7f8] dark:bg-[#16231d] rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-[#617589] dark:text-[#9cb7aa] mb-0.5">{isMcxOrder ? 'Units' : 'Qty'}</p>
              <p className="text-sm font-bold text-[#111418] dark:text-[#e8f3ee]">{currentQty}</p>
            </div>
            <div className="bg-[#f6f7f8] dark:bg-[#16231d] rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-[#617589] dark:text-[#9cb7aa] mb-0.5">Lots</p>
              <p className="text-sm font-bold text-[#111418] dark:text-[#e8f3ee]">{currentLots}</p>
            </div>
            <div className="bg-[#f6f7f8] dark:bg-[#16231d] rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-[#617589] dark:text-[#9cb7aa] mb-0.5">{isMcxOrder ? 'Units/Lot' : 'Lot Size'}</p>
              <p className="text-sm font-bold text-[#111418] dark:text-[#e8f3ee]">{lotSize}</p>
            </div>
            <div className="bg-[#f6f7f8] dark:bg-[#16231d] rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-[#617589] dark:text-[#9cb7aa] mb-0.5 flex items-center justify-center gap-0.5">
                Avg Price
                {brokerMode && <span className="material-symbols-outlined text-[10px] text-[#137fec]">edit</span>}
              </p>
              {brokerMode ? (
                <input
                  className="w-full bg-transparent border-0 text-center text-sm font-bold text-[#111418] dark:text-[#e8f3ee] focus:ring-0 outline-none p-0"
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              ) : (
                <p className="text-sm font-bold text-[#111418] dark:text-[#e8f3ee]">₹{currentPrice.toFixed(2)}</p>
              )}
            </div>
          </div>

          {(mcxSpec || lotSize > 1) && (
            <p className="text-[10px] text-gray-400 text-center -mt-2">
              {currentQty} {mcxSpec ? 'units' : 'qty'} ({currentLots} × {lotSize})
              {mcxSpec?.contract_size ? ` · ${mcxSpec.contract_size}` : ''}
            </p>
          )}

          {/* Add Lots */}
          <div>
            <label className="text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa] uppercase tracking-wider mb-1.5 block">Add Lots</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={decrementLots}
                disabled={parsedAddLots <= 0}
                className="size-10 rounded-lg bg-[#f6f7f8] dark:bg-[#16231d] hover:bg-gray-200 dark:hover:bg-[#22352d] flex items-center justify-center text-[#111418] dark:text-[#e8f3ee] font-bold text-lg transition-colors disabled:opacity-30"
              >
                -
              </button>
              <input
                className="flex-1 bg-[#f6f7f8] dark:bg-[#16231d] border-0 rounded-lg px-3 py-2.5 text-center text-base font-bold text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-[#137fec] outline-none"
                type="number"
                min="0"
                placeholder="0"
                value={addLots}
                onChange={(e) => setAddLots(e.target.value)}
              />
              <button
                type="button"
                onClick={incrementLots}
                className="size-10 rounded-lg bg-[#f6f7f8] dark:bg-[#16231d] hover:bg-gray-200 dark:hover:bg-[#22352d] flex items-center justify-center text-[#111418] dark:text-[#e8f3ee] font-bold text-lg transition-colors"
              >
                +
              </button>
            </div>
            {parsedAddLots > 0 && (
              <div className="mt-2 flex flex-col gap-1 text-[11px] text-[#617589] dark:text-[#9cb7aa]">
                <div className="flex items-center gap-3">
                  <span>+{parsedAddLots} {parsedAddLots === 1 ? 'lot' : 'lots'} ({addQty} {mcxSpec ? 'units' : 'qty'})</span>
                  <span className="size-0.5 bg-gray-300 rounded-full" />
                  <span>New total: <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">{newTotalLots} lots ({newTotalQty} {mcxSpec ? 'units' : 'qty'})</span></span>
                </div>
                {(mcxSpec || lotSize > 1) && (
                  <p className="text-[10px] text-gray-400">
                    {addQty} {mcxSpec ? 'units' : 'qty'} ({parsedAddLots} × {lotSize})
                    {mcxSpec?.contract_size ? ` · ${mcxSpec.contract_size}` : ''}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <span>LTP:</span>
                  <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">₹{ltp.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>New Avg Price:</span>
                  <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">₹{(newTotalQty > 0 ? (currentQty * currentPrice + addQty * ltp) / newTotalQty : currentPrice).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* SL & Target */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa] uppercase tracking-wider mb-1.5 block flex items-center gap-1.5">
                Stop Loss
                {slTargetLocked && <span className="material-symbols-outlined text-[12px]">lock</span>}
              </label>
              <input
                className="w-full bg-[#f6f7f8] dark:bg-[#16231d] border-0 rounded-lg px-3 py-2.5 text-center text-sm font-semibold text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-[#137fec] outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                type="number"
                placeholder={slTargetLocked ? 'Locked' : (isBuy ? `< ${ltp.toFixed(2)}` : `> ${ltp.toFixed(2)}`)}
                value={slPrice}
                disabled={slTargetLocked}
                onChange={(e) => setSlPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa] uppercase tracking-wider mb-1.5 block flex items-center gap-1.5">
                Target
                {slTargetLocked && <span className="material-symbols-outlined text-[12px]">lock</span>}
              </label>
              <input
                className="w-full bg-[#f6f7f8] dark:bg-[#16231d] border-0 rounded-lg px-3 py-2.5 text-center text-sm font-semibold text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-[#137fec] outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                type="number"
                placeholder={slTargetLocked ? 'Locked' : (isBuy ? `> ${ltp.toFixed(2)}` : `< ${ltp.toFixed(2)}`)}
                value={targetPrice}
                disabled={slTargetLocked}
                onChange={(e) => setTargetPrice(e.target.value)}
              />
            </div>
          </div>

          {slTargetLocked && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700">
              <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">lock</span>
              <p className="text-[11px] leading-snug">SL and Target are locked for longterm orders.</p>
            </div>
          )}

          {marketClosedHoldingBlocked && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700">
              <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">schedule</span>
              <p className="text-[11px] leading-snug">{resolvedClosedText}</p>
            </div>
          )}

          {/* Margin Info */}
          {parsedAddLots > 0 && (
            <div className="flex justify-between items-center text-xs px-1">
              <span className="text-[#617589] dark:text-[#9cb7aa]">
                Est. Margin: <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">₹{requiredMargin.toFixed(2)}</span>
              </span>
              <span className={`font-semibold ${availableBalance >= requiredMargin ? 'text-[#078838]' : 'text-red-500'}`}>
                {isOption ? 'Option Premium' : 'Available'}: ₹{availableBalance.toFixed(2)}
              </span>
            </div>
          )}

          {/* Re-approval notice for CNC/NRML lots changes */}
          {parsedAddLots > 0 && (product === 'CNC' || product === 'NRML') && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700">
              <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">info</span>
              <p className="text-[11px] leading-snug">Adding lots to a {product} order will send it back for broker approval.</p>
            </div>
          )}

          {/* Broker-only Holdings Correction */}
          {showHoldingsCorrection && (
            <div className="border-t border-gray-100 pt-4">
              <label className="text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                Holdings Correction
                <span className="text-[9px] text-amber-600 normal-case font-normal">Broker only · No reapproval</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-[#617589] dark:text-[#9cb7aa] block mb-1">Quantity</label>
                  <input
                    className="w-full bg-[#f6f7f8] dark:bg-[#16231d] border-0 rounded-lg px-2 py-2 text-center text-sm font-bold text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-amber-400 outline-none"
                    type="number"
                    min="1"
                    step={lotSize}
                    placeholder={String(currentQty)}
                    value={correctionQty}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCorrectionQty(v);
                      const n = parseInt(v, 10);
                      if (Number.isFinite(n) && n > 0 && lotSize > 0) {
                        setCorrectionLots(String(Math.round(n / lotSize)));
                      } else if (!v) {
                        setCorrectionLots('');
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#617589] dark:text-[#9cb7aa] block mb-1">Lots</label>
                  <input
                    className="w-full bg-[#f6f7f8] dark:bg-[#16231d] border-0 rounded-lg px-2 py-2 text-center text-sm font-bold text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-amber-400 outline-none"
                    type="number"
                    min="1"
                    placeholder={String(currentLots)}
                    value={correctionLots}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCorrectionLots(v);
                      const n = parseInt(v, 10);
                      if (Number.isFinite(n) && n > 0) {
                        setCorrectionQty(String(n * lotSize));
                      } else if (!v) {
                        setCorrectionQty('');
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#617589] dark:text-[#9cb7aa] block mb-1">Lot Size</label>
                  <div className="w-full bg-gray-100 dark:bg-[#1a2920] rounded-lg px-2 py-2 text-center text-sm font-bold text-[#617589] dark:text-[#9cb7aa]">
                    {lotSize}
                  </div>
                </div>
              </div>
              {correctionFeedback && (
                <div className={`mt-2 text-xs font-medium px-3 py-2 rounded-lg ${
                  correctionFeedback.type === 'error' ? 'text-red-600 bg-red-50' : 'text-[#078838] bg-green-50'
                }`}>
                  {correctionFeedback.message}
                </div>
              )}
              <button
                type="button"
                onClick={handleHoldingsCorrection}
                disabled={correctionSubmitting || !correctionQty || !correctionLots}
                className="mt-2 w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {correctionSubmitting && (
                  <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                )}
                {correctionSubmitting ? 'Applying...' : 'Apply Correction'}
              </button>
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`text-xs font-medium px-3 py-2 rounded-lg ${
              feedback.type === 'error' ? 'text-red-600 bg-red-50' : 'text-[#078838] bg-green-50'
            }`}>
              {feedback.message}
            </div>
          )}

          {/* Extend validity eligibility hint */}
          {order?.validity_mode === 'EQUITY_7D' && !order?.can_extend_validity && order?.extend_validity_reason && (
            <p className="text-[11px] text-amber-600 text-center">{order.extend_validity_reason}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-6 sm:pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-[#f6f7f8] dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] font-semibold text-sm hover:bg-gray-200 dark:hover:bg-[#22352d] transition-colors"
            >
              Cancel
            </button>
            {onConvertToHold && product === 'MIS' && (
              <button
                type="button"
                onClick={() => onConvertToHold(order)}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                Convert to Holdings
              </button>
            )}
            {onExtendValidity && order?.validity_mode === 'EQUITY_7D' && (
              <button
                type="button"
                onClick={() => onExtendValidity(order)}
                disabled={submitting || !order?.can_extend_validity}
                title={!order?.can_extend_validity ? (order?.extend_validity_reason || 'Not eligible yet') : undefined}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">update</span>
                Extend +7d
              </button>
            )}
            {!marketClosedHoldingBlocked && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-[2] py-3 rounded-xl bg-[#137fec] text-white font-semibold text-sm hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && (
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                )}
                {submitting ? 'Applying...' : 'Apply Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModifyOrderSheet;
