import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import LegalBottomSheet from '../../components/shared/LegalBottomSheet';
import customerApi from '../../api/customer';

const Help = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSession, setActiveSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [brokerSupportContact, setBrokerSupportContact] = useState('');
  const [activeLegalDocument, setActiveLegalDocument] = useState(null);
  const backTo = typeof location.state?.backTo === 'string' ? location.state.backTo : null;

  useEffect(() => {
    const init = async () => {
      try {
        setLoadingSession(true);
        const [sessionRes, profileRes] = await Promise.allSettled([
          customerApi.getCurrentSupportSession(),
          customerApi.getProfile(),
        ]);
        if (sessionRes.status === 'fulfilled') {
          setActiveSession(sessionRes.value.session);
        }
        if (profileRes.status === 'fulfilled') {
          setBrokerSupportContact(profileRes.value.profile?.brokerSupportContact || '');
        }
      } finally {
        setLoadingSession(false);
      }
    };
    init();
  }, []);

  const handleItemClick = (id) => {
    switch (id) {
      case 'chat':
        navigate('/support/chat', backTo ? { state: { backTo } } : undefined);
        break;
      case 'email':
        window.location.href = 'mailto:support@onecapital.trade';
        break;
      case 'phone':
        if (brokerSupportContact) {
          window.location.href = `tel:${brokerSupportContact.replace(/\s+/g, '')}`;
        }
        break;
      case 'terms':
        setActiveLegalDocument('terms');
        break;
      case 'privacy':
        setActiveLegalDocument('privacy');
        break;
      default:
        break;
    }
  };

  const supportItems = [
    {
      id: 'chat',
      icon: 'chat',
      label: 'Live Chat',
      description: activeSession
        ? `Continue chat: ${activeSession.subject?.substring(0, 30)}${activeSession.subject?.length > 30 ? '...' : ''}`
        : 'Chat with our support team',
      badge: activeSession?.customerUnreadCount > 0 ? activeSession.customerUnreadCount : null,
      highlight: !!activeSession,
    },
    { id: 'email', icon: 'mail', label: 'Email Support', description: 'support@onecapital.trade' },
    {
      id: 'phone',
      icon: 'phone',
      label: 'Call Us',
      description: brokerSupportContact,
    },
  ];

  const legalItems = [
    {
      id: 'terms',
      icon: 'gavel',
      label: 'Terms & Conditions',
      description: 'Read the account, service, and trading terms.',
    },
    {
      id: 'privacy',
      icon: 'privacy_tip',
      label: 'Privacy Policy',
      description: 'Review how customer data is collected and used.',
    },
  ];

  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806]">
      <TopHeader
        title="Help & Support"
        showBack={true}
        onBackClick={() => {
          if (backTo) {
            navigate(backTo);
            return;
          }
          navigate(-1);
        }}
      />

      <div className="px-4 py-5">
        <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-5 text-white mb-5">
          <h2 className="text-xl font-bold mb-2">How can we help?</h2>
          <p className="text-white/80 text-sm">Our support team is available 24/7 to assist you</p>
        </div>

        <div className="space-y-3">
          {supportItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={`w-full flex items-center gap-4 p-4 bg-white dark:bg-[#111b17] rounded-xl border hover:shadow-md transition-shadow ${
                item.highlight
                  ? 'border-primary dark:border-primary ring-1 ring-primary/20'
                  : 'border-gray-100 dark:border-[#22352d]'
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                item.highlight 
                  ? 'bg-primary/10 dark:bg-primary/20' 
                  : 'bg-blue-50 dark:bg-blue-900/30'
              }`}>
                <span className="material-symbols-outlined text-primary">{item.icon}</span>
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-[#e8f3ee]">{item.label}</p>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-[#9cb7aa]">
                  {loadingSession ? 'Loading...' : item.description}
                </p>
              </div>
              <span className="material-symbols-outlined text-gray-400">chevron_right</span>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <div className="mb-3 px-1">
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-[#e8f3ee]">Legal</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-[#9cb7aa]">
              Quick access to the latest terms and privacy details.
            </p>
          </div>

          <div className="space-y-3">
            {legalItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="w-full flex items-center gap-4 p-4 bg-white dark:bg-[#111b17] rounded-xl border border-gray-100 dark:border-[#22352d] hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/30">
                  <span className="material-symbols-outlined text-primary">{item.icon}</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-gray-900 dark:text-[#e8f3ee]">{item.label}</p>
                  <p className="text-sm text-gray-500 dark:text-[#9cb7aa]">{item.description}</p>
                </div>
                <span className="material-symbols-outlined text-gray-400">chevron_right</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <LegalBottomSheet
        isOpen={!!activeLegalDocument}
        defaultDocumentKey={activeLegalDocument || 'terms'}
        onClose={() => setActiveLegalDocument(null)}
      />
    </div>
  );
};

export default Help;
