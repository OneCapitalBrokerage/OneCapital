import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { login, error: authError, setError: setAuthError } = useAuth();
  const [formData, setFormData] = useState({ userId: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const displayError = error || authError || '';

  useEffect(() => {
    if (authError && authError !== error) {
      setError(authError);
    }
  }, [authError, error]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
    if (setAuthError) setAuthError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(formData.userId, formData.password);
      navigate('/watchlist');
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-white w-full max-w-md mx-auto">

      {/* Hero / Brand section */}
      <div className="relative w-full h-[300px] sm:h-[320px] shrink-0 overflow-hidden bg-[#137fec]/10">
        {/* Inline SVG wave background — zero network request */}
        <div
          className="absolute inset-0 bg-center bg-no-repeat bg-cover opacity-70"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23137fec;stop-opacity:0.25'/%3E%3Cstop offset='100%25' style='stop-color:%23137fec;stop-opacity:0.08'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='400' height='200'/%3E%3Cpath d='M0 160 Q 100 110 200 140 T 400 110 L 400 200 L 0 200 Z' fill='%23137fec' opacity='0.15'/%3E%3Ccircle cx='340' cy='40' r='60' fill='%23137fec' opacity='0.05'/%3E%3Ccircle cx='60' cy='20' r='40' fill='%23137fec' opacity='0.05'/%3E%3C/svg%3E")`
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />

        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {/* Logo icon */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-2xl flex items-center justify-center border border-[#dbe0e6] shadow-[0_8px_24px_rgba(19,127,236,0.18)] overflow-hidden">
            <img
              src="/logo/logo-1024px.png"
              alt=""
              width="48"
              height="48"
              fetchPriority="high"
              decoding="sync"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain scale-[1.35]"
            />
          </div>
          {/* Brand name — Warbler Display font */}
          <div className="mt-2 leading-none tracking-tight" style={{ fontFamily: "'WarblerDisplay', serif", fontSize: '2rem' }}>
            <span style={{ color: '#4338ca' }}>One</span><span style={{ color: '#f47929' }}>Capital</span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5">Invest in your future</p>
        </div>
      </div>

      {/* Login form */}
      <form onSubmit={handleSubmit} className="flex-1 px-4 sm:px-6 pt-5 pb-6 flex flex-col">

        <div className="text-center mb-5">
          <h2 className="text-base sm:text-lg font-bold text-[#111418]">Welcome back</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Sign in to your account</p>
        </div>

        {/* Error */}
        {displayError && (
          <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-2.5 rounded-xl text-sm mb-4 border border-red-100">
            <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
            <span>{displayError}</span>
          </div>
        )}

        {/* User ID */}
        <div className="flex flex-col gap-1.5 mb-4">
          <label className="text-sm font-semibold text-[#111418]">User ID</label>
          <div className="relative">
            <input
              type="text"
              name="userId"
              value={formData.userId}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#dbe0e6] bg-[#f6f7f8] h-11 px-4 pr-11 text-sm text-[#111418] focus:bg-white focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] transition-colors placeholder:text-slate-400 outline-none"
              placeholder="Enter your User ID"
              autoComplete="username"
              required
            />
            <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">badge</span>
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5 mb-2">
          <label className="text-sm font-semibold text-[#111418]">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#dbe0e6] bg-[#f6f7f8] h-11 px-4 pr-11 text-sm text-[#111418] focus:bg-white focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] transition-colors placeholder:text-slate-400 outline-none"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          <div className="flex justify-end mt-0.5">
            <button type="button" className="text-[11px] sm:text-xs font-medium text-[#137fec] hover:text-blue-700 transition-colors">
              Forgot Password?
            </button>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-4 max-h-8" />

        {/* Login button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-[#137fec] hover:bg-blue-600 disabled:bg-blue-400 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 text-sm sm:text-base"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </>
          )}
        </button>

        {/* Divider */}
        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-[11px] text-slate-400">New to OneCapital?</span>
          </div>
        </div>

        {/* Sign Up button */}
        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="w-full h-11 border-2 border-[#137fec] text-[#137fec] font-bold rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Open Demat Account
        </button>

        {/* Footer */}
        <div className="pt-5 text-center">
          <p className="text-[10px] text-slate-400 leading-relaxed px-2">
            By continuing, you agree to our{' '}
            <button type="button" className="underline hover:text-[#137fec] transition-colors">Terms</button>
            {' '}and{' '}
            <button type="button" className="underline hover:text-[#137fec] transition-colors">Privacy Policy</button>.
          </p>
          <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-slate-300">
            <span className="material-symbols-outlined text-[12px]">lock</span>
            <span>Secured by OneCapital Shield</span>
          </div>
        </div>

      </form>
    </div>
  );
};

export default Login;
