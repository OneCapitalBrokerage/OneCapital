/**
 * Broker Authentication Context
 * Provides broker auth state and methods throughout the app
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/index';
import { clearTokens, getStoredUser, setAuthToken, setRefreshToken, setStoredUser } from '../api/index';
import {
  clearAdminBrokerSwitchSnapshot,
  hasAdminBrokerSwitchSnapshot,
  restoreAdminFromBrokerSwitch,
} from '../utils/adminBrokerSwitch';

const BrokerContext = createContext(null);

export const useBrokerAuth = () => {
  const context = useContext(BrokerContext);
  if (!context) {
    throw new Error('useBrokerAuth must be used within a BrokerAuthProvider');
  }
  return context;
};

export const BrokerAuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [broker, setBroker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize broker auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUser = getStoredUser();
        if (storedUser && storedUser.role === 'broker') {
          setBroker(storedUser);
          // Optionally verify token by fetching profile
          try {
            const response = await api.get('/broker/profile');
            const brokerProfile = response.data?.broker || response.data?.profile || response.data;
            setBroker(brokerProfile);
          } catch {
            // Token expired or invalid
            clearTokens();
            setBroker(null);
          }
        }
      } catch (err) {
        console.error('Broker auth init error:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  /**
   * Broker Login
   */
  const login = useCallback(async (brokerId, password) => {
    setError(null);
    setLoading(true);
    try {
      const response = await api.post('/broker/auth/login', { brokerId, password });
      
      // Store tokens and broker data
      const accessToken = response.data?.accessToken || response.data?.token;
      if (accessToken) {
        setAuthToken(accessToken);
      }
      if (response.data.refreshToken) {
        setRefreshToken(response.data.refreshToken);
      }
      const brokerData = response.data?.broker || response.data?.profile || response.data?.user;
      if (brokerData) {
        setStoredUser({ ...brokerData, role: 'broker' });
        setBroker(brokerData);
      }
      
      return response.data;
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Broker Logout
   */
  const logout = useCallback(async () => {
    const switchedFromAdmin = hasAdminBrokerSwitchSnapshot();
    setLoading(true);
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Broker logout error:', err);
    }

    clearTokens();
    setBroker(null);
    setLoading(false);
    if (switchedFromAdmin) {
      const restored = restoreAdminFromBrokerSwitch('/admin/brokers');
      if (!restored) {
        clearAdminBrokerSwitchSnapshot();
        navigate('/admin/login');
      }
      return;
    }
    clearAdminBrokerSwitchSnapshot();
    navigate('/broker/login');
  }, [navigate]);

  /**
   * Refresh broker profile
   */
  const refreshProfile = useCallback(async () => {
    try {
      const response = await api.get('/broker/profile');
      const brokerData = response.data?.broker || response.data?.profile || response.data;
      setBroker(brokerData);
      setStoredUser({ ...brokerData, role: 'broker' });
      return brokerData;
    } catch (err) {
      console.error('Failed to refresh broker profile:', err);
      throw err;
    }
  }, []);

  const value = {
    broker,
    loading,
    error,
    isAuthenticated: !!broker,
    login,
    logout,
    refreshProfile,
    setError,
  };

  return (
    <BrokerContext.Provider value={value}>
      {children}
    </BrokerContext.Provider>
  );
};

export default BrokerContext;
