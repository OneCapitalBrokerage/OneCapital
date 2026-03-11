const OCCUPATIONS = [
  { value: 'salaried', label: 'Salaried' },
  { value: 'business', label: 'Business' },
  { value: 'professional', label: 'Professional' },
  { value: 'student', label: 'Student' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Others' },
];

const INCOMES = [
  { value: 'below_1l', label: 'Below ₹1 Lakh' },
  { value: '1l_5l', label: '₹1 – 5 Lakhs' },
  { value: '5l_10l', label: '₹5 – 10 Lakhs' },
  { value: '10l_25l', label: '₹10 – 25 Lakhs' },
  { value: 'above_25l', label: 'Above ₹25 Lakhs' },
];

const MAX_DOB = new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().split('T')[0];

const InputRow = ({ icon, label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[#111418] text-xs sm:text-sm font-medium">{label}</label>
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">{icon}</span>}
      {children}
    </div>
  </div>
);

const inputCls = (hasIcon = true) =>
  `w-full rounded-xl border border-[#dbe0e6] bg-white h-10 sm:h-11 ${hasIcon ? 'pl-10' : 'pl-3'} pr-3 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400`;

const Step2PersonalInfo = ({ data, onUpdate, errors }) => {
  const handle = (field) => (e) => onUpdate({ [field]: e.target.value });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Personal Information</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">Enter your basic details exactly as per your documents.</p>
      </div>

      {/* Full Name */}
      <InputRow icon="badge" label="Full Name (as per PAN)">
        <input
          type="text"
          value={data.full_name}
          onChange={handle('full_name')}
          className={`${inputCls()} ${errors?.full_name ? 'border-red-400' : ''}`}
          placeholder="e.g. Rahul Sharma"
        />
        {errors?.full_name && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{errors.full_name}</p>}
      </InputRow>

      {/* Date of Birth */}
      <InputRow icon="cake" label="Date of Birth">
        <input
          type="date"
          value={data.date_of_birth}
          onChange={handle('date_of_birth')}
          max={MAX_DOB}
          className={`${inputCls()} ${errors?.date_of_birth ? 'border-red-400' : ''}`}
        />
        {errors?.date_of_birth && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{errors.date_of_birth}</p>}
      </InputRow>

      {/* Gender */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Gender</label>
        <div className="flex gap-2">
          {['male', 'female', 'other'].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onUpdate({ gender: g })}
              className={`flex-1 h-10 sm:h-11 rounded-xl border text-sm font-medium transition-all capitalize ${
                data.gender === g
                  ? 'border-[#137fec] bg-[#137fec]/10 text-[#137fec]'
                  : 'border-[#dbe0e6] text-gray-500 hover:border-gray-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        {errors?.gender && <p className="text-red-500 text-[11px] mt-0.5">{errors.gender}</p>}
      </div>

      {/* Occupation */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Occupation</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">work</span>
          <select
            value={data.occupation}
            onChange={handle('occupation')}
            className={`${inputCls()} appearance-none pr-8 ${errors?.occupation ? 'border-red-400' : ''}`}
          >
            <option value="">Select occupation</option>
            {OCCUPATIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px] pointer-events-none">expand_more</span>
        </div>
        {errors?.occupation && <p className="text-red-500 text-[11px] mt-0.5">{errors.occupation}</p>}
      </div>

      {/* Annual Income */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Annual Income <span className="text-gray-400 font-normal">(optional)</span></label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">account_balance_wallet</span>
          <select
            value={data.annual_income}
            onChange={handle('annual_income')}
            className={`${inputCls()} appearance-none pr-8`}
          >
            <option value="">Select range</option>
            {INCOMES.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px] pointer-events-none">expand_more</span>
        </div>
      </div>
    </div>
  );
};

export default Step2PersonalInfo;
