import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';

const ADMIN_WARNING_DISMISSED_KEY = 'admin_warning_dismissed';

/**
 * WarningBanner Component
 * Displays admin-issued warning to customer
 * - Shows as modal after CFD risk agreement (once per session)
 * - Inline variant for watchlist page
 */

const WarningBanner = ({ variant = 'modal', onDismiss, onContactSupport }) => {
  const [warning, setWarning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchWarning = async () => {
      try {
        const res = await customerApi.getWarning();
        if (res.warning?.active) {
          setWarning(res.warning);
        }
      } catch (err) {
        console.error('Failed to fetch warning:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWarning();
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const handleContactSupport = () => {
    setDismissed(true);
    onDismiss?.();
    onContactSupport?.();
    navigate('/support/chat');
  };

  // Don't render anything while loading or if no warning
  if (loading || !warning || !warning.active) {
    return null;
  }

  // Modal variant (for login popup - after CFD risk)
  if (variant === 'modal' && !dismissed) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="bg-white dark:bg-[#111b17] rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-amber-500 px-4 py-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-white text-xl">warning</span>
            <h3 className="text-white font-bold text-sm">Account Warning</h3>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-700 dark:text-[#e8f3ee] leading-relaxed">
              {warning.message}
            </p>
            
            {warning.updatedAt && (
              <p className="text-[10px] text-gray-500 dark:text-[#9cb7aa]">
                Issued: {new Date(warning.updatedAt).toLocaleString('en-IN')}
              </p>
            )}

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Please address this warning promptly to avoid account restrictions.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 pb-4 space-y-2">
            <button
              onClick={handleContactSupport}
              className="w-full h-10 rounded-xl bg-[#137fec] hover:bg-[#0f6fd4] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">chat</span>
              Contact Support
            </button>
            <button
              onClick={handleDismiss}
              className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors"
            >
              I Understand
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inline banner variant (for watchlist page - between index cards and list)
  if (variant === 'inline') {
    return (
      <div className="mx-3 sm:mx-4 mt-2 mb-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 sm:p-3">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-500 text-lg sm:text-xl shrink-0">warning</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Account Warning</p>
            <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{warning.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // Compact variant (for small spaces)
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg px-2.5 py-1.5">
        <span className="material-symbols-outlined text-amber-600 text-sm">warning</span>
        <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium truncate">{warning.message}</p>
      </div>
    );
  }

  // Profile variant (with contact info)
  if (variant === 'profile') {
    return (
      <div className="mx-3 sm:mx-4 mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 sm:p-4">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-amber-500 text-xl sm:text-2xl shrink-0">warning</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-[15px] font-bold text-amber-800 dark:text-amber-300 mb-1">Account Warning</p>
            <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400 leading-relaxed mb-2">{warning.message}</p>
            <p className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-500">
              Please contact your <span className="font-semibold">broker</span> or use <span className="font-semibold">support chat</span> to resolve this issue.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

/**
 * Hook to check if customer has active warning
 * For use in components that need to conditionally show warning
 */
export const useCustomerWarning = () => {
  const [warning, setWarning] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWarning = async () => {
      try {
        const res = await customerApi.getWarning();
        setWarning(res.warning);
      } catch (err) {
        console.error('Failed to fetch warning:', err);
        setWarning(null);
      } finally {
        setLoading(false);
      }
    };

    fetchWarning();
  }, []);

  return { warning, loading, hasWarning: warning?.active || false };
};

/**
 * Admin Warning Modal Gate Component
 * Shows warning modal once per session after CFD risk agreement
 */
export const AdminWarningGate = () => {
  const [warning, setWarning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const fetchWarning = async () => {
      try {
        // Check if already dismissed this session
        const dismissed = sessionStorage.getItem(ADMIN_WARNING_DISMISSED_KEY);
        if (dismissed === '1') {
          setLoading(false);
          return;
        }

        const res = await customerApi.getWarning();
        if (res.warning?.active) {
          setWarning(res.warning);
        }
      } catch (err) {
        console.error('Failed to fetch warning:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWarning();
  }, []);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(ADMIN_WARNING_DISMISSED_KEY, '1');
    } catch {
      // No-op: session storage may be unavailable
    }
    setIsDismissed(true);
  };

  // Don't show if loading, no warning, or already dismissed
  if (loading || !warning || !warning.active || isDismissed) {
    return null;
  }

  return <WarningBanner variant="modal" onDismiss={handleDismiss} />;
};

/**
 * Inline Warning Banner Component
 * For use in watchlist page
 */
export const InlineWarningBanner = () => {
  const { warning, loading, hasWarning } = useCustomerWarning();

  if (loading || !hasWarning) {
    return null;
  }

  return (
    <div className="mx-3 sm:mx-4 mt-2 mb-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 sm:p-3">
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined text-amber-500 text-lg sm:text-xl shrink-0">warning</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Account Warning</p>
          <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{warning.message}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Orders Warning Banner
 * For use in orders page - below search/tabs, above order list
 */
export const OrdersWarningBanner = () => {
  const { warning, loading, hasWarning } = useCustomerWarning();

  if (loading || !hasWarning) {
    return null;
  }

  return (
    <div className="mx-3 sm:mx-4 mb-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 sm:p-3">
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined text-amber-500 text-lg shrink-0">warning</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Account Warning</p>
          <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{warning.message}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Funds Warning Banner
 * For use in funds page - below Saturday withdrawal info
 */
export const FundsWarningBanner = () => {
  const { warning, loading, hasWarning } = useCustomerWarning();

  if (loading || !hasWarning) {
    return null;
  }

  return (
    <div className="px-3 sm:px-4 mt-2">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 sm:p-3">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-500 text-lg shrink-0">warning</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Account Warning</p>
            <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{warning.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Profile Warning Banner
 * For use in profile page - below user card, with contact info
 */
export const ProfileWarningBanner = () => {
  const { warning, loading, hasWarning } = useCustomerWarning();

  if (loading || !hasWarning) {
    return null;
  }

  return (
    <div className="px-3 sm:px-4 mt-3">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 sm:p-4">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-amber-500 text-xl sm:text-2xl shrink-0">warning</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-[15px] font-bold text-amber-800 dark:text-amber-300 mb-1">Account Warning</p>
            <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400 leading-relaxed mb-2">{warning.message}</p>
            <p className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-500">
              Please contact your <span className="font-semibold">broker</span> or use <span className="font-semibold">support chat</span> to resolve this issue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarningBanner;
