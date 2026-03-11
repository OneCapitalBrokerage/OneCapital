import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import customerApi from '../../api/customer';

const STATUS_CONFIG = {
  pending: {
    icon: 'hourglass_top',
    iconColor: 'text-[#137fec]',
    bg: 'bg-blue-50 border-blue-200',
    title: 'Application Received',
    subtitle: 'Your application has been submitted and is awaiting review.',
  },
  under_review: {
    icon: 'manage_search',
    iconColor: 'text-yellow-600',
    bg: 'bg-yellow-50 border-yellow-200',
    title: 'Under Review',
    subtitle: 'Our team is verifying your documents. This usually takes 1–2 business days.',
  },
  approved: {
    icon: 'verified_user',
    iconColor: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    title: 'Application Approved!',
    subtitle: 'Your Demat account has been created. You can now login.',
  },
  rejected: {
    icon: 'cancel',
    iconColor: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    title: 'Application Rejected',
    subtitle: 'Your application was not approved. See the reason below.',
  },
  resubmit_required: {
    icon: 'upload_file',
    iconColor: 'text-orange-600',
    bg: 'bg-orange-50 border-orange-200',
    title: 'Documents Required',
    subtitle: 'Some documents need to be re-uploaded. Please review and resubmit.',
  },
};

const DOC_LABELS = {
  aadhaarFront: 'Aadhaar Front',
  aadhaarBack: 'Aadhaar Back',
  panCard: 'PAN Card',
  bankProof: 'Bank Proof',
};

const RegistrationStatus = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [registration, setRegistration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!id) { setError('No registration ID found.'); setLoading(false); return; }
    try {
      const res = await customerApi.checkRegistrationStatus(id);
      setRegistration(res.registration);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load registration status.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStatus();
    // Poll every 30s while in pending/under_review
    const interval = setInterval(() => {
      if (registration && !['approved', 'rejected'].includes(registration.status)) {
        fetchStatus();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, registration]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#137fec] animate-spin" />
          <p className="text-gray-400 text-sm">Loading status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-5 gap-4">
        <span className="material-symbols-outlined text-[48px] text-red-400">error_outline</span>
        <p className="text-[#111418] font-semibold">{error}</p>
        <button
          onClick={() => navigate('/login')}
          className="h-10 px-6 rounded-xl bg-[#137fec] text-white text-sm font-bold"
        >
          Go to Login
        </button>
      </div>
    );
  }

  const status = registration?.status || 'pending';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const docs = registration?.documents || {};

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-[#f2f4f6] w-full max-w-md mx-auto">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3">
          <h2 className="text-[#111418] text-sm sm:text-base font-bold leading-tight tracking-tight flex-1 text-center">
            Application Status
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col gap-4">
        {/* Status Banner */}
        <div className={`rounded-xl p-4 sm:p-5 flex items-start gap-3 border ${cfg.bg}`}>
          <span className={`material-symbols-outlined text-[32px] shrink-0 mt-0.5 ${cfg.iconColor}`}>
            {cfg.icon}
          </span>
          <div>
            <p className="text-[#111418] font-bold text-[15px] sm:text-[17px] leading-tight">{cfg.title}</p>
            <p className="text-[#617589] text-[13px] sm:text-[14px] mt-1 leading-snug">{cfg.subtitle}</p>
          </div>
        </div>

        {/* Application ID */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-[#617589] text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-2">Application ID</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-[13px] sm:text-sm text-[#111418] flex-1 truncate">{id}</p>
            <button
              onClick={handleCopyId}
              className="h-8 px-2.5 rounded-lg bg-gray-100 text-[#137fec] text-[11px] font-bold hover:bg-gray-200 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {registration?.submittedAt && (
            <p className="text-gray-400 text-[11px] mt-1.5">
              Submitted: {new Date(registration.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>

        {/* Rejection reason */}
        {registration?.rejectionReason && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <p className="text-red-700 text-[13px] font-semibold mb-1">Reason for Rejection</p>
            <p className="text-red-600 text-[13px] leading-snug">{registration.rejectionReason}</p>
          </div>
        )}

        {/* Document checklist */}
        {Object.keys(docs).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[#111418] text-[14px] sm:text-[15px] font-bold">Documents Submitted</p>
            </div>
            <div className="divide-y divide-gray-50">
              {Object.entries(docs).map(([key, uploaded]) => (
                <div key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className={`material-symbols-outlined text-[20px] ${uploaded ? 'text-green-500' : 'text-gray-300'}`}>
                    {uploaded ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span className="text-[13px] sm:text-[14px] text-[#111418]">
                    {DOC_LABELS[key] || key}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What happens next */}
        {!['approved', 'rejected'].includes(status) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-[#111418] text-[14px] font-bold mb-3">What happens next?</p>
            <div className="flex flex-col gap-2.5">
                {[
                  { step: '1', text: 'Our team reviews your application and documents', done: status === 'under_review' || status === 'approved' },
                  { step: '2', text: 'You\'ll receive an SMS/email notification on approval', done: status === 'approved' },
                  { step: '3', text: 'Your broker shares your Customer ID and password for first login', done: false },
                  { step: '4', text: 'Broker activates your trading access', done: false },
                ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className={`size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.done ? 'bg-green-100' : 'bg-[#137fec]/10'}`}>
                    {item.done
                      ? <span className="material-symbols-outlined text-green-600 text-[14px]">check</span>
                      : <span className="text-[#137fec] text-[11px] font-bold">{item.step}</span>
                    }
                  </div>
                  <p className={`text-[13px] leading-snug ${item.done ? 'text-gray-400 line-through' : 'text-[#617589]'}`}>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2 pb-4">
          {status === 'approved' && (
            <button
              onClick={() => navigate('/login')}
              className="w-full h-11 rounded-xl bg-[#137fec] text-white text-sm font-bold hover:bg-[#137fec]/90 transition-all active:scale-[0.98]"
            >
              Login Now
            </button>
          )}
          {(status === 'rejected' || status === 'resubmit_required') && (
            <button
              onClick={() => navigate('/signup')}
              className="w-full h-11 rounded-xl bg-[#137fec] text-white text-sm font-bold hover:bg-[#137fec]/90 transition-all active:scale-[0.98]"
            >
              Submit New Application
            </button>
          )}
          <button
            onClick={() => navigate('/login')}
            className="w-full h-11 rounded-xl bg-white border border-gray-200 text-[#111418] text-sm font-semibold hover:bg-gray-50 transition-all"
          >
            Go to Login
          </button>
          <button
            onClick={fetchStatus}
            className="text-[#137fec] text-xs text-center hover:opacity-80"
          >
            Refresh status
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegistrationStatus;
