import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatCurrency = (value) => {
  const amount = toNumber(value, 0);
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getIstNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

const isSaturdayIst = () => getIstNow().getDay() === 6;

const formatAmountInput = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(2).replace(/\.00$/, '');
};

const WithdrawFunds = () => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState({
    netCash: 0,
    pendingWithdrawals: 0,
    withdrawableNetCash: 0,
  });
  const [bankAccount, setBankAccount] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [balanceRes, bankRes] = await Promise.all([
          customerApi.getBalance(),
          customerApi.getBankAccounts().catch(() => ({ accounts: [] })),
        ]);

        const walletData = balanceRes?.wallet || {};
        setWallet({
          netCash: toNumber(walletData.netCash, 0),
          pendingWithdrawals: toNumber(walletData.pendingWithdrawals, 0),
          withdrawableNetCash: toNumber(
            walletData.withdrawableNetCash,
            toNumber(walletData.netCash, 0)
          ),
        });

        const accounts = (bankRes?.accounts || []).filter((acc) => acc?.is_active !== false);
        const primary = accounts.find((acc) => acc?.is_primary) || accounts[0] || null;
        setBankAccount(primary);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load withdrawal details.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const saturdayActive = useMemo(() => isSaturdayIst(), []);
  const withdrawableBalance = useMemo(
    () => Math.max(0, toNumber(wallet.withdrawableNetCash, 0)),
    [wallet.withdrawableNetCash]
  );
  const parsedAmount = useMemo(() => toNumber(amount, NaN), [amount]);

  const isAmountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const exceedsWithdrawable = isAmountValid && parsedAmount > withdrawableBalance;

  const submitDisabled = (
    loading ||
    submitting ||
    !saturdayActive ||
    !bankAccount ||
    withdrawableBalance <= 0 ||
    !isAmountValid ||
    exceedsWithdrawable
  );

  const setByPercent = (percent) => {
    const nextAmount = (withdrawableBalance * percent) / 100;
    setAmount(formatAmountInput(nextAmount));
  };

  const setMax = () => setAmount(formatAmountInput(withdrawableBalance));

  const handleSubmit = async () => {
    if (submitDisabled) return;

    setSubmitting(true);
    setError('');
    try {
      const response = await customerApi.requestWithdraw({
        amount: Number(parsedAmount.toFixed(2)),
        bankAccount: bankAccount ? { id: bankAccount._id || bankAccount.id } : undefined,
      });

      navigate('/funds/withdraw/confirm', {
        state: {
          request: response?.request || null,
          amount: Number(parsedAmount.toFixed(2)),
          bankAccount,
        },
      });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to submit withdrawal request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee]">
      <TopHeader title="Withdraw Funds" showBack={true} rightAction={<div />} />

      <div className="px-4 py-4 space-y-5">
        <div className="rounded-2xl border border-[#bfdbfe] dark:border-[#22352d] bg-[#eaf3ff] dark:bg-emerald-500/10 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#137fec] text-[18px]">account_balance_wallet</span>
            <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-semibold">Withdrawable Balance (Net Cash)</p>
          </div>
          <p className="mt-2 text-[#111418] dark:text-[#e8f3ee] text-[34px] leading-tight font-extrabold tabular-nums">
            {formatCurrency(withdrawableBalance)}
          </p>
          <p className="mt-1 text-[11px] text-[#617589] dark:text-[#9cb7aa]">
            Net Cash: {formatCurrency(wallet.netCash)} | Pending: {formatCurrency(wallet.pendingWithdrawals)}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${withdrawableBalance > 0 ? 'bg-green-500' : 'bg-amber-500'}`} />
            <p className="text-[12px] text-[#617589] dark:text-[#9cb7aa]">
              {withdrawableBalance > 0 ? 'Funds settled and ready' : 'No withdrawable net cash available'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold">Transfer to linked bank</p>
          {loading ? (
            <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4 animate-pulse h-[84px]" />
          ) : bankAccount ? (
            <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4 flex items-center gap-3">
              <div className="size-10 rounded-full bg-[#f2f4f6] dark:bg-[#0b120f] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa]">account_balance</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold truncate">{bankAccount.bank_name || 'Linked Bank'}</p>
                <p className="text-[#617589] dark:text-[#9cb7aa] text-sm truncate">
                  {bankAccount.is_primary ? 'Primary' : 'Linked'} • {bankAccount.account_number_masked || 'Account'}
                </p>
              </div>
              <span className="material-symbols-outlined text-green-600 text-[20px]">check_circle</span>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-amber-800 text-sm font-semibold">No active bank account found.</p>
              <button
                onClick={() => navigate('/profile/bank-account/add')}
                className="mt-2 text-amber-700 text-sm font-bold underline"
              >
                Add Bank Account
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold">Amount to withdraw</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-[#617589] dark:text-[#9cb7aa]">₹</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full h-14 rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#16231d] dark:text-[#e8f3ee] pl-10 pr-3 text-[28px] font-bold text-[#111418] focus:ring-2 focus:ring-[#137fec]/30 outline-none"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setByPercent(25)}
              disabled={withdrawableBalance <= 0}
              className="h-8 px-4 rounded-full border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] text-xs font-semibold disabled:opacity-40"
            >
              25%
            </button>
            <button
              type="button"
              onClick={() => setByPercent(50)}
              disabled={withdrawableBalance <= 0}
              className="h-8 px-4 rounded-full border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] text-xs font-semibold disabled:opacity-40"
            >
              50%
            </button>
            <button
              type="button"
              onClick={setMax}
              disabled={withdrawableBalance <= 0}
              className="h-8 px-4 rounded-full border border-[#bfdbfe] dark:border-[#22352d] bg-[#eaf3ff] dark:bg-emerald-500/10 text-[#137fec] text-xs font-semibold disabled:opacity-40"
            >
              Max
            </button>
          </div>

          {!isAmountValid && amount !== '' && (
            <p className="text-xs text-red-600">Enter a valid withdrawal amount.</p>
          )}
          {exceedsWithdrawable && (
            <p className="text-xs text-red-600">
              Amount exceeds withdrawable net cash ({formatCurrency(withdrawableBalance)}).
            </p>
          )}
        </div>

        <div className={`rounded-xl p-4 border ${saturdayActive ? 'bg-[#fff6ed] border-[#fed7aa]' : 'bg-[#fef2f2] border-[#fecaca]'}`}>
          <div className="flex items-start gap-2.5">
            <span className={`material-symbols-outlined mt-0.5 ${saturdayActive ? 'text-amber-600' : 'text-red-500'}`}>info</span>
            <div>
              <p className={`text-sm font-bold ${saturdayActive ? 'text-amber-800' : 'text-red-700'}`}>Saturday Only Withdrawals</p>
              <p className={`text-xs mt-1 leading-relaxed ${saturdayActive ? 'text-amber-700' : 'text-red-600'}`}>
                {saturdayActive
                  ? 'Withdrawal requests are active today. Submit before market close window.'
                  : 'Withdrawal requests are accepted only on Saturdays (IST).'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="pt-1 pb-6 space-y-2.5">
          <button
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="w-full h-12 rounded-xl bg-[#137fec] text-white text-base font-bold shadow-sm disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Withdrawal Request'}
          </button>
          <button
            onClick={() => navigate('/funds')}
            className="w-full h-10 rounded-xl text-[#617589] dark:text-[#9cb7aa] text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default WithdrawFunds;
