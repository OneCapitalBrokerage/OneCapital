import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminContext';

const Login = () => {
  const navigate = useNavigate();
  const { login, error: authError, setError: setAuthError } = useAdminAuth();
  const [formData, setFormData] = useState({
    adminId: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    if (setAuthError) setAuthError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await login(formData.adminId, formData.password);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col overflow-x-hidden max-w-md mx-auto bg-white border-x border-slate-100 shadow-sm">
      {/* Top Navigation */}
      <div className="sticky top-0 z-10 flex items-center bg-white/90 backdrop-blur-md px-3 sm:px-4 py-2.5 sm:py-3 justify-between">
        <button 
          onClick={() => navigate(-1)}
          className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-full hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back</span>
        </button>
        <h2 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10 sm:pr-12">Admin Portal</h2>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col px-4 pt-4">
        {/* Hero / Logo Section */}
        <div className="flex flex-col items-center justify-center py-6 sm:py-8">
          <div className="size-16 sm:size-20 bg-[#137fec]/10 rounded-full flex items-center justify-center text-[#137fec] mb-4 sm:mb-6 ring-6 sm:ring-8 ring-[#137fec]/5">
            <span className="material-symbols-outlined text-[32px] sm:text-[40px]">shield_person</span>
          </div>
          <h1 className="tracking-tight text-xl sm:text-[28px] font-bold leading-tight text-center mb-1.5 sm:mb-2">Welcome Back</h1>
          <p className="text-[#637588] text-sm sm:text-base font-normal leading-normal text-center max-w-[280px]">
            Sign in to manage the trading dashboard and user accounts
          </p>
        </div>

        <div className="h-3 sm:h-4"></div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-xl text-sm">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Admin ID Field */}
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <label className="text-sm font-semibold leading-normal ml-1">Admin ID</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 sm:left-4 text-[#637588]">
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">badge</span>
              </span>
              <input 
                type="text"
                name="adminId"
                value={formData.adminId}
                onChange={handleChange}
                className="flex w-full min-w-0 flex-1 rounded-xl border border-[#dbe0e6] bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 h-12 sm:h-14 placeholder:text-[#637588] pl-10 sm:pl-11 pr-4 text-sm sm:text-base font-normal leading-normal transition-all outline-none"
                placeholder="Enter your 6-digit ID"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <label className="text-sm font-semibold leading-normal ml-1">Password</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 sm:left-4 text-[#637588]">
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">lock</span>
              </span>
              <input 
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="flex w-full min-w-0 flex-1 rounded-xl border border-[#dbe0e6] bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 h-12 sm:h-14 placeholder:text-[#637588] pl-10 sm:pl-11 pr-11 sm:pr-12 text-sm sm:text-base font-normal leading-normal transition-all outline-none"
                placeholder="••••••••"
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-0 bottom-0 px-3 sm:px-4 flex items-center justify-center text-[#637588] hover:text-[#137fec] transition-colors"
              >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Forgot Password */}
          <div className="flex justify-end mt-0.5 sm:mt-1">
            <button type="button" className="text-[#137fec] text-xs sm:text-sm font-semibold hover:text-blue-700 transition-colors">
              Forgot Password?
            </button>
          </div>

          {/* Login Button */}
          <button 
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl bg-[#137fec] py-3.5 sm:py-4 px-4 text-white text-sm sm:text-base font-semibold leading-normal shadow-md shadow-blue-500/20 hover:bg-blue-600 active:scale-[0.98] disabled:bg-blue-400 transition-all mt-1 sm:mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                <span>Signing in...</span>
              </>
            ) : (
              'Secure Login'
            )}
          </button>

          {/* Biometric Option */}
          <button 
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent hover:bg-slate-50 py-2.5 sm:py-3 px-4 text-[#137fec] text-xs sm:text-sm font-semibold leading-normal transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">fingerprint</span>
            <span>Login with Biometrics</span>
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="mt-auto py-6 sm:py-8 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
          <span className="material-symbols-outlined text-[12px] sm:text-[14px] text-emerald-500">lock</span>
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-[#637588]">End-to-End Encrypted</span>
        </div>
        <p className="text-[10px] sm:text-xs text-[#9CA3AF] font-medium mt-1 sm:mt-2">v2.4.0 • Authorized Personnel Only</p>
      </div>
    </div>
  );
};

export default Login;