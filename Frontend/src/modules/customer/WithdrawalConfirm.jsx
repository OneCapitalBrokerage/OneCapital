import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';

const STATUS_META = {
  pending: { label: 'Pending Approval', className: 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 border border-amber-200 dark:border-amber-700/30' },
  processing: { label: 'Processing', className: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 border border-blue-200 dark:border-blue-700/30' },
  approved: { label: 'Approved', className: 'bg-green-100 dark:bg-emerald-900/20 text-green-700 dark:text-emerald-400 border border-green-200 dark:border-emerald-700/30' },
  rejected: { label: 'Rejected', className: 'bg-red-100 dark:bg-red-900/20 text-red-700 border border-red-200 dark:border-red-700/30' },
  completed: { label: 'Completed', className: 'bg-green-100 dark:bg-emerald-900/20 text-green-700 dark:text-emerald-400 border border-green-200 dark:border-emerald-700/30' },
  failed: { label: 'Failed', className: 'bg-red-100 dark:bg-red-900/20 text-red-700 border border-red-200 dark:border-red-700/30' },
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

const WithdrawalConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const request = location.state?.request || null;
  const bankAccount = location.state?.bankAccount || null;

  const amount = request?.amount ?? location.state?.amount ?? 0;
  const status = String(request?.status || 'pending').toLowerCase();
  const statusMeta = STATUS_META[status] || STATUS_META.pending;
  const reference = request?.requestRef || request?.id || '-';

  const bankName = request?.bankDetails?.bank_name || bankAccount?.bank_name || 'Linked Bank';
  const maskedAcc = request?.bankDetails?.account_number_masked || bankAccount?.account_number_masked || '-';

  const createdAt = useMemo(
    () => formatDateTime(request?.createdAt || new Date().toISOString()),
    [request?.createdAt]
  );

  if (!request) {
    return (
      <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee]">
        <TopHeader title="Withdrawal" showProfile={false} />
        <div className="px-4 py-10">
          <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-6 text-center">
            <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-bold">No withdrawal request found.</p>
            <button
              onClick={() => navigate('/funds')}
              className="mt-4 h-11 px-5 rounded-xl bg-[#137fec] text-white text-sm font-bold"
            >
              Go to Funds
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee] pb-36">
      <TopHeader
        title="Withdrawal"
        showProfile={false}
        rightAction={(
          <button
            onClick={() => navigate('/funds')}
            className="flex items-center justify-center text-[#111418] dark:text-[#e8f3ee] hover:opacity-70"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      />

      <div className="px-4 py-5">
        <div className="flex flex-col items-center text-center">
          <div className="size-20 rounded-full bg-green-100 dark:bg-emerald-900/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-green-600 dark:text-emerald-400 text-[44px]">check_circle</span>
          </div>
          <h1 className="mt-5 text-[#111418] dark:text-[#e8f3ee] text-[30px] sm:text-[38px] font-extrabold leading-tight tracking-[-0.02em] break-words">
            {formatCurrency(amount)}
          </h1>
          <p className="mt-2 text-[#111418] dark:text-[#e8f3ee] text-[24px] sm:text-[32px] leading-tight font-extrabold max-w-[280px] sm:max-w-none">
            Withdrawal Request Submitted!
          </p>
          <span className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4 shadow-sm">
          <p className="text-[#7f8fa0] dark:text-[#6f8b7f] text-[11px] font-bold uppercase tracking-wider">Transaction Details</p>
          <DetailRow label="To Account" value={`${bankName} ${maskedAcc !== '-' ? `• ${maskedAcc}` : ''}`} />
          <DetailRow label="Ref ID" value={reference} mono />
          <DetailRow label="Date" value={createdAt} />
          <DetailRow label="Expected Credit" value="Within 24 Hours" isLast />
        </div>

        <div className="mt-5 rounded-xl border border-[#bfdbfe] dark:border-[#22352d] bg-[#dbeafe] dark:bg-emerald-500/10 p-3.5 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[#137fec] text-[20px] mt-0.5">info</span>
          <p className="text-[#334155] dark:text-[#9cb7aa] text-sm leading-relaxed">
            Your request is currently awaiting broker approval. Once approved, funds will be credited to your linked bank account.
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-white dark:bg-[#0b120f] border-t border-gray-200 dark:border-[#22352d] p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] space-y-2.5">
        <button
          onClick={() => navigate('/funds')}
          className="w-full h-12 rounded-xl bg-[#137fec] text-white text-base font-bold"
        >
          Go to Funds
        </button>
        <button
          onClick={() => navigate('/watchlist')}
          className="w-full h-11 rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] text-[#111418] dark:text-[#e8f3ee] text-base font-semibold"
        >
          Back to Watchlist
        </button>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, mono = false, isLast = false }) => (
  <div className={`flex items-start justify-between gap-3 py-3 ${isLast ? '' : 'border-b border-dashed border-gray-200 dark:border-[#22352d]'}`}>
    <p className="text-[#617589] dark:text-[#9cb7aa] text-sm shrink-0">{label}</p>
    <p className={`text-right text-sm font-semibold text-[#111418] dark:text-[#e8f3ee] min-w-0 max-w-[68%] break-words ${mono ? 'font-mono break-all' : ''}`}>{value}</p>
  </div>
);

export default WithdrawalConfirm;
