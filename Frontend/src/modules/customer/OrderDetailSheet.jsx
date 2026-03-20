import { calculateOpenPnL, calculateClosedPnL } from '../../utils/calculateBrokerage';
import { formatValidityTillLabel } from '../../utils/marketStatus';

const money = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatCount = (value) => {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
};

const readNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const canUseStoredRealizedPnl = (order) => {
  const hasPricingAudit =
    String(order?.settlement_status || '').toLowerCase() === 'settled' ||
    !!order?.brokerage_breakdown ||
    readNumber(order?.effective_exit_price) !== null ||
    readNumber(order?.raw_exit_price) !== null;
  return hasPricingAudit && readNumber(order?.realized_pnl) !== null;
};

const statusBadgeClass = (status) => {
  if (status === 'CLOSED') return 'bg-gray-100 dark:bg-[#16231d] text-gray-600 dark:text-[#9cb7aa]';
  if (status === 'EXECUTED' || status === 'OPEN') return 'bg-green-50 text-[#078838]';
  if (status.includes('PENDING')) return 'bg-amber-50 text-amber-700';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'bg-red-50 text-red-600';
  return 'bg-gray-100 dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa]';
};

const OrderDetailSheet = ({ isOpen, order, tab, onClose, livePrices = {} }) => {
  if (!isOpen || !order) return null;

  const side = (order.side || 'BUY').toUpperCase();
  const isBuy = side === 'BUY';
  const qty = toNumber(order.quantity);
  const avgPrice = toNumber(order.effective_entry_price ?? order.price);
  const ltp = toNumber(livePrices[order.instrument_token] ?? order.ltp ?? order.price);
  const exitPrice = toNumber(order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? ltp);
  const isClosed = tab === 'closed';
  const status = String(order.status || order.order_status || '').toUpperCase();
  const product = String(order.product || 'MIS').toUpperCase();
  const upc = toNumber(order.units_per_contract);
  const lotSize = upc > 0 ? upc : (Number(order.lot_size || order.lotSize) || 1);
  const rawLots = toNumber(order.lots);
  const lots = rawLots > 0 ? rawLots : (lotSize > 0 ? qty / lotSize : 0);
  const isMcxOrder = upc > 0;
  const exchange = order.exchange || 'NSE';

  const entryBrokerageRaw = readNumber(order.brokerage_breakdown?.entry?.amount);
  const exitBrokerageRaw = readNumber(order.brokerage_breakdown?.exit?.amount);
  const totalBrokerage = readNumber(order.brokerage ?? order.brokerage_breakdown?.total);

  const entryBrokerageForCalc = entryBrokerageRaw != null ? entryBrokerageRaw : null;
  const openEntryBrokerageForCalc =
    entryBrokerageForCalc != null ? entryBrokerageForCalc : (totalBrokerage != null ? totalBrokerage : null);
  const exitBrokerageForCalc = exitBrokerageRaw != null ? exitBrokerageRaw : null;

  let pnlData;
  if (isClosed) {
    pnlData = calculateClosedPnL({
      side,
      avgPrice,
      exitPrice,
      qty,
      entryBrokerage: entryBrokerageForCalc,
      exitBrokerage: exitBrokerageForCalc,
      totalBrokerage,
    });

    if (canUseStoredRealizedPnl(order)) {
      const realizedPnl = readNumber(order.realized_pnl);
      const pct = avgPrice * qty ? (realizedPnl / (avgPrice * qty)) * 100 : 0;
      pnlData = { ...pnlData, netPnl: realizedPnl, pct };
    }
  } else {
    pnlData = calculateOpenPnL({
      side,
      avgPrice,
      ltp,
      qty,
      entryBrokerage: openEntryBrokerageForCalc,
    });
  }

  const isProfit = pnlData.netPnl >= 0;
  const pnlColor = isProfit ? 'text-[#078838]' : 'text-red-500';
  const entryBrokerageEstimated = !isClosed && openEntryBrokerageForCalc == null;

  const placedAt = order.placed_at || order.placedAt || order.createdAt;
  const closedAt = order.closed_at || order.closedAt;
  const orderId = order.orderId || order.id || order._id || null;

  const formatTime = (t) => {
    if (!t) return null;
    const d = new Date(t);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const validityLabel = order.validity_expires_at && order.validity_mode !== 'INTRADAY_DAY'
    ? formatValidityTillLabel(order.validity_expires_at, {
      exchange: order.exchange,
      segment: order.segment,
    }, {
      extensionCount: order.validity_extended_count,
    })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-[#111b17] rounded-t-3xl sm:rounded-2xl shadow-[0_18px_50px_rgba(17,20,24,0.24)] overflow-hidden mx-auto max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 dark:bg-[#22352d] rounded-full" />
        </div>

        <div className="px-4 pt-3 pb-3 border-b border-gray-100 dark:border-[#22352d]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold truncate">{order.symbol}</h3>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'text-[#137fec] bg-[#137fec]/10' : 'text-red-500 bg-red-50'}`}>
                  {side}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(status)}`}>
                  {status || 'UNKNOWN'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#617589] dark:text-[#9cb7aa] font-medium">
                {product} | {exchange}
              </p>
            </div>
            <button onClick={onClose} className="text-[#617589] dark:text-[#9cb7aa] hover:text-[#111418] p-1 -mr-1 shrink-0" aria-label="Close details">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
          <div className="rounded-2xl border border-[#dbe6f4] dark:border-[#22352d] bg-gradient-to-br from-[#f5f9ff] dark:from-[#111b17] to-white dark:to-[#16231d] p-3.5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] font-medium">{isClosed ? 'Exit Price' : 'Live LTP'}</p>
                <p className="text-[24px] leading-tight font-extrabold text-[#111418] dark:text-[#e8f3ee]">{money(isClosed ? exitPrice : ltp)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] font-medium">{isClosed ? 'Realized P&L' : 'Unrealized P&L'}</p>
                <p className={`text-[20px] leading-tight font-extrabold ${pnlColor}`}>{isProfit ? '+' : ''}{money(pnlData.netPnl)}</p>
                <p className={`text-[11px] font-semibold ${pnlColor}`}>{isProfit ? '+' : ''}{pnlData.pct.toFixed(2)}%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile label={isMcxOrder ? 'Units' : 'Qty'} value={`${qty}`} />
            <StatTile label="Lots" value={formatCount(lots)} />
            <StatTile label={isMcxOrder ? 'Units/Lot' : 'Lot Size'} value={`${lotSize}`} />
            <StatTile label="Avg" value={money(avgPrice)} />
          </div>

          <div className="rounded-2xl bg-[#f7f9fb] dark:bg-[#16231d] border border-gray-100 dark:border-[#22352d] p-3">
            <p className="text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa] uppercase tracking-wider mb-2">Brokerage</p>
            <Row label={entryBrokerageEstimated ? 'Entry Brokerage (Est.)' : 'Entry Brokerage'} value={`-${money(pnlData.brokerageEntry)}`} valueClass="text-red-500" />
            {isClosed && (
              <>
                <Row label="Exit Brokerage" value={`-${money(pnlData.brokerageExit)}`} valueClass="text-red-500" />
                <Row label="Total Brokerage" value={money(pnlData.totalBrokerage)} valueClass="text-[#111418] dark:text-[#e8f3ee] font-semibold" />
              </>
            )}
            <Row label="Gross P&L" value={money(pnlData.grossPnl)} />
            <Row label="Net P&L" value={money(pnlData.netPnl)} valueClass={`font-bold ${pnlColor}`} />
          </div>

          <div className="rounded-2xl bg-[#f7f9fb] dark:bg-[#16231d] border border-gray-100 dark:border-[#22352d] p-3">
            <p className="text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa] uppercase tracking-wider mb-2">Order Info</p>
            {orderId && <Row label="Order ID" value={String(orderId)} valueClass="text-[11px] text-[#111418] dark:text-[#e8f3ee] font-medium break-all" />}
            {placedAt && <Row label="Placed At" value={formatTime(placedAt)} />}
            {closedAt && <Row label="Closed At" value={formatTime(closedAt)} />}
            {validityLabel && <Row label="Valid Till" value={validityLabel} />}
          </div>
        </div>

        <div className="px-4 pb-5 pt-2 border-t border-gray-100 dark:border-[#22352d] bg-white dark:bg-[#111b17]">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-[#eef1f4] dark:bg-[#16231d] text-[#4d5b67] dark:text-[#9cb7aa] font-semibold text-sm hover:bg-[#e3e8ed] dark:hover:bg-[#22352d] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const StatTile = ({ label, value }) => (
  <div className="rounded-xl bg-[#f7f9fb] dark:bg-[#16231d] border border-gray-100 dark:border-[#22352d] px-2 py-2 text-center min-w-0">
    <p className="text-[10px] text-[#7a8996] dark:text-[#9cb7aa] uppercase tracking-[0.04em]">{label}</p>
    <p className="text-[11px] font-semibold text-[#111418] dark:text-[#e8f3ee] break-words leading-tight">{value}</p>
  </div>
);

const Row = ({ label, value, valueClass = '' }) => (
  <div className="flex items-center justify-between py-1.5 gap-3">
    <span className="text-[11px] text-[#617589] dark:text-[#9cb7aa] shrink-0">{label}</span>
    <span className={`text-[11px] text-[#111418] dark:text-[#e8f3ee] text-right min-w-0 max-w-[68%] break-words ${valueClass}`}>{value}</span>
  </div>
);

export default OrderDetailSheet;
