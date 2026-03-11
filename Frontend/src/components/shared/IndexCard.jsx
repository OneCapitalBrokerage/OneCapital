const IndexCard = ({ 
  name, 
  value, 
  change, 
  changePercent,
  onClick 
}) => {
  const isPositive = change >= 0;
  const changeColor = isPositive ? 'text-green-500' : 'text-red-500';
  const bgGradient = isPositive 
    ? 'from-green-50 to-white dark:from-green-900/20 dark:to-[#0b120f]'
    : 'from-red-50 to-white dark:from-red-900/20 dark:to-[#0b120f]';
  const arrow = isPositive ? 'arrow_drop_up' : 'arrow_drop_down';

  return (
    <div
      onClick={onClick}
      className={`min-w-[140px] bg-gradient-to-br ${bgGradient} rounded-xl p-3 border border-gray-100 dark:border-[#22352d] cursor-pointer hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-[#9cb7aa] uppercase tracking-wide">
          {name}
        </span>
        <span className={`material-symbols-outlined ${changeColor} text-xl`}>
          {arrow}
        </span>
      </div>
      <div className="font-bold text-lg text-gray-900 dark:text-[#e8f3ee] tnum">
        {value?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </div>
      <div className={`text-xs font-medium ${changeColor} tnum`}>
        {isPositive ? '+' : ''}{change?.toFixed(2)} ({isPositive ? '+' : ''}{changePercent?.toFixed(2)}%)
      </div>
    </div>
  );
};

export default IndexCard;
