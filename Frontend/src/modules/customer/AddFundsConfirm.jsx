import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0.00';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const AddFundsConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialState = location.state || {};

  const [loading, setLoading] = useState(!initialState.paymentInfo);
  const [paymentInfo, setPaymentInfo] = useState(initialState.paymentInfo || null);
  const [error, setError] = useState('');

  const request = initialState.request || {};
  const amount = initialState.amount || request.amount || 0;
  const fallbackQrUrl = paymentInfo?.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(`upi://pay?pa=${paymentInfo.upiId}`)}`
    : '';
  const displayQrUrl = paymentInfo?.qrPhotoUrl || fallbackQrUrl;

  useEffect(() => {
    if (paymentInfo) return;

    const fetchInfo = async () => {
      setLoading(true);
      try {
        const response = await customerApi.getPaymentInfo();
        setPaymentInfo(response.paymentInfo || null);
      } catch (err) {
        setError(err?.response?.data?.message || 'Unable to fetch broker payment details.');
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [paymentInfo]);

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee]">
      <TopHeader title="Payment Details" showBack={true} />

      <div className="px-4 py-5 space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => navigate('/funds')}
            className="inline-flex items-center gap-1 text-[#617589] dark:text-[#9cb7aa] text-xs font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            Close
          </button>
        </div>

        <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-4 shadow-sm">
          <p className="text-[#617589] dark:text-[#9cb7aa] text-xs uppercase tracking-wide mb-1">Request Amount</p>
          <p className="text-[#111418] dark:text-[#e8f3ee] text-2xl font-bold">{formatCurrency(amount)}</p>
          {request.id && (
            <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mt-2">Request ID: <span className="font-mono">{request.id}</span></p>
          )}
          <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mt-1">Status: {request.status || 'pending'}</p>
        </div>

        <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-4 shadow-sm">
          <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold mb-2">Pay to Broker UPI</p>

          {loading ? (
            <div className="animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-[#22352d] rounded w-40 mb-3"></div>
              <div className="h-24 bg-gray-100 dark:bg-[#16231d] rounded-xl"></div>
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div className="rounded-lg bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] px-3 py-2.5">
                <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mb-1">UPI ID</p>
                <p className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee] break-all">
                  {paymentInfo?.upiId || 'Not available'}
                </p>
              </div>
              {displayQrUrl ? (
                <div className="mt-3 rounded-lg border border-gray-200 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] p-3">
                  <img src={displayQrUrl} alt="Broker UPI QR" className="w-full h-auto rounded-lg" />
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-gray-300 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] h-36 flex flex-col items-center justify-center text-center px-4">
                  <span className="material-symbols-outlined text-gray-400 dark:text-[#6f8b7f] text-3xl">qr_code_2</span>
                  <p className="text-xs text-[#617589] dark:text-[#9cb7aa] mt-1">QR not available yet.</p>
                </div>
              )}
              {(paymentInfo?.brokerName || paymentInfo?.brokerId) && (
                <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mt-2">
                  Broker: {paymentInfo?.brokerName || 'Broker'} {paymentInfo?.brokerId ? `(${paymentInfo.brokerId})` : ''}
                </p>
              )}
            </>
          )}
        </div>

        <div className="bg-green-50 dark:bg-emerald-500/10 border border-green-100 dark:border-[#22352d] rounded-xl p-3">
          <p className="text-[12px] text-green-700 dark:text-[#9cb7aa]">
            Your request has been submitted for verification. Your broker will review and approve it shortly.
          </p>
        </div>

        <button
          onClick={() => navigate('/profile/payments')}
          className="w-full bg-[#137fec] text-white font-bold py-3.5 rounded-xl shadow-sm"
        >
          View Payment Status
        </button>
      </div>
    </div>
  );
};

export default AddFundsConfirm;
