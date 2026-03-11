import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const RecycleBin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(null);

  const fetchDeletedClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await brokerApi.getDeletedClients();
      setClients(response.clients || []);
    } catch (err) {
      setError(err.message || 'Failed to load recycle bin');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeletedClients();
  }, [fetchDeletedClients]);

  const handleRestore = async (deletedId) => {
    setActionLoading(deletedId);
    try {
      await brokerApi.restoreClient(deletedId);
      setClients(prev => prev.filter(c => c._id !== deletedId));
      setRestoreConfirm(null);
    } catch (err) {
      console.error('Failed to restore client:', err);
      setError(err.message || 'Failed to restore client');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '---';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDaysLeft = (expiresAt) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt) - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200">
        <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
        </button>
        <h1 className="text-base sm:text-lg font-bold flex-1 text-center">Recycle Bin</h1>
        <div className="size-9 sm:size-10"></div>
      </div>

      <main className="flex-1 pb-6">
        {/* Info Banner */}
        <div className="mx-3 sm:mx-4 mt-3 sm:mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-500 text-[18px] mt-0.5">info</span>
          <p className="text-amber-800 text-xs sm:text-sm">Deleted clients are automatically removed after 30 days. Restore before expiry to recover all data.</p>
        </div>

        {/* Client List */}
        <div className="px-3 sm:px-4 mt-3 sm:mt-4">
          <h3 className="text-[#617589] text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2.5 sm:mb-3 px-1">
            Deleted Clients ({clients.length})
          </h3>

          <div className="space-y-3">
            {loading ? (
              [1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 animate-pulse">
                  <div className="flex gap-3 p-3 sm:p-4">
                    <div className="size-12 rounded-full bg-gray-200"></div>
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
                <button onClick={fetchDeletedClients} className="text-[#137fec] text-sm font-semibold mt-2">Retry</button>
              </div>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
                <span className="material-symbols-outlined text-[56px] sm:text-[64px] text-gray-300 mb-3 sm:mb-4">delete_sweep</span>
                <p className="text-[#111418] text-base sm:text-lg font-semibold mb-1 sm:mb-2">Recycle bin is empty</p>
                <p className="text-[#617589] text-xs sm:text-sm text-center">No deleted clients to show</p>
              </div>
            ) : (
              clients.map((client) => {
                const daysLeft = getDaysLeft(client.expiresAt);
                const initials = client.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

                return (
                  <div key={client._id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200">
                    <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
                      <div className="relative">
                        <div className="rounded-full h-12 w-12 sm:h-14 sm:w-14 border-2 border-gray-200 flex items-center justify-center bg-gray-400">
                          <span className="text-white text-sm sm:text-base font-bold">{initials}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#111418] text-sm sm:text-base font-bold leading-tight">{client.name}</p>
                        <p className="text-[#617589] text-xs sm:text-sm font-medium">ID: {client.customerId}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] sm:text-xs text-[#617589]">
                          <span>Deleted: {formatDate(client.deletedAt)}</span>
                          {daysLeft !== null && (
                            <span className={`font-bold ${daysLeft <= 7 ? 'text-red-500' : 'text-amber-600'}`}>
                              {daysLeft}d left
                            </span>
                          )}
                        </div>
                        {client.dataSummary && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-[#617589]">
                            {client.dataSummary.total_orders > 0 && <span>{client.dataSummary.total_orders} orders</span>}
                            {client.dataSummary.total_holdings > 0 && <span>{client.dataSummary.total_holdings} holdings</span>}
                            {client.dataSummary.fund_balance > 0 && (
                              <span>Balance: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(client.dataSummary.fund_balance)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 flex items-center justify-end border-t border-gray-100">
                      <button
                        onClick={() => setRestoreConfirm(client)}
                        disabled={actionLoading === client._id}
                        className="flex items-center gap-1.5 text-[#137fec] text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg bg-white shadow-sm border border-gray-200 hover:bg-blue-50 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">restore</span>
                        <span>{actionLoading === client._id ? 'Restoring...' : 'Restore'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Restore Confirmation Modal */}
      {restoreConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRestoreConfirm(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="size-14 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[#137fec] text-[28px]">restore</span>
              </div>
              <h3 className="text-[#111418] text-lg font-bold mb-1">Restore {restoreConfirm.name}?</h3>
              <p className="text-[#617589] text-sm">This will restore the client account with trading disabled. You can enable trading afterward.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRestoreConfirm(null)}
                className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestore(restoreConfirm._id)}
                disabled={actionLoading === restoreConfirm._id}
                className="flex-1 h-11 bg-[#137fec] text-white rounded-xl font-bold text-sm"
              >
                {actionLoading === restoreConfirm._id ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecycleBin;
