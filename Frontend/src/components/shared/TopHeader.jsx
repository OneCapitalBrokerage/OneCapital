import { useNavigate } from 'react-router-dom';

const TopHeader = ({ 
  title, 
  showBack = false, 
  showProfile = true,
  showHelp = false,
  customerId,
  rightAction,
  onBackClick 
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-white dark:bg-[#050806] border-b border-gray-100 dark:border-[#22352d]">
      <div className="flex items-center p-4 justify-between h-14">
        {/* Left Side */}
        <div className="flex items-center gap-2 w-10">
          {showBack ? (
            <button 
              onClick={handleBack}
              className="flex items-center justify-center text-[#111418] dark:text-[#e8f3ee] hover:opacity-70 transition-opacity"
            >
              <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
            </button>
          ) : showProfile ? (
            <div className="bg-primary/10 flex items-center justify-center rounded-full size-10 text-primary">
              <span className="material-symbols-outlined text-[24px]">account_circle</span>
            </div>
          ) : (
            <div className="w-10" />
          )}
        </div>

        {/* Center */}
        <div className="flex flex-col items-center flex-1 text-center">
          <h1 className="text-lg font-bold leading-tight text-[#111418] dark:text-[#e8f3ee]">
            {title}
          </h1>
          {customerId && (
            <p className="text-[#617589] dark:text-[#9cb7aa] text-xs">
              ID: {customerId}
            </p>
          )}
        </div>

        {/* Right Side */}
        <div className="flex items-center justify-end w-10">
          {rightAction ? (
            rightAction
          ) : showHelp ? (
            <button className="text-primary text-sm font-semibold hover:opacity-80">
              Help
            </button>
          ) : (
            <button className="flex items-center justify-center text-[#111418] dark:text-[#e8f3ee]">
              <span className="material-symbols-outlined text-[24px]">notifications</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopHeader;