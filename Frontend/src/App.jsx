import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import './App.css';

// Context Providers
import { AuthProvider, useAuth } from './context/AuthContext';
import { MarketDataProvider } from './context/SocketContext';
import { BrokerAuthProvider, useBrokerAuth } from './context/BrokerContext';
import { AdminAuthProvider, useAdminAuth } from './context/AdminContext';
import { useTheme } from './context/useTheme';

// Layouts
import CustomerLayout from './layouts/CustomerLayout';
import BrokerLayout from './layouts/BrokerLayout';
import CFDRiskWarningModal from './components/shared/CFDRiskWarningModal';
import { AdminWarningGate } from './components/shared/WarningBanner';

// Auth (small, always needed)
const Login = lazy(() => import('./modules/auth/Login'));
const Signup = lazy(() => import('./modules/auth/Signup'));
const RegistrationStatus = lazy(() => import('./modules/auth/RegistrationStatus'));

// Customer Modules
const Watchlist = lazy(() => import('./modules/customer/Watchlist'));
const Orders = lazy(() => import('./modules/customer/Orders'));
const Portfolio = lazy(() => import('./modules/customer/Portfolio'));
const PortfolioInvoice = lazy(() => import('./modules/customer/PortfolioInvoice'));
const Profile = lazy(() => import('./modules/customer/Profile'));
const ProfileEdit = lazy(() => import('./modules/customer/ProfileEdit'));
const Funds = lazy(() => import('./modules/customer/Funds'));
const FundStatement = lazy(() => import('./modules/customer/FundStatement'));
const AddFunds = lazy(() => import('./modules/customer/AddFunds'));
const WithdrawFunds = lazy(() => import('./modules/customer/WithdrawFunds'));
const Payments = lazy(() => import('./modules/customer/Payments'));
const AccountSettings = lazy(() => import('./modules/customer/AccountSettings'));
const AddBankAccount = lazy(() => import('./modules/customer/AddBankAccount'));
const AccountSummary = lazy(() => import('./modules/customer/AccountSummary'));
const Help = lazy(() => import('./modules/customer/Help'));
const SupportChat = lazy(() => import('./modules/customer/SupportChat'));
const KycDetails = lazy(() => import('./modules/customer/KycDetails'));
const KYCDocuments = lazy(() => import('./modules/customer/KYCDocuments'));
const KYCPending = lazy(() => import('./modules/customer/KYCPending'));
const OrderConfirmation = lazy(() => import('./modules/customer/OrderConfirmation'));
const OptionChain = lazy(() => import('./modules/customer/OptionChain'));
const ChartView = lazy(() => import('./modules/customer/ChartView'));
const OrderBook = lazy(() => import('./modules/customer/OrderBook'));

// Broker Modules
const BrokerLogin = lazy(() => import('./modules/broker/Login'));
const BrokerDashboard = lazy(() => import('./modules/broker/Dashboard'));
const BrokerClientList = lazy(() => import('./modules/broker/ClientList'));
const BrokerClientDetail = lazy(() => import('./modules/broker/ClientDetail'));
const BrokerFunds = lazy(() => import('./modules/broker/Funds'));
const BrokerManagement = lazy(() => import('./modules/broker/Management'));
const BrokerWithdrawalRequests = lazy(() => import('./modules/broker/WithdrawalRequests'));
const BrokerApprovals = lazy(() => import('./modules/broker/Approvals'));
const BrokerCncOrderApprovals = lazy(() => import('./modules/broker/CncOrderApprovals'));
const BrokerSettings = lazy(() => import('./modules/broker/Settings'));
const BrokerLogs = lazy(() => import('./modules/broker/Logs'));
const BrokerPaymentVerification = lazy(() => import('./modules/broker/PaymentVerification'));
const BrokerCreateClient = lazy(() => import('./modules/broker/CreateClient'));
const BrokerEditClient = lazy(() => import('./modules/broker/EditClient'));
const BrokerRecycleBin = lazy(() => import('./modules/broker/RecycleBin'));

// Admin Modules
const AdminLogin = lazy(() => import('./modules/admin/Login'));
const AdminDashboard = lazy(() => import('./modules/admin/Dashboard'));
const AdminBrokers = lazy(() => import('./modules/admin/Brokers'));
const AdminCustomers = lazy(() => import('./modules/admin/Customers'));
const AdminKYC = lazy(() => import('./modules/admin/KYC'));
const AdminLogs = lazy(() => import('./modules/admin/Logs'));
const AdminAccessToken = lazy(() => import('./modules/admin/AccessToken'));
const AdminSettings = lazy(() => import('./modules/admin/Settings'));
const AdminReports = lazy(() => import('./modules/admin/Reports'));
const AdminWithdrawals = lazy(() => import('./modules/admin/Withdrawals'));
const AdminFunds = lazy(() => import('./modules/admin/Funds'));
const AdminChats = lazy(() => import('./modules/admin/Chats'));

const CUSTOMER_CFD_WARNING_REQUIRED_KEY = 'customer_cfd_warning_required';
const CUSTOMER_REENTRY_REDIRECT_DONE_KEY = 'customer_reentry_redirect_done';

const AuthLoadingScreen = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-300 tracking-wide">Checking session...</p>
      </div>
    </div>
  );
};

const LandingRoute = () => {
  const { isAuthenticated: customerAuthenticated, user: customerUser, loading: customerLoading } = useAuth();
  const { isAuthenticated: brokerAuthenticated, loading: brokerLoading } = useBrokerAuth();
  const { isAuthenticated: adminAuthenticated, loading: adminLoading } = useAdminAuth();

  if (customerLoading || brokerLoading || adminLoading) return <AuthLoadingScreen />;
  if (adminAuthenticated) return <Navigate to="/admin/dashboard" replace />;
  if (brokerAuthenticated) return <Navigate to="/broker/dashboard" replace />;
  if (customerAuthenticated) {
    return customerUser?.kycStatus === 'verified'
      ? <Navigate to="/watchlist" replace />
      : <Navigate to="/kyc-pending" replace />;
  }
  return <Navigate to="/login" replace />;
};

const CustomerCfdRiskWarningGate = () => {
  const { isAuthenticated, user } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);

  const isOpen = (() => {
    if (isDismissed || !isAuthenticated || !user) return false;
    try {
      return sessionStorage.getItem(CUSTOMER_CFD_WARNING_REQUIRED_KEY) === '1';
    } catch {
      return false;
    }
  })();

  const handleAgree = () => {
    try {
      sessionStorage.removeItem(CUSTOMER_CFD_WARNING_REQUIRED_KEY);
    } catch {
      // No-op: session storage may be unavailable in private mode.
    }
    setIsDismissed(true);
  };

  if (!isOpen) return null;

  return <CFDRiskWarningModal isOpen={isOpen} onAgree={handleAgree} />;
};

const RequireCustomerAuth = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  return isAuthenticated ? (
    <>
      {children}
      <CustomerCfdRiskWarningGate />
      <AdminWarningGate />
    </>
  ) : <Navigate to="/login" replace />;
};

// Gate trading routes behind KYC approval.
// Redirects to /kyc-pending if authenticated but trading is not yet enabled.
const RequireTradingEnabled = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (user?.kycStatus !== 'verified') return <Navigate to="/kyc-pending" replace />;
  return children;
};

const RequireBrokerAuth = ({ children }) => {
  const { isAuthenticated, loading } = useBrokerAuth();
  if (loading) return <AuthLoadingScreen />;
  return isAuthenticated ? children : <Navigate to="/broker/login" replace />;
};

const RequireAdminAuth = ({ children }) => {
  const { isAuthenticated, loading } = useAdminAuth();
  if (loading) return <AuthLoadingScreen />;
  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
};

const GuestOnlyRoute = ({ children }) => {
  const { isAuthenticated: customerAuthenticated, user: customerUser, loading: customerLoading } = useAuth();
  const { isAuthenticated: brokerAuthenticated, loading: brokerLoading } = useBrokerAuth();
  const { isAuthenticated: adminAuthenticated, loading: adminLoading } = useAdminAuth();

  if (customerLoading || brokerLoading || adminLoading) return <AuthLoadingScreen />;
  if (adminAuthenticated) return <Navigate to="/admin/dashboard" replace />;
  if (brokerAuthenticated) return <Navigate to="/broker/dashboard" replace />;
  if (customerAuthenticated) {
    return customerUser?.kycStatus === 'verified'
      ? <Navigate to="/watchlist" replace />
      : <Navigate to="/kyc-pending" replace />;
  }
  return children;
};

const CustomerSessionReentryRedirect = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isAuthenticated: customerAuthenticated,
    user: customerUser,
    loading: customerLoading,
    sessionBoot,
  } = useAuth();
  const { isAuthenticated: brokerAuthenticated, loading: brokerLoading } = useBrokerAuth();
  const { isAuthenticated: adminAuthenticated, loading: adminLoading } = useAdminAuth();

  useEffect(() => {
    if (customerLoading || brokerLoading || adminLoading) return;
    if (!sessionBoot?.hydrated || !sessionBoot?.restored) return;
    if (!customerAuthenticated || brokerAuthenticated || adminAuthenticated) return;

    let alreadyRedirected = false;
    try {
      alreadyRedirected = sessionStorage.getItem(CUSTOMER_REENTRY_REDIRECT_DONE_KEY) === '1';
    } catch {
      alreadyRedirected = false;
    }
    if (alreadyRedirected) return;

    const targetPath = customerUser?.kycStatus === 'verified' ? '/watchlist' : '/kyc-pending';
    try {
      sessionStorage.setItem(CUSTOMER_REENTRY_REDIRECT_DONE_KEY, '1');
    } catch {
      // No-op: session storage may be unavailable in private mode.
    }

    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [
    adminAuthenticated,
    adminLoading,
    brokerAuthenticated,
    brokerLoading,
    customerAuthenticated,
    customerLoading,
    customerUser?.kycStatus,
    location.pathname,
    navigate,
    sessionBoot?.hydrated,
    sessionBoot?.restored,
  ]);

  return null;
};

const RouteThemeEnforcer = () => {
  const { pathname } = useLocation();
  const { setForcedTheme } = useTheme();

  useEffect(() => {
    const isBrokerRoute = pathname === '/broker' || pathname.startsWith('/broker/');
    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
    setForcedTheme(isBrokerRoute || isAdminRoute ? 'light' : null);
  }, [pathname, setForcedTheme]);

  return null;
};

function App() {
  return (
    <Router>
      <RouteThemeEnforcer />
      <AuthProvider>
        <MarketDataProvider>
          <BrokerAuthProvider>
            <AdminAuthProvider>
              <CustomerSessionReentryRedirect />
              <div className="App font-['Inter']">
                <Suspense fallback={<AuthLoadingScreen />}>
                <Routes>
                {/* Auth Routes */}
                <Route path="/" element={<LandingRoute />} />
                <Route path="/login" element={<GuestOnlyRoute><Login /></GuestOnlyRoute>} />
                <Route path="/signup" element={<GuestOnlyRoute><Signup /></GuestOnlyRoute>} />
                <Route path="/registration-status/:id" element={<RegistrationStatus />} />
                
                {/* Customer Routes with Bottom Navigation */}
                <Route element={<RequireCustomerAuth><CustomerLayout /></RequireCustomerAuth>}>
                  {/* Customer — Account Routes (accessible after login, before KYC) */}
                  <Route path="/profile" element={<Profile />} />

                  {/* Customer — Trading Routes (require KYC approval + trading_enabled) */}
                  <Route element={<RequireTradingEnabled><Outlet /></RequireTradingEnabled>}>
                    <Route path="/watchlist" element={<Watchlist />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/portfolio" element={<Portfolio />} />
                    <Route path="/funds" element={<Funds />} />
                  </Route>
                </Route>

                {/* Profile Edit — no bottom nav */}
                <Route path="/profile/edit" element={<RequireCustomerAuth><ProfileEdit /></RequireCustomerAuth>} />

                {/* KYC pending — shown when trading_enabled is false */}
                <Route path="/kyc-pending" element={<RequireCustomerAuth><KYCPending /></RequireCustomerAuth>} />

                {/* Customer Routes without Bottom Navigation */}
                <Route path="/portfolio/invoice" element={<RequireCustomerAuth><PortfolioInvoice /></RequireCustomerAuth>} />
                <Route path="/order-book" element={<RequireCustomerAuth><OrderBook /></RequireCustomerAuth>} />
                <Route path="/funds/add" element={<RequireCustomerAuth><AddFunds /></RequireCustomerAuth>} />
                <Route path="/funds/history" element={<RequireCustomerAuth><FundStatement /></RequireCustomerAuth>} />
                <Route path="/funds/add/confirm" element={<RequireCustomerAuth><Navigate to="/funds/add" replace /></RequireCustomerAuth>} />
                <Route path="/funds/withdraw" element={<RequireCustomerAuth><WithdrawFunds /></RequireCustomerAuth>} />
                <Route path="/funds/withdraw/confirm" element={<RequireCustomerAuth><Navigate to="/funds/withdraw" replace /></RequireCustomerAuth>} />
                <Route path="/profile/payments" element={<RequireCustomerAuth><Payments /></RequireCustomerAuth>} />
                <Route path="/settings" element={<RequireCustomerAuth><AccountSettings /></RequireCustomerAuth>} />
                <Route path="/profile/bank-account/add" element={<RequireCustomerAuth><AddBankAccount /></RequireCustomerAuth>} />
                <Route path="/profile/bank-account/edit/:id" element={<RequireCustomerAuth><AddBankAccount /></RequireCustomerAuth>} />
                <Route path="/account-summary" element={<RequireCustomerAuth><AccountSummary /></RequireCustomerAuth>} />
                <Route path="/support" element={<RequireCustomerAuth><Help /></RequireCustomerAuth>} />
                <Route path="/support/chat" element={<RequireCustomerAuth><SupportChat /></RequireCustomerAuth>} />
                <Route path="/kyc" element={<RequireCustomerAuth><KycDetails /></RequireCustomerAuth>} />
                <Route path="/kyc-documents" element={<RequireCustomerAuth><KYCDocuments /></RequireCustomerAuth>} />
                <Route path="/order-confirmation" element={<RequireCustomerAuth><OrderConfirmation /></RequireCustomerAuth>} />
                <Route path="/option-chain" element={<RequireCustomerAuth><OptionChain /></RequireCustomerAuth>} />
                <Route path="/chart" element={<RequireCustomerAuth><ChartView /></RequireCustomerAuth>} />

                {/* Broker Routes with Bottom Navigation */}
                <Route element={<RequireBrokerAuth><BrokerLayout /></RequireBrokerAuth>}>
                  <Route path="/broker/dashboard" element={<BrokerDashboard />} />
                  <Route path="/broker/clients" element={<BrokerClientList />} />
                  <Route path="/broker/approvals" element={<BrokerApprovals />} />
                  <Route path="/broker/management" element={<BrokerManagement />} />
                  <Route path="/broker/funds" element={<BrokerFunds />} />
                  <Route path="/broker/settings" element={<BrokerSettings />} />
                </Route>

                {/* Broker Routes without Bottom Navigation */}
                <Route path="/broker/login" element={<GuestOnlyRoute><BrokerLogin /></GuestOnlyRoute>} />
                <Route path="/broker/clients/new" element={<RequireBrokerAuth><BrokerCreateClient /></RequireBrokerAuth>} />
                <Route path="/broker/clients/:clientId" element={<RequireBrokerAuth><BrokerClientDetail /></RequireBrokerAuth>} />
                <Route path="/broker/clients/:clientId/edit" element={<RequireBrokerAuth><BrokerEditClient /></RequireBrokerAuth>} />
                <Route path="/broker/recycle-bin" element={<RequireBrokerAuth><BrokerRecycleBin /></RequireBrokerAuth>} />
                <Route path="/broker/cnc-approvals" element={<RequireBrokerAuth><BrokerCncOrderApprovals /></RequireBrokerAuth>} />
                <Route path="/broker/withdrawals" element={<RequireBrokerAuth><BrokerWithdrawalRequests /></RequireBrokerAuth>} />
                <Route path="/broker/logs" element={<RequireBrokerAuth><BrokerLogs /></RequireBrokerAuth>} />
                <Route path="/broker/margin" element={<RequireBrokerAuth><Navigate to="/broker/logs" replace /></RequireBrokerAuth>} />
                <Route path="/broker/payment-verification" element={<RequireBrokerAuth><BrokerPaymentVerification /></RequireBrokerAuth>} />

                {/* Admin Routes */}
                <Route path="/admin/login" element={<GuestOnlyRoute><AdminLogin /></GuestOnlyRoute>} />
                <Route path="/admin/dashboard" element={<RequireAdminAuth><AdminDashboard /></RequireAdminAuth>} />
                <Route path="/admin/brokers" element={<RequireAdminAuth><AdminBrokers /></RequireAdminAuth>} />
                <Route path="/admin/brokers/:brokerId" element={<RequireAdminAuth><AdminBrokers /></RequireAdminAuth>} />
                <Route path="/admin/customers" element={<RequireAdminAuth><AdminCustomers /></RequireAdminAuth>} />
                <Route path="/admin/customers/:customerId" element={<RequireAdminAuth><AdminCustomers /></RequireAdminAuth>} />
                <Route path="/admin/kyc" element={<RequireAdminAuth><AdminKYC /></RequireAdminAuth>} />
                <Route path="/admin/logs" element={<RequireAdminAuth><AdminLogs /></RequireAdminAuth>} />
                <Route path="/admin/access-token" element={<RequireAdminAuth><AdminAccessToken /></RequireAdminAuth>} />
                <Route path="/admin/settings" element={<RequireAdminAuth><AdminSettings /></RequireAdminAuth>} />
                <Route path="/admin/reports" element={<RequireAdminAuth><AdminReports /></RequireAdminAuth>} />
                <Route path="/admin/withdrawals" element={<RequireAdminAuth><AdminWithdrawals /></RequireAdminAuth>} />
                <Route path="/admin/funds" element={<RequireAdminAuth><AdminFunds /></RequireAdminAuth>} />
                <Route path="/admin/chats" element={<RequireAdminAuth><AdminChats /></RequireAdminAuth>} />
                <Route path="/admin/chats/:sessionId" element={<RequireAdminAuth><AdminChats /></RequireAdminAuth>} />
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </Suspense>
              </div>
            </AdminAuthProvider>
          </BrokerAuthProvider>
        </MarketDataProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
