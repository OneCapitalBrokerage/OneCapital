import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';
import QrCodeFrame from '../../components/shared/QrCodeFrame';
import {
  PAYMENT_METHOD_LABELS,
  hasBankTransferDetails,
  hasUpiPaymentDetails,
} from '../../utils/paymentIntake';

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
  const [copiedField, setCopiedField] = useState('');

  const handleCopy = async (value, fieldName) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(''), 1500);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(''), 1500);
    }
  };

  const handleDownloadQr = async () => {
    if (!paymentInfo?.qrPhotoUrl) return;
    try {
      const response = await fetch(paymentInfo.qrPhotoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'broker-upi-qr.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(paymentInfo.qrPhotoUrl, '_blank');
    }
  };

  const request = initialState.request || {};
  const amount = initialState.amount || request.amount || 0;
  const selectedMethod = String(request.paymentMethod || 'upi').toLowerCase();
  const showUpiSection = hasUpiPaymentDetails(paymentInfo);
  const showBankTransferSection = hasBankTransferDetails(paymentInfo?.bankTransferDetails);

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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[#617589] dark:text-[#9cb7aa] text-sm font-semibold hover:bg-gray-100 dark:hover:bg-[#16231d] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
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
          <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mt-1">
            Recorded Method: <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">{PAYMENT_METHOD_LABELS[selectedMethod] || 'UPI'}</span>
          </p>
        </div>

        <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[#111418] dark:text-[#e8f3ee] text-sm font-bold">Broker Payment Instructions</p>
            <span className="rounded-full bg-[#eaf4ff] dark:bg-[#137fec]/15 px-2.5 py-1 text-[10px] font-semibold text-[#137fec] dark:text-[#8cc1ff]">
              {PAYMENT_METHOD_LABELS[selectedMethod] || 'UPI'}
            </span>
          </div>

          {loading ? (
            <div className="animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-[#22352d] rounded w-40 mb-3"></div>
              <div className="h-24 bg-gray-100 dark:bg-[#16231d] rounded-xl"></div>
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              {showUpiSection && (
                <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">UPI</p>
                    {selectedMethod === 'upi' && (
                      <span className="rounded-full bg-[#137fec]/10 dark:bg-[#137fec]/20 px-2.5 py-1 text-[10px] font-semibold text-[#137fec] dark:text-[#8cc1ff]">
                        Selected
                      </span>
                    )}
                  </div>
                  {paymentInfo?.qrPhotoUrl ? (
                    <div className="mt-3 rounded-lg border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-3">
                      <QrCodeFrame
                        src={paymentInfo.qrPhotoUrl}
                        settings={paymentInfo?.qrSettings}
                        alt="Broker UPI QR"
                        className="w-full rounded-lg"
                      />
                      <button
                        onClick={handleDownloadQr}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] text-sm font-semibold text-[#111418] dark:text-[#e8f3ee] hover:bg-gray-100 dark:hover:bg-[#16231d] transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        Download QR
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-gray-300 dark:border-[#22352d] bg-white dark:bg-[#111b17] px-4 py-5 text-center">
                      <span className="material-symbols-outlined text-gray-400 dark:text-[#6f8b7f] text-3xl">qr_code_2</span>
                      <p className="mt-2 text-xs text-[#617589] dark:text-[#9cb7aa]">
                        Broker QR not uploaded. Contact support for payment instructions.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {showBankTransferSection && (
                <div className="mt-3 rounded-xl border border-gray-200 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">Bank Transfer</p>
                    {selectedMethod === 'bank_transfer' && (
                      <span className="rounded-full bg-[#137fec]/10 dark:bg-[#137fec]/20 px-2.5 py-1 text-[10px] font-semibold text-[#137fec] dark:text-[#8cc1ff]">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] px-3 py-2.5">
                      <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mb-1">Account Number</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold font-mono text-[#111418] dark:text-[#e8f3ee] break-all">
                          {paymentInfo?.bankTransferDetails?.accountNumber}
                        </p>
                        <button
                          onClick={() => handleCopy(paymentInfo?.bankTransferDetails?.accountNumber, 'account')}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {copiedField === 'account' ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] px-3 py-2.5">
                      <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mb-1">IFSC Code</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold font-mono text-[#111418] dark:text-[#e8f3ee]">
                          {paymentInfo?.bankTransferDetails?.ifscCode}
                        </p>
                        <button
                          onClick={() => handleCopy(paymentInfo?.bankTransferDetails?.ifscCode, 'ifsc')}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {copiedField === 'ifsc' ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </div>
                    </div>
                    {(paymentInfo?.bankTransferDetails?.bankName || paymentInfo?.bankTransferDetails?.accountHolderName) && (
                      <div className="rounded-lg border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] px-3 py-2.5 sm:col-span-2">
                        <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mb-1">Beneficiary</p>
                        <p className="text-sm font-semibold text-[#111418] dark:text-[#e8f3ee]">
                          {paymentInfo?.bankTransferDetails?.accountHolderName || paymentInfo?.brokerName || 'Broker'}
                        </p>
                        {paymentInfo?.bankTransferDetails?.bankName && (
                          <p className="mt-1 text-[11px] text-[#617589] dark:text-[#9cb7aa]">
                            {paymentInfo.bankTransferDetails.bankName}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {['RTGS', 'NEFT', 'IMPS'].map((label) => (
                      <span key={label} className="rounded-full bg-gray-100 dark:bg-[#16231d] px-2.5 py-1 text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa]">
                        {label}
                      </span>
                    ))}
                    <span className="text-[11px] text-[#617589] dark:text-[#9cb7aa]">accepted — transfer outside the app using above details.</span>
                  </div>
                </div>
              )}

              {!showUpiSection && !showBankTransferSection && (
                <p className="text-sm text-[#617589] dark:text-[#9cb7aa]">Broker payment details are not configured yet.</p>
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
