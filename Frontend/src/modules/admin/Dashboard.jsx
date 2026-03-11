import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../api/admin';
import { useAdminAuth } from '../../context/AdminContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const { admin: authAdmin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [admin, setAdmin] = useState({
    name: authAdmin?.name || 'Admin',
    avatar: null
  });

  const [stats, setStats] = useState({
    customers: '0',
    customersChange: '+0%',
    brokers: 0,
    brokersChange: '+0%',
    activeUsers: '0',
    totalAUM: '₹ 0 Cr',
    aumChange: '+0%'
  });

  const [recentActivity, setRecentActivity] = useState([]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getDashboard();
      const data = response.data || response;

      // Map from backend shape: { brokers: {total,active}, customers: {total,active}, kyc: {pending}, financials: {totalAum} }
      if (data) {
        const totalAum = data.financials?.totalAum || 0;
        setStats({
          customers: (data.customers?.total || 0).toLocaleString(),
          customersChange: data.customers?.active ? `${data.customers.active} active` : '+0%',
          brokers: data.brokers?.total || 0,
          brokersChange: data.brokers?.active ? `${data.brokers.active} active` : '+0%',
          activeUsers: (data.trading?.todayOrders || 0).toLocaleString(),
          totalAUM: `₹ ${totalAum ? (totalAum / 10000000).toFixed(2) : '0'} Cr`,
          aumChange: '+0%'
        });
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const quickActions = [
    { icon: 'manage_accounts', label: 'User\nMgmt', path: '/admin/customers' },
    { icon: 'chat', label: 'Support\nChats', path: '/admin/chats' },
    { icon: 'assessment', label: 'Reports', path: '/admin/reports' },
    { icon: 'settings_applications', label: 'System', path: '/admin/settings' }
  ];

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="size-9 sm:size-10 rounded-full bg-[#137fec]/10 flex items-center justify-center border border-gray-200">
            <span className="material-symbols-outlined text-[#137fec] text-[18px] sm:text-[20px]">shield_person</span>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Admin Dashboard</h1>
            <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Welcome back, {admin.name}</p>
          </div>
        </div>
        <button className="flex items-center justify-center size-9 sm:size-10 rounded-full hover:bg-gray-100 transition-colors relative">
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">notifications</span>
          <span className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 size-2 bg-red-500 rounded-full border border-white"></span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-4 sm:gap-6 p-3 sm:p-4">
        {/* Stats Grid */}
        <section>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {/* Card 1 */}
            <div className="flex flex-col gap-1 rounded-xl p-3 sm:p-4 bg-white shadow-sm border border-gray-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                <div className="p-1 sm:p-1.5 rounded-md bg-blue-50 text-[#137fec]">
                  <span className="material-symbols-outlined text-[16px] sm:text-[20px]">group</span>
                </div>
                <p className="text-gray-500 text-[10px] sm:text-xs font-medium uppercase tracking-wide">Customers</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-tight">{stats.customers}</p>
              <p className="text-green-600 text-[10px] sm:text-xs font-bold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px] sm:text-[14px]">trending_up</span>
                {stats.customersChange}
              </p>
            </div>

            {/* Card 2 */}
            <div className="flex flex-col gap-1 rounded-xl p-3 sm:p-4 bg-white shadow-sm border border-gray-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                <div className="p-1 sm:p-1.5 rounded-md bg-purple-50 text-purple-600">
                  <span className="material-symbols-outlined text-[16px] sm:text-[20px]">badge</span>
                </div>
                <p className="text-gray-500 text-[10px] sm:text-xs font-medium uppercase tracking-wide">Brokers</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-tight">{stats.brokers}</p>
              <p className="text-green-600 text-[10px] sm:text-xs font-bold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px] sm:text-[14px]">trending_up</span>
                {stats.brokersChange}
              </p>
            </div>

            {/* Card 3 */}
            <div className="flex flex-col gap-1 rounded-xl p-3 sm:p-4 bg-white shadow-sm border border-gray-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                <div className="p-1 sm:p-1.5 rounded-md bg-green-50 text-green-600">
                  <span className="material-symbols-outlined text-[16px] sm:text-[20px]">sensors</span>
                </div>
                <p className="text-gray-500 text-[10px] sm:text-xs font-medium uppercase tracking-wide">Active Users</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-tight">{stats.activeUsers}</p>
              <p className="text-gray-500 text-[10px] sm:text-xs font-medium">Live Now</p>
            </div>

            {/* Card 4 */}
            <div className="flex flex-col gap-1 rounded-xl p-3 sm:p-4 bg-white shadow-sm border border-gray-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                <div className="p-1 sm:p-1.5 rounded-md bg-orange-50 text-orange-600">
                  <span className="material-symbols-outlined text-[16px] sm:text-[20px]">account_balance</span>
                </div>
                <p className="text-gray-500 text-[10px] sm:text-xs font-medium uppercase tracking-wide">Total AUM</p>
              </div>
              <p className="text-lg sm:text-xl font-bold leading-tight truncate">{stats.totalAUM}</p>
              <p className="text-green-600 text-[10px] sm:text-xs font-bold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px] sm:text-[14px]">trending_up</span>
                {stats.aumChange}
              </p>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h3 className="text-base sm:text-lg font-bold leading-tight mb-3 sm:mb-4 px-1">Quick Actions</h3>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((action, index) => (
              <button 
                key={index}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-1.5 sm:gap-2 group"
              >
                <div className="size-12 sm:size-14 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center group-active:scale-95 transition-transform">
                  <span className="material-symbols-outlined text-[#137fec] text-xl sm:text-2xl">{action.icon}</span>
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-center text-gray-700 leading-tight whitespace-pre-line">{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <h3 className="text-base sm:text-lg font-bold leading-tight mb-2.5 sm:mb-3 px-1">Recent Activity</h3>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {recentActivity.map(activity => (
              <div key={activity.id} className="p-3 sm:p-4 flex gap-2.5 sm:gap-3 items-start">
                <div className={`size-2 mt-1.5 sm:mt-2 rounded-full shrink-0 ${
                  activity.type === 'success' ? 'bg-green-500' :
                  activity.type === 'info' ? 'bg-blue-500' :
                  'bg-orange-500'
                }`}></div>
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium">{activity.message}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full max-w-md mx-auto bg-white border-t border-gray-200 z-30">
        <div className="flex justify-around items-center h-14 sm:h-16">
          <button 
            onClick={() => navigate('/admin/dashboard')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-[#137fec]"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">dashboard</span>
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => navigate('/admin/customers')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">group</span>
            <span className="text-[10px] font-medium">Customers</span>
          </button>
          <button 
            onClick={() => navigate('/admin/brokers')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">corporate_fare</span>
            <span className="text-[10px] font-medium">Brokers</span>
          </button>
          <button 
            onClick={() => navigate('/admin/chats')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chat</span>
            <span className="text-[10px] font-medium">Chats</span>
          </button>
          <button 
            onClick={() => navigate('/admin/settings')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">settings</span>
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Dashboard;