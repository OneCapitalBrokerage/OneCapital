import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../api/admin';

const AccessToken = () => {
  const navigate = useNavigate();
  const [tokenStatus, setTokenStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualLoginLoading, setManualLoginLoading] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpData, setTotpData] = useState(null);
  const [totpSecondsRemaining, setTotpSecondsRemaining] = useState(0);
  const [totpStatusMessage, setTotpStatusMessage] = useState(null);
  const [error, setError] = useState(null);

  const fetchTokenStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getKiteStatus();
      setTokenStatus(data);
    } catch (err) {
      console.error('[AccessToken] Fetch error:', err);
      setError(err.message || 'Failed to fetch token status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokenStatus();
  }, [fetchTokenStatus]);

  useEffect(() => {
    if (!totpData?.expiresAt) {
      setTotpSecondsRemaining(0);
      return undefined;
    }

    const updateRemaining = () => {
      const expiresAt = new Date(totpData.expiresAt).getTime();
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTotpSecondsRemaining(remaining);
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);

    return () => window.clearInterval(intervalId);
  }, [totpData?.expiresAt]);

  const handleRefreshToken = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const data = await adminApi.triggerAutoLogin();
      if (data.success) {
        await fetchTokenStatus();
      } else {
        setError(data.error || 'Auto-login failed');
      }
    } catch (err) {
      console.error('[AccessToken] Refresh error:', err);
      setError(err.message || 'Auto-login failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleManualLogin = async () => {
    setManualLoginLoading(true);
    setError(null);
    try {
      const data = await adminApi.getKiteLoginUrl();
      if (data.success && data.loginUrl) {
        window.open(data.loginUrl, '_blank');
      } else {
        setError(data.error || 'Failed to get login URL');
      }
    } catch (err) {
      console.error('[AccessToken] Manual login error:', err);
      setError(err.message || 'Failed to get login URL');
    } finally {
      setManualLoginLoading(false);
    }
  };

  const handleGenerateTOTP = async () => {
    setTotpLoading(true);
    setError(null);
    setTotpStatusMessage(null);
    try {
      const data = await adminApi.generateKiteTOTP();
      if (data.success && data.otp) {
        setTotpData({
          otp: data.otp,
          userId: data.user_id || 'N/A',
          generatedAt: data.generated_at,
          expiresAt: data.expires_at,
        });
        setTotpStatusMessage('TOTP generated from the active Kite credential. Secret stays on the server.');
      } else {
        setTotpData(null);
        setTotpStatusMessage(data.error || 'TOTP generation failed.');
        setError(data.error || 'TOTP generation failed.');
      }
    } catch (err) {
      console.error('[AccessToken] TOTP generation error:', err);
      setTotpData(null);
      setTotpStatusMessage(err.message || 'Unable to generate TOTP.');
      setError(err.message || 'Unable to generate TOTP.');
    } finally {
      setTotpLoading(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusDisplay = () => {
    if (!tokenStatus) return { icon: 'schedule', text: 'Unknown', bg: 'bg-gray-100', textColor: 'text-gray-700' };

    if (tokenStatus.is_expired) {
      return { icon: 'cancel', text: 'EXPIRED', bg: 'bg-red-100', textColor: 'text-red-700' };
    }
    if (tokenStatus.hours_remaining < 2) {
      return { icon: 'warning', text: 'EXPIRING SOON', bg: 'bg-yellow-100', textColor: 'text-yellow-700' };
    }
    return { icon: 'check_circle', text: 'VALID', bg: 'bg-green-100', textColor: 'text-green-700' };
  };

  const statusDisplay = getStatusDisplay();
  const hasGeneratedTotp = Boolean(totpData?.otp);
  const isTotpActive = hasGeneratedTotp && totpSecondsRemaining > 0;
  const totpStatusPill = isTotpActive
    ? { label: 'LIVE', bg: 'bg-green-100', textColor: 'text-green-700', icon: 'check_circle' }
    : hasGeneratedTotp
      ? { label: 'EXPIRED', bg: 'bg-red-100', textColor: 'text-red-700', icon: 'history' }
      : { label: 'IDLE', bg: 'bg-gray-100', textColor: 'text-gray-600', icon: 'schedule' };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => navigate('/admin/settings')}
            className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Access Token</h1>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 flex flex-col gap-3">
        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex-1 flex flex-col gap-3 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : tokenStatus ? (
          <>
            {/* Status Card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[22px] text-[#137fec]">vpn_key</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#111418]">Kite Access Token</h2>
                    <p className="text-xs text-[#617589]">User: {tokenStatus.user_id || 'N/A'}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusDisplay.bg}`}>
                  <span className={`material-symbols-outlined text-[16px] ${statusDisplay.textColor}`}>{statusDisplay.icon}</span>
                  <span className={`text-xs font-semibold ${statusDisplay.textColor}`}>{statusDisplay.text}</span>
                </div>
              </div>

              {/* 2x2 Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#f6f7f8] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wide font-medium text-[#617589] mb-1">Hours Remaining</p>
                  <p className="text-xl font-bold text-[#111418]">
                    {tokenStatus.hours_remaining?.toFixed(1) || '0'}h
                  </p>
                </div>
                <div className="bg-[#f6f7f8] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wide font-medium text-[#617589] mb-1">Token Expiry</p>
                  <p className="text-xs font-semibold text-[#111418] mt-1">
                    {formatDateTime(tokenStatus.token_expiry)}
                  </p>
                </div>
                <div className="bg-[#f6f7f8] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wide font-medium text-[#617589] mb-1">Last Login</p>
                  <p className="text-xs font-semibold text-[#111418] mt-1">
                    {formatDateTime(tokenStatus.login_time)}
                  </p>
                </div>
                <div className="bg-[#f6f7f8] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wide font-medium text-[#617589] mb-1">Token Preview</p>
                  <p className="text-xs font-mono text-[#617589] mt-1">
                    {tokenStatus.access_token_preview || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Message */}
              {tokenStatus.message && (
                <p className="mt-3 text-xs text-[#617589] text-center">{tokenStatus.message}</p>
              )}
            </div>

            {/* TOTP Generator */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px] text-emerald-600">pin</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#111418]">Generate TOTP</h3>
                    <p className="text-xs text-[#617589] mt-0.5">Generate the current Zerodha OTP from the active credential without using the CLI script.</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${totpStatusPill.bg}`}>
                  <span className={`material-symbols-outlined text-[16px] ${totpStatusPill.textColor}`}>{totpStatusPill.icon}</span>
                  <span className={`text-xs font-semibold ${totpStatusPill.textColor}`}>{totpStatusPill.label}</span>
                </div>
              </div>

              <div className="rounded-2xl bg-[#111418] text-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/60 mb-2">Current OTP</p>
                    <p className="font-mono text-[2rem] leading-none tracking-[0.28em] text-white">
                      {totpData?.otp || '------'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/60 mb-1">Expires In</p>
                    <p className={`text-2xl font-bold ${isTotpActive ? 'text-white' : 'text-red-300'}`}>
                      {hasGeneratedTotp ? `${totpSecondsRemaining}s` : '--'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-white/60 mb-1">Credential User</p>
                    <p className="text-sm font-semibold text-white">{totpData?.userId || tokenStatus.user_id || 'N/A'}</p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-white/60 mb-1">Generated At</p>
                    <p className="text-xs font-semibold text-white">
                      {totpData?.generatedAt ? formatDateTime(totpData.generatedAt) : 'Not generated'}
                    </p>
                  </div>
                </div>
              </div>

              {totpStatusMessage && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-[#f6f7f8] px-3 py-2.5 text-xs text-[#617589]">
                  {totpStatusMessage}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#111418]">
                    {isTotpActive ? 'OTP is ready to use' : 'Generate a fresh OTP when needed'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-[#617589] mt-0.5">
                    {isTotpActive
                      ? 'The card updates the countdown locally until the current code expires.'
                      : 'This does not change access tokens or trigger the auto-login workflow.'}
                  </p>
                </div>
                <button
                  onClick={handleGenerateTOTP}
                  disabled={totpLoading}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
                >
                  <span className={`material-symbols-outlined text-[16px] ${totpLoading ? 'animate-spin' : ''}`}>pin</span>
                  {totpLoading ? 'Generating...' : totpData ? 'Refresh OTP' : 'Generate OTP'}
                </button>
              </div>
            </div>

            {/* Auto Refresh */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#111418]">Auto Refresh Token</h3>
                  <p className="text-[10px] sm:text-xs text-[#617589] mt-0.5">Trigger auto-login (may fail if CAPTCHA required)</p>
                </div>
                <button
                  onClick={handleRefreshToken}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 bg-[#137fec] hover:bg-blue-600 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
                >
                  <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
                  {refreshing ? 'Refreshing...' : 'Refresh Now'}
                </button>
              </div>
            </div>

            {/* Manual Login */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#111418]">Manual Login</h3>
                  <p className="text-[10px] sm:text-xs text-[#617589] mt-0.5">Opens Kite login in new tab (use if CAPTCHA required)</p>
                </div>
                <button
                  onClick={handleManualLogin}
                  disabled={manualLoginLoading}
                  className="flex items-center gap-1.5 bg-[#078838] hover:bg-green-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
                >
                  <span className={`material-symbols-outlined text-[16px] ${manualLoginLoading ? 'animate-pulse' : ''}`}>open_in_new</span>
                  {manualLoginLoading ? 'Opening...' : 'Login via Kite'}
                </button>
              </div>
            </div>

            {/* Auto-Login Schedule Info */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[18px] text-[#137fec]">schedule</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#111418]">Auto-Login Schedule</h3>
                  <p className="text-[10px] sm:text-xs text-[#617589] mt-0.5">
                    Token is automatically refreshed every day at <span className="font-semibold text-[#111418]">7:55 AM IST</span> before market opens.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <span className="material-symbols-outlined text-[64px] text-gray-300 mb-4">vpn_key_off</span>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Token Found</h3>
            <p className="text-gray-500 text-center text-sm">Kite access token has not been configured yet.</p>
          </div>
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

export default AccessToken;
