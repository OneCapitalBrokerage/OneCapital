/**
 * Broker API Client
 * Handles all broker-specific API calls
 * Routes match backend: /api/broker/*
 */
import api from './index';

const brokerApi = {
  // ========================
  // DASHBOARD
  // ========================

  getDashboard: async () => {
    const response = await api.get('/broker/dashboard');
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/broker/profile');
    return response.data;
  },

  getAlerts: async () => {
    const response = await api.get('/broker/alerts');
    return response.data;
  },

  getActivityFeed: async (params = {}) => {
    const response = await api.get('/broker/activity', { params });
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/broker/stats');
    return response.data;
  },

  // ========================
  // CLIENT MANAGEMENT
  // ========================

  getAllClients: async (params = {}) => {
    const response = await api.get('/broker/clients', { params });
    return response.data;
  },

  getClientById: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}`);
    return response.data;
  },

  createClient: async (clientData) => {
    const response = await api.post('/broker/clients', clientData);
    return response.data;
  },

  updateClient: async (clientId, clientData) => {
    const response = await api.put(`/broker/clients/${clientId}`, clientData);
    return response.data;
  },

  deleteClient: async (clientId) => {
    const response = await api.delete(`/broker/clients/${clientId}`);
    return response.data;
  },

  blockClient: async (clientId) => {
    const response = await api.post(`/broker/clients/${clientId}/block`);
    return response.data;
  },

  unblockClient: async (clientId) => {
    const response = await api.post(`/broker/clients/${clientId}/unblock`);
    return response.data;
  },

  toggleTrading: async (clientId, enabled, reason) => {
    const response = await api.put(`/broker/clients/${clientId}/trading`, { enabled, reason });
    return response.data;
  },

  toggleHoldingsExit: async (clientId, allowed) => {
    const response = await api.put(`/broker/clients/${clientId}/holdings-exit`, { allowed });
    return response.data;
  },

  setClientSettlement: async (clientId, enabled, reason) => {
    const response = await api.put(`/broker/clients/${clientId}/settlement`, { enabled, reason });
    return response.data;
  },

  toggleOrderExitAllowed: async (clientId, orderId, allowed) => {
    const response = await api.put(`/broker/clients/${clientId}/orders/${orderId}/exit-toggle`, { allowed });
    return response.data;
  },

  getDeletedClients: async () => {
    const response = await api.get('/broker/clients-deleted');
    return response.data;
  },

  restoreClient: async (deletedId) => {
    const response = await api.post(`/broker/clients-deleted/${deletedId}/restore`);
    return response.data;
  },

  loginAsClient: async (clientId) => {
    const response = await api.post(`/broker/clients/${clientId}/login-as`);
    return response.data;
  },

  getClientCredentials: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}/credentials`);
    return response.data;
  },

  getClientHoldings: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}/holdings`);
    return response.data;
  },

  getClientPositions: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}/positions`);
    return response.data;
  },

  getClientLedger: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}/ledger`);
    return response.data;
  },

  getClientPricing: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}/pricing`);
    return response.data;
  },

  updateClientPricing: async (clientId, pricingData) => {
    const response = await api.put(`/broker/clients/${clientId}/pricing`, pricingData);
    return response.data;
  },

  // ========================
  // CLIENT ORDER MANAGEMENT
  // ========================

  getClientOrders: async (clientId, params = {}) => {
    // Uses customer order API via impersonation token
    const response = await api.get('/customer/orders', { params });
    return response.data;
  },

  getClientHoldingsOrders: async () => {
    // Uses customer portfolio API via impersonation token
    const response = await api.get('/customer/portfolio/holdings');
    return response.data;
  },

  modifyClientOrder: async (payload) => {
    // Uses legacy updateOrder via impersonation token
    const response = await api.post('/orders/updateOrder', payload);
    return response.data;
  },

  exitClientOrder: async (payload) => {
    // Uses legacy updateOrder with CLOSED status via impersonation token
    const response = await api.post('/orders/updateOrder', payload);
    return response.data;
  },

  convertOrderToHold: async (clientId, orderId) => {
    const response = await api.post(`/broker/clients/${clientId}/orders/${orderId}/convert-to-hold`);
    return response.data;
  },

  extendOrderValidity: async (clientId, orderId, payload = {}) => {
    const response = await api.post(`/broker/clients/${clientId}/orders/${orderId}/extend-validity`, payload);
    return response.data;
  },

  adjustHolding: async (clientId, orderId, payload) => {
    const response = await api.put(`/broker/clients/${clientId}/orders/${orderId}/holding-adjustment`, payload);
    return response.data;
  },

  // ========================
  // FUND MANAGEMENT
  // ========================

  addFundsToClient: async (customerId, fundData) => {
    const response = await api.post('/broker/funds/add', { customerId, ...fundData });
    return response.data;
  },

  getClientBalance: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}/balance`);
    return response.data;
  },

  updateClientFunds: async (clientId, fundData) => {
    const response = await api.put(`/broker/clients/${clientId}/funds`, fundData);
    return response.data;
  },

  getFundHistory: async (customerId, params = {}) => {
    const response = await api.get('/broker/funds/history', { params: { customerId, ...params } });
    return response.data;
  },

  // ========================
  // MARGIN MANAGEMENT
  // ========================

  updateClientMargin: async (customerId, marginData) => {
    const response = await api.post('/broker/margin/update', { customerId, ...marginData });
    return response.data;
  },

  getClientMargin: async (clientId) => {
    const response = await api.get(`/broker/clients/${clientId}/margin`);
    return response.data;
  },

  getMarginHistory: async (customerId, params = {}) => {
    const response = await api.get('/broker/margin/history', { params: { customerId, ...params } });
    return response.data;
  },

  // ========================
  // KYC APPROVALS
  // ========================

  getKycRequests: async (params = {}) => {
    const response = await api.get('/broker/kyc', { params });
    return response.data;
  },

  getKycDetail: async (id) => {
    const response = await api.get(`/broker/kyc/${id}`);
    return response.data;
  },

  approveKyc: async (requestId, docType) => {
    const response = await api.post(`/broker/kyc/${requestId}/approve`, { document: docType });
    return response.data;
  },

  rejectKyc: async (requestId, docType, reason) => {
    const response = await api.post(`/broker/kyc/${requestId}/reject`, { document: docType, reason });
    return response.data;
  },

  getKycStats: async () => {
    const response = await api.get('/broker/kyc/stats');
    return response.data;
  },

  // ========================
  // ORDER APPROVALS (CNC)
  // ========================

  getCncOrders: async (params = {}) => {
    const response = await api.get('/broker/orders/cnc', { params });
    return response.data;
  },

  approveCncOrder: async (orderId) => {
    const response = await api.post(`/broker/orders/cnc/${orderId}/approve`);
    return response.data;
  },

  rejectCncOrder: async (orderId, reason) => {
    const response = await api.post(`/broker/orders/cnc/${orderId}/reject`, { reason });
    return response.data;
  },

  getCncStats: async () => {
    const response = await api.get('/broker/orders/cnc/stats');
    return response.data;
  },

  // ========================
  // WITHDRAWAL REQUESTS
  // ========================

  getWithdrawals: async (params = {}) => {
    const response = await api.get('/broker/withdrawals', { params });
    return response.data;
  },

  approveWithdrawal: async (withdrawalId, transactionId = '') => {
    const payload = transactionId ? { transactionId } : {};
    const response = await api.post(`/broker/withdrawals/${withdrawalId}/approve`, payload);
    return response.data;
  },

  rejectWithdrawal: async (withdrawalId, reason) => {
    const response = await api.post(`/broker/withdrawals/${withdrawalId}/reject`, { reason });
    return response.data;
  },

  getWithdrawalStats: async () => {
    const response = await api.get('/broker/withdrawals/stats');
    return response.data;
  },

  // ========================
  // PAYMENT VERIFICATION
  // ========================

  getPayments: async (params = {}) => {
    const response = await api.get('/broker/payments', { params });
    return response.data;
  },

  verifyPayment: async (paymentId) => {
    const response = await api.post(`/broker/payments/${paymentId}/verify`);
    return response.data;
  },

  rejectPayment: async (paymentId, reason) => {
    const response = await api.post(`/broker/payments/${paymentId}/reject`, { reason });
    return response.data;
  },

  deletePayment: async (paymentId) => {
    const response = await api.delete(`/broker/payments/${paymentId}`);
    return response.data;
  },

  getPaymentProof: async (paymentId) => {
    const response = await api.get(`/broker/payments/${paymentId}/proof`);
    return response.data;
  },

  getPaymentStats: async () => {
    const response = await api.get('/broker/payments/stats');
    return response.data;
  },

  getPaymentHistory: async (params = {}) => {
    const response = await api.get('/broker/payments/history', { params });
    return response.data;
  },

  // ========================
  // SETTINGS
  // ========================

  getSettings: async () => {
    const response = await api.get('/broker/settings');
    return response.data;
  },

  updateSettings: async (settings) => {
    const response = await api.put('/broker/settings', settings);
    return response.data;
  },

  updateClientInfo: async (clientInfo) => {
    const response = await api.put('/broker/settings/client-info', clientInfo);
    return response.data;
  },

  getClientInfoUploadSignature: async () => {
    const response = await api.get('/broker/settings/client-info/upload-signature');
    return response.data;
  },

  discardClientInfoQrUpload: async (publicId) => {
    const response = await api.post('/broker/settings/client-info/qr/discard', { publicId });
    return response.data;
  },

  updateNotifications: async (notifications) => {
    const response = await api.put('/broker/settings/notifications', notifications);
    return response.data;
  },

  runWeeklySettlement: async (payload = {}) => {
    const response = await api.post('/broker/settlement/weekly/run', payload);
    return response.data;
  },

  runCustomerSettlement: async (customerIdStr, payload = {}) => {
    const response = await api.post(`/broker/settlement/customer/${customerIdStr}/run`, payload);
    return response.data;
  },

  getWeeklySettlementHistory: async (params = {}) => {
    const response = await api.get('/broker/settlement/weekly/history', { params });
    return response.data;
  },

  // ========================
  // REGISTRATION APPLICATIONS
  // ========================

  getRegistrationStats: async () => {
    const response = await api.get('/broker/registrations/stats');
    return response.data;
  },

  getRegistrations: async (params = {}) => {
    const response = await api.get('/broker/registrations', { params });
    return response.data;
  },

  getRegistrationDetail: async (id) => {
    const response = await api.get(`/broker/registrations/${id}`);
    return response.data;
  },

  approveRegistration: async (id) => {
    const response = await api.post(`/broker/registrations/${id}/approve`);
    return response.data;
  },

  rejectRegistration: async (id, reason) => {
    const response = await api.post(`/broker/registrations/${id}/reject`, { reason });
    return response.data;
  },
};

export default brokerApi;
