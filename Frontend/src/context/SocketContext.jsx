import { createContext, useContext, useMemo } from 'react';
import { useMarketTicks } from '../hooks/useMarketTicks';
import { useAuth } from './AuthContext';

const MarketDataContext = createContext(null);

export const MarketDataProvider = ({ children }) => {
  const { user } = useAuth();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }, [user]);

  const socketOpts = useMemo(() => ({
    auth: token ? { token } : undefined,
    withCredentials: true,
  }), [token]);

  const socketUrl = useMemo(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
    const baseUrl = apiUrl.replace(/\/api\/?$/, '');
    return `${baseUrl}/market`;
  }, []);

  const marketData = useMarketTicks(socketUrl, socketOpts);

  return (
    <MarketDataContext.Provider value={marketData}>
      {children}
    </MarketDataContext.Provider>
  );
};

export const useMarketData = () => {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
};
