import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../api/admin';

const EMPTY_LOG_FILTERS = {
  category: 'all',
  status: 'all',
  source: 'all',
  eventType: '',
  brokerId: '',
  customerId: '',
  minAmountDelta: '',
  maxAmountDelta: '',
  startDate: '',
  endDate: '',
};

const EMPTY_ALERT_FILTERS = {
  status: 'open',
  severity: 'all',
  ruleKey: '',
  brokerId: '',
  customerId: '',
  startDate: '',
  endDate: '',
};

const toTitleCase = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const humanizeToken = (value) => {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  return toTitleCase(text);
};

const formatMetaItems = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return [];

  return Object.entries(metadata)
    .filter(([, value]) => {
      const t = typeof value;
      return value !== null && t !== 'object' && t !== 'function';
    })
    .slice(0, 4)
    .map(([key, value]) => ({
      key: humanizeToken(key),
      value: String(value),
    }));
};

const Logs = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('events');
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState(null);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(null);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertStats, setAlertStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [logFilters, setLogFilters] = useState(EMPTY_LOG_FILTERS);
  const [alertFilters, setAlertFilters] = useState(EMPTY_ALERT_FILTERS);

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'security', label: 'Security' },
    { key: 'transaction', label: 'Transactions' },
    { key: 'withdrawals', label: 'Withdrawals' },
    { key: 'data', label: 'Data' },
    { key: 'system', label: 'System' },
  ];

  const WITHDRAWAL_EVENT_TYPES = [
    'WITHDRAWAL_REQUEST_CREATE',
    'WITHDRAWAL_APPROVE',
    'WITHDRAWAL_REJECT',
  ];

  const asParam = (value) => {
    if (value === null || value === undefined) return undefined;
    const str = String(value).trim();
    return str ? str : undefined;
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const isWithdrawalsTab = activeTab === 'withdrawals';
      const response = await adminApi.getLogs({
        type: !isWithdrawalsTab && activeTab !== 'all' ? activeTab : undefined,
        search: asParam(searchQuery),
        page: currentPage,
        limit: 50,
        category: isWithdrawalsTab ? 'funds' : (logFilters.category !== 'all' ? logFilters.category : undefined),
        status: logFilters.status !== 'all' ? logFilters.status : undefined,
        source: logFilters.source !== 'all' ? logFilters.source : undefined,
        eventType: isWithdrawalsTab
          ? 'WITHDRAWAL_*'
          : asParam(logFilters.eventType),
        brokerId: asParam(logFilters.brokerId),
        customerId: asParam(logFilters.customerId),
        minAmountDelta: asParam(logFilters.minAmountDelta),
        maxAmountDelta: asParam(logFilters.maxAmountDelta),
        startDate: asParam(logFilters.startDate),
        endDate: asParam(logFilters.endDate),
      });

      setLogs(response.logs || []);
      setTotalPages(response?.pagination?.pages || 1);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setError(err.message || 'Failed to load logs');
      setLogs([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, currentPage, logFilters]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [alertsRes, statsRes] = await Promise.all([
        adminApi.getAuditAlerts({
          page: currentPage,
          limit: 30,
          search: asParam(searchQuery),
          status: alertFilters.status !== 'all' ? alertFilters.status : undefined,
          severity: alertFilters.severity !== 'all' ? alertFilters.severity : undefined,
          ruleKey: asParam(alertFilters.ruleKey),
          brokerId: asParam(alertFilters.brokerId),
          customerId: asParam(alertFilters.customerId),
          startDate: asParam(alertFilters.startDate),
          endDate: asParam(alertFilters.endDate),
        }),
        adminApi.getAuditAlertStats(),
      ]);

      setAlerts(alertsRes.alerts || []);
      setTotalPages(alertsRes?.pagination?.pages || 1);
      setAlertStats(statsRes?.stats || null);
    } catch (err) {
      console.error('Failed to fetch audit alerts:', err);
      setError(err.message || 'Failed to load audit alerts');
      setAlerts([]);
      setAlertStats(null);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, alertFilters]);

  useEffect(() => {
    if (viewMode === 'events') fetchLogs();
    else fetchAlerts();
  }, [viewMode, fetchLogs, fetchAlerts]);

  const refreshCurrentView = useCallback(() => {
    if (viewMode === 'events') fetchLogs();
    else fetchAlerts();
  }, [viewMode, fetchLogs, fetchAlerts]);

  const updateLogFilter = (key, value) => {
    setLogFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const updateAlertFilter = (key, value) => {
    setAlertFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);
    setCurrentPage(1);
    setShowFilters(false);
    setError(null);
  };

  const executeClearLogs = async (period) => {
    setClearing(true);
    setError(null);
    setClearConfirm(null);
    try {
      await adminApi.clearLogs('all', period);
      setLogs([]);
      setAlerts([]);
      setAlertStats(null);
      setCurrentPage(1);
      setTotalPages(1);
    } catch (err) {
      console.error('Failed to clear logs:', err);
      setError(err.message || 'Failed to clear logs');
    } finally {
      setClearing(false);
    }
  };

  const getTypeBadge = (type) => {
    const styles = {
      security: 'bg-red-100 text-red-700',
      transaction: 'bg-blue-100 text-blue-700',
      data: 'bg-purple-100 text-purple-700',
      system: 'bg-gray-100 text-gray-700',
      error: 'bg-orange-100 text-orange-700',
      audit: 'bg-green-100 text-green-700',
    };
    return styles[type] || 'bg-gray-100 text-gray-700';
  };

  const getAlertSeverityBadge = (severity) => {
    const map = {
      low: 'bg-blue-100 text-blue-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700',
    };
    return map[severity] || 'bg-gray-100 text-gray-700';
  };

  const getAlertStatusBadge = (status) => {
    const map = {
      open: 'bg-red-100 text-red-700',
      acknowledged: 'bg-blue-100 text-blue-700',
      resolved: 'bg-green-100 text-green-700',
      ignored: 'bg-gray-100 text-gray-700',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatAmount = (value) => {
    const n = Number(value || 0);
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const hasNumber = (value) => Number.isFinite(Number(value));

  const renderFilterPanel = () => {
    if (!showFilters) return null;

    if (viewMode === 'events') {
      return (
        <div className="mt-3 rounded-xl border border-gray-200 bg-[#f9fafb] p-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={logFilters.category}
              onChange={(e) => updateLogFilter('category', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            >
              <option value="all">Category: All</option>
              <option value="funds">Funds</option>
              <option value="margin">Margin</option>
              <option value="audit">Audit</option>
            </select>

            <select
              value={logFilters.status}
              onChange={(e) => updateLogFilter('status', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            >
              <option value="all">Status: All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="rejected">Rejected</option>
              <option value="attempt">Attempt</option>
            </select>

            <select
              value={logFilters.source}
              onChange={(e) => updateLogFilter('source', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            >
              <option value="all">Source: All</option>
              <option value="api">API</option>
              <option value="cron">Cron</option>
              <option value="system">System</option>
              <option value="ws">WebSocket</option>
            </select>

            <input
              type="text"
              placeholder="Event type"
              value={logFilters.eventType}
              onChange={(e) => updateLogFilter('eventType', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            />

            <input
              type="text"
              placeholder="Broker ID"
              value={logFilters.brokerId}
              onChange={(e) => updateLogFilter('brokerId', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            />

            <input
              type="text"
              placeholder="Customer ID"
              value={logFilters.customerId}
              onChange={(e) => updateLogFilter('customerId', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            />

            <input
              type="number"
              placeholder="Min delta"
              value={logFilters.minAmountDelta}
              onChange={(e) => updateLogFilter('minAmountDelta', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            />

            <input
              type="number"
              placeholder="Max delta"
              value={logFilters.maxAmountDelta}
              onChange={(e) => updateLogFilter('maxAmountDelta', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            />

            <input
              type="date"
              value={logFilters.startDate}
              onChange={(e) => updateLogFilter('startDate', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            />

            <input
              type="date"
              value={logFilters.endDate}
              onChange={(e) => updateLogFilter('endDate', e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
            />
          </div>

          <div className="mt-2 flex justify-end">
            <button
              onClick={() => {
                setLogFilters({ ...EMPTY_LOG_FILTERS });
                setCurrentPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600"
            >
              Clear Filters
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-3 rounded-xl border border-gray-200 bg-[#f9fafb] p-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={alertFilters.status}
            onChange={(e) => updateAlertFilter('status', e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
          >
            <option value="all">Status: All</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </select>

          <select
            value={alertFilters.severity}
            onChange={(e) => updateAlertFilter('severity', e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
          >
            <option value="all">Severity: All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <input
            type="text"
            placeholder="Rule key"
            value={alertFilters.ruleKey}
            onChange={(e) => updateAlertFilter('ruleKey', e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
          />

          <input
            type="text"
            placeholder="Broker ID"
            value={alertFilters.brokerId}
            onChange={(e) => updateAlertFilter('brokerId', e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
          />

          <input
            type="text"
            placeholder="Customer ID"
            value={alertFilters.customerId}
            onChange={(e) => updateAlertFilter('customerId', e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
          />

          <input
            type="date"
            value={alertFilters.startDate}
            onChange={(e) => updateAlertFilter('startDate', e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
          />

          <input
            type="date"
            value={alertFilters.endDate}
            onChange={(e) => updateAlertFilter('endDate', e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none"
          />
        </div>

        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              setAlertFilters({ ...EMPTY_ALERT_FILTERS });
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600"
          >
            Clear Filters
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {showClearMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowClearMenu(false)} />
      )}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">System Logs</h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowFilters((prev) => !prev)}
              className="flex items-center justify-center size-9 sm:size-10 rounded-full hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">tune</span>
            </button>
            <button
              onClick={refreshCurrentView}
              className="flex items-center justify-center size-9 sm:size-10 rounded-full hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">refresh</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowClearMenu((prev) => !prev)}
                disabled={clearing || loading}
                className="flex items-center justify-center size-9 sm:size-10 rounded-full hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Clear logs"
              >
                <span className="material-symbols-outlined text-[20px] sm:text-[22px] text-red-600">delete_sweep</span>
              </button>
              {showClearMenu && (
                <div className="absolute right-0 top-10 z-50 w-52 rounded-xl bg-white shadow-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Clear Logs</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowClearMenu(false);
                      setClearConfirm({ period: 'last_week', label: 'Clear Previous Week Logs', description: 'All audit logs and alerts older than 7 days will be permanently deleted from the database.' });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-amber-50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-amber-600 text-[18px]">history</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Clear Last Week</p>
                      <p className="text-[10px] text-gray-500">Older than 7 days</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowClearMenu(false);
                      setClearConfirm({ period: 'all', label: 'Clear All Logs', description: 'Every audit log and alert in the database will be permanently deleted. This cannot be undone.' });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-red-50 transition-colors border-t border-gray-100"
                  >
                    <span className="material-symbols-outlined text-red-600 text-[18px]">delete_forever</span>
                    <div>
                      <p className="text-xs font-semibold text-red-700">Clear All Logs</p>
                      <p className="text-[10px] text-red-400">Deletes everything</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => changeViewMode('events')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              viewMode === 'events' ? 'bg-[#137fec] text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Audit Events
          </button>
          <button
            onClick={() => changeViewMode('alerts')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              viewMode === 'alerts' ? 'bg-[#137fec] text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Alerts
          </button>
        </div>

        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
          </span>
          <input
            type="text"
            placeholder={viewMode === 'events' ? 'Search logs...' : 'Search alerts...'}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-9 sm:h-10 rounded-lg border border-gray-200 pl-9 sm:pl-10 pr-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none transition-all"
          />
        </div>

        {viewMode === 'events' && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setCurrentPage(1);
                }}
                className={`shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#137fec] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {renderFilterPanel()}
      </header>

      <main className="flex-1 p-3 sm:p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : viewMode === 'events' ? (
          logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16">
              <span className="material-symbols-outlined text-[64px] text-gray-300 mb-4">receipt_long</span>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Logs Found</h3>
              <p className="text-gray-500 text-center text-sm">
                {searchQuery
                  ? 'Try a different search term'
                  : activeTab === 'withdrawals'
                    ? 'No withdrawal logs found'
                    : 'Audit events will appear here'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map((log) => {
                const metaItems = formatMetaItems(log.metadata);
                const eventLabel = log.actionLabel || humanizeToken(log.eventType || 'log_event');
                const previousDepositedCash = log?.fundBefore?.depositedCash;
                const newDepositedCash = log?.fundAfter?.depositedCash;
                const displayReference = log.reference
                  && log.reference !== log.customerId
                  && log.reference !== log.brokerId;

                return (
                  <div key={log.id} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${getTypeBadge(log.type)}`}>
                          {humanizeToken(log.type)}
                        </span>
                        {log.status && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-gray-100 text-gray-700">
                            {humanizeToken(log.status)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-400">{formatTimestamp(log.timestamp)}</span>
                    </div>

                    <p className="text-sm font-semibold text-gray-900">{eventLabel}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{log.message || 'Audit event recorded'}</p>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {log.category && (
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                          {humanizeToken(log.category)}
                        </span>
                      )}
                      {log.source && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          Source: {humanizeToken(log.source)}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] sm:text-xs text-gray-500">
                      {log.brokerId && <p>Broker: {log.brokerId}</p>}
                      {log.customerId && <p>Customer: {log.customerId}</p>}
                      {log.performedBy && <p>Performed By: {log.performedBy}</p>}
                      {displayReference && <p>Reference: {log.reference}</p>}
                      {log.amountDelta !== 0 && (
                        <p className={log.amountDelta > 0 ? 'text-green-600' : 'text-red-600'}>
                          Amount Change: {formatAmount(log.amountDelta)}
                        </p>
                      )}
                      {hasNumber(previousDepositedCash) && (
                        <p>Previous Cash: {formatAmount(previousDepositedCash)}</p>
                      )}
                      {hasNumber(newDepositedCash) && (
                        <p>New Cash: {formatAmount(newDepositedCash)}</p>
                      )}
                    </div>

                    {log.note && (
                      <p className="mt-1 text-[10px] sm:text-xs text-gray-500">Note: {log.note}</p>
                    )}

                    {metaItems.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {metaItems.map((item) => (
                          <span key={`${log.id}-${item.key}`} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                            {item.key}: {item.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {alertStats && (
              <div className="grid grid-cols-2 gap-2 mb-1">
                <div className="rounded-xl bg-white border border-gray-100 p-2.5">
                  <p className="text-[11px] text-gray-500">Open</p>
                  <p className="text-base font-bold text-red-600">{alertStats.open || 0}</p>
                </div>
                <div className="rounded-xl bg-white border border-gray-100 p-2.5">
                  <p className="text-[11px] text-gray-500">Critical Open</p>
                  <p className="text-base font-bold text-red-700">{alertStats.criticalOpen || 0}</p>
                </div>
              </div>
            )}

            {alerts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16">
                <span className="material-symbols-outlined text-[64px] text-gray-300 mb-4">warning</span>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Alerts Found</h3>
                <p className="text-gray-500 text-center text-sm">No anti-cheat alerts for selected filters.</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${getAlertSeverityBadge(alert.severity)}`}>
                        {humanizeToken(alert.severity)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${getAlertStatusBadge(alert.status)}`}>
                        {humanizeToken(alert.status)}
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-400">{formatTimestamp(alert.lastSeenAt)}</span>
                  </div>

                  <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{alert.message}</p>

                  <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] sm:text-xs text-gray-500">
                    <p>Rule: {humanizeToken(alert.ruleKey)}</p>
                    <p>Count: {alert.occurrenceCount}</p>
                    {alert.brokerId && <p>Broker: {alert.brokerId}</p>}
                    {alert.customerId && <p>Customer: {alert.customerId}</p>}
                    {alert.eventType && <p>Event: {humanizeToken(alert.eventType)}</p>}
                    {alert.performedBy && <p>Performed By: {alert.performedBy}</p>}
                    {alert.reference && <p>Reference: {alert.reference}</p>}
                    {alert.amountDelta !== 0 && (
                      <p className={alert.amountDelta > 0 ? 'text-green-600' : 'text-red-600'}>
                        Amount Change: {formatAmount(alert.amountDelta)}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* Clear Logs Confirmation Modal */}
      {clearConfirm && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setClearConfirm(null)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-5 pt-5 pb-4 border-b ${clearConfirm.period === 'all' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-start gap-3">
                <div className={`size-11 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${clearConfirm.period === 'all' ? 'bg-red-100' : 'bg-amber-100'}`}>
                  <span className={`material-symbols-outlined text-[22px] ${clearConfirm.period === 'all' ? 'text-red-600' : 'text-amber-600'}`}>
                    {clearConfirm.period === 'all' ? 'delete_forever' : 'history'}
                  </span>
                </div>
                <div>
                  <p className="text-[#111418] font-bold text-base leading-snug">{clearConfirm.label}</p>
                  <p className={`text-xs font-medium mt-0.5 ${clearConfirm.period === 'all' ? 'text-red-700' : 'text-amber-700'}`}>
                    This action cannot be undone
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-sm text-gray-600">{clearConfirm.description}</p>
              <div className={`mt-3 rounded-xl px-4 py-3 ${clearConfirm.period === 'all' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
                <div className="flex items-start gap-2">
                  <span className={`material-symbols-outlined text-[14px] mt-0.5 shrink-0 ${clearConfirm.period === 'all' ? 'text-red-500' : 'text-amber-500'}`}>warning</span>
                  <p className={`text-xs font-medium ${clearConfirm.period === 'all' ? 'text-red-700' : 'text-amber-700'}`}>
                    {clearConfirm.period === 'all'
                      ? 'All audit events and alerts will be permanently removed from the database.'
                      : 'Audit events and alerts older than 7 days will be permanently removed.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 pb-6 pt-1 flex gap-3">
              <button
                onClick={() => setClearConfirm(null)}
                className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => executeClearLogs(clearConfirm.period)}
                className={`flex-1 h-11 text-white rounded-xl font-bold text-sm ${clearConfirm.period === 'all' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {clearing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

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

export default Logs;
