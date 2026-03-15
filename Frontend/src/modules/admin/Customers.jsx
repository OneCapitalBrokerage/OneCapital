import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import adminApi from '../../api/admin';
import CustomerDetailSheet from './components/CustomerDetailSheet';

const Customers = () => {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const brokerId = searchParams.get('brokerId') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [brokerFilterName, setBrokerFilterName] = useState('');

  // Fetch broker name for display when brokerId filter is active
  useEffect(() => {
    if (!brokerId) { setBrokerFilterName(''); return; }
    adminApi.getBrokerById(brokerId)
      .then(res => setBrokerFilterName(res.broker?.name || brokerId))
      .catch(() => setBrokerFilterName(brokerId));
  }, [brokerId]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getAllCustomers({
        page: currentPage,
        limit: 20,
        search: searchQuery,
        status: filterStatus !== 'All' ? filterStatus.toLowerCase() : undefined,
        brokerId: brokerId || undefined,
      });

      const customersData = response.customers || response.data || [];
      setCustomers(customersData.map(customer => ({
        id: customer.id || customer._id,
        _id: customer._id || customer.id,
        name: customer.name || 'Unknown',
        email: customer.email || 'N/A',
        phone: customer.phone || 'N/A',
        broker: customer.broker?.name || customer.broker?.id || 'N/A',
        status: customer.status ? customer.status.charAt(0).toUpperCase() + customer.status.slice(1) : 'Unknown',
        kycStatus: customer.kycStatus ? customer.kycStatus.charAt(0).toUpperCase() + customer.kycStatus.slice(1) : 'Pending',
        tradingEnabled: customer.tradingEnabled || false,
        holdingsExitAllowed: customer.holdingsExitAllowed || false,
        lastActive: customer.lastLogin ? new Date(customer.lastLogin).toLocaleDateString() : 'Never'
      })));

      if (response.pagination) setTotalPages(response.pagination.pages || 1);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      setError(err.message || 'Failed to load customers');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, filterStatus, brokerId]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterStatus, brokerId]);

  const clearBrokerFilter = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('brokerId');
      return next;
    });
  };

  const filteredCustomers = customers;

  const getKycStatusStyle = (status) => {
    switch (status) {
      case 'Verified': return 'bg-green-100 text-green-700';
      case 'Pending': return 'bg-yellow-100 text-yellow-700';
      case 'Rejected': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-700';
      case 'Blocked': return 'bg-red-100 text-red-700';
      case 'Inactive': return 'bg-gray-100 text-gray-500';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.status === 'Active').length,
    blocked: customers.filter(c => c.status === 'Blocked').length
  };

  const openDetail = (id) => {
    const qs = searchParams.toString();
    navigate(`/admin/customers/${id}${qs ? `?${qs}` : ''}`);
  };
  const closeDetail = () => {
    fetchCustomers();
    const qs = searchParams.toString();
    navigate(`/admin/customers${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Customer Detail Sheet */}
      {customerId && (
        <CustomerDetailSheet customerId={customerId} onClose={closeDetail} />
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Customer Management</h1>
              <p className="text-[10px] sm:text-xs text-gray-500 font-medium">{stats.total} total customers</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="flex-1 bg-green-50 rounded-lg p-2 sm:p-2.5">
            <p className="text-lg sm:text-xl font-bold text-green-600">{stats.active}</p>
            <p className="text-[10px] sm:text-xs text-green-700 font-medium">Active</p>
          </div>
          <div className="flex-1 bg-red-50 rounded-lg p-2 sm:p-2.5">
            <p className="text-lg sm:text-xl font-bold text-red-600">{stats.blocked}</p>
            <p className="text-[10px] sm:text-xs text-red-700 font-medium">Blocked</p>
          </div>
          <div className="flex-1 bg-blue-50 rounded-lg p-2 sm:p-2.5">
            <p className="text-lg sm:text-xl font-bold text-[#137fec]">{stats.total}</p>
            <p className="text-[10px] sm:text-xs text-blue-700 font-medium">Total</p>
          </div>
        </div>

        {/* Broker Filter Chip */}
        {brokerId && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs text-blue-700 font-medium">
              <span className="material-symbols-outlined text-[14px]">corporate_fare</span>
              <span>Filtered by broker: {brokerFilterName || brokerId}</span>
              <button onClick={clearBrokerFilter} className="ml-1 flex items-center text-blue-500 hover:text-blue-700">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
          </span>
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 sm:h-10 rounded-lg border border-gray-200 pl-9 sm:pl-10 pr-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none transition-all"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
          {['All', 'Active', 'Blocked', 'Inactive'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                filterStatus === status ? 'bg-[#137fec] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </header>

      {/* Customers List */}
      <main className="flex-1 p-3 sm:p-4">
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 text-sm text-red-700">{error}</div>
        )}
        <div className="flex flex-col gap-3 sm:gap-4">
          {filteredCustomers.map(customer => (
            <div
              key={customer.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="p-3 sm:p-4">
                {/* Header Row */}
                <div className="flex items-start gap-3 mb-2.5 sm:mb-3">
                  <div className="size-10 sm:size-11 rounded-full bg-gradient-to-br from-[#137fec] to-purple-500 flex items-center justify-center text-white font-bold text-sm sm:text-base shrink-0">
                    {customer.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold truncate">{customer.name}</h3>
                        <p className="text-[10px] sm:text-xs text-gray-500 truncate">{customer.email}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${getStatusStyle(customer.status)}`}>
                        {customer.status}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">via {customer.broker}</p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-2.5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-0.5">Trading</p>
                    <span className={`text-xs font-semibold ${customer.tradingEnabled ? 'text-green-600' : 'text-red-500'}`}>
                      {customer.tradingEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-2.5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-0.5">KYC Status</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold ${getKycStatusStyle(customer.kycStatus)}`}>
                      {customer.kycStatus}
                    </span>
                  </div>
                </div>

                {/* Bottom Row */}
                <div className="flex items-center justify-between pt-2.5 sm:pt-3 border-t border-gray-100">
                  <p className="text-[10px] sm:text-xs text-gray-400">Last active: {customer.lastActive}</p>
                  <button
                    onClick={() => openDetail(customer._id)}
                    className="flex items-center gap-1 text-[#137fec] text-xs font-semibold"
                  >
                    View
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredCustomers.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="material-symbols-outlined text-4xl sm:text-5xl mb-2">person_search</span>
              <p className="text-sm font-medium">No customers found</p>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full max-w-md mx-auto bg-white border-t border-gray-200 z-30">
        <div className="flex justify-around items-center h-14 sm:h-16">
          <button onClick={() => navigate('/admin/dashboard')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">dashboard</span>
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          <button onClick={() => navigate('/admin/customers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-[#137fec]">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">group</span>
            <span className="text-[10px] font-medium">Customers</span>
          </button>
          <button onClick={() => navigate('/admin/brokers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">corporate_fare</span>
            <span className="text-[10px] font-medium">Brokers</span>
          </button>
          <button onClick={() => navigate('/admin/chats')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chat</span>
            <span className="text-[10px] font-medium">Chats</span>
          </button>
          <button onClick={() => navigate('/admin/settings')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">settings</span>
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Customers;
