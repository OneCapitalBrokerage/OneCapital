const SEGMENTS = [
  {
    value: 'EQUITY',
    label: 'Equity',
    icon: 'candlestick_chart',
    desc: 'Buy and sell shares of listed companies',
  },
  {
    value: 'F&O',
    label: 'Futures & Options',
    icon: 'trending_up',
    desc: 'Derivatives — higher risk, requires income proof',
    requiresIncome: true,
  },
  {
    value: 'COMMODITY',
    label: 'Commodity',
    icon: 'local_shipping',
    desc: 'Gold, silver, crude oil, agricultural goods',
  },
  {
    value: 'CURRENCY',
    label: 'Currency',
    icon: 'currency_exchange',
    desc: 'Forex derivatives on INR pairs',
  },
];

const Step6Segments = ({ data, onUpdate }) => {
  const selected = data.segments || ['EQUITY'];

  const toggle = (val) => {
    const next = selected.includes(val)
      ? selected.filter((s) => s !== val)
      : [...selected, val];
    // Always keep at least one segment
    if (next.length === 0) return;
    onUpdate({ segments: next });
  };

  const foSelected = selected.includes('F&O');
  const needsIncome = foSelected && !['5l_10l', '10l_25l', 'above_25l'].includes(data.annual_income || '');

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Trading Segments</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">Select the markets you wish to trade in. You can change these later.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {SEGMENTS.map((seg) => {
          const isSelected = selected.includes(seg.value);
          return (
            <button
              key={seg.value}
              type="button"
              onClick={() => toggle(seg.value)}
              className={`w-full flex items-center gap-3 p-3 sm:p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-[#137fec] bg-[#137fec]/5'
                  : 'border-[#dbe0e6] hover:border-gray-300'
              }`}
            >
              <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-[#137fec]/10' : 'bg-gray-100'}`}>
                <span className={`material-symbols-outlined text-[20px] ${isSelected ? 'text-[#137fec]' : 'text-gray-400'}`}>
                  {seg.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isSelected ? 'text-[#111418]' : 'text-gray-500'}`}>{seg.label}</p>
                <p className={`text-[11px] sm:text-xs mt-0.5 ${isSelected ? 'text-[#617589]' : 'text-gray-400'}`}>{seg.desc}</p>
              </div>
              <div className={`size-5 rounded-full border-2 shrink-0 flex items-center justify-center ${isSelected ? 'border-[#137fec] bg-[#137fec]' : 'border-gray-300'}`}>
                {isSelected && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
              </div>
            </button>
          );
        })}
      </div>

      {needsIncome && (
        <div className="flex items-start gap-2 bg-yellow-50 rounded-xl p-3">
          <span className="material-symbols-outlined text-yellow-600 text-[18px] shrink-0 mt-0.5">warning</span>
          <p className="text-yellow-700 text-[11px] sm:text-xs">
            F&O trading requires annual income of ₹5 Lakhs or above. Please update your income in the Personal Info step, or you may need to provide income proof documents.
          </p>
        </div>
      )}
    </div>
  );
};

export default Step6Segments;
