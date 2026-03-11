import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminContext';

const Settings = () => {
  const navigate = useNavigate();
  const { admin, logout } = useAdminAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const menuItems = [
    { icon: 'vpn_key', label: 'Access Token', description: 'Kite broker token status', action: () => navigate('/admin/access-token') },
    { icon: 'description', label: 'Logs', description: 'View system activity logs', action: () => navigate('/admin/logs') },
  ];

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Settings</h1>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 flex flex-col gap-4">
        {/* Admin Profile Card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="size-14 rounded-full bg-gradient-to-br from-[#137fec] to-purple-500 flex items-center justify-center text-white font-bold text-xl">
            {(admin?.name || 'A').charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold">{admin?.name || 'Admin'}</h2>
            <p className="text-xs text-gray-500">Administrator</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Role: {admin?.role || 'admin'}</p>
          </div>
          <span className="material-symbols-outlined text-gray-400">chevron_right</span>
        </div>

        {/* Menu Items */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
          {menuItems.map((item, idx) => (
            <button
              key={idx}
              onClick={item.action || undefined}
              className="w-full flex items-center gap-3 p-3.5 sm:p-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="size-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px] text-gray-600">{item.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{item.description}</p>
              </div>
              <span className="material-symbols-outlined text-gray-300 text-[18px]">chevron_right</span>
            </button>
          ))}
        </div>

        {/* Logout Button */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center justify-center gap-2 bg-white rounded-xl border border-red-200 p-3.5 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          Sign Out
        </button>

        {/* Version */}
        <p className="text-center text-[10px] text-gray-400 mt-2">OneCapital Admin v2.4.0</p>
      </main>

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 sm:m-4">
            <h3 className="text-lg font-bold mb-2">Sign Out</h3>
            <p className="text-sm text-gray-500 mb-5">Are you sure you want to sign out of the admin panel?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={logout}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full max-w-md mx-auto bg-white border-t border-gray-200 z-30">
        <div className="flex justify-around items-center h-14 sm:h-16">
          <button onClick={() => navigate('/admin/dashboard')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">dashboard</span>
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          <button onClick={() => navigate('/admin/customers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">group</span>
            <span className="text-[10px] font-medium">Customers</span>
          </button>
          <button onClick={() => navigate('/admin/brokers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">corporate_fare</span>
            <span className="text-[10px] font-medium">Brokers</span>
          </button>
          <button onClick={() => navigate('/admin/chats')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chat</span>
            <span className="text-[10px] font-medium">Chats</span>
          </button>
          <button onClick={() => navigate('/admin/settings')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-[#137fec]">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">settings</span>
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Settings;
