import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../../api/admin';
import { setAuthToken, setStoredUser } from '../../../api/index';

const CustomerDetailSheet = ({ customerId, onClose }) => {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credLoading, setCredLoading] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [showWarningEditor, setShowWarningEditor] = useState(false);
  const [showClearStatementConfirm, setShowClearStatementConfirm] = useState(false);
  const [clearStatementResult, setClearStatementResult] = useState(null);

  const fetchCustomer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getCustomerById(customerId);
      setCustomer(res.customer || res);
    } catch (err) {
      setError(err.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (customerId) fetchCustomer();
  }, [fetchCustomer]);

  // Initialize warning message when customer loads
  useEffect(() => {
    if (customer?.warning?.message) {
      setWarningMessage(customer.warning.message);
    }
  }, [customer?.warning?.message]);

  const handleSetWarning = async () => {
    if (!warningMessage.trim()) return;
    setActionLoading(true);
    try {
      await adminApi.setCustomerWarning(customer._id, warningMessage.trim());
      setCustomer(prev => ({
        ...prev,
        warning: { ...prev.warning, active: true, message: warningMessage.trim(), updatedAt: new Date().toISOString() }
      }));
      setShowWarningEditor(false);
    } catch (err) {
      setError(err.message || 'Failed to set warning');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearWarning = async () => {
    setActionLoading(true);
    try {
      await adminApi.clearCustomerWarning(customer._id);
      setCustomer(prev => ({
        ...prev,
        warning: { active: false, message: '', createdAt: null, updatedAt: null }
      }));
      setWarningMessage('');
      setShowWarningEditor(false);
    } catch (err) {
      setError(err.message || 'Failed to clear warning');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearStatement = async () => {
    setActionLoading(true);
    try {
      const result = await adminApi.clearCustomerStatement(customer._id);
      setClearStatementResult(result);
      setShowClearStatementConfirm(false);

      // Purge customer-facing session caches so the Funds page and Statement
      // page fetch fresh (now-empty) data when admin impersonates next.
      try {
        sessionStorage.removeItem('customer_view_cache:funds_tab_v1');
      } catch { /* ignore */ }
    } catch (err) {
      setError(err.message || 'Failed to clear statement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async () => {
    setActionLoading(true);
    try {
      const isBlocked = customer.status === 'blocked';
      if (isBlocked) {
        await adminApi.unblockCustomer(customer._id);
        setCustomer(prev => ({ ...prev, status: 'active' }));
      } else {
        await adminApi.blockCustomer(customer._id, 'Blocked by admin');
        setCustomer(prev => ({ ...prev, status: 'blocked', tradingEnabled: false }));
      }
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleTrading = async () => {
    setActionLoading(true);
    try {
      const newEnabled = !customer.tradingEnabled;
      if (newEnabled) {
        await adminApi.enableTrading(customer._id);
      } else {
        await adminApi.disableTrading(customer._id);
      }
      setCustomer(prev => ({ ...prev, tradingEnabled: newEnabled }));
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleHoldingsExit = async () => {
    setActionLoading(true);
    try {
      const newAllowed = !customer.holdingsExitAllowed;
      await adminApi.toggleHoldingsExit(customer._id, newAllowed);
      setCustomer(prev => ({ ...prev, holdingsExitAllowed: newAllowed }));
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleGlitch = async () => {
    setActionLoading(true);
    try {
      const newEnabled = !customer.glitchEnabled;
      await adminApi.toggleCustomerGlitch(customer._id, newEnabled);
      setCustomer(prev => ({ ...prev, glitchEnabled: newEnabled }));
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLoginAs = async () => {
    setActionLoading(true);
    try {
      const res = await adminApi.loginAsCustomer(customer._id);
      if (res.token) {
        // Save admin session for restoration after impersonation
        const currentToken = localStorage.getItem('accessToken');
        const currentUser = localStorage.getItem('user');
        sessionStorage.setItem('adminToken', currentToken || '');
        sessionStorage.setItem('adminUser', currentUser || '');
        sessionStorage.setItem('impersonationReturnTo', window.location.pathname + window.location.search);

        // Set impersonation session
        setAuthToken(res.token);
        setStoredUser({
          id: res.customer.id,
          name: res.customer.name,
          role: 'customer',
          isImpersonation: true,
          impersonatorRole: 'admin',
        });

        // Hard redirect so the customer app re-initializes from storage
        window.location.href = '/watchlist';
      }
    } catch (err) {
      setError(err.message || 'Login failed');
      setActionLoading(false);
    }
  };

  const handleViewCredentials = async () => {
    if (credentials) { setShowCredentials(v => !v); return; }
    setCredLoading(true);
    try {
      const res = await adminApi.getCustomerCredentials(customer._id);
      setCredentials(res.credentials);
      setShowCredentials(true);
    } catch (err) {
      setError(err.message || 'Failed to fetch credentials');
    } finally {
      setCredLoading(false);
    }
  };

  const statusColor = (s) => {
    if (s === 'blocked') return 'bg-red-100 text-red-700';
    if (s === 'active') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-600';
  };

  const kycColor = (s) => {
    if (s === 'verified') return 'bg-green-100 text-green-700';
    if (s === 'rejected') return 'bg-red-100 text-red-700';
    if (s === 'under_review') return 'bg-blue-100 text-blue-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="flex-1" onClick={onClose} />
      <div className="bg-white rounded-t-2xl max-h-[92dvh] flex flex-col w-full max-w-md mx-auto overflow-hidden">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-100">
          <h2 className="text-base font-bold">Customer Detail</h2>
          <button onClick={onClose} className="flex items-center justify-center size-8 rounded-full hover:bg-gray-100">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#137fec] animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          {!loading && customer && (
            <>
              {/* Identity */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-12 rounded-full bg-gradient-to-br from-[#137fec] to-purple-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {customer.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{customer.name}</h3>
                    <p className="text-xs text-gray-500 truncate">{customer.email}</p>
                    <p className="text-xs text-gray-500">{customer.phone}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(customer.status)}`}>
                      {customer.status}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${kycColor(customer.kycStatus)}`}>
                      KYC: {customer.kycStatus}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Customer ID</p>
                    <p className="font-semibold font-mono">{customer.id}</p>
                  </div>
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Broker</p>
                    <p className="font-semibold truncate">{customer.broker?.name || customer.broker?.id || '—'}</p>
                  </div>
                  {customer.panNumber && (
                    <div className="bg-white rounded-lg px-2.5 py-2">
                      <p className="text-gray-400 uppercase tracking-wide mb-0.5">PAN</p>
                      <p className="font-semibold font-mono">{customer.panNumber}</p>
                    </div>
                  )}
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Last Login</p>
                    <p className="font-semibold">{customer.lastLogin ? new Date(customer.lastLogin).toLocaleDateString('en-IN') : 'Never'}</p>
                  </div>
                </div>
              </div>

              {/* Funds Snapshot */}
              {customer.funds && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Funds</p>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="bg-white rounded-lg px-2 py-2 text-center">
                      <p className="text-gray-400 mb-0.5">Balance</p>
                      <p className="font-bold">₹{(customer.funds.balance || 0).toFixed(0)}</p>
                    </div>
                    <div className="bg-white rounded-lg px-2 py-2 text-center">
                      <p className="text-gray-400 mb-0.5">Intraday</p>
                      <p className="font-bold">₹{(customer.funds.intradayLimit || 0).toFixed(0)}</p>
                    </div>
                    <div className="bg-white rounded-lg px-2 py-2 text-center">
                      <p className="text-gray-400 mb-0.5">Orders</p>
                      <p className="font-bold">{customer.stats?.totalOrders || 0}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Controls</p>

                {/* Block / Unblock Toggle */}
                <div className={`flex items-center justify-between bg-white p-3 rounded-xl ${actionLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-full ${customer.status === 'blocked' ? 'bg-orange-50 text-orange-500' : 'bg-red-50 text-red-500'}`}>
                      <span className="material-symbols-outlined text-[18px]">block</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Block Account</p>
                      <p className="text-[10px] text-gray-500">Suspend all access</p>
                    </div>
                  </div>
                  <div className="relative inline-block w-10 h-5 select-none">
                    <input type="checkbox" checked={customer.status === 'blocked'} onChange={handleBlock}
                      disabled={actionLoading}
                      className="sr-only peer" id="adminBlockToggle" />
                    <label htmlFor="adminBlockToggle"
                      className={`block overflow-hidden h-5 rounded-full cursor-pointer transition-colors ${customer.status === 'blocked' ? 'bg-orange-500' : 'bg-gray-300'}`}>
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${customer.status === 'blocked' ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                    </label>
                  </div>
                </div>
                {customer.status === 'blocked' && customer.blockReason && (
                  <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 -mt-1">
                    <p className="text-[10px] text-orange-700">Reason: {customer.blockReason}</p>
                  </div>
                )}
                {customer.status !== 'blocked' && (
                  <p className="text-[10px] text-gray-400 -mt-1 pl-1">Unblocking does not automatically resume trading</p>
                )}

                {/* Trading toggle */}
                <div className={`flex items-center justify-between bg-white p-3 rounded-xl ${actionLoading || customer.status === 'blocked' ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-red-50 text-red-500">
                      <span className="material-symbols-outlined text-[18px]">do_not_disturb</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Stop Trading</p>
                      <p className="text-[10px] text-gray-500">Disable order placement only</p>
                    </div>
                  </div>
                  <div className="relative inline-block w-10 h-5 select-none">
                    <input type="checkbox" checked={!customer.tradingEnabled} onChange={handleToggleTrading}
                      disabled={actionLoading || customer.status === 'blocked'}
                      className="sr-only peer" id="adminTradingToggle" />
                    <label htmlFor="adminTradingToggle"
                      className={`block overflow-hidden h-5 rounded-full cursor-pointer transition-colors ${!customer.tradingEnabled ? 'bg-red-500' : 'bg-gray-300'}`}>
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${!customer.tradingEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                    </label>
                  </div>
                </div>
                {!customer.tradingEnabled && customer.tradingDisabledReason && (
                  <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 -mt-1">
                    <p className="text-[10px] text-red-700">Reason: {customer.tradingDisabledReason}</p>
                  </div>
                )}

                {/* Holdings Exit toggle */}
                <div className={`flex items-center justify-between bg-white p-3 rounded-xl ${actionLoading || customer.status === 'blocked' ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-full ${customer.holdingsExitAllowed ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      <span className="material-symbols-outlined text-[18px]">{customer.holdingsExitAllowed ? 'lock_open' : 'lock'}</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Holdings Exit</p>
                      <p className="text-[10px] text-gray-500">{customer.holdingsExitAllowed ? 'Customer can exit holdings' : 'Exit locked'}</p>
                    </div>
                  </div>
                  <div className="relative inline-block w-10 h-5 select-none">
                    <input type="checkbox" checked={!!customer.holdingsExitAllowed} onChange={handleToggleHoldingsExit}
                      disabled={actionLoading || customer.status === 'blocked'}
                      className="sr-only peer" id="adminHoldingsExitToggle" />
                    <label htmlFor="adminHoldingsExitToggle"
                      className={`block overflow-hidden h-5 rounded-full cursor-pointer transition-colors ${customer.holdingsExitAllowed ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${customer.holdingsExitAllowed ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                    </label>
                  </div>
                </div>

                {/* Glitch Mode toggle */}
                <div className={`flex items-center justify-between bg-white p-3 rounded-xl ${actionLoading || customer.status === 'blocked' ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-full ${customer.glitchEnabled ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                      <span className="material-symbols-outlined text-[18px]">bug_report</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Glitch Mode</p>
                      <p className="text-[10px] text-gray-500">
                        {customer.glitchEnabled ? 'Active — customer views are distorted' : 'Inactive — customer sees normal data'}
                      </p>
                    </div>
                  </div>
                  <div className="relative inline-block w-10 h-5 select-none">
                    <input type="checkbox" checked={!!customer.glitchEnabled} onChange={handleToggleGlitch}
                      disabled={actionLoading || customer.status === 'blocked'}
                      className="sr-only peer" id="adminGlitchToggle" />
                    <label htmlFor="adminGlitchToggle"
                      className={`block overflow-hidden h-5 rounded-full cursor-pointer transition-colors ${customer.glitchEnabled ? 'bg-red-600' : 'bg-gray-300'}`}>
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${customer.glitchEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                    </label>
                  </div>
                </div>

                {/* Admin Warning */}
                <div className={`flex flex-col bg-white p-3 rounded-xl ${actionLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-full ${customer.warning?.active ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>
                        <span className="material-symbols-outlined text-[18px]">warning</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold">Admin Warning</p>
                        <p className="text-[10px] text-gray-500">
                          {customer.warning?.active ? 'Warning active' : 'No active warning'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowWarningEditor(!showWarningEditor)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${customer.warning?.active ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}
                    >
                      {customer.warning?.active ? 'Edit' : 'Set Warning'}
                    </button>
                  </div>
                  
                  {/* Warning Message Display */}
                  {customer.warning?.active && !showWarningEditor && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                      <p className="text-[11px] text-amber-800">{customer.warning.message}</p>
                      {customer.warning.updatedAt && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          Updated: {new Date(customer.warning.updatedAt).toLocaleString('en-IN')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Warning Editor */}
                  {showWarningEditor && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={warningMessage}
                        onChange={(e) => setWarningMessage(e.target.value)}
                        placeholder="Enter warning message for customer..."
                        rows={3}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs resize-none focus:outline-none focus:border-blue-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowWarningEditor(false); setWarningMessage(customer.warning?.message || ''); }}
                          className="flex-1 h-8 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold"
                        >
                          Cancel
                        </button>
                        {customer.warning?.active && (
                          <button
                            onClick={handleClearWarning}
                            className="flex-1 h-8 rounded-lg bg-gray-200 text-gray-700 text-xs font-semibold"
                          >
                            Clear Warning
                          </button>
                        )}
                        <button
                          onClick={handleSetWarning}
                          disabled={!warningMessage.trim()}
                          className="flex-1 h-8 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {customer.warning?.active ? 'Update' : 'Set Warning'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Credentials */}
              <div className="bg-gray-50 rounded-xl p-4">
                <button
                  onClick={handleViewCredentials}
                  disabled={credLoading}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-blue-50 text-[#137fec]">
                      <span className="material-symbols-outlined text-[18px]">key</span>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold">View Credentials</p>
                      <p className="text-[10px] text-gray-500">Customer ID + password</p>
                    </div>
                  </div>
                  {credLoading
                    ? <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-[#137fec] animate-spin" />
                    : <span className="material-symbols-outlined text-gray-400 text-[18px]">{showCredentials ? 'expand_less' : 'expand_more'}</span>
                  }
                </button>
                {showCredentials && credentials && (
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                    <div className="bg-white rounded-lg px-3 py-2 flex justify-between">
                      <span className="text-gray-400">Customer ID</span>
                      <span className="font-semibold font-mono">{credentials.customerId}</span>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 flex justify-between">
                      <span className="text-gray-400">Email</span>
                      <span className="font-semibold">{credentials.email || '—'}</span>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 flex justify-between">
                      <span className="text-gray-400">Password</span>
                      <span className="font-semibold font-mono">{credentials.password}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Clear Statement */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-red-50 text-red-500">
                      <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Clear Statement</p>
                      <p className="text-[10px] text-gray-500">Delete all fund transactions</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowClearStatementConfirm(true)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 text-[10px] font-bold hover:bg-red-200 transition-colors disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>

                {/* Clear Statement Confirmation */}
                {showClearStatementConfirm && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-xs text-red-600 font-medium mb-2">
                      Are you sure? This will permanently delete all fund transaction history for this customer.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowClearStatementConfirm(false)}
                        className="flex-1 h-8 rounded-lg bg-white text-gray-600 text-xs font-semibold border border-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleClearStatement}
                        disabled={actionLoading}
                        className="flex-1 h-8 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {actionLoading ? 'Clearing...' : 'Confirm Clear'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Clear Statement Result */}
                {clearStatementResult && (
                  <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-xs text-green-700 font-medium">
                      {clearStatementResult.message}
                    </p>
                    <button
                      onClick={() => setClearStatementResult(null)}
                      className="mt-2 text-[10px] text-green-600 font-semibold underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {/* Login As */}
              <button
                onClick={handleLoginAs}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 h-11 bg-[#137fec] text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">login</span>
                Login As Customer
              </button>

              <div className="pb-4" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDetailSheet;
