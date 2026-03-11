const RELATIONS = ['Father','Mother','Spouse','Son','Daughter','Brother','Sister','Other'];

const Step5Nominee = ({ data, onUpdate }) => {
  const handle = (field) => (e) =>
    onUpdate({ nominee: { ...data.nominee, [field]: e.target.value } });

  const nom = data.nominee || {};

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Nominee Details</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          Optional but recommended by SEBI. Your nominee will be the beneficiary in case of unforeseen events.
        </p>
      </div>

      <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
        <span className="material-symbols-outlined text-[#137fec] text-[18px] shrink-0 mt-0.5">info</span>
        <p className="text-[11px] sm:text-xs text-[#137fec]">
          You can skip this step and add a nominee later from your profile settings.
        </p>
      </div>

      {/* Nominee Name */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Nominee Full Name</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">person</span>
          <input
            type="text"
            value={nom.name || ''}
            onChange={handle('name')}
            className="w-full rounded-xl border border-[#dbe0e6] bg-white h-10 sm:h-11 pl-10 pr-3 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400"
            placeholder="Full name"
          />
        </div>
      </div>

      {/* Relationship */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Relationship</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">family_restroom</span>
          <select
            value={nom.relation || ''}
            onChange={handle('relation')}
            className="w-full rounded-xl border border-[#dbe0e6] bg-white h-10 sm:h-11 pl-10 pr-8 text-sm appearance-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all"
          >
            <option value="">Select relationship</option>
            {RELATIONS.map((r) => <option key={r} value={r.toLowerCase()}>{r}</option>)}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px] pointer-events-none">expand_more</span>
        </div>
      </div>

      {/* Date of Birth */}
      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">Nominee Date of Birth</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">cake</span>
          <input
            type="date"
            value={nom.date_of_birth || ''}
            onChange={handle('date_of_birth')}
            className="w-full rounded-xl border border-[#dbe0e6] bg-white h-10 sm:h-11 pl-10 pr-3 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all"
          />
        </div>
        <p className="text-gray-400 text-[11px]">Required if nominee is a minor (under 18)</p>
      </div>

      {/* Guardian (if minor) */}
      {nom.date_of_birth && new Date(nom.date_of_birth) > new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000) && (
        <div className="flex flex-col gap-1">
          <label className="text-[#111418] text-xs sm:text-sm font-medium">Guardian Name <span className="text-red-500">*</span></label>
          <p className="text-[11px] text-gray-400 -mt-0.5">Nominee is a minor. Guardian details required.</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">shield_person</span>
            <input
              type="text"
              value={nom.guardian || ''}
              onChange={handle('guardian')}
              className="w-full rounded-xl border border-[#dbe0e6] bg-white h-10 sm:h-11 pl-10 pr-3 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400"
              placeholder="Guardian full name"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Step5Nominee;
