import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../api/admin';

const AdminFunds = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [financials, setFinancials] = useState({
    totalAum: 0,
    totalIntradayLimit: 0,
    totalOvernightLimit: 0,
  });

  const fetchFinancials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getDashboard();
      const data = response.data || response;
      if (data?.financials) {
        setFinancials(data.financials);
      }
    } catch (err) {
      console.error('Failed to fetch financials:', err);
      setError(err.message || 'Failed to load fund data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFinancials();
  }, [fetchFinancials]);

  const formatCurrency = (amount) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString()}`;
  };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Fund Oversight</h1>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Total AUM Card */}
            <div className="bg-gradient-to-br from-[#137fec] to-blue-600 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[20px] opacity-80">account_balance</span>
                <p className="text-sm font-medium opacity-80">Total Assets Under Management</p>
              </div>
              <p className="text-3xl font-bold">{formatCurrency(financials.totalAum)}</p>
              <p className="text-xs opacity-60 mt-1">Across all customer accounts</p>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="size-7 rounded-lg bg-green-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-green-600 text-[16px]">trending_up</span>
                  </div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Intraday Limits</p>
                </div>
                <p className="text-lg font-bold">{formatCurrency(financials.totalIntradayLimit)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="size-7 rounded-lg bg-purple-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-purple-600 text-[16px]">inventory_2</span>
                  </div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Delivery Limits</p>
                </div>
                <p className="text-lg font-bold">{formatCurrency(financials.totalOvernightLimit)}</p>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold mb-2">Fund Overview</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                This page shows the total funds managed across all customer accounts on the platform.
                For individual customer fund management, visit the customer detail page.
              </p>
            </div>
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full max-w-md mx-auto bg-white border-t border-gray-200 z-30">
        <div className="flex justify-around items-center h-14 sm:h-16">
          <button onClick={() => navigate('/admin/dashboard')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">dashboard</span>
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          <button onClick={() => navigate('/admin/customers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
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

export default AdminFunds;
