import { useAuth } from '../../context/AuthContext';

const DealerModeBanner = () => {
  const { dealerMode } = useAuth();

  if (!dealerMode) return null;

  return (
    <div className="sticky top-0 z-[59] flex items-center justify-center gap-2 bg-red-500 px-3 py-2 text-white">
      <span className="material-symbols-outlined text-[16px]">lock</span>
      <span className="text-xs font-medium">
        View-Only Mode: Trading and fund operations are disabled. Contact your broker.
      </span>
    </div>
  );
};

export default DealerModeBanner;
