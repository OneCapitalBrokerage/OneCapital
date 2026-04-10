import { useEffect, useMemo, useState } from 'react';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';
import { buildWhatsAppUrl, formatSupportContact } from '../../utils/whatsappContact';

const toText = (value) => String(value || '').trim();

const AddFunds = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentInfo, setPaymentInfo] = useState(null);

  useEffect(() => {
    let active = true;

    const loadPaymentInfo = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await customerApi.getPaymentInfo();
        if (!active) return;
        setPaymentInfo(response?.paymentInfo || null);
      } catch (err) {
        if (!active) return;
        setPaymentInfo(null);
        setError(err?.response?.data?.message || 'Unable to load broker contact details.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPaymentInfo();
    return () => {
      active = false;
    };
  }, []);

  const supportContact = toText(paymentInfo?.supportContact);
  const whatsappUrl = useMemo(() => {
    const baseMessage = [
      'Hi, I want to add funds to my trading account.',
      paymentInfo?.brokerName ? `Broker: ${paymentInfo.brokerName}` : '',
      paymentInfo?.brokerId ? `Broker ID: ${paymentInfo.brokerId}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return buildWhatsAppUrl(supportContact, baseMessage);
  }, [paymentInfo?.brokerId, paymentInfo?.brokerName, supportContact]);

  const canOpenWhatsApp = Boolean(whatsappUrl);

  const handleOpenWhatsApp = () => {
    if (!whatsappUrl) return;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee]">
      <TopHeader title="Add Funds" showBack={true} />

      <div className="px-4 py-5 space-y-4">
        <div className="rounded-2xl border border-[#bfdbfe] dark:border-[#22352d] bg-[#eaf3ff] dark:bg-emerald-500/10 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#137fec] text-[24px] mt-0.5">chat</span>
            <div>
              <p className="text-[#111418] dark:text-[#e8f3ee] text-[17px] font-bold">Add Funds via Broker WhatsApp</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#3c4d5f] dark:text-[#9cb7aa]">
                To keep your account funding secure, add-funds requests are now managed directly with your broker on WhatsApp.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4 space-y-3">
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
              {paymentInfo?.brokerId && (
                <p className="text-[12px] text-[#617589] dark:text-[#9cb7aa]">Broker ID: {paymentInfo.brokerId}</p>
              )}
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#617589] dark:text-[#9cb7aa] mb-2">What to share</p>
          <ul className="space-y-1.5 text-[13px] text-[#111418] dark:text-[#e8f3ee]">
            <li>Client ID and intended amount</li>
            <li>Transfer method used (UPI/IMPS/NEFT/RTGS)</li>
            <li>UTR or transaction reference after payment</li>
          </ul>
        </div>

        <button
          onClick={handleOpenWhatsApp}
          disabled={!canOpenWhatsApp || loading}
          className="w-full h-12 rounded-xl bg-[#1f9d55] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Open WhatsApp
        </button>

        {!loading && !canOpenWhatsApp && (
          <p className="text-[12px] text-[#617589] dark:text-[#9cb7aa] text-center">
            WhatsApp contact is not configured. Please use Help & Support to reach your broker.
          </p>
        )}
      </div>
    </div>
  );
};

export default AddFunds;
