import { Outlet } from 'react-router-dom';
import BrokerBottomNav from '../components/shared/BrokerBottomNav';
import {
  hasAdminBrokerSwitchSnapshot,
  restoreAdminFromBrokerSwitch,
} from '../utils/adminBrokerSwitch';

const BrokerLayout = () => {
  const showBackToAdmin = hasAdminBrokerSwitchSnapshot();

  const handleBackToAdmin = () => {
    restoreAdminFromBrokerSwitch('/admin/brokers');
  };

  return (
    <div className="min-h-screen bg-[#f2f4f6]">
      {showBackToAdmin && (
        <div className="sticky top-0 z-40 flex items-center justify-between bg-indigo-600 px-3 py-2 text-white">
          <p className="text-xs font-medium">Admin switched into broker session</p>
          <button
            onClick={handleBackToAdmin}
            className="rounded-md bg-white/20 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/30 transition-colors"
          >
            Back to Admin
          </button>
        </div>
      )}
      <Outlet />
      <BrokerBottomNav />
    </div>
  );
};

export default BrokerLayout;
