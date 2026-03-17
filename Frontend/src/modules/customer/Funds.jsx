import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import { useAuth } from '../../context/AuthContext';
import {
  formatSignedTransactionAmount,
  formatTransactionDateTime,
  getStatusMeta,
  getTransactionVisualMeta,
  normalizeUiTransaction,
} from '../../utils/transactionFormatters';
import { readSessionCache, writeSessionCache, clearSessionCache } from '../../utils/sessionCache';
import { FundsWarningBanner } from '../../components/shared/WarningBanner';

const FUNDS_CACHE_KEY = 'funds_tab_v1';
const FUNDS_CACHE_TTL_MS = 30 * 1000;

const formatCurrency = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatIstDateOnly = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const getIstNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

const isSaturdayIst = () => getIstNow().getDay() === 6;

const Funds = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [wallet, setWallet] = useState({
    depositedCash: 0,
    netCash: 0,
    withdrawableNetCash: 0,
    pendingWithdrawals: 0,
  });
  const [trading, setTrading] = useState({
    openingBalance: 0,
    intraday: { available: 0, used: 0, remaining: 0 },
    delivery: { available: 0, used: 0, remaining: 0 },
    optionPremium: { percent: 10, base: 0, limit: 0, used: 0, remaining: 0 },
    commodityDelivery: { available: 0, used: 0, remaining: 0 },
    commodityIntraday: { available: 0, used: 0, remaining: 0 },
    commodityOptionPremium: { percent: 10, base: 0, limit: 0, used: 0, remaining: 0 },
  });
  const [summary, setSummary] = useState({
    payInLastWeek: 0,
    payOutToday: 0,
    realizedPnlToday: 0,
    realizedPnlThisWeek: 0,
    weekBoundaryStart: null,
    weekBoundaryType: 'trading_week_start',
  });

  const applyFundsState = useCallback((nextState) => {
    setWallet(nextState?.wallet || {
      depositedCash: 0,
      netCash: 0,
      withdrawableNetCash: 0,
      pendingWithdrawals: 0,
    });
    setTrading(nextState?.trading || {
      openingBalance: 0,
      intraday: { available: 0, used: 0, remaining: 0 },
      delivery: { available: 0, used: 0, remaining: 0 },
      optionPremium: { percent: 10, base: 0, limit: 0, used: 0, remaining: 0 },
      commodityDelivery: { available: 0, used: 0, remaining: 0 },
      commodityOptionPremium: { percent: 10, base: 0, limit: 0, used: 0, remaining: 0 },
    });
    setSummary(nextState?.summary || {
      payInLastWeek: 0,
      payOutToday: 0,
      realizedPnlToday: 0,
      realizedPnlThisWeek: 0,
      weekBoundaryStart: null,
      weekBoundaryType: 'trading_week_start',
    });
    setTransactions(nextState?.transactions || []);
  }, []);

  const fetchFunds = useCallback(async (options = {}) => {
    const { force = false } = options;

    if (!force) {
      const cached = readSessionCache(FUNDS_CACHE_KEY, FUNDS_CACHE_TTL_MS);
      if (cached?.data) {
        applyFundsState(cached.data);
        setError(null);
        setLoading(false);
        return;
      }
    } else {
      clearSessionCache(FUNDS_CACHE_KEY);
    }

    setLoading(true);
    setError(null);
    try {
      const [balanceRes, historyRes] = await Promise.all([
        customerApi.getBalance(),
        customerApi.getFundHistory({
          limit: 5,
          category: 'payment',
          ui: true,
          includeRequests: true,
        }).catch(() => ({ transactions: [] })),
      ]);

      // Map new structured response (with legacy fallbacks)
      const data = balanceRes;
      const balance = data.balance || {};
      const intraday = balance.intraday || {};
      const overnight = balance.overnight || {};

      const nextWallet = {
        depositedCash: data.wallet?.depositedCash ?? data.wallet?.availableCash ?? balance.net ?? 0,
        netCash: data.wallet?.netCash ?? 0,
        withdrawableNetCash: data.wallet?.withdrawableNetCash ?? data.wallet?.netCash ?? 0,
        pendingWithdrawals: data.wallet?.pendingWithdrawals ?? 0,
      };

      const nextTrading = {
        openingBalance: data.trading?.openingBalance ?? 0,
        intraday: {
          available: data.trading?.intraday?.available ?? intraday.available ?? 0,
          used: data.trading?.intraday?.used ?? intraday.used ?? 0,
          remaining: data.trading?.intraday?.remaining ?? intraday.free ?? 0,
        },
        delivery: {
          available: data.trading?.delivery?.available ?? overnight.available ?? 0,
          used: data.trading?.delivery?.used ?? 0,
          remaining: data.trading?.delivery?.remaining ?? overnight.available ?? 0,
        },
        optionPremium: {
          percent: data.trading?.optionPremium?.percent ?? 10,
          base: data.trading?.optionPremium?.base ?? 0,
          limit: data.trading?.optionPremium?.limit ?? 0,
          used: data.trading?.optionPremium?.used ?? 0,
          remaining: data.trading?.optionPremium?.remaining ?? 0,
        },
        commodityDelivery: {
          available: data.trading?.commodityDelivery?.available ?? 0,
          used: data.trading?.commodityDelivery?.used ?? 0,
          remaining: data.trading?.commodityDelivery?.remaining ?? 0,
        },
        commodityIntraday: {
          available: data.trading?.commodityIntraday?.available ?? 0,
          used: data.trading?.commodityIntraday?.used ?? 0,
          remaining: data.trading?.commodityIntraday?.remaining ?? 0,
        },
        commodityOptionPremium: {
          percent: data.trading?.commodityOptionPremium?.percent ?? 10,
          base: data.trading?.commodityOptionPremium?.base ?? 0,
          limit: data.trading?.commodityOptionPremium?.limit ?? 0,
          used: data.trading?.commodityOptionPremium?.used ?? 0,
          remaining: data.trading?.commodityOptionPremium?.remaining ?? 0,
        },
      };

      const nextSummary = {
        payInLastWeek: data.summary?.payInLastWeek ?? data.summary?.payInToday ?? 0,
        payOutToday: data.summary?.payOutToday ?? 0,
        realizedPnlToday: data.summary?.realizedPnlToday ?? 0,
        realizedPnlThisWeek: data.summary?.realizedPnlThisWeek ?? data.summary?.realizedPnlToday ?? 0,
        weekBoundaryStart: data.summary?.weekBoundaryStart
          ?? data.settlement?.boundaryStart
          ?? null,
        weekBoundaryType: data.summary?.weekBoundaryType
          ?? data.settlement?.boundaryType
          ?? 'trading_week_start',
      };

      const txHistory = historyRes.transactions || historyRes.data || [];
      const paymentOnlyRows = txHistory
        .map((tx) => normalizeUiTransaction(tx))
        .filter((tx) => tx.category === 'payment')
        .slice(0, 5);
      const nextState = {
        wallet: nextWallet,
        trading: nextTrading,
        summary: nextSummary,
        transactions: paymentOnlyRows,
      };

      applyFundsState(nextState);
      writeSessionCache(FUNDS_CACHE_KEY, nextState);
    } catch (err) {
      console.error('Failed to fetch funds:', err);
      setError(err.message || 'Failed to load funds data');
    } finally {
      setLoading(false);
    }
  }, [applyFundsState]);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  // Re-fetch when the tab regains focus so balances don't stay stale after
  // external actions (deposits, withdrawals, trades in another tab).
  useEffect(() => {
    const onFocus = () => fetchFunds({ force: true });
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchFunds]);

  // Periodic auto-refresh so balance values update automatically while the
  // page stays open (aligns with backend 90 s rotation slot).
  useEffect(() => {
    const id = setInterval(() => fetchFunds({ force: true }), 90_000);
    return () => clearInterval(id);
  }, [fetchFunds]);

  // Compute margin utilization
  const totalMarginAvailable =
    trading.intraday.available +
    trading.delivery.available +
    trading.commodityDelivery.available +
    trading.commodityIntraday.available;
  const totalMarginUsed =
    trading.intraday.used +
    trading.delivery.used +
    trading.commodityDelivery.used +
    trading.commodityIntraday.used;
  const usedPercent = totalMarginAvailable > 0 ? Math.round((totalMarginUsed / totalMarginAvailable) * 100) : 0;
  const saturdayActive = isSaturdayIst();
  const withdrawableNetCash = Math.max(0, Number(wallet.withdrawableNetCash) || 0);
  const withdrawDisabled = loading || withdrawableNetCash <= 0 || !saturdayActive;
  const currentWeekNetCash = Number(wallet.netCash) || 0;
  const displayedNetCash = currentWeekNetCash;
  const netCashToneClass = displayedNetCash >= 0 ? 'text-[#078838]' : 'text-red-500';

  return (
    <div className="flex flex-col min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee] pb-24">
      {/* Header */}
      <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between sticky top-0 z-10 bg-[#f2f4f6] dark:bg-[#050806]">
        <div className="flex flex-col">
          <h2 className="text-[#111418] dark:text-[#e8f3ee] text-[17px] sm:text-[19px] font-bold leading-tight">Funds</h2>
          <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[13px]">ID: {user?.customer_id || user?.id || '---'}</p>
        </div>
        <button
          onClick={() => navigate('/support', { state: { backTo: '/funds' } })}
          className="inline-flex items-center justify-end text-[#137fec] text-[14px] sm:text-[15px] font-semibold hover:opacity-80 transition-opacity"
        >
          Help
        </button>
      </div>

      {error && (
        <div className="mx-3 sm:mx-4 mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Main Cards — Deposited Cash + Net Cash */}
      <div className="px-3 sm:px-4 mt-1.5 flex gap-2.5">
        {/* Deposited Cash */}
        <div className="flex-1 rounded-xl shadow-sm border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#0b120f] overflow-hidden">
          <div className="p-3.5 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="material-symbols-outlined text-[#137fec] text-[18px]">account_balance_wallet</span>
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[13px]">Deposited Cash</p>
            </div>
            {loading ? (
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-24 mb-1"></div>
              </div>
            ) : (
              <p className="text-[#111418] dark:text-[#e8f3ee] text-[20px] sm:text-[24px] font-bold leading-tight tracking-[-0.02em]">
                {formatCurrency(wallet.depositedCash)}
              </p>
            )}
          </div>
        </div>

        {/* Net Cash (P&L) */}
        <div className="flex-1 rounded-xl shadow-sm border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#0b120f] overflow-hidden">
          <div className="p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]" style={{ color: !loading && displayedNetCash >= 0 ? '#078838' : '#ef4444' }}>
                  trending_up
                </span>
                <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[13px]">Net Cash</p>
              </div>
            </div>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-[10px] sm:text-[11px] mb-0.5">
              Net P&amp;L
            </p>
            {loading ? (
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-24 mb-1"></div>
              </div>
            ) : (
              <p className={`text-[20px] sm:text-[24px] font-bold leading-tight tracking-[-0.02em] ${netCashToneClass}`}>
                {displayedNetCash >= 0 ? '+' : ''}{formatCurrency(displayedNetCash)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Margin Usage Bar */}
      <div className="px-3 sm:px-4 mt-2.5">
        <div className="rounded-xl shadow-sm border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#0b120f] overflow-hidden">
          <div className="p-3.5 sm:p-4">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-3.5 bg-gray-200 rounded w-48 mb-3"></div>
                <div className="h-2 bg-gray-200 rounded w-full"></div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-end mb-1">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[13px]">Margin Used</p>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[11px] sm:text-[13px] font-bold">{usedPercent}%</p>
                </div>
                <div className="w-full bg-gray-200 dark:bg-[#16231d] rounded-full h-1.5">
                  <div
                    className="bg-[#137fec] h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(usedPercent, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[11px] font-semibold">{formatCurrency(totalMarginUsed)}</p>
                  <p className="text-gray-400 dark:text-[#6f8b7f] text-[10px]">of {formatCurrency(totalMarginAvailable)}</p>
                </div>
              </>
            )}
          </div>
          <div
            onClick={() => navigate('/funds/history')}
            className="border-t border-gray-100 dark:border-[#22352d] py-2.5 flex justify-center items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors"
          >
            <span className="text-[#137fec] text-[13px] font-semibold mr-0.5">View Statement</span>
            <span className="material-symbols-outlined text-[#137fec] text-[16px]">chevron_right</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2.5 px-3 sm:px-4 mt-3">
        <button
          onClick={() => navigate('/funds/add')}
          className="flex-1 flex items-center justify-center rounded-xl h-11 bg-[#137fec] text-white text-[14px] font-semibold shadow-sm"
        >
          <span className="material-symbols-outlined mr-1.5 text-[18px]">add</span>
          Add Funds
        </button>
        <button
          onClick={() => navigate('/funds/withdraw')}
          disabled={withdrawDisabled}
          className="flex-1 flex items-center justify-center rounded-xl h-11 bg-white dark:bg-[#0b120f] border border-gray-200 dark:border-[#22352d] text-[#111418] dark:text-[#e8f3ee] text-[14px] font-bold shadow-sm disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined mr-1.5 text-[18px] rotate-45">arrow_upward</span>
          Withdraw
        </button>
      </div>
      <div className="px-3 sm:px-4 mt-1">
        <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px]">
          Withdrawable (Net Cash): <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">{formatCurrency(withdrawableNetCash)}</span>
          {' '}| Pending Requests: <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">{formatCurrency(wallet.pendingWithdrawals)}</span>
        </p>
      </div>

      {/* Info Banner */}
      <div className="px-3 sm:px-4 mt-3">
        <div className="flex items-start gap-1.5 bg-[#e6f2ff] py-2.5 px-2.5 rounded-lg">
          <span className="material-symbols-outlined text-[#137fec] text-[16px] mt-[1px]">info</span>
          <p className="text-[#137fec] text-[11px] font-medium leading-tight">
            {saturdayActive
              ? 'Withdrawal requests are active today (Saturday, IST).'
              : 'Withdrawal requests are active on Saturdays only.'}
          </p>
        </div>
      </div>

      {/* Admin Warning Banner */}
      <FundsWarningBanner />

      {/* Details Grid */}
      <div className="px-3 sm:px-4 mt-6">
        <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[17px] font-bold mb-3">Details</h3>
        {summary.weekBoundaryStart && (
          <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] mb-2">
            Active period from{' '}
            <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">
              {formatIstDateOnly(summary.weekBoundaryStart)}
            </span>
          </p>
        )}
        <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-3 animate-pulse">
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-12 bg-gray-200 rounded"></div>)}
              </div>
            </div>
          ) : (
            <>
              <div className="flex border-b border-gray-100 dark:border-[#22352d]">
                <div className="flex-1 p-3 border-r border-gray-100 dark:border-[#22352d]">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] mb-1">Opening Balance</p>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.openingBalance)}</p>
                </div>
                <div className="flex-1 p-3">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] mb-1">Pay-in (This Week)</p>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(summary.payInLastWeek)}</p>
                </div>
              </div>
              <div className="flex border-b border-gray-100 dark:border-[#22352d]">
                <div className="flex-1 p-3 border-r border-gray-100 dark:border-[#22352d]">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] mb-1">Intraday Margin</p>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.intraday.available)}</p>
                </div>
                <div className="flex-1 p-3">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] mb-1">Delivery Margin</p>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.delivery.available)}</p>
                </div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 border-r border-gray-100 dark:border-[#22352d]">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] mb-1">Option Premium</p>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.optionPremium.limit)}</p>
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[9px] mt-0.5">{trading.optionPremium.percent}% of opening balance</p>
                </div>
                <div className="flex-1 p-3">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] mb-1">Realized P&L (This Week)</p>
                  <p className={`text-[13px] font-bold ${summary.realizedPnlThisWeek >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                    {summary.realizedPnlThisWeek >= 0 ? '+' : ''}{formatCurrency(summary.realizedPnlThisWeek)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Limits Remaining Card */}
      <div className="px-3 sm:px-4 mt-4">
        <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[17px] font-bold mb-3">Limits Remaining</h3>
        <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-3 animate-pulse">
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-200 rounded"></div>)}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#22352d]">
              {/* Intraday Remaining */}
              <div className="p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#137fec] text-[16px]">speed</span>
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-medium">Intraday</p>
                  </div>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.intraday.remaining)}</p>
                </div>
                <div className="w-full bg-gray-100 dark:bg-[#16231d] rounded-full h-1.5">
                  <div
                    className="bg-[#137fec] h-1.5 rounded-full transition-all"
                    style={{ width: `${trading.intraday.available > 0 ? Math.min(100, Math.round((trading.intraday.used / trading.intraday.available) * 100)) : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Used: {formatCurrency(trading.intraday.used)}</p>
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Limit: {formatCurrency(trading.intraday.available)}</p>
                </div>
              </div>

              {/* Delivery Remaining */}
              <div className="p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#078838] text-[16px]">inventory_2</span>
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-medium">Delivery</p>
                  </div>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.delivery.remaining)}</p>
                </div>
                <div className="w-full bg-gray-100 dark:bg-[#16231d] rounded-full h-1.5">
                  <div
                    className="bg-[#078838] h-1.5 rounded-full transition-all"
                    style={{ width: `${trading.delivery.available > 0 ? Math.min(100, Math.round((trading.delivery.used / trading.delivery.available) * 100)) : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Used: {formatCurrency(trading.delivery.used)}</p>
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Limit: {formatCurrency(trading.delivery.available)}</p>
                </div>
              </div>

              {/* Option Premium Remaining */}
              <div className="p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-500 text-[16px]">candlestick_chart</span>
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-medium">Option Premium</p>
                  </div>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.optionPremium.remaining)}</p>
                </div>
                <div className="w-full bg-gray-100 dark:bg-[#16231d] rounded-full h-1.5">
                  <div
                    className="bg-amber-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${trading.optionPremium.limit > 0 ? Math.min(100, Math.round((trading.optionPremium.used / trading.optionPremium.limit) * 100)) : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Used: {formatCurrency(trading.optionPremium.used)}</p>
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Limit: {formatCurrency(trading.optionPremium.limit)}</p>
                </div>
              </div>

              {/* Commodities Intraday Margin (MCX) */}
              <div className="p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-orange-500 text-[16px]">speed</span>
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-medium">Commodities Intraday Margin</p>
                  </div>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.commodityIntraday.remaining)}</p>
                </div>
                <div className="w-full bg-gray-100 dark:bg-[#16231d] rounded-full h-1.5">
                  <div
                    className="bg-orange-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${trading.commodityIntraday.available > 0 ? Math.min(100, Math.round((trading.commodityIntraday.used / trading.commodityIntraday.available) * 100)) : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Used: {formatCurrency(trading.commodityIntraday.used)}</p>
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Limit: {formatCurrency(trading.commodityIntraday.available)}</p>
                </div>
              </div>

              {/* Commodities Delivery Margin (MCX) */}
              <div className="p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-orange-500 text-[16px]">warehouse</span>
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-medium">Commodities Delivery Margin</p>
                  </div>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.commodityDelivery.remaining)}</p>
                </div>
                <div className="w-full bg-gray-100 dark:bg-[#16231d] rounded-full h-1.5">
                  <div
                    className="bg-orange-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${trading.commodityDelivery.available > 0 ? Math.min(100, Math.round((trading.commodityDelivery.used / trading.commodityDelivery.available) * 100)) : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Used: {formatCurrency(trading.commodityDelivery.used)}</p>
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Limit: {formatCurrency(trading.commodityDelivery.available)}</p>
                </div>
              </div>

              {/* Commodities Option Premium (MCX) */}
              <div className="p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-orange-400 text-[16px]">candlestick_chart</span>
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-medium">Commodities Option Premium</p>
                  </div>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] font-bold">{formatCurrency(trading.commodityOptionPremium.remaining)}</p>
                </div>
                <div className="w-full bg-gray-100 dark:bg-[#16231d] rounded-full h-1.5">
                  <div
                    className="bg-orange-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${trading.commodityOptionPremium.limit > 0 ? Math.min(100, Math.round((trading.commodityOptionPremium.used / trading.commodityOptionPremium.limit) * 100)) : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Used: {formatCurrency(trading.commodityOptionPremium.used)}</p>
                  <p className="text-[9px] text-[#617589] dark:text-[#9cb7aa]">Limit: {formatCurrency(trading.commodityOptionPremium.limit)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="mt-6 px-3 sm:px-4">
        <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[17px] font-bold mb-2">Recent Transactions</h3>
      </div>
      <div className="flex flex-col mt-1 mb-4 px-3 sm:px-4">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 py-3.5 border-b border-gray-100 dark:border-[#22352d] animate-pulse">
              <div className="size-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32 mb-1.5"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-20"></div>
            </div>
          ))
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="material-symbols-outlined text-[48px] text-gray-300 dark:text-[#22352d] mb-3">receipt_long</span>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-sm">No recent payment transactions</p>
          </div>
        ) : (
          transactions.map((tx, index) => {
            const visual = getTransactionVisualMeta(tx);
            const statusMeta = getStatusMeta(tx.status);
            const showStatus = tx.status === 'pending' || tx.status === 'failed';
            return (
              <div key={tx.id || index} className={`flex items-center gap-3 py-3.5 ${index < transactions.length - 1 ? 'border-b border-gray-100 dark:border-[#22352d]' : ''}`}>
                <div className={`${visual.circleClass} flex items-center justify-center rounded-full shrink-0 size-10`}>
                  <span className={`material-symbols-outlined ${visual.iconClass} text-[22px]`}>
                    {visual.icon}
                  </span>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] font-bold leading-snug break-words">{tx.title}</p>
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[12px] break-words">{tx.subtitle || 'Payment activity'}</p>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                    <p className="text-[#8a9aac] dark:text-[#6f8b7f] text-[11px]">{formatTransactionDateTime(tx.timestamp)}</p>
                    {showStatus && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    )}
                  </div>
                </div>
                <p className={`text-[14px] font-bold shrink-0 ${visual.amountClass}`}>
                  {formatSignedTransactionAmount(tx)}
                </p>
              </div>
            );
          })
        )}
        <button
          onClick={() => navigate('/funds/history')}
          className="w-full flex items-center justify-center rounded-xl h-11 bg-transparent border border-dashed border-gray-300 dark:border-[#22352d] text-[#137fec] hover:bg-gray-50 dark:hover:bg-[#16231d] text-[14px] font-bold transition-colors mt-3"
        >
          View All Transactions
        </button>
      </div>
    </div>
  );
};

export default Funds;
