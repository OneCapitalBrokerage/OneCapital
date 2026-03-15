import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import { calculateClosedPnL } from '../../utils/calculateBrokerage';
import { useAuth } from '../../context/AuthContext';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const localDateStr = (d) => {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
};

const formatMoney = (value) =>
  `₹${Math.abs(toNumber(value)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatSignedMoney = (value) => {
  const n = toNumber(value);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${formatMoney(n)}`;
};

const CLOSED_STATUSES = new Set(['CLOSED', 'EXPIRED']);

/* Fixed document width — wide enough for all 8 columns without truncation */
const INVOICE_DOC_WIDTH = 720;

const PRINT_CSS = `
@page { size: A4 portrait; margin: 1.2cm; }
@media print {
  body { background: white !important; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }

  /* Reset the viewport-zoom wrapper so the invoice fills the full A4 page */
  .invoice-zoom-wrap {
    zoom: 1 !important;
    width: 100% !important;
  }

  #portfolio-invoice-content {
    width: 100% !important;
    max-width: 100% !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  #portfolio-invoice-content table { width: 100% !important; font-size: 8.5pt !important; }
  #portfolio-invoice-content th,
  #portfolio-invoice-content td { padding: 5px 6px !important; white-space: nowrap !important; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

const PortfolioInvoice = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [generated, setGenerated] = useState(false);
  const [invoiceData, setInvoiceData] = useState([]);
  const [statementNo, setStatementNo] = useState('');
  const [generatedOn, setGeneratedOn] = useState('');
  const [summary, setSummary] = useState({
    totalTurnover: 0,
    totalBrokerage: 0,
    grossPnl: 0,
    netPnl: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
  });

  /* Zoom the invoice card so it always fits the viewport without clipping */
  const [docZoom, setDocZoom] = useState(1);
  const zoomRef = useRef(null);

  useEffect(() => {
    const updateZoom = () => {
      const available = (zoomRef.current?.parentElement?.clientWidth ?? window.innerWidth) - 32;
      setDocZoom(Math.min(1, available / INVOICE_DOC_WIDTH));
    };
    updateZoom();
    window.addEventListener('resize', updateZoom);
    return () => window.removeEventListener('resize', updateZoom);
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'portfolio-invoice-print-styles';
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => {
      const existing = document.getElementById('portfolio-invoice-print-styles');
      if (existing) document.head.removeChild(existing);
    };
  }, []);

  const fetchClosedOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = [];
      let page = 1;
      const limit = 200;
      while (true) {
        const res = await customerApi.getOrders({ page, limit });
        const batch = res.orders || res.data || [];
        all.push(...batch);
        if (batch.length < limit) break;
        page++;
      }

      const closedOrders = all
        .filter((order) => {
          const status = String(order.status || order.order_status || '').toUpperCase();
          return CLOSED_STATUSES.has(status);
        })
        .sort((a, b) => {
          const dateA = parseDate(a.closed_at || a.updatedAt || a.createdAt || a.placed_at);
          const dateB = parseDate(b.closed_at || b.updatedAt || b.createdAt || b.placed_at);
          return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        });

      setOrders(closedOrders);
    } catch (err) {
      console.error('Failed to load invoice orders:', err);
      setError(err.message || 'Failed to load closed orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    setStartDate(localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(localDateStr(now));
    fetchClosedOrders();
  }, [fetchClosedOrders]);

  const generateInvoice = () => {
    if (!startDate || !endDate) {
      setError('Select start and end dates first.');
      return;
    }

    const from = new Date(startDate);
    const to = new Date(endDate);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const filtered = orders.filter((order) => {
      const closedAt = parseDate(order.closed_at || order.updatedAt || order.createdAt || order.placed_at);
      if (!closedAt) return false;
      return closedAt >= from && closedAt <= to;
    });

    let totalTurnover = 0;
    let totalBrokerage = 0;
    let totalNetPnl = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    const processed = filtered.map((order, index) => {
      const qty = toNumber(order.quantity);
      const entryPrice = toNumber(order.effective_entry_price ?? order.average_price ?? order.price);
      const exitPrice = toNumber(
        order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? order.ltp ?? order.last_price ?? entryPrice
      );
      const side = String(order.side || '').toUpperCase() || 'BUY';
      const entryBrokerage = readNumber(order.brokerage_breakdown?.entry?.amount);
      const exitBrokerage = readNumber(order.brokerage_breakdown?.exit?.amount);
      const orderTotalBrokerage = readNumber(order.brokerage ?? order.brokerage_breakdown?.total);
      const fallbackPnl = calculateClosedPnL({
        side,
        avgPrice: entryPrice,
        exitPrice,
        qty,
        entryBrokerage,
        exitBrokerage,
        totalBrokerage: orderTotalBrokerage,
      });
      const realizedPnl = canUseStoredRealizedPnl(order) ? readNumber(order.realized_pnl) : null;
      const resolvedNetPnl = realizedPnl ?? fallbackPnl.netPnl;
      const resolvedBrokerage = orderTotalBrokerage ?? fallbackPnl.totalBrokerage;

      totalTurnover += entryPrice * qty + exitPrice * qty;
      totalBrokerage += resolvedBrokerage;
      totalNetPnl += resolvedNetPnl;
      if (resolvedNetPnl > 0) winningTrades++;
      else if (resolvedNetPnl < 0) losingTrades++;

      const date = parseDate(order.closed_at || order.updatedAt || order.createdAt || order.placed_at);

      return {
        id: order.id || order._id || `${order.symbol || 'row'}-${index}`,
        date: date ? date.toLocaleDateString('en-IN') : '-',
        symbol: order.symbol || '-',
        side,
        qty,
        entryPrice,
        exitPrice,
        brokerage: resolvedBrokerage,
        netPnl: resolvedNetPnl,
      };
    });

    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 90000) + 10000);
    setStatementNo(`ST-${yyyymm}-${seq}`);
    setGeneratedOn(now.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }));

    setInvoiceData(processed);
    setSummary({
      totalTurnover,
      totalBrokerage,
      grossPnl: totalNetPnl + totalBrokerage,
      netPnl: totalNetPnl,
      totalTrades: processed.length,
      winningTrades,
      losingTrades,
    });
    setGenerated(true);
    setError(null);
  };

  const clientName = user?.name || user?.fullName || user?.username || 'Client';
  const clientId = user?._id || user?.id || user?.client_id || '-';

  if (!generated) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] p-4 flex flex-col items-center pt-16">
        <div className="w-full max-w-md bg-white dark:bg-[#111b17] rounded-xl shadow-sm border border-gray-100 dark:border-[#22352d] p-6">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/portfolio')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-[#16231d] rounded-full"
            >
              <span className="material-symbols-outlined text-[20px] dark:text-[#e8f3ee]">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-[#111418] dark:text-[#e8f3ee]">Generate Trade Statement</h1>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#617589] dark:text-[#9cb7aa] mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-lg py-2 px-3 text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-[#137fec]/25 dark:focus:border-[#10b981] outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#617589] dark:text-[#9cb7aa] mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-lg py-2 px-3 text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-[#137fec]/25 dark:focus:border-[#10b981] outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {loading && <p className="text-sm text-[#617589] dark:text-[#9cb7aa]">Loading orders...</p>}

            <button
              onClick={generateInvoice}
              disabled={loading}
              className="w-full bg-[#137fec] hover:bg-[#106dcc] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
            >
              Generate Statement
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] p-4 sm:p-6">
      {/* Action bar — hidden on print */}
      <div className="flex items-center justify-between mb-4 no-print">
        <button
          onClick={() => setGenerated(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] px-3 py-2 text-sm text-[#111418] dark:text-[#e8f3ee] hover:bg-gray-50 dark:hover:bg-[#16231d]"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Edit Dates
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#137fec] px-4 py-2 text-sm font-semibold text-white hover:bg-[#106dcc]"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Print / Save as PDF
        </button>
      </div>

      {/* Zoom wrapper — centres the fixed-width invoice and scales it to fit any viewport */}
      <div className="flex justify-center items-start">
        <div ref={zoomRef} className="invoice-zoom-wrap" style={{ zoom: docZoom, width: `${INVOICE_DOC_WIDTH}px` }}>

      {/* Invoice card — always light for print fidelity */}
      <div
        id="portfolio-invoice-content"
        className="bg-white border border-gray-200 rounded-xl p-6"
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-5 mb-5">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <img
                src="/logo/logo-1024px.png"
                alt=""
                className="w-14 h-14 object-contain shrink-0"
              />
              <div
                className="leading-none tracking-tight"
                style={{ fontFamily: "'WarblerDisplay', serif", fontSize: '2rem' }}
              >
                <span style={{ color: '#4338ca' }}>One</span>
                <span style={{ color: '#f47929' }}>Capital</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-[#111418]">Closed Trade Statement</h1>
            <p className="text-[#617589] text-sm mt-1">Portfolio P&L Report</p>
          </div>
          <div className="text-right text-xs text-[#617589] space-y-1">
            <p className="font-semibold text-sm text-[#111418]">{clientName}</p>
            <p>Client ID: {clientId}</p>
            <p>
              Statement No:{' '}
              <span className="font-medium text-[#111418]">{statementNo}</span>
            </p>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-4 gap-4 mb-6 text-xs text-[#617589]">
          <div>
            <p className="uppercase font-semibold text-[10px] tracking-wide mb-0.5">Period From</p>
            <p className="text-[#111418] font-medium">
              {new Date(startDate).toLocaleDateString('en-IN')}
            </p>
          </div>
          <div>
            <p className="uppercase font-semibold text-[10px] tracking-wide mb-0.5">Period To</p>
            <p className="text-[#111418] font-medium">
              {new Date(endDate).toLocaleDateString('en-IN')}
            </p>
          </div>
          <div>
            <p className="uppercase font-semibold text-[10px] tracking-wide mb-0.5">Generated On</p>
            <p className="text-[#111418] font-medium">{generatedOn}</p>
          </div>
          <div>
            <p className="uppercase font-semibold text-[10px] tracking-wide mb-0.5">Total Trades</p>
            <p className="text-[#111418] font-medium">{invoiceData.length}</p>
          </div>
        </div>

        {/* Table or empty state */}
        {invoiceData.length === 0 ? (
          <div className="text-center py-12 text-[#617589]">
            No closed trades found for the selected period.
          </div>
        ) : (
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-gray-100 text-[#4b5563] font-semibold uppercase text-[10px] tracking-wide">
              <tr>
                <th className="px-2 py-2 rounded-l-lg whitespace-nowrap">Date</th>
                <th className="px-2 py-2 whitespace-nowrap">Symbol</th>
                <th className="px-2 py-2 whitespace-nowrap">Side</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Qty</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Entry</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Exit</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Brokerage</th>
                <th className="px-2 py-2 text-right rounded-r-lg whitespace-nowrap">Net P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoiceData.map((item) => (
                <tr key={item.id}>
                  <td className="px-2 py-2 text-[#617589] whitespace-nowrap">{item.date}</td>
                  <td className="px-2 py-2 font-medium text-[#111418] whitespace-nowrap">{item.symbol}</td>
                  <td className="px-2 py-2 text-[#374151] whitespace-nowrap">{item.side}</td>
                  <td className="px-2 py-2 text-right text-[#374151] whitespace-nowrap">{item.qty}</td>
                  <td className="px-2 py-2 text-right text-[#374151] whitespace-nowrap">{formatMoney(item.entryPrice)}</td>
                  <td className="px-2 py-2 text-right text-[#374151] whitespace-nowrap">{formatMoney(item.exitPrice)}</td>
                  <td className="px-2 py-2 text-right text-[#374151] whitespace-nowrap">{formatMoney(item.brokerage)}</td>
                  <td
                    className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${
                      item.netPnl >= 0 ? 'text-[#078838]' : 'text-red-500'
                    }`}
                  >
                    {formatSignedMoney(item.netPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Summary */}
        {invoiceData.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
            <div className="w-80 text-sm space-y-2">
              <div className="flex justify-between text-[#4b5563]">
                <span>Total Trades</span>
                <span>{summary.totalTrades}</span>
              </div>
              <div className="flex justify-between text-[#4b5563]">
                <span>Winning Trades</span>
                <span className="text-[#078838]">{summary.winningTrades}</span>
              </div>
              <div className="flex justify-between text-[#4b5563]">
                <span>Losing Trades</span>
                <span className="text-red-500">{summary.losingTrades}</span>
              </div>
              <div className="flex justify-between text-[#4b5563]">
                <span>Period Turnover</span>
                <span>{formatMoney(summary.totalTurnover)}</span>
              </div>
              <div className="flex justify-between text-[#4b5563]">
                <span>Brokerage &amp; Charges</span>
                <span>{formatMoney(summary.totalBrokerage)}</span>
              </div>
              <div className="flex justify-between text-[#4b5563]">
                <span>Gross P&amp;L</span>
                <span className={summary.grossPnl >= 0 ? 'text-[#078838]' : 'text-red-500'}>
                  {formatSignedMoney(summary.grossPnl)}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200 text-[#111418]">
                <span>Net P&amp;L</span>
                <span className={summary.netPnl >= 0 ? 'text-[#078838]' : 'text-red-500'}>
                  {formatSignedMoney(summary.netPnl)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-[#617589] text-center space-y-1">
          <p>This is a system-generated statement and does not require a signature.</p>
          <p>For support, contact our team via the app. All figures are in INR.</p>
          <p>
            Generated on {generatedOn} &middot; {statementNo}
          </p>
        </div>
      </div>{/* /invoice-card */}
        </div>{/* /zoom-inner */}
      </div>{/* /zoom-wrapper */}
    </div>
  );
};

export default PortfolioInvoice;
