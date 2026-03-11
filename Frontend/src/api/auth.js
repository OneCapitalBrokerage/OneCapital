/**
 * Authentication API Client
 * Handles login, logout, registration, and password reset
 */
import api, { setAuthToken, setRefreshToken, setStoredUser, clearTokens } from './index';

const authApi = {
  /**
   * Customer Login
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} - User data and tokens
   */
  login: async (identifier, password) => {
    const isEmail = typeof identifier === 'string' && identifier.includes('@');
    const payload = isEmail
      ? { email: identifier, password }
      : { customerId: identifier, password };
    const response = await api.post('/customer/auth/login', payload);
    
    // Store tokens and user data
    if (response.data.token) {
      setAuthToken(response.data.token);
    }
    if (response.data.refreshToken) {
      setRefreshToken(response.data.refreshToken);
    }
    if (response.data.user) {
      setStoredUser({ ...response.data.user, role: 'customer' });
    }
    
    return response.data;
  },

  /**
   * Customer Signup/Registration
   * @param {Object} userData - Registration data
   * @returns {Promise} - Registration response
   */
  signup: async (userData) => {
    const response = await api.post('/customer/register', userData);
    return response.data;
  },

  /**
   * Logout - Clear tokens and session
   * @returns {Promise}
   */
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore logout errors
    } finally {
      clearTokens();
    }
  },

  /**
   * Refresh access token
   * @returns {Promise} - New access token
   */
  refreshToken: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await api.post('/customer/auth/refresh-token', { refreshToken });
    
    if (response.data.token) {
      setAuthToken(response.data.token);
    }
    
    return response.data;
  },

  /**
   * Request password reset
   * @param {string} email - User email
   * @returns {Promise}
   */
  forgotPassword: async (email) => {
    const response = await api.post('/customer/auth/forgot-password', { email });
    return response.data;
  },

  /**
   * Reset password with token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise}
   */
  resetPassword: async (token, newPassword) => {
    const response = await api.post('/auth/reset-password', { token, newPassword });
    return response.data;
  },

  /**
   * Change password (authenticated)
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise}
   */
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post('/customer/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },

  /**
   * Check registration status
   * @param {string} email - User email
   * @returns {Promise}
   */
  checkRegistrationStatus: async (registrationId) => {
    const response = await api.get(`/customer/register/${registrationId}/status`);
    return response.data;
  },

  /**
   * Get current user profile
   * @returns {Promise} - User profile data
   */
  getProfile: async () => {
    const response = await api.get('/customer/profile');
    return response.data.profile || response.data;
  },
};

export default authApi
