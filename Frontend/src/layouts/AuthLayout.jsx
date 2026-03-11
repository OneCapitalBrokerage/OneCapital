import { Outlet } from 'react-router-dom';

const AuthLayout = () => {
  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806] flex items-center justify-center">
      <Outlet />
    </div>
  );
};

export default AuthLayout;