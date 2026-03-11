import { useLocation, useNavigate } from 'react-router-dom';

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const toTitleOrderType = (value) => {
  const normalized = String(value || 'MARKET').toUpperCase();
  if (normalized === 'SL-M') return 'SL-M';
  if (normalized === 'OPTION_CHAIN') return 'Market';
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
};

const OrderConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state || {};

  const {
    referenceId,
    orderId,
    symbol,
    name,
    exchange,
    segment,
    price,
    side,
    quantity,
    orderType,
    productType,
    requiresApproval,
    placedAt,
    status,
    isModified = false,
    ltp,
    newAvgPrice,
  } = data;

  const normalizedProduct = String(productType || '').toUpperCase();
  const isIntraday = normalizedProduct === 'MIS' && !requiresApproval;
  const resolvedOrderId = orderId || referenceId;
  const orderIdText = resolvedOrderId
    ? (String(resolvedOrderId).startsWith('#') ? String(resolvedOrderId) : `#${resolvedOrderId}`)
    : '—';
  const displayOrderType = toTitleOrderType(orderType);
  const displayPrice = formatCurrency(price);
  const displayExchange = exchange || 'NSE';
  const displaySegment = (segment || 'EQUITY').toUpperCase();
  const displaySide = String(side || 'BUY').toUpperCase();
  const symbolText = String(symbol || '—');
  const nameText = String(name || 'N/A');
  const isVeryLongSymbol = symbolText.length > 20;
  const isLongSymbol = symbolText.length > 12;
  const symbolSizeClass = isVeryLongSymbol
    ? 'text-[16px] sm:text-[18px]'
    : isLongSymbol
      ? 'text-[20px] sm:text-[22px]'
      : 'text-[24px] sm:text-[26px]';

  if (isIntraday) {
    return (
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-x-hidden bg-[#f4f5f7] font-['Inter'] dark:bg-[#050806]">
        <div className="relative border-b border-[#e5e7eb] bg-white px-4 py-3.5 dark:border-[#22352d] dark:bg-[#1a2632]">
          <button
            type="button"
            onClick={() => navigate('/watchlist')}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#1f2937] hover:bg-gray-100 dark:text-[#e8f3ee] dark:hover:bg-[#16231d]"
            aria-label="Close confirmation"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
          <h2 className="text-center text-[17px] font-bold text-[#111418] dark:text-[#e8f3ee] sm:text-[18px]">
            Order Confirmation
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-5 pt-6">
          <div className="flex flex-col items-center justify-center">
            <div className="mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#e6efff]">
              <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[#155dfc] text-white">
                <span className="material-symbols-outlined text-[24px]">check</span>
              </div>
            </div>
            <h1 className="text-center text-[24px] font-bold leading-tight text-[#155dfc] sm:text-[26px]">
              {isModified ? 'Order Modified!' : 'Order Placed Successfully!'}
            </h1>
            <p className="mt-1.5 text-center text-[13px] font-medium leading-[1.45] text-[#6b7280] dark:text-[#9cb7aa] sm:text-[14px]">
              {isModified ? 'Your order has been updated' : 'Your order has been sent to the exchange'}
            </p>
          </div>

          <div className="mt-6 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.05)] dark:bg-[#1a2632]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#9aa3b1]">
                  {displaySegment} • {displayExchange}
                </p>
                <p
                  title={symbolText}
                  className={`mt-1.5 overflow-hidden break-all [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] font-extrabold leading-tight text-[#111827] dark:text-[#e8f3ee] ${symbolSizeClass}`}
                >
                  {symbolText}
                </p>
                <p
                  title={nameText}
                  className="mt-1 overflow-hidden break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-[12px] font-medium leading-[1.35] text-[#7b8492] dark:text-[#9cb7aa] sm:text-[13px]"
                >
                  {nameText}
                </p>
              </div>
              <div className="max-w-[96px] shrink-0 text-right">
                <span className="inline-flex rounded-xl bg-[#155dfc] px-3 py-1 text-[12px] font-bold text-white">
                  {displaySide}
                </span>
                <p className="mt-2 text-[12px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">
                  Regular Order
                </p>
              </div>
            </div>

            <div className="mt-3.5 space-y-2.5 border-t border-[#eef1f4] pt-3.5 dark:border-[#22352d]">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">Quantity</p>
                <p className="text-[15px] font-bold text-[#111827] dark:text-[#e8f3ee]">{Number(quantity || 0)}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">{isModified ? 'New Avg Price' : 'Average Price'}</p>
                <p className="text-[15px] font-bold text-[#111827] dark:text-[#e8f3ee]">{formatCurrency(isModified ? newAvgPrice : price)}</p>
              </div>
              {isModified && ltp != null && (
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">LTP at Modification</p>
                  <p className="text-[15px] font-bold text-[#111827] dark:text-[#e8f3ee]">{formatCurrency(ltp)}</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">Segment</p>
                <p className="text-[15px] font-bold text-[#111827] dark:text-[#e8f3ee]">MIS (Intraday)</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">Order Type</p>
                <p className="text-[15px] font-bold text-[#111827] dark:text-[#e8f3ee]">{displayOrderType}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-[#e3e7ec] px-4 py-3.5 dark:border-[#22352d]">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7b8492] dark:text-[#9cb7aa]">
              Order Details
            </p>
            <div className="mt-2.5 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">Order ID</p>
                <p
                  title={orderIdText}
                  className="max-w-[62%] truncate text-right text-[13px] font-bold text-[#1f2937] dark:text-[#e8f3ee]"
                >
                  {orderIdText}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">Placed Time</p>
                <p className="max-w-[62%] truncate text-right text-[13px] font-semibold text-[#1f2937] dark:text-[#e8f3ee]">
                  {formatDateTime(placedAt)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-[13px] font-medium text-[#7b8492] dark:text-[#9cb7aa]">Status</p>
                <p className="text-right text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {String(status || 'EXECUTED').toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[#e5e7eb] bg-white p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] dark:border-[#22352d] dark:bg-[#1a2632]">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="h-12 w-full rounded-xl bg-[#155dfc] text-[16px] font-bold text-white transition-colors hover:bg-blue-600"
            >
              Go to Orders
            </button>
            <button
              type="button"
              onClick={() => navigate('/watchlist')}
              className="h-12 w-full rounded-xl bg-[#e9eaee] text-[16px] font-bold text-[#1f2937] transition-colors hover:bg-[#dfe1e7] dark:bg-[#16231d] dark:text-[#e8f3ee] dark:hover:bg-[#1e3229]"
            >
              Back to Watchlist
            </button>
          </div>
        </div>
      </div>
    );
  }

  const headline = isModified
    ? requiresApproval
      ? 'Order Modified,\nAwaiting Broker Approval'
      : 'Order Modified Successfully'
    : requiresApproval
      ? 'CNC Order Placed Successfully,\nAwaiting Broker Approval'
      : 'Order Placed Successfully';

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-[#f6f7f8] dark:bg-[#050806] font-['Inter'] overflow-x-hidden">
      <div className="flex items-center bg-white dark:bg-[#1a2632] p-4 pb-2 justify-between border-b border-gray-100 dark:border-[#22352d]">
        <div className="flex size-12 shrink-0 items-center"></div>
        <h2 className="text-[#111418] dark:text-[#e8f3ee] text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">
          Order Status
        </h2>
        <div className="flex w-12 items-center justify-end">
          <button
            type="button"
            onClick={() => navigate('/watchlist')}
            className="flex items-center justify-center rounded-lg h-12 bg-transparent text-[#111418] dark:text-[#e8f3ee]"
          >
            <span className="material-symbols-outlined text-[#111418] dark:text-[#e8f3ee]">close</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center">
        <div className="flex flex-col items-center justify-center py-6">
          <div className="rounded-full bg-[#137fec]/10 p-6 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[#137fec] text-[48px]">check_circle</span>
          </div>
          <h1 className="text-[#111418] dark:text-[#e8f3ee] text-[24px] font-bold leading-tight text-center whitespace-pre-line">
            {headline}
          </h1>
          {referenceId && (
            <p className="text-[#617589] text-sm font-normal leading-normal text-center mt-2">
              Reference ID: #{referenceId}
            </p>
          )}
        </div>

        <div className="w-full bg-white dark:bg-[#1a2632] rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden mt-4">
          <div className="p-5 border-b border-[#dbe0e6] dark:border-[#22352d] flex items-center gap-4">
            <div className="bg-center bg-no-repeat bg-cover rounded-lg h-12 w-12 shrink-0 bg-gray-100" />
            <div className="flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <p className="text-[#111418] dark:text-[#e8f3ee] text-lg font-bold leading-tight tracking-[-0.015em]">
                  {symbol || '—'}
                </p>
                <span className="bg-gray-100 dark:bg-gray-700 text-[#617589] dark:text-gray-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {displayExchange}
                </span>
              </div>
              <p className="text-[#617589] text-sm font-normal leading-normal">{name || ''}</p>
              <p className="text-[#617589] text-sm font-normal leading-normal">{displayPrice}</p>
            </div>
          </div>

          <div className="p-5 grid grid-cols-2 gap-y-6">
            <div className="flex flex-col gap-1 pr-2">
              <p className="text-[#617589] text-xs font-medium uppercase tracking-wide">Order Type</p>
              <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold leading-normal flex items-center gap-1">
                <span className="text-[#137fec]">{displaySide}</span>
                <span className="text-[#617589] font-normal text-sm">({String(orderType || 'MARKET').toUpperCase()})</span>
              </p>
            </div>
            <div className="flex flex-col gap-1 pl-2 text-right">
              <p className="text-[#617589] text-xs font-medium uppercase tracking-wide">Quantity</p>
              <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold leading-normal">{quantity || 0} Qty</p>
            </div>
            <div className="flex flex-col gap-1 pr-2">
              <p className="text-[#617589] text-xs font-medium uppercase tracking-wide">Product Type</p>
              <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold leading-normal">
                {normalizedProduct === 'MIS' ? 'Intraday (MIS)' : 'Longterm (CNC)'}
              </p>
            </div>
            <div className="flex flex-col gap-1 pl-2 text-right">
              <p className="text-[#617589] text-xs font-medium uppercase tracking-wide">{isModified ? 'New Avg Price' : 'Avg. Price'}</p>
              <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold leading-normal">{formatCurrency(isModified ? newAvgPrice : price)}</p>
            </div>
            {isModified && ltp != null && (
              <div className="flex flex-col gap-1 pr-2">
                <p className="text-[#617589] text-xs font-medium uppercase tracking-wide">LTP at Modification</p>
                <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold leading-normal">{formatCurrency(ltp)}</p>
              </div>
            )}
          </div>
        </div>

        {requiresApproval && (
          <div className="mt-6 flex gap-3 px-2 w-full">
            <span className="material-symbols-outlined text-[#617589] text-[20px] shrink-0">info</span>
            <p className="text-[#617589] text-xs font-normal leading-snug">
              {isModified
                ? 'Your CNC order has been modified. The broker will review the updated lot count. You can check the status in the order book.'
                : 'Your CNC order has been placed. The status will be updated upon broker\u2019s action. You can check the status in the order book.'}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#1a2632] p-4 border-t border-[#dbe0e6] dark:border-[#22352d] pb-8">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="flex w-full items-center justify-center rounded-lg h-12 bg-[#137fec] hover:bg-blue-600 text-white gap-2 text-base font-bold transition-colors shadow-sm"
          >
            View Orders
          </button>
          <button
            type="button"
            onClick={() => navigate('/watchlist')}
            className="flex w-full items-center justify-center rounded-lg h-12 bg-white dark:bg-transparent border border-[#dbe0e6] dark:border-gray-600 text-[#137fec] dark:text-blue-400 gap-2 text-base font-bold hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors"
          >
            Go to Watchlist
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
