import { useEffect, useMemo, useState } from 'react';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';
import { buildWhatsAppUrl, formatSupportContact } from '../../utils/whatsappContact';
import { getWithdrawalWindowInfo } from '../../utils/withdrawalWindow';

const toText = (value) => String(value || '').trim();

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0.00';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const WithdrawFunds = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [wallet, setWallet] = useState({
    netCash: 0,
    pendingWithdrawals: 0,
    withdrawableNetCash: 0,
  });

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const [paymentRes, balanceRes] = await Promise.all([
          customerApi.getPaymentInfo(),
          customerApi.getBalance().catch(() => null),
        ]);

        if (!active) return;

        setPaymentInfo(paymentRes?.paymentInfo || null);

        const walletData = balanceRes?.wallet || {};
        setWallet({
          netCash: toNumber(walletData.netCash),
          pendingWithdrawals: toNumber(walletData.pendingWithdrawals),
          withdrawableNetCash: toNumber(walletData.withdrawableNetCash),
        });
      } catch (err) {
        if (!active) return;
        setPaymentInfo(null);
        setError(err?.response?.data?.message || 'Unable to load broker contact details.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, []);

  const supportContact = toText(paymentInfo?.supportContact);
  const withdrawable = Math.max(0, toNumber(wallet.withdrawableNetCash));
  const withdrawalWindow = getWithdrawalWindowInfo();

  const whatsappUrl = useMemo(() => {
    const msg = [
      'Hi, I want to place a withdrawal request from my trading account.',
      paymentInfo?.brokerName ? `Broker: ${paymentInfo.brokerName}` : '',
      paymentInfo?.brokerId ? `Broker ID: ${paymentInfo.brokerId}` : '',
      `Withdrawable Net Cash: ${formatCurrency(withdrawable)}`,
    ]
      .filter(Boolean)
      .join('\n');
    return buildWhatsAppUrl(supportContact, msg);
  }, [paymentInfo?.brokerId, paymentInfo?.brokerName, supportContact, withdrawable]);

  const canOpenWhatsApp = Boolean(whatsappUrl) && withdrawalWindow.isOpen;

  const handleOpenWhatsApp = () => {
    if (!whatsappUrl) return;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee]">
      <TopHeader title="Withdraw Funds" showBack={true} />

      <div className="px-4 py-5 space-y-4">
        <div className="rounded-2xl border border-[#fecaca] dark:border-[#22352d] bg-[#fff1f2] dark:bg-red-900/15 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-red-500 text-[24px] mt-0.5">account_balance</span>
            <div>
              <p className="text-[#111418] dark:text-[#e8f3ee] text-[17px] font-bold">Withdraw via Broker WhatsApp</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#4b5563] dark:text-[#9cb7aa]">
                Withdrawal requests are now handled directly with your broker on WhatsApp for faster confirmation and tracking.
              </p>
              <p className={`mt-2 text-[12px] font-semibold ${withdrawalWindow.isOpen ? 'text-green-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                {withdrawalWindow.isOpen
                  ? 'Withdrawal window is open today (Saturday IST).'
                  : 'Withdrawals are open only on Saturday (IST).'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4 space-y-2.5">
          <p className="text-[11px] uppercase tracking-wide text-[#617589] dark:text-[#9cb7aa]">Available Summary</p>
          <p className="text-[20px] font-bold text-[#111418] dark:text-[#e8f3ee]">{formatCurrency(withdrawable)}</p>
          <p className="text-[12px] text-[#617589] dark:text-[#9cb7aa]">
            Net Cash: {formatCurrency(wallet.netCash)} | Pending: {formatCurrency(wallet.pendingWithdrawals)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4 space-y-2.5">
          <p className="text-[11px] uppercase tracking-wide text-[#617589] dark:text-[#9cb7aa]">Broker Contact</p>
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 w-40 rounded bg-gray-200 dark:bg-[#22352d]" />
              <div className="h-4 w-28 rounded bg-gray-200 dark:bg-[#22352d]" />
            </div>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-[#111418] dark:text-[#e8f3ee]">
                {paymentInfo?.brokerName || 'Your Broker'}
              </p>
              <p className="text-[13px] text-[#617589] dark:text-[#9cb7aa]">
                WhatsApp: {formatSupportContact(supportContact) || 'Not configured'}
              </p>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#617589] dark:text-[#9cb7aa] mb-2">What to include</p>
          <ul className="space-y-1.5 text-[13px] text-[#111418] dark:text-[#e8f3ee]">
            <li>Client ID and requested withdrawal amount</li>
            <li>Bank account (last 4 digits) for payout</li>
            <li>Any special note for broker processing</li>
          </ul>
        </div>

        <button
          onClick={handleOpenWhatsApp}
          disabled={!canOpenWhatsApp || loading}
          className="w-full h-12 rounded-xl bg-[#1f9d55] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {withdrawalWindow.isOpen ? 'Open WhatsApp' : 'Available on Saturday'}
        </button>

        {!loading && !whatsappUrl && (
          <p className="text-[12px] text-[#617589] dark:text-[#9cb7aa] text-center">
            WhatsApp contact is not configured. Please use Help & Support to reach your broker.
          </p>
        )}

        {!loading && whatsappUrl && !withdrawalWindow.isOpen && (
          <p className="text-[12px] text-amber-700 dark:text-amber-300 text-center">
            Withdrawal request window is closed right now. Please place requests on Saturday (IST).
          </p>
        )}
      </div>
    </div>
  );
};

export default WithdrawFunds;
