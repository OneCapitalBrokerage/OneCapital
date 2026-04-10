import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const FILTER_OPTIONS = {
  status: [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'inactive', label: 'Inactive' },
  ],
  trading: [
    { value: 'all', label: 'All' },
    { value: 'enabled', label: 'Enabled' },
    { value: 'disabled', label: 'Disabled' },
  ],
};

const ClientList = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [credentialsModal, setCredentialsModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: 'all', trading: 'all' });
  const [pendingFilters, setPendingFilters] = useState({ status: 'all', trading: 'all' });

  // Pagination
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });

  const activeFilterCount = [filters.status, filters.trading].filter(v => v !== 'all').length;

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { search: searchTerm, page, limit: 20 };
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.trading !== 'all') params.trading = filters.trading;
      const response = await brokerApi.getAllClients(params);
      setClients(response.clients || []);
      if (response.pagination) setPagination(response.pagination);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
      setError(err.message || 'Failed to load clients');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, page, filters]);

  // Reset page when search or filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, filters]);

  useEffect(() => {
    const debounce = setTimeout(() => fetchClients(), 300);
    return () => clearTimeout(debounce);
  }, [fetchClients]);

  const handleDelete = async (clientId) => {
    setActionLoading(clientId);
    try {
      await brokerApi.deleteClient(clientId);
      setClients(prev => prev.filter(c => c.id !== clientId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete client:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCredentials = async (clientId) => {
    setActionLoading(clientId);
    try {
      const response = await brokerApi.getClientCredentials(clientId);
      setCredentialsModal(response.credentials || { id: clientId, password: '---' });
    } catch (err) {
      console.error('Failed to fetch credentials:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLoginAs = async (clientId) => {
    navigate(`/broker/clients/${clientId}`);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'blocked': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getOnlineIndicator = (status) => {
    if (status === 'blocked') return 'bg-red-500';
    return status === 'active' ? 'bg-green-500' : 'bg-gray-300';
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center px-3 sm:px-4 py-3 sm:py-4 justify-between">
          <h2 className="text-[#111418] text-base sm:text-lg font-bold leading-tight">Client Management</h2>
          <button onClick={() => { setPendingFilters(filters); setShowFilters(true); }} className="relative text-[#137fec]">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">filter_list</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#137fec] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </div>

      <main className="pb-6">
        {/* Create New Client + Recycle Bin */}
        <div className="flex gap-2 px-3 sm:px-4 py-3 sm:py-4">
          <button
            onClick={() => navigate('/broker/clients/new')}
            className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-xl h-12 sm:h-14 px-4 sm:px-5 flex-1 bg-[#137fec] text-white text-sm sm:text-base font-bold leading-normal tracking-[0.015em] shadow-lg shadow-[#137fec]/20"
          >
            <span className="material-symbols-outlined mr-1.5 sm:mr-2 text-[20px] sm:text-[22px]">person_add</span>
            <span className="truncate">Create New Client</span>
          </button>
          <button
            onClick={() => navigate('/broker/recycle-bin')}
            className="flex items-center justify-center rounded-xl h-12 sm:h-14 px-3 sm:px-4 bg-white border border-gray-200 text-[#617589] shadow-sm hover:bg-gray-50 transition-colors"
            title="Recycle Bin"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">delete_sweep</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-3 sm:px-4 py-2">
          <label className="flex flex-col min-w-40 h-10 sm:h-12 w-full">
            <div className="flex w-full flex-1 items-stretch rounded-xl h-full shadow-sm">
              <div className="text-[#617589] flex border-none bg-white items-center justify-center pl-3 sm:pl-4 rounded-l-xl border-r-0">
                <span className="material-symbols-outlined text-[20px] sm:text-[22px]">search</span>
              </div>
              <input
                className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-xl text-[#111418] focus:outline-0 focus:ring-0 border-none bg-white h-full placeholder:text-[#617589] px-3 sm:px-4 pl-2 text-sm sm:text-base font-normal leading-normal"
                placeholder="Search by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </label>
        </div>

        {/* Client List */}
        <div className="px-3 sm:px-4 mt-3 sm:mt-4">
          <h3 className="text-[#617589] text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2.5 sm:mb-3 px-1">
            {activeFilterCount > 0 ? 'Filtered' : 'All'} Clients ({pagination.total})
          </h3>

          <div className="space-y-3 sm:space-y-4">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 animate-pulse">
                  <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
                    <div className="size-12 sm:size-14 rounded-full bg-gray-200"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-24"></div>
                    </div>
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <span className="material-symbols-outlined text-[56px] text-red-300 mb-3">error</span>
                <p className="text-[#111418] text-base font-semibold mb-1">{error}</p>
                <button onClick={fetchClients} className="text-[#137fec] text-sm font-semibold mt-2">Retry</button>
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
                <span className="material-symbols-outlined text-[56px] sm:text-[64px] text-gray-300 mb-3 sm:mb-4">group_off</span>
                <p className="text-[#111418] text-base sm:text-lg font-semibold mb-1 sm:mb-2">No clients found</p>
                <p className="text-[#617589] text-xs sm:text-sm text-center">Try adjusting your search criteria</p>
              </div>
            ) : (
              clients.map((client) => (
                <div
                  key={client.id}
                  className={`bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 ${client.status === 'blocked' ? 'opacity-80' : ''}`}
                >
                  <div
                    className="flex gap-3 sm:gap-4 p-3 sm:p-4 justify-between border-b border-gray-100 cursor-pointer"
                    onClick={() => navigate(`/broker/clients/${client.id}`)}
                  >
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div className="relative">
                        <div className={`rounded-full h-12 w-12 sm:h-14 sm:w-14 border-2 ${client.status === 'blocked' ? 'border-red-200' : 'border-[#137fec]/10'} flex items-center justify-center bg-[#137fec]`}>
                          <span className="text-white text-sm sm:text-base font-bold">
                            {client.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className={`absolute bottom-0 right-0 h-3.5 w-3.5 sm:h-4 sm:w-4 ${getOnlineIndicator(client.status)} border-2 border-white rounded-full`}></div>
                      </div>
                      <div className="flex flex-1 flex-col justify-center">
                        <p className="text-[#111418] text-sm sm:text-base font-bold leading-tight">{client.name}</p>
                        <p className="text-[#617589] text-xs sm:text-sm font-medium leading-normal">ID: {client.id}</p>
                        <div className="flex items-center mt-1 gap-1 flex-wrap">
                          <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${getStatusColor(client.status)}`}>
                            {client.status}
                          </span>
                          {client.blockedByAdmin && (
                            <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-purple-100 text-purple-700">
                              Admin Suspended
                            </span>
                          )}
                          {client.dealerMode && (
                            <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-purple-100 text-purple-700">
                              Dealer Mode
                            </span>
                          )}
                          {client.status !== 'blocked' && !client.tradingEnabled && (
                            <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-orange-100 text-orange-700">
                              No Trading
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end justify-between">
                      <button
                        className={`${client.status === 'blocked' || client.blockedByAdmin ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#137fec]/10 text-[#137fec]'} p-1.5 sm:p-2 rounded-lg flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold`}
                        disabled={client.status === 'blocked' || client.blockedByAdmin}
                        onClick={(e) => { e.stopPropagation(); handleLoginAs(client.id); }}
                        title={client.blockedByAdmin ? 'Account suspended by admin' : undefined}
                      >
                        <span className="material-symbols-outlined text-base sm:text-lg">login</span>
                        <span>View</span>
                      </button>
                    </div>
                  </div>
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => handleCredentials(client.id)}
                      disabled={actionLoading === client.id}
                      className="flex items-center gap-1 sm:gap-1.5 text-[#137fec] text-xs sm:text-sm font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-white shadow-sm border border-gray-200"
                    >
                      <span className="material-symbols-outlined text-[16px] sm:text-[18px]">key</span>
                      <span>Credentials</span>
                    </button>
                    {client.blockedByAdmin ? (
                      <div className="flex items-center gap-1.5 text-purple-600 text-xs sm:text-sm font-medium">
                        <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                        <span>Admin control only</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <button onClick={() => setDeleteConfirm(client.id)} className="flex flex-col items-center">
                          <div className="rounded-full bg-white border border-gray-200 p-1.5 sm:p-2 text-red-500 cursor-pointer hover:bg-red-50">
                            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">delete</span>
                          </div>
                          <p className="text-[9px] sm:text-[10px] mt-0.5 sm:mt-1 font-medium text-[#617589]">Delete</p>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {!loading && !error && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 sm:mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center justify-center size-9 sm:size-10 rounded-xl bg-white border border-gray-200 shadow-sm disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === pagination.pages || Math.abs(p - page) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="text-[#617589] text-sm px-1">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`flex items-center justify-center size-9 sm:size-10 rounded-xl text-sm font-bold transition-colors ${
                        page === p
                          ? 'bg-[#137fec] text-white shadow-sm'
                          : 'bg-white border border-gray-200 text-[#111418] shadow-sm hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="flex items-center justify-center size-9 sm:size-10 rounded-xl bg-white border border-gray-200 shadow-sm disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Credentials Modal */}
      {credentialsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCredentialsModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111418] text-lg font-bold">Client Credentials</h3>
              <button onClick={() => setCredentialsModal(null)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-3">
              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[#617589] text-xs font-medium mb-1">Client ID</p>
                <p className="text-[#111418] text-sm font-bold font-mono">{credentialsModal.id}</p>
              </div>
              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[#617589] text-xs font-medium mb-1">Password</p>
                <p className="text-[#111418] text-sm font-bold font-mono">{credentialsModal.password}</p>
              </div>
            </div>
            <button
              onClick={() => setCredentialsModal(null)}
              className="w-full mt-4 h-11 bg-[#137fec] text-white rounded-xl font-bold text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="size-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-red-500 text-[28px]">delete_forever</span>
              </div>
              <h3 className="text-[#111418] text-lg font-bold mb-1">Delete Client?</h3>
              <p className="text-[#617589] text-sm">This will move the client to recycle bin. Are you sure?</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={actionLoading === deleteConfirm}
                className="flex-1 h-11 bg-red-500 text-white rounded-xl font-bold text-sm"
              >
                {actionLoading === deleteConfirm ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Filter Bottom Sheet */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowFilters(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm sm:mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Drag handle */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300"></div>
            </div>

            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-[#111418] text-lg font-bold">Filters</h3>
              <button onClick={() => setShowFilters(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="px-4 pb-2 space-y-4">
              {/* Status Filter */}
              <div>
                <p className="text-xs font-bold text-[#617589] uppercase tracking-wider mb-2">Account Status</p>
                <div className="flex flex-wrap gap-2">
                  {FILTER_OPTIONS.status.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPendingFilters(prev => ({ ...prev, status: opt.value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        pendingFilters.status === opt.value
                          ? 'bg-[#137fec] text-white'
                          : 'bg-[#f6f7f8] text-[#617589] hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trading Filter */}
              <div>
                <p className="text-xs font-bold text-[#617589] uppercase tracking-wider mb-2">Trading</p>
                <div className="flex flex-wrap gap-2">
                  {FILTER_OPTIONS.trading.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPendingFilters(prev => ({ ...prev, trading: opt.value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        pendingFilters.trading === opt.value
                          ? 'bg-[#137fec] text-white'
                          : 'bg-[#f6f7f8] text-[#617589] hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-4 pt-3">
              <button
                onClick={() => {
                  setPendingFilters({ status: 'all', trading: 'all' });
                  setFilters({ status: 'all', trading: 'all' });
                  setShowFilters(false);
                }}
                className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm"
              >
                Clear All
              </button>
              <button
                onClick={() => {
                  setFilters(pendingFilters);
                  setShowFilters(false);
                }}
                className="flex-1 h-11 bg-[#137fec] text-white rounded-xl font-bold text-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientList;
