import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';
import { useBrokerAuth } from '../../context/BrokerContext';

const toCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { broker: authBroker } = useBrokerAuth();
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);

  const [broker, setBroker] = useState({
    name: authBroker?.name || 'Broker',
    companyName: ''
  });

  const [stats, setStats] = useState({
    totalAum: 0,
    totalClients: 0,
    activeClients: 0,
    todayOrders: 0,
    pendingKyc: 0,
    pendingApprovals: 0,
    approvalBreakdown: {
      registrationPending: 0,
      kycPending: 0,
      cncPending: 0,
      withdrawalPending: 0,
      paymentPending: 0,
    },
  });

  const [alerts, setAlerts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const [dashboardRes, profileRes, alertsRes, activityRes] = await Promise.all([
        brokerApi.getDashboard().catch(() => null),
        brokerApi.getProfile().catch(() => null),
        brokerApi.getAlerts().catch(() => null),
        brokerApi.getActivityFeed({ limit: 5 }).catch(() => null),
      ]);

      if (dashboardRes?.data) {
        const d = dashboardRes.data;
        const approvals = d.approvals || {};
        const registrationPending = toCount(approvals.registrationPending ?? d.kyc?.pending);
        const kycPending = toCount(approvals.kycPending);
        const cncPending = toCount(approvals.cncPending);
        const withdrawalPending = toCount(approvals.withdrawalPending);
        const paymentPending = toCount(approvals.paymentPending);
        const pendingApprovals = toCount(
          approvals.totalPending
          ?? (registrationPending + kycPending + cncPending + withdrawalPending + paymentPending)
        );

        setStats({
          totalAum: toCount(d.financials?.totalAum),
          totalClients: toCount(d.clients?.total),
          activeClients: toCount(d.clients?.active),
          todayOrders: toCount(d.trading?.todayOrders),
          pendingKyc: registrationPending,
          pendingApprovals,
          approvalBreakdown: {
            registrationPending,
            kycPending,
            cncPending,
            withdrawalPending,
            paymentPending,
          },
        });
      }

      if (profileRes?.profile) {
        const p = profileRes.profile;
        setBroker({
          name: p.ownerName || p.name || authBroker?.name || 'Broker',
          companyName: p.companyName || ''
        });
      }

      setAlerts(alertsRes?.alerts || []);

      setRecentActivity((activityRes?.activities || []).slice(0, 5));
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      if (!silent) setError(err.message || 'Failed to load dashboard data');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authBroker]);

  useEffect(() => {
    fetchDashboardData();
    const intervalId = setInterval(() => {
      fetchDashboardData({ silent: true });
    }, 30000);
    return () => clearInterval(intervalId);
  }, [fetchDashboardData]);

  const formatCurrency = (value) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)} L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const quickActions = [
    { key: 'add_client', icon: 'person_add', label: 'Add Client', path: '/broker/clients' },
    { key: 'approvals', icon: 'task_alt', label: 'Approvals', path: '/broker/approvals' },
    { key: 'manage', icon: 'tune', label: 'Manage', path: '/broker/management' },
    { key: 'logs', icon: 'history', label: 'Logs', path: '/broker/logs' },
  ];

  const getAlertIcon = (type) => {
    switch (type) {
      case 'margin_warning': return 'warning';
      case 'kyc_pending': return 'verified_user';
      case 'approvals_pending': return 'pending_actions';
      case 'blocked_clients': return 'block';
      default: return 'info';
    }
  };

  const getAlertColor = (severity) => {
    return severity === 'warning' ? 'red' : 'blue';
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'order': return 'shopping_bag';
      case 'client_joined': return 'person_add';
      case 'payment': return 'payments';
      default: return 'notifications';
    }
  };

  const getActivityColor = (type) => {
    switch (type) {
      case 'order': return { bg: 'bg-blue-50', text: 'text-[#137fec]' };
      case 'client_joined': return { bg: 'bg-green-50', text: 'text-green-600' };
      default: return { bg: 'bg-gray-50', text: 'text-gray-600' };
    }
  };

  const timeAgo = (timestamp) => {
    if (!timestamp) return '';
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const pendingBreakdownText = [
    ['Reg', stats.approvalBreakdown.registrationPending],
    ['KYC', stats.approvalBreakdown.kycPending],
    ['CNC', stats.approvalBreakdown.cncPending],
    ['WD', stats.approvalBreakdown.withdrawalPending],
    ['Pay', stats.approvalBreakdown.paymentPending],
  ]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}: ${count}`)
    .join(' • ');

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8] pb-20">
      {/* Header */}
      <header className="flex items-center bg-white p-3 sm:p-4 sticky top-0 z-20 shadow-sm">
        <div className="flex shrink-0 items-center mr-2.5 sm:mr-3">
          <div className="bg-[#137fec] rounded-full size-9 sm:size-10 flex items-center justify-center">
            <span className="text-white text-sm sm:text-base font-bold">
              {broker.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'B'}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[10px] sm:text-xs text-gray-500 font-medium">{getGreeting()},</h2>
          <h1 className="text-[#111418] text-base sm:text-lg font-bold leading-tight truncate">{broker.name}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button className="flex items-center justify-center rounded-full size-9 sm:size-10 text-[#111418] hover:bg-gray-100 transition-colors">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">search</span>
          </button>
          <button className="relative flex items-center justify-center rounded-full size-9 sm:size-10 text-[#111418] hover:bg-gray-100 transition-colors">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">notifications</span>
            {alerts.length > 0 && (
              <span className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 size-2 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </button>
        </div>
      </header>

      <div className="p-3 sm:p-4 flex flex-col gap-4 sm:gap-5">
        {/* Performance Overview */}
        <section>
          <h3 className="text-[#111418] text-sm sm:text-base font-bold mb-2.5 sm:mb-3">Performance Overview</h3>
          <div className="bg-[#137fec] rounded-xl p-4 sm:p-5 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-32 sm:w-40 h-32 sm:h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute -left-10 -bottom-10 w-24 sm:w-32 h-24 sm:h-32 bg-black/10 rounded-full blur-xl pointer-events-none"></div>

            <div className="relative z-10">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-4 bg-white/20 rounded w-32 mb-2"></div>
                  <div className="h-8 bg-white/20 rounded w-24 mb-5"></div>
                  <div className="flex gap-4">
                    <div className="h-12 bg-white/20 rounded flex-1"></div>
                    <div className="h-12 bg-white/20 rounded flex-1"></div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4 sm:mb-5">
                    <p className="text-blue-100 text-xs sm:text-sm font-medium mb-0.5 sm:mb-1">Total Assets (AUM)</p>
                    <p className="text-[26px] sm:text-3xl font-bold tracking-tight">{formatCurrency(stats.totalAum)}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-white/20">
                    <div className="flex-1">
                      <p className="text-blue-100 text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1">Today's Orders</p>
                      <p className="text-base sm:text-lg font-bold">{stats.todayOrders}</p>
                    </div>
                    <div className="w-px h-7 sm:h-8 bg-white/20"></div>
                    <div className="flex-1">
                      <p className="text-blue-100 text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1">Active Clients</p>
                      <p className="text-base sm:text-lg font-bold">{stats.activeClients}<span className="text-xs sm:text-sm font-normal text-blue-200">/{stats.totalClients}</span></p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h3 className="text-[#111418] text-sm sm:text-base font-bold mb-2.5 sm:mb-3">Quick Actions</h3>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {quickActions.map((action) => (
              <button
                key={action.key}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-1.5 sm:gap-2 group"
              >
                <div className="relative size-12 sm:size-14 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-gray-100 group-active:scale-95 transition-transform">
                  <span className="material-symbols-outlined text-[#137fec] text-[24px] sm:text-[28px]">{action.icon}</span>
                  {action.key === 'approvals' && stats.pendingApprovals > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {stats.pendingApprovals > 99 ? '99+' : stats.pendingApprovals}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-center text-gray-600 leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Alerts */}
        {alerts.length > 0 && (
          <section className="flex flex-col gap-2.5">
            {alerts.map((alert, index) => {
              const color = getAlertColor(alert.severity);
              return (
                <div
                  key={index}
                  className={`flex items-start gap-3 rounded-xl border ${color === 'red' ? 'border-red-100' : 'border-blue-100'} bg-white p-3 sm:p-4 shadow-sm relative overflow-hidden`}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${color === 'red' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                  <div className="flex-1 pl-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`material-symbols-outlined ${color === 'red' ? 'text-red-500' : 'text-blue-500'} text-base sm:text-lg`}>{getAlertIcon(alert.type)}</span>
                      <p className="text-[#111418] text-xs sm:text-sm font-bold leading-tight capitalize">{alert.type.replace(/_/g, ' ')}</p>
                    </div>
                    <p className="text-gray-500 text-[11px] sm:text-xs">{alert.message}</p>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Pending Approvals Summary */}
        {stats.pendingApprovals > 0 && (
          <section>
            <button
              onClick={() => navigate('/broker/approvals')}
              className="w-full flex items-center justify-between bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-orange-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-orange-500 text-[20px]">pending_actions</span>
                </div>
                <div className="text-left">
                  <p className="text-[#111418] text-sm font-bold">Pending Approvals</p>
                  <p className="text-[#617589] text-xs">
                    {stats.pendingApprovals} total pending actions
                    {pendingBreakdownText ? ` (${pendingBreakdownText})` : ''}
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-gray-400 text-[20px]">chevron_right</span>
            </button>
          </section>
        )}

        {/* Recent Activity */}
        <section>
          <div className="flex items-center justify-between mb-2.5 sm:mb-3">
            <h3 className="text-[#111418] text-sm sm:text-base font-bold">Recent Activity</h3>
          </div>
          <div className="flex flex-col gap-2.5 sm:gap-3">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2.5 sm:gap-3 rounded-xl bg-white p-2.5 sm:p-3 shadow-sm border border-gray-100 animate-pulse">
                  <div className="size-9 sm:size-10 rounded-full bg-gray-200"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-32"></div>
                  </div>
                </div>
              ))
            ) : recentActivity.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="material-symbols-outlined text-[40px] text-gray-300 mb-2">history</span>
                <p className="text-[#617589] text-sm">No recent activity</p>
              </div>
            ) : (
              recentActivity.slice(0, 5).map((activity, index) => {
                const colors = getActivityColor(activity.type);
                return (
                  <div
                    key={index}
                    className="flex items-start gap-2.5 sm:gap-3 rounded-xl bg-white p-2.5 sm:p-3 shadow-sm border border-gray-100"
                  >
                    <div className={`size-9 sm:size-10 rounded-full ${colors.bg} flex items-center justify-center shrink-0 ${colors.text}`}>
                      <span className="material-symbols-outlined text-lg sm:text-xl">{getActivityIcon(activity.type)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs sm:text-sm font-bold text-[#111418] truncate">
                          {activity.userName ? `${activity.userName} (${activity.user})` : activity.user || 'System'}
                        </h4>
                        <span className="text-[9px] sm:text-[10px] font-medium text-gray-400 bg-gray-50 px-1 sm:px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">{timeAgo(activity.timestamp)}</span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">{activity.message}</p>
                      {activity.status && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`size-1.5 rounded-full ${
                            activity.status === 'EXECUTED' ? 'bg-green-500' :
                            activity.status === 'PENDING' ? 'bg-orange-500' : 'bg-gray-400'
                          }`}></span>
                          <span className={`text-[9px] sm:text-[10px] font-semibold ${
                            activity.status === 'EXECUTED' ? 'text-green-600' :
                            activity.status === 'PENDING' ? 'text-orange-600' : 'text-gray-600'
                          }`}>
                            {activity.status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
