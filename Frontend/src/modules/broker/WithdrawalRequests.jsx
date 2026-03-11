import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

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

const WithdrawalRequests = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [stats, setStats] = useState({
    pending: 0,
    totalValue: 0
  });

  const fetchWithdrawalRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [requestsRes, statsRes] = await Promise.all([
        brokerApi.getWithdrawals({ status: 'pending' }),
        brokerApi.getWithdrawalStats()
      ]);

      const requestsData = requestsRes.withdrawals || requestsRes.data || [];
      setRequests(requestsData);

      const statsData = statsRes.stats || statsRes.data || statsRes;
      const fallbackTotal = requestsData.reduce((sum, r) => sum + (r.amount || 0), 0);
      setStats({
        pending: extractCount(statsData.pending, requestsData.length),
        totalValue: extractAmount(statsData.totalValue ?? statsData.totalAmount ?? statsData.pending, fallbackTotal)
      });
    } catch (err) {
      console.error('Failed to fetch withdrawal requests:', err);
      setError(err.message || 'Failed to load withdrawal requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWithdrawalRequests();
  }, [fetchWithdrawalRequests]);

  const formatCurrency = (value) => {
    if (value >= 100000) {
      return `₹${(value / 100000).toFixed(2)}L`;
    }
    return `₹${(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  const handleApprove = async (id) => {
    setError(null);
    setActionLoading(id);
    try {
      await brokerApi.approveWithdrawal(id);
      const request = requests.find(r => (r.id || r._id) === id);
      setRequests(prev => prev.filter(r => (r.id || r._id) !== id));
      setStats(prev => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        totalValue: prev.totalValue - (request?.amount || 0)
      }));
    } catch (err) {
      console.error('Failed to approve withdrawal:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to approve withdrawal.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setError(null);
    setActionLoading(rejectModal);
    try {
      await brokerApi.rejectWithdrawal(rejectModal, rejectReason);
      const request = requests.find(r => (r.id || r._id) === rejectModal);
      setRequests(prev => prev.filter(r => (r.id || r._id) !== rejectModal));
      setStats(prev => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        totalValue: prev.totalValue - (request?.amount || 0)
      }));
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      console.error('Failed to reject withdrawal:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to reject withdrawal.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const name = r.name || r.clientName || '';
    const clientId = r.clientId || r.client_id || '';
    return name.toLowerCase().includes(q) || clientId.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between">
          <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
          </button>
          <h2 className="text-base sm:text-lg font-bold">Withdrawal Requests</h2>
          <div className="size-9 sm:size-10"></div>
        </div>

        {/* Search */}
        <div className="px-3 sm:px-4 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl h-10 sm:h-11 px-3">
            <span className="material-symbols-outlined text-[#617589] text-[18px] sm:text-[20px]">search</span>
            <input
              className="w-full bg-transparent border-none text-[#111418] placeholder:text-[#617589] focus:ring-0 text-xs sm:text-sm outline-none"
              placeholder="Search by Client ID or Name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Stats */}
        <div className="flex gap-2.5 sm:gap-3 p-3 sm:p-4">
          <div className="flex flex-1 flex-col rounded-xl bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-500 text-base sm:text-lg">pending_actions</span>
              </div>
              <p className="text-[#617589] text-[9px] sm:text-xs font-medium uppercase tracking-wider">Pending</p>
            </div>
            <p className="text-[#111418] text-xl sm:text-2xl font-bold">{stats.pending}</p>
          </div>
          <div className="flex flex-1 flex-col rounded-xl bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-green-600 text-base sm:text-lg">account_balance_wallet</span>
              </div>
              <p className="text-[#617589] text-[9px] sm:text-xs font-medium uppercase tracking-wider">Total Value</p>
            </div>
            <p className="text-[#111418] text-xl sm:text-2xl font-bold">{formatCurrency(stats.totalValue)}</p>
          </div>
        </div>

        {/* Request List */}
        <div className="px-3 sm:px-4 flex flex-col gap-3 sm:gap-4">
          {loading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm animate-pulse">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                    <div>
                      <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-16"></div>
                    </div>
                  </div>
                  <div className="h-5 bg-gray-200 rounded w-20"></div>
                </div>
                <div className="flex gap-2"><div className="flex-1 h-9 bg-gray-200 rounded-lg"></div><div className="flex-1 h-9 bg-gray-200 rounded-lg"></div></div>
              </div>
            ))
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-red-700 font-medium">{error}</p>
              <button onClick={fetchWithdrawalRequests} className="mt-2 text-red-600 text-sm font-medium underline">Retry</button>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="material-symbols-outlined text-gray-300 text-5xl mb-3">check_circle</span>
              <h3 className="text-[#111418] text-base font-bold mb-1">All caught up!</h3>
              <p className="text-[#617589] text-xs text-center">No pending withdrawal requests.</p>
            </div>
          ) : (
            filteredRequests.map(request => {
              const id = request.id || request._id;
              const initials = (request.name || request.clientName || '?').split(' ').map(n => n[0]).join('');
              return (
                <div key={id} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#137fec]/10 flex items-center justify-center shrink-0">
                        <span className="text-[#137fec] text-xs font-bold">{initials}</span>
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-semibold">{request.name || request.clientName || 'Unknown'}</h3>
                        <p className="text-[10px] text-[#617589]">{request.clientId || request.client_id || id}</p>
                        {request.requestRef && <p className="text-[10px] text-[#617589] font-mono">{request.requestRef}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm sm:text-base font-bold">₹{(request.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      {request.netCash !== null && request.netCash !== undefined && (
                        <p className={`text-[10px] font-medium mt-0.5 ${request.netCash >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          Net Cash: {request.netCash >= 0 ? '+' : ''}₹{toFiniteNumber(request.netCash).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-amber-500 text-[12px]">schedule</span>
                        <p className="text-[10px] text-[#617589]">{request.time || (request.createdAt ? new Date(request.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')}</p>
                      </div>
                    </div>
                  </div>

                  {request.bankAccount && (
                    <div className="bg-gray-50 rounded-lg p-2 mb-2.5 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#617589] text-[14px]">account_balance</span>
                      <span className="text-[10px] text-[#617589]">{request.bankAccount}</span>
                    </div>
                  )}

                  <div className="h-px bg-gray-100 w-full mb-2.5"></div>
                  <div className="flex gap-2.5">
                    <button
                      onClick={() => { setRejectModal(id); setRejectReason(''); }}
                      disabled={actionLoading === id}
                      className="flex-1 h-8 sm:h-9 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(id)}
                      disabled={actionLoading === id}
                      className="flex-1 h-8 sm:h-9 rounded-lg bg-[#137fec] text-white text-xs font-medium shadow-sm shadow-blue-200"
                    >
                      {actionLoading === id ? 'Processing...' : 'Approve'}
                    </button>
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

export default WithdrawalRequests;
