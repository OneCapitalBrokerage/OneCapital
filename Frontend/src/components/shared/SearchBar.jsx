const SearchBar = ({ 
  placeholder = 'Search...', 
  value = '', 
  onChange, 
  onSearch,
  showFilter = false,
  onFilterClick,
  className = ''
}) => {
  return (
    <div className={`flex w-full items-stretch rounded-lg h-10 ${className}`}>
      <div className="text-[#617589] dark:text-[#9cb7aa] flex border-none bg-[#f0f2f4] dark:bg-[#0b120f] items-center justify-center pl-4 rounded-l-lg">
        <span className="material-symbols-outlined text-[20px]">search</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch?.()}
        className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden text-[#111418] dark:text-[#e8f3ee] focus:outline-0 focus:ring-0 border-none bg-[#f0f2f4] dark:bg-[#0b120f] focus:border-none h-full placeholder:text-[#617589] dark:placeholder:text-gray-500 px-4 pl-2 text-sm font-normal leading-normal rounded-none"
        placeholder={placeholder}
      />
      {showFilter && (
        <button 
          onClick={onFilterClick}
          className="text-[#617589] dark:text-[#9cb7aa] flex border-none bg-[#f0f2f4] dark:bg-[#0b120f] items-center justify-center pr-4 rounded-r-lg hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </button>
      )}
      {!showFilter && (
        <div className="bg-[#f0f2f4] dark:bg-[#0b120f] w-4 rounded-r-lg" />
      )}
    </div>
  );
};

export default SearchBar;