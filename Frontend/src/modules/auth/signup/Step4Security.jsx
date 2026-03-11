import { useState } from 'react';

const getStrength = (pw) => {
  if (!pw) return { strength: 0, label: '', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return {
    strength: s,
    label: ['', 'Weak', 'Fair', 'Good', 'Strong'][s],
    color: ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'][s],
  };
};

const Step4Security = ({ data, onUpdate, errors }) => {
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pwStrength = getStrength(data.password);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Account Password</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          Set a strong password. Your login ID will be assigned by your broker after account approval.
        </p>
      </div>

      <div className="bg-[#f6f7f8] rounded-xl p-3 flex gap-2.5">
        <span className="material-symbols-outlined text-[#617589] text-[18px] shrink-0 mt-0.5">info</span>
        <p className="text-[#617589] text-[11px] leading-relaxed">
          Your Customer ID (login ID) will be generated and shared with you once your broker
          approves your application.
        </p>
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Password <span className="text-red-500">*</span></label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">lock</span>
          <input
            type={showPw ? 'text' : 'password'}
            value={data.password}
            onChange={(e) => onUpdate({ password: e.target.value })}
            className={`w-full rounded-xl border bg-white h-10 sm:h-11 pl-10 pr-10 text-sm focus:ring-1 outline-none transition-all placeholder:text-gray-400 ${errors?.password ? 'border-red-400 focus:ring-red-400' : 'border-[#dbe0e6] focus:border-[#137fec] focus:ring-[#137fec]'}`}
            placeholder="Min 8 characters"
          />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
            <span className="material-symbols-outlined text-gray-400 text-[18px]">{showPw ? 'visibility' : 'visibility_off'}</span>
          </button>
        </div>
        {data.password && (
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex gap-0.5 flex-1">
              {[1,2,3,4].map((l) => (
                <div key={l} className={`h-1 flex-1 rounded-full ${l <= pwStrength.strength ? pwStrength.color : 'bg-gray-200'}`} />
              ))}
            </div>
            <p className="text-[10px] text-gray-500">{pwStrength.label}</p>
          </div>
        )}
        {errors?.password && <p className="text-red-500 text-[11px]">{errors.password}</p>}
      </div>

      {/* Confirm Password */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Confirm Password <span className="text-red-500">*</span></label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">lock_reset</span>
          <input
            type={showConfirm ? 'text' : 'password'}
            value={data.confirm_password}
            onChange={(e) => onUpdate({ confirm_password: e.target.value })}
            className={`w-full rounded-xl border bg-white h-10 sm:h-11 pl-10 pr-10 text-sm focus:ring-1 outline-none transition-all placeholder:text-gray-400 ${
              data.confirm_password && data.password !== data.confirm_password ? 'border-red-400 focus:ring-red-400' :
              data.confirm_password && data.password === data.confirm_password ? 'border-green-500 focus:ring-green-500' :
              'border-[#dbe0e6] focus:border-[#137fec] focus:ring-[#137fec]'
            }`}
            placeholder="Re-enter password"
          />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
            <span className="material-symbols-outlined text-gray-400 text-[18px]">{showConfirm ? 'visibility' : 'visibility_off'}</span>
          </button>
        </div>
        {data.confirm_password && data.password !== data.confirm_password && (
          <p className="text-red-500 text-[11px]">Passwords do not match</p>
        )}
        {errors?.confirm_password && <p className="text-red-500 text-[11px]">{errors.confirm_password}</p>}
      </div>
    </div>
  );
};

export default Step4Security;
