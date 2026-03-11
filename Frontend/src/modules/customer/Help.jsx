import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';

const Help = () => {
  const navigate = useNavigate();
  const [activeSession, setActiveSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Check for existing support session
  useEffect(() => {
    const checkSession = async () => {
      try {
        setLoadingSession(true);
        const response = await customerApi.getCurrentSupportSession();
        setActiveSession(response.session);
      } catch {
        // Ignore errors
      } finally {
        setLoadingSession(false);
      }
    };
    checkSession();
  }, []);

  const handleItemClick = (id) => {
    switch (id) {
      case 'chat':
        navigate('/support/chat');
        break;
      case 'email':
        window.location.href = 'mailto:support@onecapital.com';
        break;
      case 'phone':
        window.location.href = 'tel:+911800123456';
        break;
      default:
        // Other items not yet implemented
        break;
    }
  };

  const helpItems = [
    { id: 'faq', icon: 'help', label: 'FAQs', description: 'Find answers to common questions' },
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
    { id: 'email', icon: 'mail', label: 'Email Support', description: 'support@onecapital.com' },
    { id: 'phone', icon: 'phone', label: 'Call Us', description: '+91 1800 123 4567' },
    { id: 'guide', icon: 'menu_book', label: 'User Guide', description: 'Learn how to use the app' },
    { id: 'feedback', icon: 'rate_review', label: 'Feedback', description: 'Share your experience' },
  ];

  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806]">
      <TopHeader title="Help & Support" showBack={true} />

      <div className="px-4 py-5">
        <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-5 text-white mb-5">
          <h2 className="text-xl font-bold mb-2">How can we help?</h2>
          <p className="text-white/80 text-sm">Our support team is available 24/7 to assist you</p>
        </div>

        <div className="space-y-3">
          {helpItems.map((item) => (
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
                  {item.id === 'chat' && loadingSession ? 'Checking...' : item.description}
                </p>
              </div>
              <span className="material-symbols-outlined text-gray-400">chevron_right</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Help;