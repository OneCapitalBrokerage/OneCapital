const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];

const inputCls = (hasIcon = true, error = false) =>
  `w-full rounded-xl border bg-white h-10 sm:h-11 ${hasIcon ? 'pl-10' : 'pl-3'} pr-3 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400 ${error ? 'border-red-400' : 'border-[#dbe0e6]'}`;

const Step3ContactAddress = ({ data, onUpdate, errors }) => {
  const handle = (field) => (e) => onUpdate({ [field]: e.target.value });
  const handleAddr = (field) => (e) => onUpdate({ address: { ...data.address, [field]: e.target.value } });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Contact & Address</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">Your contact information and residential address.</p>
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Mobile Number</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">smartphone</span>
          <input
            type="tel"
            value={data.mobile_number}
            onChange={(e) => onUpdate({ mobile_number: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            className={inputCls(true, !!errors?.mobile_number)}
            placeholder="10-digit mobile"
          />
        </div>
        {errors?.mobile_number && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{errors.mobile_number}</p>}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Email Address</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">mail</span>
          <input
            type="email"
            value={data.email}
            onChange={handle('email')}
            className={inputCls(true, !!errors?.email)}
            placeholder="you@example.com"
          />
        </div>
        {errors?.email && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{errors.email}</p>}
      </div>

      {/* Address */}
      <div className="flex flex-col gap-1 mt-1">
        <label className="text-[#111418] text-xs sm:text-sm font-semibold">Residential Address</label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs font-medium">Street / House No.</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">home</span>
          <input
            type="text"
            value={data.address?.street || ''}
            onChange={handleAddr('street')}
            className={inputCls(true, !!errors?.['address.street'])}
            placeholder="House no., street name"
          />
        </div>
        {errors?.['address.street'] && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{errors['address.street']}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[#111418] text-xs font-medium">City</label>
          <input
            type="text"
            value={data.address?.city || ''}
            onChange={handleAddr('city')}
            className={`w-full rounded-xl border bg-white h-10 px-3 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400 ${errors?.['address.city'] ? 'border-red-400' : 'border-[#dbe0e6]'}`}
            placeholder="City"
          />
          {errors?.['address.city'] && <p className="text-red-500 text-[11px] mt-0.5">{errors['address.city']}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[#111418] text-xs font-medium">Pincode</label>
          <input
            type="text"
            value={data.address?.pincode || ''}
            onChange={(e) => onUpdate({ address: { ...data.address, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) } })}
            className={`w-full rounded-xl border bg-white h-10 px-3 text-sm font-mono focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400 ${errors?.['address.pincode'] ? 'border-red-400' : 'border-[#dbe0e6]'}`}
            placeholder="6-digit PIN"
            maxLength={6}
          />
          {errors?.['address.pincode'] && <p className="text-red-500 text-[11px] mt-0.5">{errors['address.pincode']}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs font-medium">State</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">location_on</span>
          <select
            value={data.address?.state || ''}
            onChange={handleAddr('state')}
            className={`w-full rounded-xl border bg-white h-10 sm:h-11 pl-10 pr-8 text-sm appearance-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all ${errors?.['address.state'] ? 'border-red-400' : 'border-[#dbe0e6]'}`}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px] pointer-events-none">expand_more</span>
        </div>
        {errors?.['address.state'] && <p className="text-red-500 text-[11px] mt-0.5">{errors['address.state']}</p>}
      </div>
    </div>
  );
};

export default Step3ContactAddress;
