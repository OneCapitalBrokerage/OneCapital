import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrokerAuth } from '../../context/BrokerContext';

const Login = () => {
  const navigate = useNavigate();
  const { login, error: authError, setError: setAuthError } = useBrokerAuth();
  const [brokerId, setBrokerId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!brokerId || !password) {
      setError('Please enter both Broker ID and Password');
      return;
    }
    setLoading(true);
    setError('');
    if (setAuthError) setAuthError(null);
    
    try {
      await login(brokerId, password);
      navigate('/broker/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col justify-start sm:justify-between overflow-x-hidden overflow-y-auto bg-[#f6f7f8]">
      {/* Header & Branding */}
      <div className="flex flex-col items-center pt-8 sm:pt-12 pb-3 sm:pb-4 px-4">
        <div className="size-12 sm:size-14 bg-white shadow-sm border border-gray-200 rounded-xl flex items-center justify-center mb-3 sm:mb-4 transform transition-transform hover:scale-105">
          <span className="material-symbols-outlined text-[#137fec] text-[28px] sm:text-[32px]">candlestick_chart</span>
        </div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Broker Terminal</h2>
      </div>

      {/* Main Login Form */}
      <div className="flex-1 flex flex-col px-4 sm:px-6 max-w-[420px] mx-auto w-full justify-start sm:justify-center -mt-2 sm:-mt-10">
        <div className="pb-5 sm:pb-8">
          <h1 className="text-[#111418] text-[22px] sm:text-[28px] font-bold leading-tight text-center tracking-tight">Welcome Back</h1>
          <p className="text-[#617589] text-[13px] sm:text-base font-normal leading-normal pt-1.5 sm:pt-2 text-center">Login to access your trading dashboard.</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-3.5 sm:gap-5">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {/* Broker ID Field */}
          <label className="flex flex-col w-full group">
            <span className="text-[#111418] text-xs sm:text-sm font-semibold leading-normal pb-1.5 sm:pb-2 ml-1">Broker ID</span>
            <div className="flex w-full items-stretch rounded-lg border border-gray-200 bg-white group-focus-within:border-[#137fec] group-focus-within:ring-1 group-focus-within:ring-[#137fec]/20 transition-all duration-200 h-11 sm:h-14 overflow-hidden shadow-sm">
              <input 
                className="flex w-full min-w-0 flex-1 resize-none bg-transparent text-[#111418] focus:outline-none placeholder:text-gray-400 p-3 sm:p-[15px] text-sm sm:text-base font-normal leading-normal border-none focus:ring-0" 
                placeholder="AB1234" 
                type="text"
                value={brokerId}
                onChange={(e) => setBrokerId(e.target.value)}
              />
              <div className="text-[#617589] flex items-center justify-center pr-3 sm:pr-[15px] pl-2">
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">badge</span>
              </div>
            </div>
          </label>

          {/* Password Field */}
          <label className="flex flex-col w-full group">
            <span className="text-[#111418] text-xs sm:text-sm font-semibold leading-normal pb-1.5 sm:pb-2 ml-1">Password</span>
            <div className="flex w-full items-stretch rounded-lg border border-gray-200 bg-white group-focus-within:border-[#137fec] group-focus-within:ring-1 group-focus-within:ring-[#137fec]/20 transition-all duration-200 h-11 sm:h-14 overflow-hidden shadow-sm">
              <input 
                className="flex w-full min-w-0 flex-1 resize-none bg-transparent text-[#111418] focus:outline-none placeholder:text-gray-400 p-3 sm:p-[15px] text-sm sm:text-base font-normal leading-normal border-none focus:ring-0" 
                placeholder="••••••••" 
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[#617589] hover:text-[#111418] transition-colors flex items-center justify-center pr-3 sm:pr-[15px] pl-2 cursor-pointer focus:outline-none"
              >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </label>

          <div className="flex justify-end -mt-1">
            <button type="button" className="text-[#137fec] hover:text-[#137fec]/80 text-xs sm:text-sm font-semibold transition-colors">
              Forgot Password?
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 sm:gap-4 mt-1 sm:mt-2">
            <button 
              type="submit"
              disabled={loading}
              className="relative flex w-full items-center justify-center rounded-lg bg-[#137fec] h-11 sm:h-12 hover:bg-[#137fec]/90 active:bg-[#137fec]/95 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.1)] group disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="text-white text-sm sm:text-base font-bold leading-normal">Logging in...</span>
              ) : (
                <>
                  <span className="text-white text-sm sm:text-base font-bold leading-normal">Login Securely</span>
                  <div className="absolute right-3 sm:right-4 text-white/80 group-hover:text-white transition-colors">
                    <span className="material-symbols-outlined text-[16px] sm:text-[18px]">lock</span>
                  </div>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex w-full items-center justify-center rounded-lg border border-[#137fec]/30 bg-white h-10 sm:h-11 text-[#137fec] hover:bg-[#eaf4ff] transition-colors text-sm sm:text-base font-semibold"
            >
              Customer Login
            </button>

            <div className="relative flex items-center py-1 sm:py-2">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="flex-shrink-0 mx-3 sm:mx-4 text-[#617589] text-[10px] sm:text-xs font-medium uppercase tracking-wider">Or</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            <div className="flex justify-center">
              <button 
                type="button"
                className="flex items-center justify-center gap-2 p-2.5 sm:p-3 rounded-full bg-white border border-gray-200 text-[#137fec] hover:bg-gray-50 transition-all shadow-sm active:scale-95 w-12 h-12 sm:w-14 sm:h-14"
              >
                <span className="material-symbols-outlined text-[24px] sm:text-[28px]">face</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="py-4 sm:py-6 pb-6 sm:pb-8 px-4 flex flex-col items-center gap-2.5 sm:gap-4">
        <button className="text-[#617589] hover:text-[#137fec] text-xs sm:text-sm font-medium transition-colors">
          Need Help? Contact Support
        </button>
        <div className="flex items-center gap-1.5 opacity-70 bg-gray-100 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border border-gray-200 max-w-full">
          <span className="material-symbols-outlined text-green-600 text-[14px] sm:text-[16px]">verified_user</span>
          <span className="text-[#617589] text-[9px] sm:text-[11px] leading-tight text-center font-medium tracking-wide">SECURED BY 256-BIT ENCRYPTION • v1.0.4</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
