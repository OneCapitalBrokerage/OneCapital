import { Outlet } from 'react-router-dom';

const AdminLayout = () => {
  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806] flex">
      <aside className="w-64 bg-white dark:bg-[#1e293b] border-r border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2">
          <img src="/logo/fullname-logo-1024px.png" alt="OneCapital" className="h-8 w-auto object-contain scale-[1.35]" />
          <h2 className="text-xl font-bold text-primary">OneCapital Admin</h2>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;