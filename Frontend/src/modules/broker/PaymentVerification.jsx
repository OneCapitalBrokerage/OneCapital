import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const STATUS_META = {
  pending_proof: { label: 'Pending', className: 'bg-amber-50 text-amber-700' }, // Legacy status
  pending: { label: 'Pending Review', className: 'bg-blue-50 text-blue-600' },
  verified: { label: 'Approved', className: 'bg-green-50 text-green-600' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-600' },
};

const FILTER_OPTIONS = [
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Approved' },
];

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const extractCount = (value, fallback = 0) => {
  if (value && typeof value === 'object') {
    return toFiniteNumber(value.count);
  }
  const n = toFiniteNumber(value);
  return n || toFiniteNumber(fallback);
};

const extractAmount = (value, fallback = 0) => {
  if (value && typeof value === 'object') {
    return toFiniteNumber(value.amount ?? value.value);
  }
  const n = toFiniteNumber(value);
  return n || toFiniteNumber(fallback);
};

const PaymentVerification = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activeFilter, setActiveFilter] = useState('pending');

  const [stats, setStats] = useState({
    totalPending: 0,
    pendingCount: 0,
    totalApproved: 0,
    approvedCount: 0,
  });

  const [requests, setRequests] = useState([]);

  const fetchPaymentRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [requestsRes, statsRes] = await Promise.all([
        brokerApi.getPayments({ status: activeFilter }),
        brokerApi.getPaymentStats()
      ]);

      const requestsData = requestsRes.payments || requestsRes.data || [];
      setRequests(requestsData);

      const statsData = statsRes.stats || statsRes.data || statsRes;
      const fallbackTotal = requestsData.reduce((sum, r) => sum + (r.amount || 0), 0);
      setStats({
        totalPending: extractAmount(statsData.totalPending ?? statsData.totalAmount ?? statsData.pending, fallbackTotal),
        pendingCount: extractCount(statsData.pendingCount ?? statsData.pending, requestsData.length),
        totalApproved: extractAmount(statsData.verified, 0),
        approvedCount: extractCount(statsData.verified, 0),
      });
    } catch (err) {
      console.error('Failed to fetch payment requests:', err);
      setError(err.message || 'Failed to load payment requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchPaymentRequests();
  }, [fetchPaymentRequests]);

  const handleVerify = async (id) => {
    setActionLoading(id);
    try {
      await brokerApi.verifyPayment(id);
      const request = requests.find(r => (r.id || r._id) === id);
      setRequests(prev => prev.filter(r => (r.id || r._id) !== id));
      setStats(prev => ({
        ...prev,
        totalPending: prev.totalPending - (request?.amount || 0),
        pendingCount: Math.max(0, prev.pendingCount - 1),
        totalApproved: prev.totalApproved + (request?.amount || 0),
        approvedCount: prev.approvedCount + 1,
      }));
    } catch (err) {
      console.error('Failed to verify payment:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionLoading(rejectModal);
    try {
      await brokerApi.rejectPayment(rejectModal, rejectReason);
      const request = requests.find(r => (r.id || r._id) === rejectModal);
      setRequests(prev => prev.filter(r => (r.id || r._id) !== rejectModal));
      setStats(prev => ({
        ...prev,
        totalPending: prev.totalPending - (request?.amount || 0),
        pendingCount: Math.max(0, prev.pendingCount - 1)
      }));
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      console.error('Failed to reject payment:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const isPendingView = activeFilter === 'pending';
  const summaryAmount = isPendingView ? stats.totalPending : stats.totalApproved;
  const summaryCount = isPendingView ? stats.pendingCount : stats.approvedCount;
  const summaryTitle = isPendingView ? 'Total Pending Payments' : 'Total Approved Payments';
  const summaryNote = isPendingView
    ? `${summaryCount} requests awaiting proof/review`
    : `${summaryCount} approved requests`;

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between">
          <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
          </button>
          <h2 className="text-base sm:text-lg font-bold">Payment Verification</h2>
          <div className="size-9 sm:size-10"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Stats Card */}
        <div className="p-3 sm:p-4">
          <div className="flex flex-col gap-2 rounded-xl p-4 sm:p-5 bg-white shadow-sm">
            <p className="text-[#617589] text-xs sm:text-sm font-medium">{summaryTitle}</p>
            <div className="flex items-baseline gap-2">
              {loading ? (
                <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
              ) : (
                <p className="text-2xl sm:text-3xl font-bold">{formatCurrency(summaryAmount)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`flex h-2 w-2 rounded-full ${isPendingView ? 'bg-amber-400' : 'bg-green-500'}`}></span>
              <p className="text-[#617589] text-xs font-medium">{summaryNote}</p>
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 pb-2 gap-2">
          <h3 className="text-sm font-bold">Fund Requests</h3>
          <div className="flex items-center gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => setActiveFilter(option.key)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
                  activeFilter === option.key
                    ? 'bg-[#137fec] text-white border-[#137fec]'
                    : 'bg-white text-[#617589] border-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Request Cards */}
        <div className="flex flex-col gap-3 px-3 sm:px-4">
          {loading ? (
            [1, 2].map(i => (
              <div key={i} className="bg-white rounded-xl shadow-sm animate-pulse overflow-hidden">
                <div className="w-full h-36 bg-gray-200"></div>
                <div className="p-3 sm:p-4">
                  <div className="h-5 bg-gray-200 rounded w-28 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-40 mb-3"></div>
                  <div className="flex gap-2"><div className="flex-1 h-10 bg-gray-200 rounded-lg"></div><div className="flex-[2] h-10 bg-gray-200 rounded-lg"></div></div>
                </div>
              </div>
            ))
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-red-700 font-medium">{error}</p>
              <button onClick={fetchPaymentRequests} className="mt-2 text-red-600 text-sm font-medium underline">Retry</button>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="material-symbols-outlined text-gray-300 text-5xl mb-3">verified</span>
              <p className="text-[#617589] text-sm font-medium">
                {isPendingView ? 'No pending payments' : 'No approved payments'}
              </p>
              <p className="text-[#617589] text-xs mt-1">
                {isPendingView ? 'All requests have been processed' : 'Approved requests will appear here'}
              </p>
            </div>
          ) : (
            requests.map(request => {
              const id = request.id || request._id;
              const status = request.status || 'pending';
              const statusMeta = STATUS_META[status] || STATUS_META.pending;
              const isPendingReview = status === 'pending' || status === 'pending_proof';
              const canVerify = isPendingView && isPendingReview;
              const canReject = isPendingView && isPendingReview;
              const customerName = request.customerName || request.clientName || request.name || 'Unknown';
              const customerId = request.customerId || request.clientId || request.client_id || '';
              return (
                <div key={id} className="flex flex-col rounded-xl shadow-sm bg-white overflow-hidden">
                  {/* Request Header with Status */}
                  <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                    <p className="text-[#617589] text-[10px] font-medium">
                      {request.date || (request.createdAt ? new Date(request.createdAt).toLocaleDateString('en-IN') : '')}
                      {request.time ? ` • ${request.time}` : ''}
                    </p>
                  </div>

                  {/* Request Details */}
                  <div className="flex flex-col gap-2.5 p-3 sm:p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-base sm:text-lg font-bold leading-none mb-1">{formatCurrency(request.amount)}</p>
                        <p className="text-[#617589] text-[11px]">
                          {customerName} {customerId ? `• ${customerId}` : ''}
                        </p>
                      </div>
                    </div>

                    {request.utrNumber && (
                      <div className="bg-blue-50 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                        <span className="text-[10px] text-blue-600 font-medium">UTR:</span>
                        <span className="text-[11px] font-semibold font-mono text-blue-800">{request.utrNumber}</span>
                      </div>
                    )}

                    {request.paymentReference && !request.utrNumber && (
                      <div className="bg-gray-50 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                        <span className="text-[10px] text-[#617589]">Ref:</span>
                        <span className="text-[10px] font-semibold font-mono">{request.paymentReference}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {canVerify ? (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => { setRejectModal(id); setRejectReason(''); }}
                          disabled={actionLoading === id}
                          className="flex-1 flex items-center justify-center rounded-lg h-10 bg-red-500 text-white text-xs font-bold active:scale-95 transition-transform"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleVerify(id)}
                          disabled={actionLoading === id}
                          className="flex-[2] flex items-center justify-center rounded-lg h-10 bg-green-500 text-white text-xs font-bold active:scale-95 transition-transform"
                        >
                          {actionLoading === id ? 'Verifying...' : 'Verify & Add Funds'}
                        </button>
                      </div>
                    ) : canReject ? (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => { setRejectModal(id); setRejectReason(''); }}
                          disabled={actionLoading === id}
                          className="flex-1 flex items-center justify-center rounded-lg h-10 bg-red-500 text-white text-xs font-bold active:scale-95 transition-transform"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-100 rounded-lg p-2.5">
                        <p className="text-[11px] text-green-700">
                          Approved on {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString('en-IN') : 'N/A'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[#111418] text-lg font-bold mb-3">Rejection Reason</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection (optional)..."
              rows={3}
              className="w-full p-3 rounded-xl bg-[#f6f7f8] border border-gray-200 text-sm resize-none focus:outline-none focus:border-[#137fec]"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectModal(null)} className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm">Cancel</button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModal}
                className="flex-1 h-11 bg-red-500 text-white rounded-xl font-bold text-sm"
              >
                {actionLoading === rejectModal ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentVerification;
