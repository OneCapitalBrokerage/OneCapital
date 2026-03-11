const StockCard = ({ 
  symbol, 
  fullName, 
  exchange = 'NSE', 
  ltp, 
  change, 
  changePercent, 
  hasEvent = false,
  isSelected = false,
  onClick 
}) => {
  const isPositive = change >= 0;
  const changeColor = isPositive ? 'text-[#078838]' : 'text-red-500';
  const arrowIcon = isPositive ? 'arrow_drop_up' : 'arrow_drop_down';

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-4 min-h-[72px] py-3 justify-between hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors cursor-pointer group ${
        isSelected ? 'bg-gray-50 dark:bg-[#0b120f]/50 border-l-4 border-primary' : ''
      }`}
    >
      {/* Left Side - Stock Info */}
      <div className="flex flex-col justify-center">
        <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-semibold leading-normal line-clamp-1">
          {symbol}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[#9CA3AF] dark:text-[#6f8b7f] text-[10px] font-medium border border-[#e5e7eb] dark:border-[#22352d] rounded px-1">
            {exchange}
          </span>
          {hasEvent && (
            <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[9px] font-bold px-1.5 rounded-sm">
              EVENT
            </span>
          )}
          {fullName && (
            <p className="text-[#617589] dark:text-[#9cb7aa] text-xs font-normal leading-normal line-clamp-2">
              {fullName}
            </p>
          )}
        </div>
      </div>

      {/* Right Side - Price Info */}
      <div className="flex flex-col items-end shrink-0">
        <p className="text-[#111418] dark:text-[#e8f3ee] text-base font-medium leading-normal tabular-nums">
          ₹{ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className="flex items-center gap-1">
          <p className={`${changeColor} text-xs font-medium leading-normal tabular-nums`}>
            {isPositive ? '+' : ''}{change?.toFixed(2)} ({isPositive ? '+' : ''}{changePercent?.toFixed(2)}%)
          </p>
          <span className={`material-symbols-outlined ${changeColor} text-[12px]`}>
            {arrowIcon}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StockCard;