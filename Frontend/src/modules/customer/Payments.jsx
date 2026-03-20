import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';
import QrCodeFrame from '../../components/shared/QrCodeFrame';
import {
  PAYMENT_METHOD_LABELS,
  hasBankTransferDetails,
} from '../../utils/paymentIntake';

const ADD_STATUS_META = {
  pending_proof: { label: 'Pending', className: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700' }, // Legacy status
  pending: { label: 'Pending Approval', className: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' },
  verified: { label: 'Approved', className: 'bg-green-50 dark:bg-emerald-900/20 text-green-600 dark:text-emerald-400' },
  rejected: { label: 'Rejected', className: 'bg-red-50 dark:bg-red-900/20 text-red-600' },
};

const WD_STATUS_META = {
  pending: { label: 'Pending', className: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700' },
  approved: { label: 'Approved', className: 'bg-green-50 dark:bg-emerald-900/20 text-green-600 dark:text-emerald-400' },
  completed: { label: 'Completed', className: 'bg-green-50 dark:bg-emerald-900/20 text-green-600 dark:text-emerald-400' },
  rejected: { label: 'Rejected', className: 'bg-red-50 dark:bg-red-900/20 text-red-600' },
  failed: { label: 'Failed', className: 'bg-red-50 dark:bg-red-900/20 text-red-600' },
  processing: { label: 'Processing', className: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' },
};

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0.00';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Payments = () => {
  const location = useLocation();
  const highlightedRequestId = location.state?.requestId || '';

  const [activeTab, setActiveTab] = useState('add');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [addFundRequests, setAddFundRequests] = useState([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [showQr, setShowQr] = useState(false);
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

  const fetchRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const [paymentsRes, withdrawalsRes, paymentInfoRes] = await Promise.all([
        customerApi.getAddFundRequests({ limit: 50 }),
        customerApi.getWithdrawalRequests({ limit: 50 }),
        customerApi.getPaymentInfo().catch(() => null),
      ]);

      setAddFundRequests(paymentsRes.payments || []);
      setWithdrawalRequests(withdrawalsRes.withdrawals || []);
      setPaymentInfo(paymentInfoRes?.paymentInfo || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load payment records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const pendingRequestCount = useMemo(
    () => addFundRequests.filter((r) => r.status === 'pending_proof' || r.status === 'pending').length,
    [addFundRequests]
  );
  const bankTransferReady = hasBankTransferDetails(paymentInfo?.bankTransferDetails);

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee]">
      <TopHeader title="Payments" showBack={true} />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm p-3.5">
          <p className="text-[#617589] dark:text-[#9cb7aa] text-xs uppercase tracking-wide">Pending Requests</p>
          <p className="text-[#111418] dark:text-[#e8f3ee] text-xl font-bold mt-0.5">{pendingRequestCount}</p>
          <div className="mt-2.5 space-y-1 text-[11px] text-[#617589] dark:text-[#9cb7aa]">
            <p>Broker: {paymentInfo?.brokerName || '-'}</p>
            <p>Contact: {paymentInfo?.supportContact || '-'}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {paymentInfo?.qrPhotoUrl && (
              <button
                onClick={() => setShowQr(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#137fec]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#137fec]"
              >
                <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
                Show QR
              </button>
            )}
            {bankTransferReady && ['RTGS', 'NEFT', 'IMPS'].map((label) => (
              <span key={label} className="rounded-lg bg-[#eaf4ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#137fec]">
                {label}
              </span>
            ))}
          </div>
          {bankTransferReady && (
            <div className="mt-3 rounded-xl border border-gray-200 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] px-3 py-3 text-[11px] text-[#617589] dark:text-[#9cb7aa] space-y-2">
              <p className="font-semibold text-[#111418] dark:text-[#e8f3ee]">Broker Bank Transfer</p>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono break-all">{paymentInfo?.bankTransferDetails?.accountNumber}</p>
                <button
                  onClick={() => handleCopy(paymentInfo?.bankTransferDetails?.accountNumber, 'account')}
                  className="shrink-0 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copiedField === 'account' ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono">{paymentInfo?.bankTransferDetails?.ifscCode}</p>
                <button
                  onClick={() => handleCopy(paymentInfo?.bankTransferDetails?.ifscCode, 'ifsc')}
                  className="shrink-0 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-[#16231d] text-[#617589] dark:text-[#9cb7aa] transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copiedField === 'ifsc' ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
              {paymentInfo?.bankTransferDetails?.bankName && <p>{paymentInfo.bankTransferDetails.bankName}</p>}
            </div>
          )}
        </div>

        <div className="flex bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
              activeTab === 'add' ? 'bg-[#137fec] text-white' : 'text-[#617589] dark:text-[#9cb7aa]'
            }`}
          >
            Funds
          </button>
          <button
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
              activeTab === 'withdraw' ? 'bg-[#137fec] text-white' : 'text-[#617589] dark:text-[#9cb7aa]'
            }`}
          >
            Withdrawals
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-[#111b17] rounded-xl h-28 border border-gray-200 dark:border-[#22352d]" />
            ))}
          </div>
        ) : activeTab === 'add' ? (
          addFundRequests.length === 0 ? (
            <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-8 text-center">
              <span className="material-symbols-outlined text-gray-300 dark:text-[#22352d] text-4xl">receipt_long</span>
              <p className="text-sm text-[#617589] dark:text-[#9cb7aa] mt-2">No fund requests found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {addFundRequests.map((request) => {
                const statusMeta = ADD_STATUS_META[request.status] || ADD_STATUS_META.pending;
                const highlight = request.id === highlightedRequestId;

                return (
                  <div
                    key={request.id}
                    className={`bg-white dark:bg-[#111b17] rounded-xl border shadow-sm p-3.5 ${
                      highlight ? 'border-[#137fec]' : 'border-gray-200 dark:border-[#22352d]'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold">{formatCurrency(request.amount)}</p>
                        <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mt-0.5">
                          {formatDateTime(request.createdAt)}
                        </p>
                        <p className="text-[10px] text-[#137fec] dark:text-[#8cc1ff] mt-1 font-semibold">
                          {PAYMENT_METHOD_LABELS[String(request.paymentMethod || 'upi').toLowerCase()] || 'UPI'}
                        </p>
                        <p className="text-[10px] text-[#617589] dark:text-[#9cb7aa] mt-1 font-mono">{request.id}</p>
                        {request.utrNumber && (
                          <p className="text-[10px] text-[#617589] dark:text-[#9cb7aa] mt-1">UTR: {request.utrNumber}</p>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    {request.rejectionReason && (
                      <p className="mt-2 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                        Rejected: {request.rejectionReason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : withdrawalRequests.length === 0 ? (
          <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-8 text-center">
            <span className="material-symbols-outlined text-gray-300 dark:text-[#22352d] text-4xl">payments</span>
            <p className="text-sm text-[#617589] dark:text-[#9cb7aa] mt-2">No withdrawal requests found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawalRequests.map((request) => {
              const statusMeta = WD_STATUS_META[request.status] || WD_STATUS_META.pending;
              return (
                <div key={request.id} className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm p-3.5">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold">{formatCurrency(request.amount)}</p>
                      <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mt-0.5">{formatDateTime(request.createdAt)}</p>
                      {request.requestRef && (
                        <p className="text-[10px] text-[#617589] dark:text-[#9cb7aa] mt-1 font-mono">{request.requestRef}</p>
                      )}
                      {request.bankDetails?.bank_name && (
                        <p className="text-[11px] text-[#617589] dark:text-[#9cb7aa] mt-1">
                          {request.bankDetails.bank_name} • {request.bankDetails.account_number_masked || ''}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {request.rejectionReason && (
                    <p className="mt-2 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                      Rejected: {request.rejectionReason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showQr && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowQr(false)}
        >
          <div
            className="bg-white dark:bg-[#111b17] rounded-2xl p-4 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold">Broker UPI QR</h3>
              <button
                onClick={() => setShowQr(false)}
                className="text-[#617589] dark:text-[#9cb7aa] hover:text-[#111418] dark:hover:text-[#e8f3ee]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {paymentInfo?.qrPhotoUrl ? (
              <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-[#f6f7f8] dark:bg-[#16231d] p-3">
                <QrCodeFrame
                  src={paymentInfo.qrPhotoUrl}
                  settings={paymentInfo?.qrSettings}
                  alt="Broker UPI QR"
                  className="w-full rounded-lg"
                />
                <button
                  onClick={handleDownloadQr}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#0b120f] text-sm font-semibold text-[#111418] dark:text-[#e8f3ee] hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Download QR
                </button>
              </div>
            ) : (
              <p className="text-sm text-[#617589] dark:text-[#9cb7aa]">
                Broker QR not uploaded. Contact support for payment instructions.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
