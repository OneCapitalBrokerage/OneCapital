import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../api/admin';

const Reports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('7d');
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getStats({ period });
      setStats(response.data || response);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const periods = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
  ];

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Reports & Analytics</h1>
        </div>

        {/* Period Selector */}
        <div className="flex gap-2">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                period === p.key
                  ? 'bg-[#137fec] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-blue-500">person_add</span>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">New Customers</p>
                </div>
                <p className="text-xl font-bold">{stats.summary?.newCustomers || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-purple-500">badge</span>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">New Brokers</p>
                </div>
                <p className="text-xl font-bold">{stats.summary?.newBrokers || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-green-500">receipt_long</span>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Orders</p>
                </div>
                <p className="text-xl font-bold">{stats.summary?.ordersInPeriod || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[16px] text-orange-500">verified</span>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">KYC Approved</p>
                </div>
                <p className="text-xl font-bold">{stats.summary?.kycApprovedInPeriod || 0}</p>
              </div>
            </div>

            {/* Daily Orders Chart */}
            {stats.charts?.dailyOrders?.length > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold mb-3">Daily Orders</h3>
                <div className="flex items-end gap-1 h-24">
                  {stats.charts.dailyOrders.map((day, i) => {
                    const max = Math.max(...stats.charts.dailyOrders.map(d => d.count));
                    const height = max > 0 ? (day.count / max) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] text-gray-500">{day.count}</span>
                        <div
                          className="w-full bg-[#137fec] rounded-t"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        ></div>
                        <span className="text-[8px] text-gray-400">{day._id?.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily Signups Chart */}
            {stats.charts?.dailySignups?.length > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold mb-3">Daily Signups</h3>
                <div className="flex items-end gap-1 h-24">
                  {stats.charts.dailySignups.map((day, i) => {
                    const max = Math.max(...stats.charts.dailySignups.map(d => d.count));
                    const height = max > 0 ? (day.count / max) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] text-gray-500">{day.count}</span>
                        <div
                          className="w-full bg-green-500 rounded-t"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        ></div>
                        <span className="text-[8px] text-gray-400">{day._id?.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : null}
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

export default Reports;
