/**
 * API Base Client
 * Centralized axios instance with interceptors for auth and error handling
 */
import axios from 'axios';

// Base URL from environment or default to backend port
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
export const CUSTOMER_AUTH_NOTICE_KEY = 'customer_auth_notice';

const getRequestUrl = (config) => String(config?.url || '');
const isCustomerApiRequest = (url) => url.startsWith('/customer/');
const isCustomerAuthRoute = (url) =>
  url.startsWith('/customer/auth/login') ||
  url.startsWith('/customer/auth/refresh-token');
const isCustomerSessionInvalidation = (status, data = {}) => {
  if (status === 403 && ['ACCOUNT_SUSPENDED', 'ACCOUNT_INACTIVE'].includes(data?.code)) {
    return true;
  }

  if (status === 401 && data?.code === 'SESSION_EXPIRED') {
    return true;
  }

  return false;
};

const storeCustomerAuthNotice = (message) => {
  if (typeof window === 'undefined') return;
  try {
    const notice = typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Session expired. Please login again.';
    window.sessionStorage.setItem(CUSTOMER_AUTH_NOTICE_KEY, notice);
  } catch {
    // No-op: session storage may be unavailable in private mode.
  }
};

const redirectCustomerToLogin = (message) => {
  clearTokens();
  storeCustomerAuthNotice(message);

  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = getRequestUrl(originalRequest);
    const responseStatus = error.response?.status;
    const responseData = error.response?.data || {};
    const storedRole = (() => {
      try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw)?.role || null : null;
      } catch {
        return null;
      }
    })();
    const canAttemptCustomerRefresh =
      isCustomerApiRequest(requestUrl) &&
      !isCustomerAuthRoute(requestUrl) &&
      storedRole !== 'broker' &&
      storedRole !== 'admin';

    // If 401 and we haven't tried refreshing yet
    if (responseStatus === 401 && !originalRequest._retry && canAttemptCustomerRefresh) {
      originalRequest._retry = true;

      try {
        // Try to refresh the token
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/customer/auth/refresh-token`, {
            refreshToken,
          });

          const { token } = response.data;
          if (token) {
            localStorage.setItem('accessToken', token);
          }

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed - clear tokens and redirect to login
        const refreshMessage =
          refreshError?.response?.data?.message ||
          refreshError?.message ||
          'Session expired. Please login again.';
        redirectCustomerToLogin(refreshMessage);
        return Promise.reject({
          status: refreshError?.response?.status,
          message: refreshMessage,
          data: refreshError?.response?.data,
        });
      }
    }

    // Handle other errors
    const fieldErrors = Array.isArray(responseData?.errors)
      ? responseData.errors
          .map((item) => item?.message || item?.msg || item?.error)
          .filter(Boolean)
      : [];

    const errorMessage =
      responseData?.message ||
      responseData?.error ||
      (fieldErrors.length > 0 ? fieldErrors.join(', ') : null) ||
      error.message ||
      'An error occurred';

    if (isCustomerApiRequest(requestUrl) && isCustomerSessionInvalidation(responseStatus, responseData)) {
      redirectCustomerToLogin(errorMessage);
    }
    
    return Promise.reject({
      status: responseStatus,
      message: errorMessage,
      data: responseData,
    });
  }
);

export default api;

// Helper methods
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('accessToken', token);
  } else {
    localStorage.removeItem('accessToken');
  }
};

export const setRefreshToken = (token) => {
  if (token) {
    localStorage.setItem('refreshToken', token);
  } else {
    localStorage.removeItem('refreshToken');
  }
};

export const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
};

export const setCustomerAuthNotice = (message) => {
  storeCustomerAuthNotice(message);
};

export const consumeCustomerAuthNotice = () => {
  if (typeof window === 'undefined') return null;
  try {
    const message = window.sessionStorage.getItem(CUSTOMER_AUTH_NOTICE_KEY);
    if (message) {
      window.sessionStorage.removeItem(CUSTOMER_AUTH_NOTICE_KEY);
    }
    return message;
  } catch {
    return null;
  }
};

export const getStoredUser = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};

export const setStoredUser = (user) => {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
};
