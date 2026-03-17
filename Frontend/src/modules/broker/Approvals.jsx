import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const extractCount = (value, fallback = 0) => {
  if (value && typeof value === 'object') return toFiniteNumber(value.count);
  return toFiniteNumber(value) || toFiniteNumber(fallback);
};

const DOC_STATUS_CONFIG = {
  not_submitted: { label: 'Not Submitted', bg: 'bg-gray-100', text: 'text-gray-500' },
  pending: { label: 'Pending', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  in_process: { label: 'In Process', bg: 'bg-blue-50', text: 'text-blue-600' },
  approved: { label: 'Approved', bg: 'bg-green-50', text: 'text-green-600' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-500' },
};

const REG_STATUS_CONFIG = {
  pending: { label: 'Pending', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  under_review: { label: 'Under Review', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  approved: { label: 'Approved', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600 border-red-200' },
  resubmit_required: { label: 'Resubmit', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
};

const OCCUPATION_LABELS = {
  salaried: 'Salaried',
  business: 'Business',
  professional: 'Professional',
  student: 'Student',
  retired: 'Retired',
  other: 'Other',
};

const REG_DOC_LABELS = {
  panCard: 'PAN Card',
  aadhaarFront: 'Aadhaar Front',
  aadhaarBack: 'Aadhaar Back',
  bankProof: 'Bank Proof',
  passportPhoto: 'Passport Photo',
  signature: 'Signature',
  incomeProof: 'Income Proof',
};

const DocBadge = ({ status }) => {
  const c = DOC_STATUS_CONFIG[status] || DOC_STATUS_CONFIG.not_submitted;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
};

const RegistrationStatusBadge = ({ status }) => {
  const cfg = REG_STATUS_CONFIG[status] || REG_STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const InfoRow = ({ label, value }) =>
  (value || value === 0) ? (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[#617589] text-xs shrink-0">{label}</span>
      <span className="text-[#111418] text-xs font-medium text-right break-all">{value}</span>
    </div>
  ) : null;

const RegistrationDetailSheet = ({ regId, onClose, onRefresh }) => {
  const [reg, setReg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveResult, setApproveResult] = useState(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await brokerApi.getRegistrationDetail(regId);
      setReg(res.registration || null);
    } catch (err) {
      console.error('Failed to fetch registration detail:', err);
      setReg(null);
    } finally {
      setLoading(false);
    }
  }, [regId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleApprove = async () => {
    setActing(true);
    try {
      const res = await brokerApi.approveRegistration(regId);
      setApproveResult(res);
      if (typeof onRefresh === 'function') {
        await onRefresh();
      }
    } catch (err) {
      alert(err?.response?.data?.message || 'Approval failed. Please try again.');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActing(true);
    try {
      await brokerApi.rejectRegistration(regId, rejectReason.trim());
      if (typeof onRefresh === 'function') {
        await onRefresh();
      }
      onClose();
    } catch (err) {
      alert(err?.response?.data?.message || 'Rejection failed.');
    } finally {
      setActing(false);
    }
  };

  const docs = reg?.documents || {};
  const docEntries = Object.entries(docs).filter(([, value]) => value?.url);
  const maskedAadhaar = reg?.aadharNumber ? `********${String(reg.aadharNumber).slice(-4)}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <p className="font-bold text-[#111418]">Registration Details</p>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 border-2 border-gray-200 border-t-[#137fec] rounded-full animate-spin" />
            </div>
          )}

          {!loading && !reg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-600 text-xs">Failed to load registration details.</p>
            </div>
          )}

          {!loading && reg && (
            <>
              {approveResult && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-600 text-[24px] shrink-0">verified_user</span>
                  <div>
                    <p className="text-green-700 font-bold text-sm">Account Created</p>
                    <p className="text-green-600 text-xs mt-0.5">Customer ID: <span className="font-mono font-bold">{approveResult.customer_id}</span></p>
                    <p className="text-green-600 text-xs mt-0.5">Password: <span className="font-mono font-bold">{approveResult.password}</span></p>
                    {approveResult.passwordGenerated && (
                      <p className="text-green-600 text-xs mt-1">Password was auto-generated because none was available.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <RegistrationStatusBadge status={reg.status} />
                {reg.submittedAt && (
                  <span className="text-gray-400 text-[11px]">
                    {new Date(reg.submittedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </span>
                )}
              </div>

              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Personal</p>
                <div className="divide-y divide-gray-200/60">
                  <InfoRow label="Name" value={reg.name} />
                  <InfoRow label="Email" value={reg.email} />
                  <InfoRow label="Phone" value={reg.phone} />
                  <InfoRow label="Date of Birth" value={reg.dateOfBirth ? new Date(reg.dateOfBirth).toLocaleDateString('en-IN') : ''} />
                  <InfoRow label="Gender" value={reg.gender} />
                  <InfoRow label="PAN" value={reg.panNumber} />
                  <InfoRow label="Aadhaar" value={maskedAadhaar} />
                  <InfoRow label="Occupation" value={OCCUPATION_LABELS[reg.occupation] || reg.occupation} />
                  <InfoRow label="Annual Income" value={reg.annual_income} />
                </div>
              </div>

              {reg.address?.city && (
                <div className="bg-[#f6f7f8] rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Address</p>
                  <div className="divide-y divide-gray-200/60">
                    <InfoRow label="Street" value={reg.address.street} />
                    <InfoRow label="City" value={reg.address.city} />
                    <InfoRow label="State" value={reg.address.state} />
                    <InfoRow label="Pincode" value={reg.address.pincode} />
                  </div>
                </div>
              )}

              {reg.bank_details?.bank_name && (
                <div className="bg-[#f6f7f8] rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Bank Details</p>
                  <div className="divide-y divide-gray-200/60">
                    <InfoRow label="Bank Name" value={reg.bank_details.bank_name} />
                    <InfoRow label="Account Holder" value={reg.bank_details.account_holder_name} />
                    <InfoRow label="Account Number" value={reg.bank_details.account_number ? `****${String(reg.bank_details.account_number).slice(-4)}` : ''} />
                    <InfoRow label="IFSC" value={reg.bank_details.ifsc_code} />
                    <InfoRow label="Account Type" value={reg.bank_details.account_type} />
                  </div>
                </div>
              )}

              {Array.isArray(reg.segments_requested) && reg.segments_requested.length > 0 && (
                <div className="bg-[#f6f7f8] rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Segments</p>
                  <p className="text-xs text-[#111418]">{reg.segments_requested.join(', ')}</p>
                </div>
              )}

              {docEntries.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">Documents</p>
                  <div className="grid grid-cols-2 gap-2">
                    {docEntries.map(([key, doc]) => (
                      <a
                        key={key}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col rounded-xl overflow-hidden border border-gray-200 hover:border-[#137fec] transition-colors"
                      >
                        <img src={doc.url} alt={REG_DOC_LABELS[key] || key} className="w-full h-28 object-cover bg-gray-100" />
                        <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                          <span className="text-[11px] font-medium text-[#111418] truncate">{REG_DOC_LABELS[key] || key}</span>
                          <span className="material-symbols-outlined text-[14px] text-[#137fec] shrink-0">open_in_new</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {reg.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-xs font-semibold mb-1">Rejection Reason</p>
                  <p className="text-red-600 text-xs">{reg.rejectionReason}</p>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && reg && !approveResult && ['pending', 'under_review'].includes(reg.status) && (
          <div className="shrink-0 border-t border-gray-100 p-4 flex flex-col gap-2">
            {showRejectForm ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (required)"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 bg-[#f6f7f8] px-3 py-2 text-sm resize-none outline-none focus:border-red-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRejectForm(false)}
                    className="flex-1 h-10 rounded-xl border border-gray-200 text-[#111418] text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || acting}
                    className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-60"
                  >
                    {acting ? 'Rejecting...' : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={acting}
                  className="flex-1 h-10 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="flex-1 h-10 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {acting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {acting ? 'Creating...' : 'Approve & Create Account'}
                </button>
              </div>
            )}
          </div>
        )}

        {approveResult && (
          <div className="shrink-0 border-t border-gray-100 p-4">
            <button
              onClick={onClose}
              className="w-full h-10 rounded-xl bg-[#137fec] text-white text-sm font-bold"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const REG_FILTERS = ['actionable', 'pending', 'under_review', 'approved', 'rejected', 'all'];

const Approvals = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('kyc');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectModal, setRejectModal] = useState(null); // { kycId, docType }
  const [rejectReason, setRejectReason] = useState('');
  const [registrationFilter, setRegistrationFilter] = useState('actionable');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState(null);
  const [deletingRegId, setDeletingRegId] = useState(null);

  const [stats, setStats] = useState({
    kycPending: 0,
    cncPending: 0,
    withdrawalPending: 0,
    paymentPending: 0,
    registrationPending: 0,
  });
  const [kycApprovals, setKycApprovals] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [registrationStats, setRegistrationStats] = useState({
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });

  const [expandedKyc, setExpandedKyc] = useState(null); // kycId
  const [kycDetail, setKycDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kycRes, kycStatsRes, cncStatsRes, wdStatsRes, pmtStatsRes, regStatsRes, regsRes] = await Promise.all([
        brokerApi.getKycRequests({ status: 'pending' }).catch(() => null),
        brokerApi.getKycStats().catch(() => null),
        brokerApi.getCncStats().catch(() => null),
        brokerApi.getWithdrawalStats().catch(() => null),
        brokerApi.getPaymentStats().catch(() => null),
        brokerApi.getRegistrationStats().catch(() => null),
        brokerApi.getRegistrations({ status: 'all', page: 1, limit: 200 }).catch(() => null),
      ]);

      const regStats = regStatsRes?.stats || {};
      const regPending = toFiniteNumber(regStats.pending) + toFiniteNumber(regStats.under_review);

      setKycApprovals(kycRes?.requests || []);
      setRegistrations(regsRes?.registrations || []);
      setRegistrationStats({
        pending: toFiniteNumber(regStats.pending),
        under_review: toFiniteNumber(regStats.under_review),
        approved: toFiniteNumber(regStats.approved),
        rejected: toFiniteNumber(regStats.rejected),
        total: toFiniteNumber(regStats.total),
      });

      setStats({
        kycPending: extractCount(kycStatsRes?.stats?.pending ?? kycStatsRes?.pending),
        cncPending: extractCount(cncStatsRes?.stats?.pending ?? cncStatsRes?.pending),
        withdrawalPending: extractCount(wdStatsRes?.stats?.pending ?? wdStatsRes?.pending),
        paymentPending: extractCount(
          pmtStatsRes?.stats?.pendingCount ?? pmtStatsRes?.stats?.pending ?? pmtStatsRes?.pendingCount ?? pmtStatsRes?.pending
        ),
        registrationPending: regPending,
      });
    } catch (err) {
      console.error('Failed to fetch approvals:', err);
      setError(err.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleExpandKyc = async (kycId) => {
    if (expandedKyc === kycId) {
      setExpandedKyc(null);
      setKycDetail(null);
      return;
    }
    setExpandedKyc(kycId);
    setDetailLoading(true);
    setKycDetail(null);
    try {
      const res = await brokerApi.getKycDetail(kycId);
      setKycDetail(res.kyc);
    } catch (err) {
      console.error('Failed to load KYC detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApproveDoc = async (kycId, docType) => {
    const key = `${kycId}-${docType}`;
    setActionLoading(key);
    try {
      const res = await brokerApi.approveKyc(kycId, docType);
      if (kycDetail && kycDetail.id === kycId) {
        setKycDetail((prev) => ({
          ...prev,
          [docType]: { ...prev[docType], status: 'approved', rejection_reason: null },
          overall_status: res.overall_status || prev.overall_status,
        }));
      }
      if (res.overall_status === 'approved') {
        setKycApprovals((prev) => prev.filter((a) => a.id !== kycId));
        setStats((prev) => ({ ...prev, kycPending: Math.max(0, prev.kycPending - 1) }));
        setExpandedKyc(null);
        setKycDetail(null);
      }
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectDoc = async () => {
    if (!rejectModal) return;
    const { kycId, docType } = rejectModal;
    const key = `${kycId}-${docType}`;
    setActionLoading(key);
    try {
      const res = await brokerApi.rejectKyc(kycId, docType, rejectReason);
      if (kycDetail && kycDetail.id === kycId) {
        setKycDetail((prev) => ({
          ...prev,
          [docType]: { ...prev[docType], status: 'rejected', rejection_reason: rejectReason },
          overall_status: res.overall_status || prev.overall_status,
        }));
      }
      setKycApprovals((prev) => prev.map((a) => {
        if (a.id !== kycId) return a;
        return { ...a, [docType]: { ...a[docType], status: 'rejected' }, overall_status: res.overall_status || a.overall_status };
      }));
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteRegistration = async (e, regId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this registration record? This action cannot be undone.')) return;
    setDeletingRegId(regId);
    try {
      await brokerApi.deleteRegistration(regId);
      setRegistrations((prev) => prev.filter((r) => r.id !== regId));
      await brokerApi.getRegistrationStats().then((res) => {
        const s = res.stats || {};
        setRegistrationStats({
          pending: toFiniteNumber(s.pending),
          under_review: toFiniteNumber(s.under_review),
          approved: toFiniteNumber(s.approved),
          rejected: toFiniteNumber(s.rejected),
          total: toFiniteNumber(s.total),
        });
        setStats((prev) => ({
          ...prev,
          registrationPending: toFiniteNumber(s.pending) + toFiniteNumber(s.under_review),
        }));
      }).catch(() => {});
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to delete registration. Please try again.');
    } finally {
      setDeletingRegId(null);
    }
  };

  const totalPending = (
    stats.kycPending
    + stats.cncPending
    + stats.withdrawalPending
    + stats.paymentPending
    + stats.registrationPending
  );

  const query = searchQuery.toLowerCase().trim();

  const filteredApprovals = kycApprovals.filter((a) => {
    const name = a.customerName || '';
    const id = a.customerId || '';
    return name.toLowerCase().includes(query) || String(id).toLowerCase().includes(query);
  });

  const filteredRegistrations = registrations
    .filter((reg) => {
      if (registrationFilter === 'all') return true;
      if (registrationFilter === 'actionable') return ['pending', 'under_review'].includes(reg.status);
      return reg.status === registrationFilter;
    })
    .filter((reg) => {
      if (!query) return true;
      return (
        String(reg.name || '').toLowerCase().includes(query)
        || String(reg.email || '').toLowerCase().includes(query)
        || String(reg.phone || '').toLowerCase().includes(query)
      );
    });

  const tabs = [
    { key: 'kyc', label: 'KYC', count: stats.kycPending },
    { key: 'registrations', label: 'Registrations', count: stats.registrationPending },
    { key: 'cnc', label: 'CNC Orders', count: stats.cncPending, path: '/broker/cnc-approvals' },
    { key: 'withdrawals', label: 'Withdrawals', count: stats.withdrawalPending, path: '/broker/withdrawals' },
    { key: 'payments', label: 'Payments', count: stats.paymentPending, path: '/broker/payment-verification' },
  ];

  const renderDocSection = (kycId, docType, label, icon, docData) => {
    if (!docData || docData.status === 'not_submitted') return null;
    const isPending = docData.status === 'pending';
    const isApproved = docData.status === 'approved';
    const isRejected = docData.status === 'rejected';
    const loadingKey = `${kycId}-${docType}`;

    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-[#f6f7f8]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#617589] text-[18px]">{icon}</span>
            <span className="text-[13px] sm:text-[14px] font-semibold text-[#111418]">{label}</span>
          </div>
          <DocBadge status={docData.status} />
        </div>

        <div className="p-3 flex flex-col gap-2.5">
          {docData.number && (
            <div className="flex items-center gap-2">
              <span className="text-[#617589] text-[11px] sm:text-[12px] font-medium">Number:</span>
              <span className="text-[#111418] text-[12px] sm:text-[13px] font-bold tracking-wide">{docData.number}</span>
            </div>
          )}

          {docType === 'aadhaar' && (
            <div className="grid grid-cols-2 gap-2">
              {docData.front_url && (
                <div>
                  <p className="text-[10px] text-[#617589] mb-1">Front</p>
                  <img src={docData.front_url} alt="Aadhaar Front" className="w-full h-28 sm:h-36 object-cover rounded-lg border border-gray-200" />
                </div>
              )}
              {docData.back_url && (
                <div>
                  <p className="text-[10px] text-[#617589] mb-1">Back</p>
                  <img src={docData.back_url} alt="Aadhaar Back" className="w-full h-28 sm:h-36 object-cover rounded-lg border border-gray-200" />
                </div>
              )}
            </div>
          )}

          {docType === 'pan' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {docData.front_url && (
                  <div>
                    <p className="text-[10px] text-[#617589] mb-1">Front</p>
                    <img src={docData.front_url} alt="PAN Front" className="w-full h-28 sm:h-36 object-cover rounded-lg border border-gray-200" />
                  </div>
                )}
                {docData.back_url && (
                  <div>
                    <p className="text-[10px] text-[#617589] mb-1">Back</p>
                    <img src={docData.back_url} alt="PAN Back" className="w-full h-28 sm:h-36 object-cover rounded-lg border border-gray-200" />
                  </div>
                )}
              </div>
              {docData.signature_url && (
                <div>
                  <p className="text-[10px] text-[#617589] mb-1">Signature</p>
                  <img src={docData.signature_url} alt="Signature" className="h-20 sm:h-24 object-contain rounded-lg border border-gray-200 bg-white" />
                </div>
              )}
            </>
          )}

          {docType === 'bank_proof' && docData.document_url && (
            <div>
              <p className="text-[10px] text-[#617589] mb-1">Passbook / Cancelled Cheque</p>
              <img src={docData.document_url} alt="Bank Proof" className="w-full h-36 sm:h-44 object-cover rounded-lg border border-gray-200" />
            </div>
          )}

          {isRejected && docData.rejection_reason && (
            <div className="bg-red-50 text-red-600 text-[11px] sm:text-[12px] px-2.5 py-1.5 rounded-lg">
              Rejected: {docData.rejection_reason}
            </div>
          )}

          {docData.submitted_at && (
            <p className="text-[10px] text-[#617589]">
              Submitted: {new Date(docData.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}

          {isPending && (
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => { setRejectModal({ kycId, docType }); setRejectReason(''); }}
                disabled={actionLoading === loadingKey}
                className="flex-1 h-8 rounded-lg bg-red-50 text-red-600 text-[11px] sm:text-[12px] font-bold border border-red-100"
              >
                Reject
              </button>
              <button
                onClick={() => handleApproveDoc(kycId, docType)}
                disabled={actionLoading === loadingKey}
                className="flex-1 h-8 rounded-lg bg-[#137fec] text-white text-[11px] sm:text-[12px] font-bold shadow-sm"
              >
                {actionLoading === loadingKey ? 'Processing...' : 'Approve'}
              </button>
            </div>
          )}

          {isApproved && (
            <div className="flex items-center gap-1 text-green-600 text-[11px] font-medium">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              Verified
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8] pb-20">
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between">
          <h1 className="text-lg sm:text-xl font-bold leading-tight">Approvals</h1>
          <div className="relative">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">notifications</span>
            {totalPending > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{totalPending > 9 ? '9+' : totalPending}</span>
            )}
          </div>
        </div>

        <div className="flex px-3 sm:px-4 pb-2 gap-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.path) { navigate(tab.path); return; }
                setActiveTab(tab.key);
              }}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-[#137fec] text-white'
                  : 'bg-gray-100 text-[#617589]'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 sm:p-4">
          <div className="flex flex-col gap-2 rounded-xl p-4 sm:p-5 bg-white shadow-sm border border-gray-100">
            <p className="text-[#617589] text-xs sm:text-sm font-medium uppercase tracking-wider">Total Pending Actions</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
              ) : (
                <span className="text-3xl sm:text-4xl font-bold">{totalPending}</span>
              )}
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-1 bg-[#137fec]/10 text-[#137fec] rounded-full">
                KYC: {stats.kycPending} | REG: {stats.registrationPending} | CNC: {stats.cncPending} | WD: {stats.withdrawalPending} | PMT: {stats.paymentPending}
              </span>
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-4 mb-3">
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 sm:px-4 py-2.5 shadow-sm border border-gray-100">
            <span className="material-symbols-outlined text-[#617589] text-[18px] sm:text-[20px]">search</span>
            <input
              type="text"
              placeholder={activeTab === 'registrations' ? 'Search registrations by name/email/phone...' : 'Search by name or client ID...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 outline-none bg-transparent text-sm placeholder:text-[#617589]"
            />
          </div>
        </div>

        {activeTab === 'kyc' && (
          <div className="px-3 sm:px-4 flex flex-col gap-3 sm:gap-4">
            <h3 className="text-xs font-semibold text-[#617589] uppercase tracking-wider px-1">Pending KYC Verifications</h3>
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 animate-pulse">
                  <div className="flex gap-3 items-center mb-3">
                    <div className="w-12 h-12 rounded-full bg-gray-200" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-24" />
                    </div>
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <span className="material-symbols-outlined text-red-500 text-3xl mb-2">error</span>
                <p className="text-red-700 font-medium">{error}</p>
                <button onClick={fetchApprovals} className="mt-2 text-red-600 text-sm font-medium underline">Try Again</button>
              </div>
            ) : filteredApprovals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="material-symbols-outlined text-gray-300 text-5xl mb-3">verified_user</span>
                <p className="text-[#617589] text-sm font-medium">No pending KYC verifications</p>
                <p className="text-[#617589] text-xs mt-1">All documents have been reviewed</p>
              </div>
            ) : (
              filteredApprovals.map((approval) => {
                const id = approval.id || approval._id;
                const isExpanded = expandedKyc === id;
                const pendingDocs = [approval.aadhaar, approval.pan, approval.bank_proof]
                  .filter((d) => d?.status === 'pending').length;

                return (
                  <div key={id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => handleExpandKyc(id)}
                      className="w-full p-3 sm:p-4 text-left"
                    >
                      <div className="flex gap-3 items-center">
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#137fec]/10 flex items-center justify-center border-2 border-[#137fec]/20 shrink-0">
                          <span className="text-[#137fec] text-sm font-bold">
                            {(approval.customerName || '?').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] sm:text-[14px] font-bold text-[#111418] truncate">{approval.customerName || 'Unknown'}</p>
                          <p className="text-[10px] sm:text-[11px] text-[#617589] font-medium">
                            ID: {approval.customerId} {approval.phone ? `| ${approval.phone}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] sm:text-[11px] font-semibold bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">
                            {pendingDocs} pending
                          </span>
                          <div className="flex gap-1">
                            {['aadhaar', 'pan', 'bank_proof'].map((dt) => {
                              const st = approval[dt]?.status || 'not_submitted';
                              if (st === 'not_submitted') return null;
                              const color = st === 'approved' ? 'bg-green-500' : st === 'rejected' ? 'bg-red-500' : 'bg-yellow-500';
                              return <div key={dt} className={`w-2 h-2 rounded-full ${color}`} title={`${dt}: ${st}`} />;
                            })}
                          </div>
                        </div>
                        <span className={`material-symbols-outlined text-gray-400 text-[20px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          expand_more
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 p-3 sm:p-4">
                        {detailLoading ? (
                          <div className="flex flex-col gap-3 animate-pulse">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="border border-gray-100 rounded-xl p-3">
                                <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="h-28 bg-gray-200 rounded-lg" />
                                  <div className="h-28 bg-gray-200 rounded-lg" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : kycDetail ? (
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-[11px] sm:text-[12px] text-[#617589]">
                              {kycDetail.email && <span>{kycDetail.email}</span>}
                              {kycDetail.email && kycDetail.phone && <span>|</span>}
                              {kycDetail.phone && <span>{kycDetail.phone}</span>}
                            </div>

                            {renderDocSection(id, 'aadhaar', 'Aadhaar Card', 'badge', kycDetail.aadhaar)}
                            {renderDocSection(id, 'pan', 'PAN Card', 'credit_card', kycDetail.pan)}
                            {renderDocSection(id, 'bank_proof', 'Bank Account', 'account_balance', kycDetail.bank_proof)}
                          </div>
                        ) : (
                          <p className="text-red-500 text-[12px] text-center py-4">Failed to load details</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'registrations' && (
          <div className="px-3 sm:px-4 flex flex-col gap-3 sm:gap-4">
            <h3 className="text-xs font-semibold text-[#617589] uppercase tracking-wider px-1">Registration Applications</h3>

            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="grid grid-cols-4 divide-x divide-gray-100">
                {[
                  { label: 'Pending', value: registrationStats.pending, color: 'text-yellow-600' },
                  { label: 'Review', value: registrationStats.under_review, color: 'text-blue-600' },
                  { label: 'Approved', value: registrationStats.approved, color: 'text-green-600' },
                  { label: 'Rejected', value: registrationStats.rejected, color: 'text-red-500' },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center py-1">
                    <p className={`text-base font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-[10px] text-gray-400">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {REG_FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setRegistrationFilter(filter)}
                  className={`shrink-0 h-7 px-3 rounded-full text-[11px] sm:text-xs font-semibold capitalize transition-colors ${
                    registrationFilter === filter ? 'bg-[#111418] text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {filter.replace('_', ' ')}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 border-2 border-gray-200 border-t-[#137fec] rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <span className="material-symbols-outlined text-red-500 text-3xl mb-2">error</span>
                <p className="text-red-700 font-medium">{error}</p>
                <button onClick={fetchApprovals} className="mt-2 text-red-600 text-sm font-medium underline">Try Again</button>
              </div>
            ) : filteredRegistrations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="material-symbols-outlined text-gray-300 text-5xl mb-3">inbox</span>
                <p className="text-[#617589] text-sm font-medium">No registrations found</p>
              </div>
            ) : (
              filteredRegistrations.map((reg) => (
                <div
                  key={reg.id}
                  className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <button
                    onClick={() => setSelectedRegistrationId(reg.id)}
                    className="w-full text-left p-3 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-[#111418] font-semibold text-sm truncate">{reg.name || '—'}</p>
                        <p className="text-[#617589] text-xs mt-0.5 truncate">{reg.email || reg.phone || '—'}</p>
                      </div>
                      <RegistrationStatusBadge status={reg.status} />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      {reg.panNumber && <span className="font-mono">{reg.panNumber}</span>}
                      <span className="ml-auto">{new Date(reg.submittedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                    </div>
                  </button>
                  <div className="flex items-center justify-end px-3 pb-2 sm:px-4 sm:pb-3">
                    <button
                      onClick={(e) => handleDeleteRegistration(e, reg.id)}
                      disabled={deletingRegId === reg.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold text-red-500 hover:bg-red-50 border border-red-100 transition-colors disabled:opacity-50"
                      title="Delete this registration"
                    >
                      {deletingRegId === reg.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      )}
                      {deletingRegId === reg.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[#111418] text-lg font-bold mb-1">Reject {rejectModal.docType === 'bank_proof' ? 'Bank Proof' : rejectModal.docType === 'pan' ? 'PAN' : 'Aadhaar'}</h3>
            <p className="text-[#617589] text-[12px] mb-3">The customer will need to re-submit this document.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              rows={3}
              className="w-full p-3 rounded-xl bg-[#f6f7f8] border border-gray-200 text-sm resize-none focus:outline-none focus:border-[#137fec]"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectModal(null)} className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm">
                Cancel
              </button>
              <button
                onClick={handleRejectDoc}
                disabled={!rejectReason.trim() || actionLoading}
                className="flex-1 h-11 bg-red-500 text-white rounded-xl font-bold text-sm disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRegistrationId && (
        <RegistrationDetailSheet
          regId={selectedRegistrationId}
          onClose={() => setSelectedRegistrationId(null)}
          onRefresh={fetchApprovals}
        />
      )}
    </div>
  );
};

export default Approvals;
