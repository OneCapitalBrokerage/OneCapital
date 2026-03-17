import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePWAInstall } from '../../context/PWAInstallContext';
import customerApi from '../../api/customer';
import { readSessionCache, writeSessionCache, clearSessionCache } from '../../utils/sessionCache';
import { ProfileWarningBanner } from '../../components/shared/WarningBanner';
import LegalBottomSheet from '../../components/shared/LegalBottomSheet';

const PROFILE_CACHE_KEY = 'profile_tab_v1';
const PROFILE_CACHE_TTL_MS = 60 * 1000;

const Profile = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // User data - populated from API
  const [user, setUser] = useState({
    name: '',
    email: '',
    phone: '',
    clientId: '',
    initials: ''
  });
  
  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState([]);

  // KYC status
  const [kycStatus, setKycStatus] = useState(null);

  // Fetch profile data
  const applyProfileState = useCallback((nextState) => {
    setUser(nextState?.user || {
      name: '',
      email: '',
      phone: '',
      clientId: '',
      initials: '',
      profilePhoto: '',
    });
    setBankAccounts(nextState?.bankAccounts || []);
    setKycStatus(nextState?.kycStatus || null);
  }, []);

  const fetchProfile = useCallback(async (options = {}) => {
    const { force = false } = options;

    if (!force) {
      const cached = readSessionCache(PROFILE_CACHE_KEY, PROFILE_CACHE_TTL_MS);
      if (cached?.data) {
        applyProfileState(cached.data);
        setError(null);
        setLoading(false);
        return;
      }
    } else {
      clearSessionCache(PROFILE_CACHE_KEY);
    }

    setLoading(true);
    setError(null);
    try {
      const [profileRes, bankRes, kycRes] = await Promise.all([
        customerApi.getProfile(),
        customerApi.getBankAccounts().catch(() => null),
        customerApi.getKycDocuments().catch(() => null)
      ]);

      const profile = profileRes.profile || profileRes.user || profileRes.data || profileRes;
      const nextUser = {
        name: profile.name || profile.fullName || '',
        email: profile.email || '',
        phone: profile.phone || profile.mobile || '',
        clientId: profile.id || profile.clientId || profile.userId || '',
        initials: profile.initials || '',
        profilePhoto: profile.profilePhoto || profile.avatar || ''
      };

      const nextBankAccounts = bankRes?.accounts || [];
      const nextKycStatus = kycRes?.kyc || null;

      applyProfileState({
        user: nextUser,
        bankAccounts: nextBankAccounts,
        kycStatus: nextKycStatus,
      });

      writeSessionCache(PROFILE_CACHE_KEY, {
        user: nextUser,
        bankAccounts: nextBankAccounts,
        kycStatus: nextKycStatus,
      });
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [applyProfileState]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Handle logout
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const { canInstall, triggerInstall } = usePWAInstall();
  const [activeLegalDocument, setActiveLegalDocument] = useState(null);

  const menuItems = [
    { icon: 'menu_book', label: 'Order Book', path: '/order-book' },
    { icon: 'payments', label: 'Payments', path: '/profile/payments' },
    { icon: 'help_outline', label: 'Help & Support', path: '/support', state: { backTo: '/profile' } },
    { icon: 'gavel', label: 'Terms & Conditions', action: () => setActiveLegalDocument('terms') },
    { icon: 'privacy_tip', label: 'Privacy Policy', action: () => setActiveLegalDocument('privacy') },
    { icon: 'info', label: 'About', path: '/about' },
    { icon: 'settings', label: 'Settings', path: '/settings' },
    ...(canInstall ? [{ icon: 'install_mobile', label: 'Install App', action: triggerInstall }] : []),
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#f2f4f6] dark:bg-[#050806] dark:text-[#e8f3ee]">
      {/* Header */}
      <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between sticky top-0 z-10 bg-[#f2f4f6] dark:bg-[#050806]">
        <h2 className="text-[#111418] dark:text-[#e8f3ee] text-[17px] sm:text-[19px] font-bold leading-tight">Profile</h2>
        <button
          onClick={() => navigate('/profile/edit')}
          className="text-[#137fec] text-[14px] sm:text-[15px] font-semibold hover:opacity-80"
        >
          Edit
        </button>
      </div>

      {error && (
        <div className="mx-3 sm:mx-4 mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium">
          {error}
        </div>
      )}

      {/* User Card */}
      <div className="px-3 sm:px-4 mt-1.5 sm:mt-2">
        <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] p-4 sm:p-5 shadow-sm">
          {loading ? (
            <div className="flex items-center gap-3 sm:gap-4 animate-pulse">
              <div className="size-14 sm:size-16 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 sm:h-5 bg-gray-200 rounded w-28 sm:w-32 mb-2"></div>
                <div className="h-3.5 sm:h-4 bg-gray-200 rounded w-36 sm:w-40 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-20 sm:w-24"></div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="size-14 sm:size-16 rounded-full overflow-hidden bg-[#137fec] flex items-center justify-center shrink-0">
                {user.profilePhoto ? (
                  <img src={user.profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-white text-lg sm:text-xl font-bold">
                    {user.initials || user.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[16px] sm:text-[18px] font-bold leading-tight truncate">
                  {user.name || 'Not available'}
                </h3>
                <p className="text-[#617589] dark:text-[#9cb7aa] text-[13px] sm:text-[14px] mt-0.5 truncate">
                  {user.email || 'No email'}
                </p>
                <p className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] mt-0.5">
                  Client ID: <span className="font-semibold text-[#111418] dark:text-[#e8f3ee]">{user.clientId || '---'}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Warning Banner */}
      <ProfileWarningBanner />

      {/* KYC Verification */}
      <div className="px-3 sm:px-4 mt-5 sm:mt-6">
        <button
          onClick={() => navigate('/kyc-documents')}
          className="w-full bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] p-3.5 sm:p-4 shadow-sm hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors text-left"
        >
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[15px] sm:text-[17px] font-bold">KYC Verification</h3>
            {kycStatus && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] sm:text-[12px] font-medium ${
                kycStatus.overall_status === 'approved' ? 'bg-green-50 text-green-600' :
                kycStatus.overall_status === 'rejected' ? 'bg-red-50 text-red-500' :
                kycStatus.overall_status === 'pending' || kycStatus.overall_status === 'in_process' ? 'bg-yellow-50 text-yellow-700' :
                kycStatus.overall_status === 'partial' ? 'bg-blue-50 text-blue-600' :
                'bg-gray-100 dark:bg-[#16231d] text-gray-500 dark:text-[#9cb7aa]'
              }`}>
                {kycStatus.overall_status === 'approved' ? 'Verified' :
                 kycStatus.overall_status === 'not_submitted' ? 'Incomplete' :
                 kycStatus.overall_status === 'partial' ? 'Partial' :
                 kycStatus.overall_status === 'rejected' ? 'Rejected' :
                 'Pending'}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {[
              { key: 'aadhaar', label: 'Aadhaar', icon: 'badge' },
              { key: 'pan', label: 'PAN', icon: 'credit_card' },
              { key: 'bank_proof', label: 'Bank', icon: 'account_balance' },
            ].map((doc) => {
              const status = kycStatus?.[doc.key]?.status || 'not_submitted';
              const color = status === 'approved' ? 'text-green-600' :
                            status === 'rejected' ? 'text-red-500' :
                            status === 'pending' || status === 'in_process' ? 'text-yellow-600' :
                            'text-gray-400 dark:text-[#6f8b7f]';
              const iconName = status === 'approved' ? 'check_circle' :
                               status === 'rejected' ? 'cancel' :
                               status === 'pending' || status === 'in_process' ? 'schedule' :
                               'circle';
              return (
                <div key={doc.key} className="flex-1 flex flex-col items-center gap-1 py-1.5">
                  <span className={`material-symbols-outlined text-[20px] ${color}`}>{iconName}</span>
                  <span className="text-[#111418] dark:text-[#e8f3ee] text-[11px] sm:text-[12px] font-medium">{doc.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-[#22352d]">
            <span className="text-[#137fec] text-[13px] sm:text-[14px] font-semibold">
              {kycStatus?.overall_status === 'approved' ? 'View KYC' : 'Complete KYC'}
            </span>
            <span className="material-symbols-outlined text-[#137fec] text-[16px]">chevron_right</span>
          </div>
        </button>
      </div>

      {/* Bank Accounts */}
      <div className="px-3 sm:px-4 mt-5 sm:mt-6">
        <div className="flex items-center justify-between mb-2.5 sm:mb-3">
          <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[15px] sm:text-[17px] font-bold">Bank Accounts</h3>
          {bankAccounts.length === 0 && (
            <button
              onClick={() => navigate('/kyc-documents')}
              className="text-[#137fec] text-[13px] sm:text-[14px] font-semibold hover:opacity-80"
            >
              + Add
            </button>
          )}
        </div>
        {bankAccounts.length === 0 ? (
          <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col items-center py-3">
              <span className="material-symbols-outlined text-[36px] text-gray-300 dark:text-[#22352d] mb-2">account_balance</span>
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[13px] sm:text-[14px]">No bank accounts linked</p>
              <button
                onClick={() => navigate('/kyc-documents')}
                className="mt-3 text-[#137fec] text-[13px] sm:text-[14px] font-semibold hover:opacity-80"
              >
                Add Bank Account
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] overflow-hidden shadow-sm">
            {bankAccounts.map((acc, index) => (
              <div
                key={acc._id}
                className={`flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 ${
                  index < bankAccounts.length - 1 ? 'border-b border-gray-100 dark:border-[#22352d]' : ''
                }`}
              >
                <div className="size-10 sm:size-11 bg-[#f6f7f8] dark:bg-[#111b17] rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[20px] sm:text-[22px]">account_balance</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-semibold truncate">{acc.bank_name}</p>
                    {acc.is_primary && (
                      <span className="text-[10px] sm:text-[11px] bg-[#137fec] text-white px-1.5 py-0.5 rounded font-medium">Primary</span>
                    )}
                  </div>
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px]">
                    {acc.account_number_masked || '****'} &middot; {acc.ifsc_code}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/profile/bank-account/edit/${acc._id}`)}
                  className="flex items-center gap-1 text-[#137fec] text-[12px] sm:text-[13px] font-semibold hover:opacity-80 shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">edit</span>
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className="px-3 sm:px-4 mt-5 sm:mt-6">
        <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] overflow-hidden shadow-sm">
          {menuItems.filter(item => !item.danger).map((item, index, arr) => (
            <button
              key={item.path || item.label}
              onClick={() => item.action ? item.action() : navigate(item.path, item.state ? { state: item.state } : undefined)}
              className={`w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-4 hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors ${
                index < arr.length - 1 ? 'border-b border-gray-100 dark:border-[#22352d]' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[22px] sm:text-[24px]">{item.icon}</span>
              <span className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-medium flex-1 text-left">{item.label}</span>
              <span className="material-symbols-outlined text-gray-400 dark:text-[#6f8b7f] text-[18px] sm:text-[20px]">chevron_right</span>
            </button>
          ))}
        </div>
      </div>

      {/* Logout Button */}
      <div className="px-3 sm:px-4 mt-5 sm:mt-6 pb-24">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 rounded-xl py-3 sm:py-4 font-semibold hover:bg-red-100 transition-colors text-[14px] sm:text-base"
        >
          <span className="material-symbols-outlined text-[20px] sm:text-[22px]">logout</span>
          <span>Logout</span>
        </button>
      </div>

      <LegalBottomSheet
        isOpen={!!activeLegalDocument}
        defaultDocumentKey={activeLegalDocument || 'terms'}
        onClose={() => setActiveLegalDocument(null)}
      />
    </div>
  );
};

export default Profile;
