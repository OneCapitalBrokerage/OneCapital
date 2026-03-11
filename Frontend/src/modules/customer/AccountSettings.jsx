import { useState, useEffect, useCallback } from 'react';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/useTheme';

const AccountSettings = () => {
  const { changePassword } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      await customerApi.getSettings();
      // Settings loaded
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Change password
  const handleChangePassword = async () => {
    if (passwordData.new !== passwordData.confirm) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (passwordData.new.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    setPasswordError('');
    try {
      await changePassword(passwordData.current, passwordData.new);
      setShowPasswordModal(false);
      setPasswordData({ current: '', new: '', confirm: '' });
      alert('Password changed successfully');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const settingsItems = [
    { id: 'darkMode', icon: 'dark_mode', label: 'Dark Mode', toggle: true, value: isDark, onChange: () => toggleTheme() },
    { id: 'password', icon: 'lock', label: 'Change Password', toggle: false, action: () => setShowPasswordModal(true) },
    { id: 'email', icon: 'mail', label: 'Update Email', toggle: false },
    { id: 'phone', icon: 'phone', label: 'Update Phone', toggle: false },
  ];

  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806]">
      <TopHeader title="Settings" showBack={true} />

      <div className="px-4 py-5">
        <div className="bg-white dark:bg-[#111b17] rounded-2xl shadow-sm border border-gray-100 dark:border-[#22352d] overflow-hidden">
          {loading ? (
            [1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-[#22352d] last:border-0 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-gray-200 rounded"></div>
                  <div className="w-32 h-4 bg-gray-200 rounded"></div>
                </div>
                <div className="w-12 h-6 bg-gray-200 rounded-full"></div>
              </div>
            ))
          ) : (
            settingsItems.map((item, index) => (
              <div 
                key={item.id} 
                onClick={() => !item.toggle && item.action && item.action()}
                className={`flex items-center justify-between p-4 ${!item.toggle ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#16231d]' : ''} ${index !== settingsItems.length - 1 ? 'border-b border-gray-100 dark:border-[#22352d]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-gray-500">{item.icon}</span>
                  <span className="font-medium text-gray-900 dark:text-[#e8f3ee]">{item.label}</span>
                </div>
                {item.toggle ? (
                  <button onClick={() => item.onChange(!item.value)} className={`w-12 h-6 rounded-full transition-colors ${item.value ? 'bg-emerald-500 dark:bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'} relative`}>
                    <span className={`absolute top-0.5 ${item.value ? 'right-0.5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
                  </button>
                ) : (
                  <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-6">
          <button className="w-full py-4 text-red-500 font-semibold bg-red-50 dark:bg-red-900/20 rounded-xl">Delete Account</button>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#111b17] rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-[#e8f3ee] mb-4">Change Password</h3>
            {passwordError && (
              <div className="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded-lg">{passwordError}</div>
            )}
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Current Password"
                value={passwordData.current}
                onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                className="w-full p-3 border border-gray-200 dark:border-[#22352d] rounded-xl bg-transparent text-gray-900 dark:text-[#e8f3ee]"
              />
              <input
                type="password"
                placeholder="New Password"
                value={passwordData.new}
                onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                className="w-full p-3 border border-gray-200 dark:border-[#22352d] rounded-xl bg-transparent text-gray-900 dark:text-[#e8f3ee]"
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={passwordData.confirm}
                onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                className="w-full p-3 border border-gray-200 dark:border-[#22352d] rounded-xl bg-transparent text-gray-900 dark:text-[#e8f3ee]"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-3 border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-600 dark:text-[#9cb7aa] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={saving}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSettings;
