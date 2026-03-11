import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';

const STATUS_CONFIG = {
  approved:      { icon: 'check_circle', color: 'text-green-600 dark:text-emerald-400', label: 'Verified' },
  in_process:    { icon: 'schedule',     color: 'text-yellow-600 dark:text-yellow-400',  label: 'In Review' },
  pending:       { icon: 'schedule',     color: 'text-yellow-600 dark:text-yellow-400',  label: 'Pending' },
  rejected:      { icon: 'cancel',       color: 'text-red-500 dark:text-red-400',        label: 'Rejected' },
  not_submitted: { icon: 'radio_button_unchecked', color: 'text-gray-400 dark:text-[#6f8b7f]', label: 'Not Done' },
};

const DOC_STEPS = [
  { key: 'aadhaar',    label: 'Aadhaar Card',  icon: 'badge' },
  { key: 'pan',        label: 'PAN Card',       icon: 'credit_card' },
  { key: 'bank_proof', label: 'Bank Proof',     icon: 'account_balance' },
];

const KYCPending = () => {
  const navigate = useNavigate();
  const [kyc, setKyc] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchKyc = useCallback(async () => {
    try {
      const res = await customerApi.getKycDocuments();
      setKyc(res?.kyc || null);
    } catch {
      // non-fatal — show fallback UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKyc(); }, [fetchKyc]);

  const overall = kyc?.overall_status || 'not_submitted';
  const allApproved = overall === 'approved';
  const anyRejected = DOC_STEPS.some((d) => (kyc?.[d.key]?.status || 'not_submitted') === 'rejected');
  const isUnderReview = overall === 'in_process' || overall === 'pending';
  const isPartial = overall === 'partial' || overall === 'not_submitted';

  const headerMessage = allApproved
    ? 'KYC Verified — Awaiting Activation'
    : anyRejected
    ? 'Action Required'
    : isUnderReview
    ? 'Under Review'
    : 'Complete Your KYC';

  const subMessage = allApproved
    ? 'Your documents are verified. Your broker is activating trading access.'
    : anyRejected
    ? 'One or more documents were rejected. Please resubmit.'
    : isUnderReview
    ? 'Your documents are being reviewed. This usually takes 1–2 business days.'
    : 'Please submit your KYC documents to activate trading.';

  return (
    <div className="min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee] flex flex-col">
      {/* Header */}
      <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 sticky top-0 z-10 bg-[#f2f4f6] dark:bg-[#050806]">
        <h2 className="text-[#111418] dark:text-[#e8f3ee] text-[17px] sm:text-[19px] font-bold leading-tight flex-1">
          Account Verification
        </h2>
      </div>

      <div className="flex-1 px-3 sm:px-4 pb-10 flex flex-col gap-4 sm:gap-5 mt-1">
        {/* Status banner */}
        <div className={`rounded-xl p-4 sm:p-5 flex items-start gap-3 ${
          allApproved  ? 'bg-green-50 dark:bg-emerald-900/20 border border-green-200 dark:border-emerald-800' :
          anyRejected  ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
          isUnderReview ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
          'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900'
        }`}>
          <span className={`material-symbols-outlined text-[28px] sm:text-[32px] shrink-0 mt-0.5 ${
            allApproved  ? 'text-green-600 dark:text-emerald-400' :
            anyRejected  ? 'text-red-500 dark:text-red-400' :
            isUnderReview ? 'text-yellow-600 dark:text-yellow-400' :
            'text-[#137fec]'
          }`}>
            {allApproved ? 'verified_user' : anyRejected ? 'report' : isUnderReview ? 'hourglass_top' : 'assignment_ind'}
          </span>
          <div>
            <p className="text-[#111418] dark:text-[#e8f3ee] font-bold text-[15px] sm:text-[17px] leading-tight">
              {headerMessage}
            </p>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-[13px] sm:text-[14px] mt-1 leading-snug">
              {subMessage}
            </p>
          </div>
        </div>

        {/* Document checklist */}
        <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-[#22352d]">
            <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[15px] sm:text-[16px] font-bold">
              KYC Document Status
            </h3>
          </div>
          {loading ? (
            <div className="p-4 space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-gray-200 dark:bg-[#22352d]" />
                  <div className="flex-1">
                    <div className="h-3.5 bg-gray-200 dark:bg-[#22352d] rounded w-28 mb-1.5" />
                    <div className="h-3 bg-gray-200 dark:bg-[#22352d] rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#22352d]">
              {DOC_STEPS.map((doc) => {
                const status = kyc?.[doc.key]?.status || 'not_submitted';
                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_submitted;
                const rejection = kyc?.[doc.key]?.rejection_reason;
                return (
                  <div key={doc.key} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="size-10 sm:size-11 bg-[#f6f7f8] dark:bg-[#111b17] rounded-full flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[20px]">{doc.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-semibold">{doc.label}</p>
                      {rejection && status === 'rejected' && (
                        <p className="text-red-500 dark:text-red-400 text-[11px] sm:text-[12px] mt-0.5 truncate">{rejection}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`material-symbols-outlined text-[20px] sm:text-[22px] ${cfg.color}`}>{cfg.icon}</span>
                      <span className={`text-[11px] sm:text-[12px] font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* What happens next */}
        {!allApproved && (
          <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] p-4 sm:p-5 shadow-sm">
            <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-bold mb-3">
              What happens after verification?
            </h3>
            <div className="flex flex-col gap-2.5">
              {[
                { step: '1', text: 'Submit all 3 KYC documents below' },
                { step: '2', text: 'Our team verifies within 1–2 business days' },
                { step: '3', text: 'Broker activates your trading account' },
                { step: '4', text: 'You gain full access to Watchlist, Orders & Portfolio' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="size-6 rounded-full bg-[#137fec]/10 dark:bg-[#137fec]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[#137fec] text-[11px] font-bold">{item.step}</span>
                  </div>
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[13px] sm:text-[14px] leading-snug">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2 mt-1">
          {(isPartial || anyRejected) && (
            <button
              onClick={() => navigate('/kyc-documents')}
              className="w-full h-11 rounded-xl bg-[#137fec] hover:bg-[#137fec]/90 text-white text-sm sm:text-base font-bold transition-all active:scale-[0.98]"
            >
              {anyRejected ? 'Resubmit Documents' : 'Complete KYC'}
            </button>
          )}
          <button
            onClick={() => navigate('/profile')}
            className="w-full h-11 rounded-xl bg-white dark:bg-[#0b120f] border border-gray-200 dark:border-[#22352d] text-[#111418] dark:text-[#e8f3ee] text-sm sm:text-base font-semibold hover:bg-gray-50 dark:hover:bg-[#16231d] transition-all"
          >
            Go to Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default KYCPending;
