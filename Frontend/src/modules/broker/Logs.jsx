import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const activityFilters = [
  { key: 'all', label: 'All' },
  { key: 'order', label: 'Orders' },
  { key: 'order_modify', label: 'Modified' },
  { key: 'payment', label: 'Payments' },
  { key: 'client_joined', label: 'Clients' },
];

const getActivityIcon = (type) => {
  switch (type) {
    case 'order':
      return 'shopping_bag';
    case 'order_modify':
      return 'edit_note';
    case 'payment':
      return 'payments';
    case 'client_joined':
      return 'person_add';
    default:
      return 'notifications';
  }
};

const getActivityColors = (type) => {
  switch (type) {
    case 'order':
      return { bg: 'bg-blue-50', text: 'text-[#137fec]' };
    case 'order_modify':
      return { bg: 'bg-purple-50', text: 'text-purple-600' };
    case 'payment':
      return { bg: 'bg-amber-50', text: 'text-amber-600' };
    case 'client_joined':
      return { bg: 'bg-green-50', text: 'text-green-600' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-600' };
  }
};

const getStatusStyles = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'EXECUTED' || normalized === 'VERIFIED' || normalized === 'APPROVED') return 'bg-green-100 text-green-700';
  if (normalized === 'PENDING' || normalized === 'PENDING_PROOF') return 'bg-orange-100 text-orange-700';
  if (normalized === 'REJECTED') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Logs = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [activities, setActivities] = useState([]);

  const fetchActivity = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const response = await brokerApi.getActivityFeed({ limit: 100 });
      setActivities(response.activities || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch logs.');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity(false);
  }, [fetchActivity]);

  const filteredActivities = useMemo(() => {
    if (selectedFilter === 'all') return activities;
    return activities.filter((activity) => activity.type === selectedFilter);
  }, [activities, selectedFilter]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7f8]">
      <div className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3">
          <button
            onClick={() => navigate(-1)}
            className="flex size-9 items-center justify-center rounded-full hover:bg-gray-100 sm:size-10"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
          </button>
          <h2 className="text-base font-bold sm:text-lg">Activity Logs</h2>
          <button
            onClick={() => fetchActivity(true)}
            disabled={refreshing}
            className="flex size-9 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50 sm:size-10"
            title="Refresh logs"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">refresh</span>
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto px-3 pb-3 sm:px-4 no-scrollbar">
          {activityFilters.map((filter) => {
            const isActive = selectedFilter === filter.key;
            return (
              <button
                key={filter.key}
                onClick={() => setSelectedFilter(filter.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#137fec] text-white'
                    : 'bg-white text-[#617589] border border-gray-200'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-xl bg-white shadow-sm" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <span className="material-symbols-outlined mb-2 text-[40px] text-gray-300">history</span>
            <p className="text-sm text-[#617589]">No activity logs found.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredActivities.map((activity, idx) => {
              const colors = getActivityColors(activity.type);
              return (
                <div
                  key={`${activity.type || 'activity'}-${activity.timestamp || idx}-${idx}`}
                  className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${colors.bg} ${colors.text}`}>
                      <span className="material-symbols-outlined text-[20px]">{getActivityIcon(activity.type)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-[#111418]">{activity.user || 'System'}</p>
                        <p className="shrink-0 text-[10px] text-[#617589]">{formatTimestamp(activity.timestamp)}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-[#617589]">{activity.message || 'No message'}</p>
                      {activity.type === 'order_modify' && activity.meta && (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-purple-50 px-3 py-2">
                          <div>
                            <p className="text-[9px] font-semibold uppercase text-purple-400">Old Qty</p>
                            <p className="text-xs font-bold text-[#111418]">{activity.meta.old_quantity ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold uppercase text-purple-400">New Qty</p>
                            <p className="text-xs font-bold text-[#111418]">
                              {activity.meta.new_quantity ?? '—'}
                              {activity.meta.added_lots > 0 && (
                                <span className="ml-1 text-[9px] font-semibold text-purple-600">+{activity.meta.added_lots} lots</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold uppercase text-purple-400">Old Avg</p>
                            <p className="text-xs font-bold text-[#111418]">
                              {activity.meta.old_price != null ? `₹${Number(activity.meta.old_price).toFixed(2)}` : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold uppercase text-purple-400">New Avg</p>
                            <p className="text-xs font-bold text-purple-700">
                              {activity.meta.new_price != null ? `₹${Number(activity.meta.new_price).toFixed(2)}` : '—'}
                            </p>
                          </div>
                        </div>
                      )}
                      {activity.status && (
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusStyles(activity.status)}`}>
                          {String(activity.status).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Logs;
