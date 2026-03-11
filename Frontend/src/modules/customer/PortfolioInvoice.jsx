import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import { calculateClosedPnL } from '../../utils/calculateBrokerage';

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

const formatMoney = (value) =>
  `₹${Math.abs(toNumber(value)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatSignedMoney = (value) => {
  const n = toNumber(value);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${formatMoney(n)}`;
};

const CLOSED_STATUSES = new Set(['CLOSED', 'EXPIRED']);

const PortfolioInvoice = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [margin, setMargin] = useState('');

  const [generated, setGenerated] = useState(false);
  const [invoiceData, setInvoiceData] = useState([]);
  const [summary, setSummary] = useState({
    totalTurnover: 0,
    totalBrokerage: 0,
    totalPnl: 0,
    netPnl: 0,
  });

  const fetchClosedOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getOrders();
      const allOrders = response.orders || response.data || [];

      const closedOrders = allOrders
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
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
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
    let totalPnl = 0;

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

      totalTurnover += (entryPrice * qty) + (exitPrice * qty);
      totalBrokerage += resolvedBrokerage;
      totalPnl += resolvedNetPnl;

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

    setInvoiceData(processed);
    setSummary({
      totalTurnover,
      totalBrokerage,
      totalPnl,
      netPnl: totalPnl,
    });
    setGenerated(true);
    setError(null);
  };

  const handleDownloadPdf = async () => {
    const content = document.getElementById('portfolio-invoice-content');
    if (!content) return;

    try {
      setPdfLoading(true);
      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) {
        setError('Unable to open print window. Allow popups and try again.');
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Portfolio Invoice</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
              th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
            </style>
          </head>
          <body>${content.outerHTML}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    } catch (err) {
      console.error('PDF generation failed:', err);
      setError('Failed to open print-to-PDF flow. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  const summaryRows = useMemo(
    () => [
      { label: 'Total Turnover', value: formatMoney(summary.totalTurnover) },
      { label: 'Brokerage & Charges', value: formatMoney(summary.totalBrokerage) },
      ...(margin ? [{ label: 'Margin Used', value: formatMoney(margin) }] : []),
      { label: 'Net Profit / Loss', value: formatSignedMoney(summary.netPnl), isNet: true },
    ],
    [summary, margin]
  );

  if (!generated) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] p-4 flex flex-col items-center pt-16">
        <div className="w-full max-w-md bg-white dark:bg-[#111b17] rounded-xl shadow-sm border border-gray-100 dark:border-[#22352d] p-6">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => navigate('/portfolio')} className="p-2 hover:bg-gray-100 dark:hover:bg-[#16231d] rounded-full">
              <span className="material-symbols-outlined text-[20px] dark:text-[#e8f3ee]">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-[#111418] dark:text-[#e8f3ee]">Generate Portfolio Invoice</h1>
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

            <div>
              <label className="block text-sm font-medium text-[#617589] dark:text-[#9cb7aa] mb-1">Margin Used (optional)</label>
              <input
                type="number"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                placeholder="Enter margin amount"
                className="w-full bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-lg py-2 px-3 text-[#111418] dark:text-[#e8f3ee] focus:ring-2 focus:ring-[#137fec]/25 dark:focus:border-[#10b981] outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {loading && <p className="text-sm text-[#617589] dark:text-[#9cb7aa]">Loading closed orders...</p>}

            <button
              onClick={generateInvoice}
              disabled={loading}
              className="w-full bg-[#137fec] hover:bg-[#106dcc] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
            >
              Generate Invoice
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#050806] p-4 sm:p-6">
      <div className="max-w-5xl mx-auto flex items-center justify-between mb-4">
        <button
          onClick={() => setGenerated(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] px-3 py-2 text-sm text-[#111418] dark:text-[#e8f3ee] hover:bg-gray-50 dark:hover:bg-[#16231d]"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Edit Dates
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-[#137fec] px-4 py-2 text-sm font-semibold text-white hover:bg-[#106dcc] disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          {pdfLoading ? 'Opening...' : 'Save as PDF'}
        </button>
      </div>

      <div id="portfolio-invoice-content" className="max-w-5xl mx-auto bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl p-5 sm:p-8">
        <div className="flex justify-between items-start border-b border-gray-200 dark:border-[#22352d] pb-5 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#111418] dark:text-[#e8f3ee]">TAX INVOICE</h1>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-sm mt-1">Statement of Closed Positions</p>
            <div className="mt-3 text-xs text-[#617589] dark:text-[#9cb7aa]">
              <p><strong>Period:</strong> {new Date(startDate).toLocaleDateString('en-IN')} to {new Date(endDate).toLocaleDateString('en-IN')}</p>
              <p><strong>Generated On:</strong> {new Date().toLocaleDateString('en-IN')}</p>
            </div>
          </div>
          <div className="text-right">
            <h3 className="text-sm font-semibold text-[#617589] dark:text-[#9cb7aa] uppercase tracking-wide mb-1">Client Statement</h3>
            <p className="text-xs text-[#617589] dark:text-[#9cb7aa]">Rows: {invoiceData.length}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[760px]">
            <thead className="bg-gray-100 dark:bg-[#16231d] text-[#4b5563] dark:text-[#9cb7aa] font-semibold uppercase text-xs">
              <tr>
                <th className="px-3 py-3 rounded-l-lg">Date</th>
                <th className="px-3 py-3">Symbol</th>
                <th className="px-3 py-3">Side</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Entry</th>
                <th className="px-3 py-3 text-right">Exit</th>
                <th className="px-3 py-3 text-right">Brokerage</th>
                <th className="px-3 py-3 text-right rounded-r-lg">Net P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#22352d]">
              {invoiceData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-[#16231d]">
                  <td className="px-3 py-3 text-[#617589] dark:text-[#9cb7aa]">{item.date}</td>
                  <td className="px-3 py-3 font-medium text-[#111418] dark:text-[#e8f3ee]">{item.symbol}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-[#9cb7aa]">{item.side}</td>
                  <td className="px-3 py-3 text-right text-[#374151] dark:text-[#9cb7aa]">{item.qty}</td>
                  <td className="px-3 py-3 text-right text-[#374151] dark:text-[#9cb7aa]">{item.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-[#374151] dark:text-[#9cb7aa]">{item.exitPrice.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-[#374151] dark:text-[#9cb7aa]">{formatMoney(item.brokerage)}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${item.netPnl >= 0 ? 'text-[#078838] dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {formatSignedMoney(item.netPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-[#22352d] flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            {summaryRows.map((row) => (
              <div key={row.label} className={`flex justify-between ${row.isNet ? 'text-base font-bold pt-2 border-t border-gray-200 dark:border-[#22352d] dark:text-[#e8f3ee]' : 'text-[#4b5563] dark:text-[#9cb7aa]'}`}>
                <span>{row.label}</span>
                <span className={row.isNet ? (summary.netPnl >= 0 ? 'text-[#078838] dark:text-emerald-400' : 'text-red-500 dark:text-red-400') : ''}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioInvoice;
