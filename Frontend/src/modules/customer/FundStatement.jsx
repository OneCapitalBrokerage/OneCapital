import { useCallback, useEffect, useMemo, useState } from 'react';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';
import {
  formatCurrency,
  formatSignedTransactionAmount,
  formatTransactionDateTime,
  getStatusMeta,
  getTransactionVisualMeta,
  normalizeUiTransaction,
} from '../../utils/transactionFormatters';

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'payment', label: 'Payments' },
  { key: 'trading', label: 'Trading P&L' },
  { key: 'margin', label: 'Margin' },
  { key: 'adjustment', label: 'Adjustments' },
];

const DATE_FILTERS = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

const toIsoStart = (dateStr) => {
  const parsed = new Date(`${dateStr}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toIsoEnd = (dateStr) => {
  const parsed = new Date(`${dateStr}T23:59:59.999`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const FundStatement = () => {
  const [category, setCategory] = useState('all');
  const [dateFilter, setDateFilter] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  const dateQuery = useMemo(() => {
    const now = new Date();

    if (dateFilter === '7d' || dateFilter === '30d') {
      const days = dateFilter === '7d' ? 7 : 30;
      const fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - days);
      fromDate.setHours(0, 0, 0, 0);
      return {
        from: fromDate.toISOString(),
        to: now.toISOString(),
      };
    }

    if (dateFilter === 'custom') {
      const from = customFrom ? toIsoStart(customFrom) : null;
      const to = customTo ? toIsoEnd(customTo) : null;
      return { from, to };
    }

    return { from: null, to: null };
  }, [dateFilter, customFrom, customTo]);

  const hasInvalidCustomRange = useMemo(() => {
    if (dateFilter !== 'custom' || !customFrom || !customTo) return false;
    return new Date(customFrom) > new Date(customTo);
  }, [dateFilter, customFrom, customTo]);

  const fetchStatement = useCallback(async ({ pageToLoad = 1, append = false } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const params = {
        page: pageToLoad,
        limit: 20,
        ui: true,
        includeRequests: true,
        category: category === 'all' ? undefined : category,
        from: dateQuery.from || undefined,
        to: dateQuery.to || undefined,
      };
      const response = await customerApi.getFundHistory(params);
      const mappedRows = (response.transactions || []).map((row) => normalizeUiTransaction(row));

      setTransactions((prev) => {
        if (!append) return mappedRows;
        const merged = [...prev, ...mappedRows];
        const seen = new Set();
        return merged.filter((item) => {
          const key = `${item.id || ''}-${item.timestamp || ''}-${item.title || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });

      setPagination({
        page: Number(response?.pagination?.page) || 1,
        limit: Number(response?.pagination?.limit) || 20,
        total: Number(response?.pagination?.total) || mappedRows.length,
        pages: Number(response?.pagination?.pages) || 1,
      });
    } catch (err) {
      console.error('Failed to fetch statement:', err);
      setError(err?.response?.data?.message || err.message || 'Failed to load statement.');
      if (!append) {
        setTransactions([]);
        setPagination({ page: 1, limit: 20, total: 0, pages: 1 });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, dateQuery.from, dateQuery.to]);

  useEffect(() => {
    if (hasInvalidCustomRange) {
      setTransactions([]);
      setPagination({ page: 1, limit: 20, total: 0, pages: 1 });
      return;
    }
    fetchStatement({ pageToLoad: 1, append: false });
  }, [fetchStatement, hasInvalidCustomRange]);

  const canLoadMore = !loading && !loadingMore && pagination.page < pagination.pages;

  const transactionsForTotals = useMemo(
    () => transactions.filter((tx) => tx.status !== 'failed'),
    [transactions]
  );

  const totals = useMemo(() => {
    return transactionsForTotals.reduce(
      (acc, tx) => {
        if (tx.direction === 'credit') acc.credits += tx.amount;
        if (tx.direction === 'debit') acc.debits += tx.amount;
        return acc;
      },
      { credits: 0, debits: 0 }
    );
  }, [transactionsForTotals]);

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee] pb-8">
      <TopHeader title="Statement" showBack={true} rightAction={<div />} />

      <div className="px-4 pt-3 space-y-3">
        <div className="bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl p-3.5 shadow-sm">
          <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] uppercase tracking-wide">Summary (Loaded)</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-[#eaf3ff] dark:bg-emerald-500/10 p-2.5">
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px]">Credits</p>
              <p className="text-[#078838] dark:text-emerald-400 text-[13px] font-bold mt-0.5">{formatCurrency(totals.credits)}</p>
            </div>
            <div className="rounded-lg bg-[#fff2f2] dark:bg-red-900/20 p-2.5">
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px]">Debits</p>
              <p className="text-red-600 dark:text-red-400 text-[13px] font-bold mt-0.5">{formatCurrency(totals.debits)}</p>
            </div>
            <div className="rounded-lg bg-[#f6f7f8] dark:bg-[#16231d] p-2.5">
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px]">Entries</p>
              <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold mt-0.5">{pagination.total}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[#617589] dark:text-[#9cb7aa]">
            Note: failed entries not included in Credits/Debits totals.
          </p>
        </div>

        <div className="bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl p-2 shadow-sm">
          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {CATEGORY_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setCategory(filter.key)}
                  className={`h-9 px-3.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${
                    category === filter.key
                      ? 'bg-[#137fec] text-white'
                      : 'bg-[#f6f7f8] dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto mt-2">
            <div className="flex gap-2 min-w-max">
              {DATE_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setDateFilter(filter.key)}
                  className={`h-8 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                    dateFilter === filter.key
                      ? 'bg-[#111418] dark:bg-[#e8f3ee] dark:text-[#111418] text-white'
                      : 'bg-[#f6f7f8] dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {dateFilter === 'custom' && (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="h-10 rounded-lg border border-gray-200 dark:border-[#22352d] dark:bg-[#16231d] dark:text-[#e8f3ee] px-3 text-sm outline-none focus:border-[#137fec]"
              />
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="h-10 rounded-lg border border-gray-200 dark:border-[#22352d] dark:bg-[#16231d] dark:text-[#e8f3ee] px-3 text-sm outline-none focus:border-[#137fec]"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {hasInvalidCustomRange && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-sm text-amber-800">Custom date range is invalid. Select a valid `From` and `To` range.</p>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            [1, 2, 3, 4].map((item) => (
              <div key={item} className="bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl p-3 animate-pulse">
                <div className="h-4 w-32 bg-gray-200 dark:bg-[#22352d] rounded" />
                <div className="h-3 w-40 bg-gray-200 dark:bg-[#22352d] rounded mt-2" />
                <div className="h-3 w-24 bg-gray-200 dark:bg-[#22352d] rounded mt-2" />
              </div>
            ))
          ) : transactions.length === 0 ? (
            <div className="bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl py-12 text-center">
              <span className="material-symbols-outlined text-gray-300 dark:text-[#22352d] text-[44px]">receipt_long</span>
              <p className="text-[#617589] dark:text-[#9cb7aa] text-sm mt-2">No statement entries found.</p>
            </div>
          ) : (
            transactions.map((tx, index) => {
              const visual = getTransactionVisualMeta(tx);
              const statusMeta = getStatusMeta(tx.status);
              const showStatus = tx.status === 'pending' || tx.status === 'failed';

              return (
                <div key={`${tx.id || index}-${tx.timestamp || ''}`} className="bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl p-3.5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 size-10 rounded-full flex items-center justify-center ${visual.circleClass}`}>
                      <span className={`material-symbols-outlined text-[20px] ${visual.iconClass}`}>{visual.icon}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] font-bold leading-snug break-words">{tx.title}</p>
                        <p className={`text-[13px] font-bold shrink-0 ${visual.amountClass}`}>
                          {formatSignedTransactionAmount(tx)}
                        </p>
                      </div>

                      <p className="text-[#617589] dark:text-[#9cb7aa] text-[12px] mt-0.5 break-words">
                        {tx.subtitle || 'Account update'}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] break-words">
                          {formatTransactionDateTime(tx.timestamp)}
                          {tx.reference ? ` • Ref: ${tx.reference}` : ''}
                        </p>
                        {showStatus && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {canLoadMore && (
          <button
            onClick={() => fetchStatement({ pageToLoad: pagination.page + 1, append: true })}
            className="w-full h-11 rounded-xl border border-dashed border-gray-300 dark:border-[#22352d] text-[#137fec] text-sm font-bold"
          >
            Load More
          </button>
        )}
        {loadingMore && (
          <div className="text-center py-2">
            <p className="text-[#617589] dark:text-[#9cb7aa] text-sm">Loading more...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FundStatement;
