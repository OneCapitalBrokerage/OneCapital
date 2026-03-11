import { Outlet } from 'react-router-dom';
import BrokerBottomNav from '../components/shared/BrokerBottomNav';

const BrokerLayout = () => {
  return (
    <div className="min-h-screen bg-[#f2f4f6]">
      <Outlet />
      <BrokerBottomNav />
    </div>
  );
};

export default BrokerLayout;
