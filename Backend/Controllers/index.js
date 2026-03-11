// Controllers/index.js
// Main Controllers export - Organized by module

// ==========================================
// Common Module - Shared authentication
// ==========================================
export * as Auth from './common/AuthController.js';

// ==========================================
// Admin Module - Platform administration
// ==========================================
export * as AdminDashboard from './admin/DashboardController.js';
export * as AdminBroker from './admin/BrokerController.js';
export * as AdminCustomer from './admin/CustomerController.js';
export * as AdminKyc from './admin/KycController.js';
export * as AdminLogs from './admin/LogsController.js';
export * as AdminApiKey from './admin/ApiKeyController.js';

// ==========================================
// Broker Module - Broker operations
// ==========================================
export * as BrokerDashboard from './broker/DashboardController.js';
export * as BrokerClient from './broker/ClientController.js';
export * as BrokerFund from './broker/FundController.js';
export * as BrokerMargin from './broker/MarginController.js';
export * as BrokerKyc from './broker/KycController.js';
export * as BrokerOrder from './broker/OrderController.js';
export * as BrokerWithdrawal from './broker/WithdrawalController.js';
export * as BrokerPayment from './broker/PaymentController.js';
export * as BrokerSettings from './broker/SettingsController.js';

// ==========================================
// Customer Module - Customer operations
// ==========================================
export * as CustomerDashboard from './customer/DashboardController.js';
export * as CustomerTrading from './customer/TradingController.js';
export * as CustomerFund from './customer/FundController.js';
export * as CustomerSettings from './customer/SettingsController.js';
export * as CustomerRegistration from './customer/RegistrationController.js';
export * as CustomerOrderHistory from './customer/OrderHistoryController.js';

// ==========================================
// Market Module - Market data
// ==========================================
export * as Chart from './market/ChartController.js';
export * as OptionChain from './market/optionChainController.js';
export * as Instruments from './market/instrumentStockNameControllers.js';

// ==========================================
// Legacy - Existing controllers (still active)
// ==========================================
export * as LegacyAuth from './common/AuthController.js';
export * as LegacyCustomer from './legacy/CustomerController.js';
export * as LegacyOrder from './legacy/orderController.js';
