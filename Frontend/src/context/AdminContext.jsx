/**
 * Admin Context
 * Provides admin auth state and methods throughout the app
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../api/admin';
import { getStoredUser, clearTokens, setAuthToken, setStoredUser } from '../api/index';

const AdminContext = createContext(null);

export const useAdminAuth = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};

export const AdminAuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUser = getStoredUser();
        const token = localStorage.getItem('accessToken');
        if (storedUser && storedUser.role === 'admin' && token) {
          try {
            await adminApi.getDashboard();
            setAdmin(storedUser);
          } catch (_err) {
            clearTokens();
            setAdmin(null);
          }
        }
      } catch (err) {
        console.error('Admin auth init error:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  /**
   * Admin Login
   */
  const login = useCallback(async (adminId, password) => {
    setError(null);
    setLoading(true);
    try {
      const response = await adminApi.login(adminId, password);

      // Backend returns { token, name, role } from unified /auth/login
      if (response.token) {
        setAuthToken(response.token);
      }

      // Build admin object from response fields
      const adminData = { name: response.name, role: response.role || 'admin' };
      if (response.role === 'admin') {
        setStoredUser(adminData);
        setAdmin(adminData);
      } else {
        throw new Error('This account is not an admin account.');
      }
      
      return response;
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Admin Logout
   */
  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await adminApi.logout();
    } catch (err) {
      console.error('Admin logout error:', err);
    } finally {
      clearTokens();
      setAdmin(null);
      setLoading(false);
      navigate('/admin/login');
    }
  }, [navigate]);

  /**
   * Refresh admin profile
   */
  const refreshProfile = useCallback(async () => {
    try {
      // For now, we'll just re-fetch from localStorage
      const storedUser = getStoredUser();
      if (storedUser && storedUser.role === 'admin') {
        setAdmin(storedUser);
      }
      return storedUser;
    } catch (err) {
      console.error('Failed to refresh admin profile:', err);
      throw err;
    }
  }, []);

  const value = {
    admin,
    loading,
    error,
    isAuthenticated: !!admin,
    login,
    logout,
    refreshProfile,
    setError,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};

export default AdminContext;
