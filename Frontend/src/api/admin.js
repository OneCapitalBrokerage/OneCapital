/**
 * Admin API Client
 * Handles all admin-specific API calls
 */
import api from './index';

const adminApi = {
  // ========================
  // AUTHENTICATION
  // ========================
  
  /**
   * Admin Login
   * @param {string} adminId - Admin ID
   * @param {string} password - Admin password
   * @returns {Promise} - Login response with tokens
   */
  login: async (adminId, password) => {
    const response = await api.post('/auth/login', { identifier: adminId, password });
    return response.data;
  },

  /**
   * Admin Logout
   * @returns {Promise}
   */
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout errors
    }
  },

  // ========================
  // DASHBOARD
  // ========================
  
  /**
   * Get admin dashboard data
   * @returns {Promise} - Dashboard statistics and activity
   */
  getDashboard: async () => {
    const response = await api.get('/admin/dashboard');
    return response.data;
  },

  // ========================
  // CUSTOMERS
  // ========================
  
  /**
   * Get all customers
   * @param {Object} params - Query parameters (page, limit, search, status, sort)
   * @returns {Promise} - List of customers with pagination
   */
  getAllCustomers: async (params = {}) => {
    const response = await api.get('/admin/customers', { params });
    return response.data;
  },

  /**
   * Get customer by ID
   * @param {string} customerId - Customer ID
   * @returns {Promise} - Customer details
   */
  getCustomerById: async (customerId) => {
    const response = await api.get(`/admin/customers/${customerId}`);
    return response.data;
  },

  /**
   * Update customer status
   * @param {string} customerId - Customer ID
   * @param {Object} updates - Status updates
   * @returns {Promise}
   */
  updateCustomer: async (customerId, updates) => {
    const response = await api.put(`/admin/customers/${customerId}`, updates);
    return response.data;
  },

  /**
   * Block/unblock customer
   * @param {string} customerId - Customer ID
   * @param {boolean} blocked - Block status
   * @returns {Promise}
   */
  blockCustomer: async (customerId, reason) => {
    const response = await api.post(`/admin/customers/${customerId}/block`, { reason });
    return response.data;
  },

  unblockCustomer: async (customerId) => {
    const response = await api.post(`/admin/customers/${customerId}/unblock`);
    return response.data;
  },

  enableTrading: async (customerId, segments) => {
    const response = await api.post(`/admin/customers/${customerId}/trading/enable`, { segments });
    return response.data;
  },

  disableTrading: async (customerId, reason) => {
    const response = await api.post(`/admin/customers/${customerId}/trading/disable`, { reason });
    return response.data;
  },

  loginAsCustomer: async (customerId) => {
    const response = await api.post(`/admin/customers/${customerId}/login-as`);
    return response.data;
  },

  toggleHoldingsExit: async (customerId, allowed) => {
    const response = await api.put(`/admin/customers/${customerId}/holdings-exit`, { allowed });
    return response.data;
  },

  toggleCustomerGlitch: async (customerId, enabled) => {
    const response = await api.put(`/admin/customers/${customerId}/glitch`, { enabled });
    return response.data;
  },

  getCustomerCredentials: async (customerId) => {
    const response = await api.get(`/admin/customers/${customerId}/credentials`);
    return response.data;
  },

  /**
   * Set admin warning for customer
   * @param {string} customerId - Customer ID
   * @param {string} message - Warning message
   * @returns {Promise}
   */
  setCustomerWarning: async (customerId, message) => {
    const response = await api.post(`/admin/customers/${customerId}/warning`, { message });
    return response.data;
  },

  /**
   * Clear admin warning for customer
   * @param {string} customerId - Customer ID
   * @returns {Promise}
   */
  clearCustomerWarning: async (customerId) => {
    const response = await api.delete(`/admin/customers/${customerId}/warning`);
    return response.data;
  },

  /**
   * Clear customer statement (delete all fund transactions)
   * @param {string} customerId - Customer ID
   * @returns {Promise}
   */
  clearCustomerStatement: async (customerId) => {
    const response = await api.delete(`/admin/customers/${customerId}/statement`);
    return response.data;
  },

  updateReferenceCode: async (brokerId, referenceCode) => {
    const response = await api.put(`/admin/brokers/${brokerId}/reference-code`, { referenceCode });
    return response.data;
  },

  // ========================
  // BROKERS
  // ========================
  
  /**
   * Get all brokers
   * @param {Object} params - Query parameters (page, limit, search, status, sort)
   * @returns {Promise} - List of brokers with pagination
   */
  getAllBrokers: async (params = {}) => {
    const response = await api.get('/admin/brokers', { params });
    return response.data;
  },

  /**
   * Get broker by ID
   * @param {string} brokerId - Broker ID
   * @returns {Promise} - Broker details
   */
  getBrokerById: async (brokerId) => {
    const response = await api.get(`/admin/brokers/${brokerId}`);
    return response.data;
  },

  /**
   * Create new broker
   * @param {Object} brokerData - Broker details
   * @returns {Promise}
   */
  createBroker: async (brokerData) => {
    const response = await api.post('/admin/brokers', brokerData);
    return response.data;
  },

  /**
   * Update broker
   * @param {string} brokerId - Broker ID
   * @param {Object} updates - Broker updates
   * @returns {Promise}
   */
  updateBroker: async (brokerId, updates) => {
    const response = await api.put(`/admin/brokers/${brokerId}`, updates);
    return response.data;
  },

  /**
   * Block/unblock broker
   * @param {string} brokerId - Broker ID
   * @param {boolean} blocked - Block status
   * @returns {Promise}
   */
  blockBroker: async (brokerId, reason) => {
    const response = await api.post(`/admin/brokers/${brokerId}/block`, { reason });
    return response.data;
  },

  unblockBroker: async (brokerId) => {
    const response = await api.post(`/admin/brokers/${brokerId}/unblock`);
    return response.data;
  },

  deleteBroker: async (brokerId) => {
    const response = await api.delete(`/admin/brokers/${brokerId}`);
    return response.data;
  },

  loginAsBroker: async (brokerId) => {
    const response = await api.post(`/admin/brokers/${brokerId}/login-as`);
    return response.data;
  },

  getBrokerCredentials: async (brokerId) => {
    const response = await api.get(`/admin/brokers/${brokerId}/credentials`);
    return response.data;
  },

  // ========================
  // KYC
  // ========================
  
  /**
   * Get KYC requests
   * @param {Object} params - Query parameters (status, page, limit, search)
   * @returns {Promise} - List of KYC requests
   */
  getKycRequests: async (params = {}) => {
    const response = await api.get('/admin/kyc', { params });
    return response.data;
  },

  /**
   * Approve KYC request
   * @param {string} requestId - KYC request ID
   * @returns {Promise}
   */
  approveKyc: async (requestId) => {
    const response = await api.post(`/admin/kyc/${requestId}/approve`);
    return response.data;
  },

  /**
   * Reject KYC request
   * @param {string} requestId - KYC request ID
   * @param {string} reason - Rejection reason
   * @returns {Promise}
   */
  rejectKyc: async (requestId, reason) => {
    const response = await api.post(`/admin/kyc/${requestId}/reject`, { reason });
    return response.data;
  },

  // ========================
  // LOGS
  // ========================
  
  /**
   * Get system logs
   * @param {Object} params - Query parameters (level, page, limit, search)
   * @returns {Promise} - List of system logs
   */
  getLogs: async (params = {}) => {
    const response = await api.get('/admin/logs', { params });
    return response.data;
  },

  clearLogs: async (scope = 'all', period = 'all') => {
    const response = await api.delete('/admin/logs', { data: { scope, period } });
    return response.data;
  },

  getAuditAlerts: async (params = {}) => {
    const response = await api.get('/admin/logs/alerts', { params });
    return response.data;
  },

  getAuditAlertStats: async () => {
    const response = await api.get('/admin/logs/alerts/stats');
    return response.data;
  },

  // ========================
  // API KEYS
  // ========================
  
  /**
   * Get all API keys
   * @param {Object} params - Query parameters (page, limit, search)
   * @returns {Promise} - List of API keys
   */
  getApiKeys: async (params = {}) => {
    const response = await api.get('/admin/api-keys', { params });
    return response.data;
  },

  /**
   * Create new API key
   * @param {Object} keyData - API key details
   * @returns {Promise}
   */
  createApiKey: async (keyData) => {
    const response = await api.post('/admin/api-keys', keyData);
    return response.data;
  },

  /**
   * Revoke API key
   * @param {string} keyId - API key ID
   * @returns {Promise}
   */
  revokeApiKey: async (keyId) => {
    const response = await api.delete(`/admin/api-keys/${keyId}`);
    return response.data;
  },

  toggleApiKey: async (keyId) => {
    const response = await api.put(`/admin/api-keys/${keyId}/toggle`);
    return response.data;
  },

  revokeAllApiKeys: async () => {
    const response = await api.post('/admin/api-keys/revoke-all', { confirm: 'REVOKE_ALL' });
    return response.data;
  },

  // ========================
  // KITE / ACCESS TOKEN
  // ========================

  getKiteStatus: async () => {
    const response = await api.get('/kite/status');
    return response.data;
  },

  triggerAutoLogin: async () => {
    const response = await api.post('/kite/auto-login/trigger');
    return response.data;
  },

  getKiteLoginUrl: async () => {
    const response = await api.get('/kite/login-url');
    return response.data;
  },

  generateKiteTOTP: async () => {
    const response = await api.post('/admin/kite/totp/generate');
    return response.data;
  },

  reconnectWebSocket: async () => {
    const response = await api.post('/kite/websocket/reconnect');
    return response.data;
  },

  // ========================
  // KYC STATS
  // ========================

  getKycStats: async () => {
    const response = await api.get('/admin/kyc/stats');
    return response.data;
  },

  // ========================
  // STATS / REPORTS
  // ========================

  getStats: async (params = {}) => {
    const response = await api.get('/admin/stats', { params });
    return response.data;
  },

  getActionItems: async () => {
    const response = await api.get('/admin/action-items');
    return response.data;
  },

  getActivity: async (params = {}) => {
    const response = await api.get('/admin/activity', { params });
    return response.data;
  },

  // ========================
  // SUPPORT CHAT
  // ========================

  /**
   * Get all support sessions with filtering and pagination
   * @param {Object} params - { status, brokerId, search, hasUnread, page, limit, sortBy, sortOrder }
   * @returns {Promise} - { sessions, pagination, totalUnread }
   */
  getSupportSessions: async (params = {}) => {
    const response = await api.get('/admin/support/sessions', { params });
    return response.data;
  },

  /**
   * Get total unread count across all sessions
   * @returns {Promise} - { unreadCount }
   */
  getSupportUnreadCount: async () => {
    const response = await api.get('/admin/support/unread-count');
    return response.data;
  },

  /**
   * Get a specific support session
   * @param {string} sessionId - Session ID
   * @returns {Promise} - { session }
   */
  getSupportSession: async (sessionId) => {
    const response = await api.get(`/admin/support/sessions/${sessionId}`);
    return response.data;
  },

  /**
   * Get messages for a support session (cursor-based pagination)
   * @param {string} sessionId - Session ID
   * @param {Object} params - { before, after, limit }
   * @returns {Promise} - { messages, hasMore, cursor }
   */
  getSupportMessages: async (sessionId, params = {}) => {
    const response = await api.get(`/admin/support/sessions/${sessionId}/messages`, { params });
    return response.data;
  },

  /**
   * Send a message in a support session
   * @param {string} sessionId - Session ID
   * @param {string} text - Message text
   * @param {File[]} attachments - Optional file attachments
   * @returns {Promise} - { message }
   */
  sendSupportMessage: async (sessionId, text, attachments = []) => {
    const formData = new FormData();
    if (text) formData.append('text', text);
    for (const file of attachments) {
      formData.append('attachments', file);
    }
    const response = await api.post(`/admin/support/sessions/${sessionId}/messages`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Mark messages as read
   * @param {string} sessionId - Session ID
   * @param {string[]} messageIds - Optional specific message IDs to mark read
   * @returns {Promise}
   */
  markSupportMessagesRead: async (sessionId, messageIds = []) => {
    const response = await api.post(`/admin/support/sessions/${sessionId}/read`, { messageIds });
    return response.data;
  },

  /**
   * Resolve and delete a support session
   * @param {string} sessionId - Session ID
   * @returns {Promise}
   */
  resolveSupportSession: async (sessionId) => {
    const response = await api.post(`/admin/support/sessions/${sessionId}/resolve`);
    return response.data;
  },

  /**
   * Close and delete a support session (without resolution)
   * @param {string} sessionId - Session ID
   * @param {string} reason - Optional closure reason
   * @returns {Promise}
   */
  closeSupportSession: async (sessionId, reason) => {
    const response = await api.post(`/admin/support/sessions/${sessionId}/close`, { reason });
    return response.data;
  },

  /**
   * Send typing status
   * @param {string} sessionId - Session ID
   * @param {boolean} isTyping - Whether admin is typing
   * @returns {Promise}
   */
  sendSupportTyping: async (sessionId, isTyping) => {
    const response = await api.post(`/admin/support/sessions/${sessionId}/typing`, { isTyping });
    return response.data;
  },
};

export default adminApi;
