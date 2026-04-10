/**
 * Authentication Context
 * Provides auth state and methods throughout the app
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authApi from '../api/auth';
import {
  getStoredUser,
  clearTokens,
  setStoredUser,
  setCustomerAuthNotice,
  consumeCustomerAuthNotice,
} from '../api/index';

const AuthContext = createContext(null);
const CUSTOMER_CFD_WARNING_REQUIRED_KEY = 'customer_cfd_warning_required';
const CUSTOMER_REENTRY_REDIRECT_DONE_KEY = 'customer_reentry_redirect_done';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionBoot, setSessionBoot] = useState({ hydrated: false, restored: false });

  const applyResolvedUser = useCallback((resolvedUser) => {
    setUser((prevUser) => {
      if (prevUser && JSON.stringify(prevUser) === JSON.stringify(resolvedUser)) {
        return prevUser;
      }
      return resolvedUser;
    });
    setStoredUser(resolvedUser);
  }, []);

  const invalidateSession = useCallback((message = 'Session expired. Please login again.') => {
    const notice = message || 'Session expired. Please login again.';
    setCustomerAuthNotice(notice);
    clearTokens();
    try {
      sessionStorage.removeItem(CUSTOMER_CFD_WARNING_REQUIRED_KEY);
      sessionStorage.removeItem(CUSTOMER_REENTRY_REDIRECT_DONE_KEY);
    } catch {
      // No-op: session storage may be unavailable in private mode.
    }
    setUser(null);
    setError(notice);
    setSessionBoot({ hydrated: true, restored: false });
    setLoading(false);
  }, []);

  useEffect(() => {
    const pendingNotice = consumeCustomerAuthNotice();
    if (pendingNotice) {
      setError(pendingNotice);
    }
  }, []);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        try {
          sessionStorage.removeItem(CUSTOMER_REENTRY_REDIRECT_DONE_KEY);
        } catch {
          // No-op: session storage may be unavailable in private mode.
        }

        const storedUser = getStoredUser();
        const storedRole = storedUser?.role;
        const isCustomerSession = !storedRole || storedRole === 'customer';

        if (storedUser && isCustomerSession) {
          setUser({ ...storedUser, role: 'customer' });
          // Optionally verify token by fetching profile
          try {
            const profile = await authApi.getProfile();
            const resolvedUser = { ...(profile.user || profile), role: 'customer' };
            applyResolvedUser(resolvedUser);
            setSessionBoot({ hydrated: true, restored: true });
          } catch (err) {
            // Token expired or invalid
            invalidateSession(err?.message || 'Session expired. Please login again.');
          }
        } else {
          // Another role session (broker/admin) should not be treated as customer auth.
          setUser(null);
          setSessionBoot({ hydrated: true, restored: false });
        }
      } catch (err) {
        console.error('Auth init error:', err);
        setSessionBoot({ hydrated: true, restored: false });
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [applyResolvedUser, invalidateSession]);

  useEffect(() => {
    if (loading || !user || user.role !== 'customer') return undefined;

    let cancelled = false;
    let validating = false;

    const validateSession = async () => {
      if (cancelled || validating) return;
      validating = true;

      try {
        const profile = await authApi.getProfile();
        if (cancelled) return;
        const resolvedUser = { ...(profile.user || profile), role: 'customer' };
        applyResolvedUser(resolvedUser);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401 || err?.status === 403) {
          invalidateSession(err?.message || 'Session expired. Please login again.');
        }
      } finally {
        validating = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        validateSession();
      }
    };

    const intervalId = window.setInterval(validateSession, 30000);
    window.addEventListener('focus', validateSession);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', validateSession);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyResolvedUser, invalidateSession, loading, user]);

  /**
   * Login with email and password
   */
  const login = useCallback(async (email, password) => {
    setError(null);
    setLoading(true);
    try {
      const response = await authApi.login(email, password);
      const resolvedUser = { ...(response.user || {}), role: 'customer' };
      applyResolvedUser(resolvedUser);
      setSessionBoot({ hydrated: true, restored: false });
      try {
        sessionStorage.setItem(CUSTOMER_CFD_WARNING_REQUIRED_KEY, '1');
        sessionStorage.removeItem(CUSTOMER_REENTRY_REDIRECT_DONE_KEY);
      } catch {
        // No-op: session storage may be unavailable in private mode.
      }
      return response;
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applyResolvedUser]);

  /**
   * Signup / Register new user
   */
  const signup = useCallback(async (userData) => {
    setError(null);
    setLoading(true);
    try {
      const response = await authApi.signup(userData);
      return response;
    } catch (err) {
      const errorMessage = err.message || 'Registration failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Logout user — if a parent impersonation session exists, exit impersonation instead
   */
  const logout = useCallback(async () => {
    // If impersonating, treat logout as "exit impersonation" to avoid losing parent session
    try {
      const adminToken = sessionStorage.getItem('adminToken');
      const adminUser = sessionStorage.getItem('adminUser');
      const returnTo = sessionStorage.getItem('impersonationReturnTo');
      const brokerToken = sessionStorage.getItem('brokerToken');
      const brokerUser = sessionStorage.getItem('brokerUser');

      if (adminToken) {
        localStorage.setItem('accessToken', adminToken);
        localStorage.setItem('user', adminUser || '');
        sessionStorage.removeItem('adminToken');
        sessionStorage.removeItem('adminUser');
        sessionStorage.removeItem('impersonationReturnTo');
        window.location.href = returnTo || '/admin/customers';
        return;
      }

      if (brokerToken) {
        localStorage.setItem('accessToken', brokerToken);
        sessionStorage.removeItem('brokerToken');
        if (brokerUser) {
          localStorage.setItem('user', brokerUser);
          sessionStorage.removeItem('brokerUser');
        }
        window.location.href = '/broker/clients';
        return;
      }
    } catch {
      // sessionStorage unavailable — fall through to normal logout
    }

    setLoading(true);
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      try {
        sessionStorage.removeItem(CUSTOMER_CFD_WARNING_REQUIRED_KEY);
        sessionStorage.removeItem(CUSTOMER_REENTRY_REDIRECT_DONE_KEY);
      } catch {
        // No-op: session storage may be unavailable in private mode.
      }
      setUser(null);
      setSessionBoot({ hydrated: true, restored: false });
      setLoading(false);
    }
  }, []);

  /**
   * Request password reset
   */
  const forgotPassword = useCallback(async (email) => {
    setError(null);
    try {
      const response = await authApi.forgotPassword(email);
      return response;
    } catch (err) {
      const errorMessage = err.message || 'Failed to send reset email';
      setError(errorMessage);
      throw err;
    }
  }, []);

  /**
   * Change password (authenticated)
   */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    setError(null);
    try {
      const response = await authApi.changePassword(currentPassword, newPassword);
      return response;
    } catch (err) {
      const errorMessage = err.message || 'Failed to change password';
      setError(errorMessage);
      throw err;
    }
  }, []);

  /**
   * Refresh user profile
   */
  const refreshProfile = useCallback(async () => {
    try {
      const profile = await authApi.getProfile();
      const resolvedUser = { ...(profile.user || profile), role: 'customer' };
      applyResolvedUser(resolvedUser);
      return profile;
    } catch (err) {
      console.error('Failed to refresh profile:', err);
      throw err;
    }
  }, [applyResolvedUser]);

  const value = {
    user,
    loading,
    error,
    sessionBoot,
    isAuthenticated: !!user,
    dealerMode: user?.dealerMode || false,
    login,
    signup,
    logout,
    forgotPassword,
    changePassword,
    refreshProfile,
    setError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
