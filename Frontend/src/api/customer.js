/**
 * Customer API Client
 * Handles all customer-specific API calls
 */
import api from './index';

const customerApi = {
  // ========================
  // DASHBOARD
  // ========================
  
  /**
   * Get customer dashboard data
   * @returns {Promise} - Dashboard overview data
   */
  getDashboard: async () => {
    const response = await api.get('/customer/dashboard');
    return response.data;
  },

  /**
   * Get customer profile
   * @returns {Promise} - Profile data
   */
  getProfile: async () => {
    const response = await api.get('/customer/profile');
    return response.data;
  },

  /**
   * Update customer profile
   * @param {Object} profileData - Profile data to update
   * @returns {Promise}
   */
  updateProfile: async (profileData) => {
    const response = await api.put('/customer/profile', profileData);
    return response.data;
  },

  /**
   * Get account summary with P&L, charges, etc.
   * @returns {Promise} - Account summary data
   */
  getAccountSummary: async () => {
    const response = await api.get('/customer/account/summary');
    return response.data;
  },

  // ========================
  // FUNDS
  // ========================

  /**
   * Get funds balance
   * @returns {Promise} - Balance data
   */
  getBalance: async () => {
    const response = await api.get('/customer/funds');
    return response.data;
  },

  /**
   * Get fund transaction history
   * @param {Object} params - Query params (page, limit, type)
   * @returns {Promise} - Transaction history
   */
  getFundHistory: async (params = {}) => {
    const response = await api.get('/customer/funds/transactions', { params });
    return response.data;
  },

  /**
   * Request to add funds
   * @param {Object} fundData - Amount details (amount, utr_number optional)
   * @returns {Promise}
   */
  requestAddFunds: async (fundData) => {
    const response = await api.post('/customer/funds/add', fundData);
    return response.data;
  },

  /**
   * @deprecated Screenshot proof upload is no longer required
   * Submit payment proof for an add-funds request
   * @param {string} requestId - Add-funds request id
   * @param {Object} proofData - proof_url, proof_public_id, payment_reference
   * @returns {Promise}
   */
  submitAddFundsProof: async (requestId, proofData) => {
    // DEPRECATED: This endpoint now returns 410 Gone
    const response = await api.post(`/customer/funds/add/${requestId}/proof`, proofData);
    return response.data;
  },

  /**
   * Request withdrawal
   * @param {Object} withdrawData - Amount and bank details
   * @returns {Promise}
   */
  requestWithdraw: async (withdrawData) => {
    const response = await api.post('/customer/funds/withdraw', withdrawData);
    return response.data;
  },

  /**
   * Get broker payment info (UPI, bank details)
   * @returns {Promise} - Payment info
   */
  getPaymentInfo: async () => {
    const response = await api.get('/customer/funds/payment-info');
    return response.data;
  },

  /**
   * Get add-funds request records
   * @param {Object} params - Query params
   * @returns {Promise}
   */
  getAddFundRequests: async (params = {}) => {
    const response = await api.get('/customer/funds/payments', { params });
    return response.data;
  },

  /**
   * Get withdrawal request records
   * @param {Object} params - Query params
   * @returns {Promise}
   */
  getWithdrawalRequests: async (params = {}) => {
    const response = await api.get('/customer/funds/withdrawals', { params });
    return response.data;
  },

  /**
   * @deprecated Screenshot proof upload is no longer required
   * Get upload signature for funds proof image upload
   * @returns {Promise}
   */
  getFundsUploadSignature: async () => {
    // DEPRECATED: This endpoint now returns 410 Gone
    const response = await api.get('/customer/funds/upload-signature');
    return response.data;
  },

  // ========================
  // ORDERS
  // ========================

  /**
   * Place a new order
   * @param {Object} orderData - Order details
   * @returns {Promise} - Order confirmation
   */
  placeOrder: async (orderData) => {
    const response = await api.post('/customer/postOrder', orderData);
    return response.data;
  },

  /**
   * Get all orders
   * @param {Object} params - Query params (status, page, limit)
   * @returns {Promise} - List of orders
   */
  getOrders: async (params = {}) => {
    const response = await api.get('/customer/orders', { params });
    return response.data;
  },

  /**
   * Get order book (section + bucket view)
   * @param {Object} params - Query params (section, bucket, search, from, to, page, limit, sort)
   * @returns {Promise}
   */
  getOrderBook: async (params = {}) => {
    const response = await api.get('/customer/order-book', { params });
    return response.data;
  },

  /**
   * Get today's orders
   * @returns {Promise} - Today's orders
   */
  getTodayOrders: async () => {
    const response = await api.get('/customer/orders/today');
    return response.data;
  },

  /**
   * Get order history
   * @param {Object} params - Query params (from, to, page)
   * @returns {Promise} - Order history
   */
  getOrderHistory: async (params = {}) => {
    const response = await api.get('/customer/orders/history', { params });
    return response.data;
  },

  /**
   * Get cancelled orders
   * @param {Object} params - Query params
   * @returns {Promise} - Cancelled orders
   */
  getCancelledOrders: async (params = {}) => {
    const response = await api.get('/customer/orders/cancelled', { params });
    return response.data;
  },

  /**
   * Modify an existing order
   * @param {string} orderId - Order ID
   * @param {Object} modifications - Modified fields
   * @returns {Promise}
   */
  modifyOrder: async (orderId, modifications) => {
    const response = await api.put(`/customer/orders/${orderId}`, modifications);
    return response.data;
  },

  /**
   * Update order via legacy endpoint (supports status changes, exit, SL/target updates)
   * @param {Object} updateData - Order update payload
   * @returns {Promise}
   */
  updateOrder: async (updateData) => {
    const response = await api.post('/orders/updateOrder', updateData);
    return response.data;
  },

  /**
   * Cancel an order
   * @param {string} orderId - Order ID
   * @returns {Promise}
   */
  cancelOrder: async (orderId) => {
    const response = await api.delete(`/customer/orders/${orderId}`);
    return response.data;
  },

  /**
   * Get trade book
   * @param {Object} params - Query params
   * @returns {Promise} - Trade book data
   */
  getTradeBook: async (params = {}) => {
    const response = await api.get('/customer/trades', { params });
    return response.data;
  },

  /**
   * Get P&L report
   * @param {Object} params - Query params (from, to)
   * @returns {Promise} - P&L report
   */
  getPnlReport: async (params = {}) => {
    const response = await api.get('/customer/pnl', { params });
    return response.data;
  },

  // ========================
  // PORTFOLIO
  // ========================

  /**
   * Get holdings
   * @returns {Promise} - Holdings data
   */
  getHoldings: async () => {
    const response = await api.get('/customer/portfolio/holdings');
    return response.data;
  },

  /**
   * Get positions
   * @returns {Promise} - Positions data
   */
  getPositions: async () => {
    const response = await api.get('/customer/portfolio/positions');
    return response.data;
  },

  // ========================
  // WATCHLIST
  // ========================

  /**
   * Get watchlist
   * @returns {Promise} - Watchlist data
   */
  getWatchlist: async () => {
    const response = await api.get('/customer/watchlist');
    return response.data;
  },

  /**
   * Update watchlist (add/remove symbols)
   * @param {Object} watchlistData - Watchlist updates
   * @returns {Promise}
   */
  updateWatchlist: async (watchlistData) => {
    const response = await api.put('/customer/watchlist', watchlistData);
    return response.data;
  },

  createWatchlist: async (name) => {
    const response = await api.post('/customer/watchlist', { action: 'create', name });
    return response.data;
  },

  deleteWatchlist: async (name) => {
    const response = await api.delete(`/customer/watchlist/list/${encodeURIComponent(name)}`);
    return response.data;
  },

  /**
   * Delete symbol from watchlist
   * @param {string} symbol - Symbol to remove
   * @returns {Promise}
   */
  removeFromWatchlist: async (symbol, listName, options = {}) => {
    const query = new URLSearchParams();
    if (listName) query.set('listName', listName);
    if (options.instrumentToken) query.set('instrumentToken', String(options.instrumentToken));
    if (options.segment) query.set('segment', String(options.segment));
    if (options.exchange) query.set('exchange', String(options.exchange));
    const params = query.toString() ? `?${query.toString()}` : '';
    const response = await api.delete(`/customer/watchlist/${encodeURIComponent(symbol)}${params}`);
    return response.data;
  },

  // ========================
  // SETTINGS
  // ========================

  /**
   * Get account settings
   * @returns {Promise} - Settings data
   */
  getSettings: async () => {
    const response = await api.get('/customer/settings');
    return response.data;
  },

  /**
   * Update account settings
   * @param {Object} settings - Settings to update
   * @returns {Promise}
   */
  updateSettings: async (settings) => {
    const response = await api.put('/customer/settings', settings);
    return response.data;
  },

  /**
   * Update notification preferences
   * @param {Object} notifications - Notification settings
   * @returns {Promise}
   */
  updateNotifications: async (notifications) => {
    const response = await api.put('/customer/settings/notifications', notifications);
    return response.data;
  },

  /**
   * Save profile photo URL after direct Cloudinary upload
   * @param {string} photoUrl - Cloudinary URL of uploaded photo
   * @returns {Promise}
   */
  uploadProfilePhoto: async (photoUrl) => {
    const response = await api.put('/customer/profile/photo', { photoUrl });
    return response.data;
  },

  /**
   * Get Cloudinary upload signature for profile photo
   * @returns {Promise}
   */
  getProfilePhotoUploadSignature: async () => {
    const response = await api.get('/customer/profile/photo-upload-signature');
    return response.data;
  },

  // ========================
  // REGISTRATION / KYC
  // ========================

  /**
   * Verify a broker reference code (public — no auth)
   * @param {string} code - Broker reference code e.g. WOLF0001
   * @returns {Promise} { valid, broker_name, city, broker_id }
   */
  verifyBrokerCode: async (code) => {
    const response = await api.get('/broker/verify-code', { params: { code } });
    return response.data;
  },

  /**
   * Check if a userId is available for registration
   * @param {string} userId
   * @returns {Promise} { available: boolean }
   */
  checkUserId: async (userId) => {
    const response = await api.get('/customer/register/check-userid', { params: { userId } });
    return response.data;
  },

  /**
   * Submit registration
   * @param {Object} registrationData - Registration form data
   * @returns {Promise}
   */
  submitRegistration: async (registrationData) => {
    const response = await api.post('/customer/register', registrationData);
    return response.data;
  },

  /**
   * Check registration status
   * @param {string} email - User email
   * @returns {Promise} - Registration status
   */
  checkRegistrationStatus: async (registrationId) => {
    const response = await api.get(`/customer/register/${registrationId}/status`);
    return response.data;
  },

  /**
   * Get document upload signature (for direct upload)
   * @param {Object} fileInfo - File type and name
   * @returns {Promise} - Upload signature
   */
  getUploadSignature: async () => {
    const response = await api.get('/customer/register/upload-signature');
    return response.data;
  },

  /**
   * Submit KYC documents
   * @param {FormData} formData - Form data with documents
   * @returns {Promise}
   */
  submitKycDocuments: async (registrationId, formData) => {
    const response = await api.post(`/customer/register/${registrationId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Get KYC status/details for logged-in customer
   */
  getKyc: async () => {
    const response = await api.get('/customer/kyc');
    return response.data;
  },

  // ========================
  // MARKET DATA (Instruments + Quotes)
  // ========================

  searchInstruments: async (query) => {
    const response = await api.get('/instruments/search', { params: { q: query } });
    return response.data;
  },

  getIndexes: async () => {
    const response = await api.get('/instruments/indexes');
    return response.data;
  },

  getQuotesSnapshot: async (items) => {
    const response = await api.post('/quotes/snapshot', { items });
    return response.data;
  },

  resolveInstrument: async (params) => {
    const response = await api.get('/instruments/resolve', { params });
    return response.data;
  },

  lookupInstrument: async (params) => {
    const response = await api.get('/instruments/lookup', { params });
    return response.data;
  },

  // ========================
  // BANK ACCOUNTS
  // ========================

  getBankAccounts: async () => {
    const response = await api.get('/customer/bank-accounts');
    return response.data;
  },

  addBankAccount: async (data) => {
    const response = await api.post('/customer/bank-accounts', data);
    return response.data;
  },

  updateBankAccount: async (id, data) => {
    const response = await api.put(`/customer/bank-accounts/${id}`, data);
    return response.data;
  },

  deleteBankAccount: async (id) => {
    const response = await api.delete(`/customer/bank-accounts/${id}`);
    return response.data;
  },

  // ========================
  // KYC DOCUMENTS
  // ========================

  getKycDocuments: async () => {
    const response = await api.get('/customer/kyc-documents');
    return response.data;
  },

  submitAadhaarKyc: async (data) => {
    const response = await api.post('/customer/kyc-documents/aadhaar', data);
    return response.data;
  },

  submitPanKyc: async (data) => {
    const response = await api.post('/customer/kyc-documents/pan', data);
    return response.data;
  },

  submitBankProofKyc: async (data) => {
    const response = await api.post('/customer/kyc-documents/bank-proof', data);
    return response.data;
  },

  getKycUploadSignature: async () => {
    const response = await api.get('/customer/kyc-documents/upload-signature');
    return response.data;
  },

  /**
   * Get active admin warning for current customer
   * @returns {Promise} - { warning: { active, message, createdAt, updatedAt } }
   */
  getWarning: async () => {
    const response = await api.get('/customer/warning');
    return response.data;
  },

  // ========================
  // SUPPORT CHAT
  // ========================

  /**
   * Create a new support session or get existing one
   * @param {string} subject - Session subject (required for new session)
   * @returns {Promise} - { session, isNew }
   */
  createOrGetSupportSession: async (subject) => {
    const response = await api.post('/customer/support/sessions', { subject });
    return response.data;
  },

  /**
   * Get current active support session
   * @returns {Promise} - { session } or { session: null }
   */
  getCurrentSupportSession: async () => {
    const response = await api.get('/customer/support/sessions/current');
    return response.data;
  },

  /**
   * Get messages for a support session (cursor-based pagination)
   * @param {string} sessionId - Session ID
   * @param {Object} params - { before, after, limit }
   * @returns {Promise} - { messages, hasMore, cursor }
   */
  getSupportMessages: async (sessionId, params = {}) => {
    const response = await api.get(`/customer/support/sessions/${sessionId}/messages`, { params });
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
    const response = await api.post(`/customer/support/sessions/${sessionId}/messages`, formData, {
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
    const response = await api.post(`/customer/support/sessions/${sessionId}/read`, { messageIds });
    return response.data;
  },

  /**
   * Send typing status
   * @param {string} sessionId - Session ID
   * @param {boolean} isTyping - Whether user is typing
   * @returns {Promise}
   */
  sendSupportTyping: async (sessionId, isTyping) => {
    const response = await api.post(`/customer/support/sessions/${sessionId}/typing`, { isTyping });
    return response.data;
  },
};

export default customerApi;
