import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const FILTER_OPTIONS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
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

const CncOrderApprovals = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activeFilter, setActiveFilter] = useState('pending');

  const [stats, setStats] = useState({ pending: 0, approvedToday: 0, rejectedToday: 0 });
  const [orders, setOrders] = useState([]);

  const fetchCncOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, statsRes] = await Promise.all([
        brokerApi.getCncOrders({ status: activeFilter }),
        brokerApi.getCncStats()
      ]);

      setOrders(ordersRes.orders || ordersRes.data || []);

      const s = statsRes.stats || statsRes.data || statsRes;
      setStats({
        pending: extractCount(s.pending),
        approvedToday: extractCount(s.approvedToday ?? s.approved),
        rejectedToday: extractCount(s.rejectedToday ?? s.rejected)
      });
    } catch (err) {
      console.error('Failed to fetch CNC orders:', err);
      setError(err.message || 'Failed to load CNC orders');
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchCncOrders();
  }, [fetchCncOrders]);

  const handleApprove = async (orderId) => {
    setActionLoading(orderId);
    try {
      await brokerApi.approveCncOrder(orderId);
      setOrders(prev => prev.filter(o => (o.id || o._id) !== orderId));
      setStats(prev => ({ ...prev, pending: prev.pending - 1, approvedToday: prev.approvedToday + 1 }));
    } catch (err) {
      console.error('Failed to approve order:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionLoading(rejectModal);
    try {
      await brokerApi.rejectCncOrder(rejectModal, rejectReason);
      setOrders(prev => prev.filter(o => (o.id || o._id) !== rejectModal));
      setStats(prev => ({ ...prev, pending: prev.pending - 1, rejectedToday: prev.rejectedToday + 1 }));
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      console.error('Failed to reject order:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredOrders = orders.filter(o => {
    const q = searchQuery.toLowerCase();
    const name = o.customerName || o.clientName || '';
    const symbol = o.symbol || o.tradingsymbol || '';
    const id = o.customerId || o.clientId || '';
    return name.toLowerCase().includes(q) || symbol.toLowerCase().includes(q) || String(id).toLowerCase().includes(q);
  });

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  const isPendingView = activeFilter === 'pending';

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 justify-between border-b border-gray-200">
        <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
        </button>
        <h2 className="text-base sm:text-lg font-bold">CNC Order Approvals</h2>
        <div className="size-9 sm:size-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-4">
          <div className="bg-white rounded-xl p-2.5 sm:p-3 shadow-sm text-center">
            <p className="text-lg sm:text-xl font-bold text-amber-500">{stats.pending}</p>
            <p className="text-[10px] sm:text-xs text-[#617589]">Pending</p>
          </div>
          <div className="bg-white rounded-xl p-2.5 sm:p-3 shadow-sm text-center">
            <p className="text-lg sm:text-xl font-bold text-green-500">{stats.approvedToday}</p>
            <p className="text-[10px] sm:text-xs text-[#617589]">Approved</p>
          </div>
          <div className="bg-white rounded-xl p-2.5 sm:p-3 shadow-sm text-center">
            <p className="text-lg sm:text-xl font-bold text-red-500">{stats.rejectedToday}</p>
            <p className="text-[10px] sm:text-xs text-[#617589]">Rejected</p>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 sm:px-4 mb-2">
          <div className="flex items-center gap-2 mb-2">
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
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 sm:px-4 py-2.5 shadow-sm">
            <span className="material-symbols-outlined text-[#617589] text-[18px] sm:text-[20px]">search</span>
            <input
              type="text"
              placeholder="Search by client or symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 outline-none bg-transparent text-sm placeholder:text-[#617589]"
            />
          </div>
        </div>

        {/* Order Cards */}
        <div className="px-3 sm:px-4 flex flex-col gap-2.5 sm:gap-3">
          {loading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                  <div className="flex-1"><div className="h-4 bg-gray-200 rounded w-24 mb-2"></div><div className="h-3 bg-gray-200 rounded w-16"></div></div>
                </div>
                <div className="h-16 bg-gray-200 rounded-lg mb-3"></div>
                <div className="flex gap-2"><div className="flex-1 h-9 bg-gray-200 rounded-lg"></div><div className="flex-1 h-9 bg-gray-200 rounded-lg"></div></div>
              </div>
            ))
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-red-700 font-medium">{error}</p>
              <button onClick={fetchCncOrders} className="mt-2 text-red-600 text-sm font-medium underline">Retry</button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="material-symbols-outlined text-gray-300 text-5xl mb-3">check_circle</span>
              <p className="text-[#617589] text-sm font-medium">
                {isPendingView ? 'No pending orders' : 'No approved orders'}
              </p>
              <p className="text-[#617589] text-xs mt-1">
                {isPendingView ? 'All orders have been processed' : 'Approved CNC orders will appear here'}
              </p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const id = order.id || order._id;
              const approvalStatus = String(order.approvalStatus || '').toLowerCase();
              const isApproved = approvalStatus === 'approved';
              return (
                <div key={id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-3 sm:p-4">
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#137fec]/10 flex items-center justify-center shrink-0">
                          <span className="text-[#137fec] text-xs font-bold">
                            {(order.customerName || '?').split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{order.customerName || 'Unknown'}</p>
                          <p className="text-[10px] text-[#617589]">{order.customerId || id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                          order.segment === 'CASH' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                        }`}>{order.segment || 'CNC'}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                          isApproved ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isApproved ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-2.5 mb-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-bold">{order.symbol || order.tradingsymbol || '---'}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          order.type === 'BUY' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                        }`}>{order.type || order.transaction_type || '---'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-[#617589]">Qty</p>
                          <p className="text-xs font-semibold">{order.quantity || 0}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#617589]">Price</p>
                          <p className="text-xs font-semibold">₹{(order.price || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#617589]">Value</p>
                          <p className="text-xs font-semibold">{formatCurrency(order.orderValue || (order.price || 0) * (order.quantity || 0))}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[#617589]">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        <span className="text-[10px]">{order.time || (order.createdAt ? new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')}</span>
                      </div>
                      {isPendingView ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setRejectModal(id); setRejectReason(''); }}
                            disabled={actionLoading === id}
                            className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>Reject
                          </button>
                          <button
                            onClick={() => handleApprove(id)}
                            disabled={actionLoading === id}
                            className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">check</span>{actionLoading === id ? '...' : 'Approve'}
                          </button>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                          Approved {order.approvedAt ? `on ${new Date(order.approvedAt).toLocaleDateString('en-IN')}` : ''}
                        </div>
                      )}
                    </div>
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
              <button onClick={handleReject} disabled={actionLoading === rejectModal} className="flex-1 h-11 bg-red-500 text-white rounded-xl font-bold text-sm">
                {actionLoading === rejectModal ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CncOrderApprovals;
