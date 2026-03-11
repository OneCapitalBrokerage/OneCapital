import { Outlet } from 'react-router-dom';
import BottomNavigation from '../components/shared/BottomNavigation';
import ImpersonationBanner from '../components/shared/ImpersonationBanner';

const CustomerLayout = () => {
  return (
    <div className="relative flex size-full min-h-screen flex-col bg-white dark:bg-[#050806] font-['Inter']">
      <ImpersonationBanner />
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
};

export default CustomerLayout;
