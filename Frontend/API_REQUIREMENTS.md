# Wolf Trading Platform - API Requirements

This document outlines all the API endpoints required for the Wolf Trading Platform frontend application, organized by module (Customer, Broker, Admin) with common/shared APIs separated.

---

## Table of Contents

1. [Common/Shared APIs](#commonshared-apis)
2. [Customer Module APIs](#customer-module-apis)
3. [Broker Module APIs](#broker-module-apis)
4. [Admin Module APIs](#admin-module-apis)
5. [Summary](#summary)

---

## Common/Shared APIs

These APIs are shared across multiple modules and should be implemented as common services.

### Authentication (Common Patterns)

| Priority | Endpoint | Method | Description | Used By |
|----------|----------|--------|-------------|---------|
| P0 | `/api/auth/login` | POST | Universal login endpoint (role-based) | Customer, Broker, Admin |
| P0 | `/api/auth/logout` | POST | Logout and invalidate session | Customer, Broker, Admin |
| P1 | `/api/auth/forgot-password` | POST | Request password reset | Customer, Broker, Admin |
| P1 | `/api/auth/reset-password` | POST | Reset password with token | Customer, Broker, Admin |
| P2 | `/api/auth/biometric` | POST | Biometric authentication (Face ID/Touch ID) | Customer, Broker, Admin |
| P0 | `/api/auth/refresh-token` | POST | Refresh authentication token | Customer, Broker, Admin |

### Market Data APIs

| Priority | Endpoint | Method | Description | Used By |
|----------|----------|--------|-------------|---------|
| P0 | `/api/market/indices` | GET | Get market indices (NIFTY 50, SENSEX, BANK NIFTY) | Customer (Watchlist), Broker (Dashboard) |
| P0 | `/api/market/stocks/search` | GET | Search stocks by name or symbol | Customer (Watchlist), Broker (Trading) |
| P0 | `/api/market/stocks/:symbol` | GET | Get stock details and current price | Customer (Watchlist, Orders), Broker (Trading) |
| P0 | `/api/market/stocks/:symbol/quote` | GET | Get real-time stock quote | Customer (Watchlist), Broker (Trading) |

### Real-time WebSocket Connections

| Priority | Endpoint | Purpose | Used By |
|----------|----------|---------|---------|
| P0 | `ws://api/market/stream` | Real-time market data streaming | Customer, Broker |
| P1 | `ws://api/notifications/stream` | Real-time notifications | Customer, Broker, Admin |

### KYC Document APIs

| Priority | Endpoint | Method | Description | Used By |
|----------|----------|--------|-------------|---------|
| P1 | `/api/kyc/:id/documents` | GET | Get KYC documents for review | Broker (Approvals), Admin (KYC) |
| P1 | `/api/kyc/:id/documents/:docId` | GET | Download specific KYC document | Broker (Approvals), Admin (KYC) |

### File Upload APIs

| Priority | Endpoint | Method | Description | Used By |
|----------|----------|--------|-------------|---------|
| P1 | `/api/upload/image` | POST | Upload image (payment proof, KYC docs) | Customer (KYC), Broker (Payments) |
| P1 | `/api/upload/document` | POST | Upload document (PDF, etc.) | Customer (KYC), Broker (KYC) |

---

## Customer Module APIs

### User Authentication APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/auth/register` | POST | Register new customer account | Signup.jsx |
| P0 | `/api/auth/check-userid` | GET | Check if User ID is available during registration | Signup.jsx |

### User Profile APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/user/profile` | GET | Get user profile details | Profile.jsx |
| P0 | `/api/user/profile` | PUT | Update user profile | Profile.jsx, AccountSettings.jsx |
| P1 | `/api/user/stats` | GET | Get user statistics (total investment, returns, etc.) | Profile.jsx |
| P2 | `/api/user/change-password` | POST | Change password | AccountSettings.jsx |

### Watchlist APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P1 | `/api/watchlist` | GET | Get user's watchlist | Watchlist.jsx |
| P1 | `/api/watchlist` | POST | Add stock to watchlist | Watchlist.jsx |
| P1 | `/api/watchlist/:symbol` | DELETE | Remove stock from watchlist | Watchlist.jsx |
| P2 | `/api/watchlist/reorder` | PUT | Reorder watchlist items | Watchlist.jsx |
| P2 | `/api/watchlist/groups` | GET | Get watchlist groups | Watchlist.jsx |
| P2 | `/api/watchlist/groups` | POST | Create new watchlist group | Watchlist.jsx |

### Orders APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/orders` | GET | Get all orders (with filters) | Orders.jsx |
| P0 | `/api/orders/pending` | GET | Get pending orders | Orders.jsx |
| P0 | `/api/orders/executed` | GET | Get executed orders | Orders.jsx |
| P0 | `/api/orders` | POST | Place new order | Orders.jsx |
| P0 | `/api/orders/:id` | PUT | Modify order | Orders.jsx |
| P0 | `/api/orders/:id` | DELETE | Cancel order | Orders.jsx |
| P1 | `/api/orders/history` | GET | Get order history with pagination | Orders.jsx |

### Portfolio APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/portfolio/holdings` | GET | Get user's holdings | Portfolio.jsx |
| P0 | `/api/portfolio/positions` | GET | Get user's positions (intraday) | Portfolio.jsx |
| P0 | `/api/portfolio/summary` | GET | Get portfolio summary (P&L, current value) | Portfolio.jsx |

### Funds APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/funds/balance` | GET | Get available cash, margin, used margin | Funds.jsx |
| P1 | `/api/funds/transactions` | GET | Get fund transaction history | Funds.jsx |
| P1 | `/api/funds/add` | POST | Initiate add funds request | AddFunds.jsx |
| P1 | `/api/funds/add/upi` | POST | Add funds via UPI | AddFunds.jsx |
| P1 | `/api/funds/add/netbanking` | POST | Add funds via Net Banking | AddFunds.jsx |
| P1 | `/api/funds/withdraw` | POST | Request withdrawal | WithdrawFunds.jsx |
| P1 | `/api/funds/withdraw/status` | GET | Get withdrawal request status | WithdrawFunds.jsx |

### Account Summary APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P2 | `/api/account/summary` | GET | Get account summary (charges, fees, ledger) | AccountSummary.jsx |

### Bank Account APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P1 | `/api/user/bank-accounts` | GET | Get linked bank accounts | AccountSettings.jsx, AddFunds.jsx |
| P1 | `/api/user/bank-accounts` | POST | Add new bank account | AccountSettings.jsx |
| P1 | `/api/user/bank-accounts/:id` | DELETE | Remove bank account | AccountSettings.jsx |

### KYC APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P1 | `/api/kyc/status` | GET | Get KYC verification status | KycDetails.jsx |
| P1 | `/api/kyc/details` | GET | Get KYC details (PAN, Aadhar, etc.) | KycDetails.jsx |

### Settings APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P2 | `/api/settings` | GET | Get user settings | AccountSettings.jsx |
| P2 | `/api/settings` | PUT | Update settings (notifications, biometric) | AccountSettings.jsx |

---

## Broker Module APIs

### Dashboard APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/dashboard` | GET | Get dashboard data (stats, AUM, revenue) | Dashboard.jsx |
| P0 | `/api/broker/profile` | GET | Get broker profile | Dashboard.jsx, Settings.jsx |
| P1 | `/api/broker/alerts` | GET | Get broker alerts (margin calls, etc.) | Dashboard.jsx |
| P1 | `/api/broker/activity` | GET | Get recent activity feed | Dashboard.jsx |
| P1 | `/api/broker/stats` | GET | Get broker performance stats | Dashboard.jsx |

### Client Management APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/clients` | GET | Get all clients list | ClientList.jsx |
| P0 | `/api/broker/clients/:id` | GET | Get client details | ClientDetail.jsx |
| P0 | `/api/broker/clients` | POST | Create new client | ClientList.jsx |
| P0 | `/api/broker/clients/:id` | PUT | Update client details | ClientDetail.jsx |
| P0 | `/api/broker/clients/:id` | DELETE | Delete client | ClientDetail.jsx |
| P1 | `/api/broker/clients/:id/block` | POST | Block client account | ClientList.jsx, ClientDetail.jsx |
| P1 | `/api/broker/clients/:id/unblock` | POST | Unblock client account | ClientList.jsx, ClientDetail.jsx |
| P1 | `/api/broker/clients/:id/login-as` | POST | Login as client (impersonation) | ClientList.jsx, ClientDetail.jsx |
| P2 | `/api/broker/clients/:id/credentials` | GET | Get client credentials | ClientList.jsx |
| P2 | `/api/broker/clients/:id/holdings` | GET | Get client holdings | ClientDetail.jsx |
| P2 | `/api/broker/clients/:id/positions` | GET | Get client positions | ClientDetail.jsx |
| P2 | `/api/broker/clients/:id/ledger` | GET | Get client ledger | ClientDetail.jsx |

### Fund Management APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/funds/add` | POST | Add funds to client account | Funds.jsx |
| P0 | `/api/broker/clients/:id/balance` | GET | Get client balance | Funds.jsx |
| P1 | `/api/broker/funds/history` | GET | Get fund transfer history | Funds.jsx |

### Margin Management APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/margin/update` | POST | Update client margin | Margin.jsx |
| P0 | `/api/broker/clients/:id/margin` | GET | Get client margin details | Margin.jsx |
| P1 | `/api/broker/margin/history` | GET | Get margin update history | Margin.jsx |

### KYC Approval APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/kyc` | GET | Get KYC approval requests | Approvals.jsx |
| P0 | `/api/broker/kyc/:id/approve` | POST | Approve KYC request | Approvals.jsx |
| P0 | `/api/broker/kyc/:id/reject` | POST | Reject KYC request | Approvals.jsx |
| P1 | `/api/broker/kyc/stats` | GET | Get KYC stats (pending, approved, rejected) | Approvals.jsx |

### CNC Order Approval APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/orders/cnc` | GET | Get pending CNC orders | CncOrderApprovals.jsx |
| P0 | `/api/broker/orders/cnc/:id/approve` | POST | Approve CNC order | CncOrderApprovals.jsx |
| P0 | `/api/broker/orders/cnc/:id/reject` | POST | Reject CNC order | CncOrderApprovals.jsx |
| P1 | `/api/broker/orders/cnc/stats` | GET | Get CNC order stats | CncOrderApprovals.jsx |

### Withdrawal Request APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/withdrawals` | GET | Get pending withdrawal requests | WithdrawalRequests.jsx |
| P0 | `/api/broker/withdrawals/:id/approve` | POST | Approve withdrawal | WithdrawalRequests.jsx |
| P0 | `/api/broker/withdrawals/:id/reject` | POST | Reject withdrawal | WithdrawalRequests.jsx |
| P1 | `/api/broker/withdrawals/stats` | GET | Get withdrawal stats | WithdrawalRequests.jsx |

### Payment Verification APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/broker/payments` | GET | Get pending payment verifications | PaymentVerification.jsx |
| P0 | `/api/broker/payments/:id/verify` | POST | Verify and add funds | PaymentVerification.jsx |
| P0 | `/api/broker/payments/:id/reject` | POST | Reject payment | PaymentVerification.jsx |
| P1 | `/api/broker/payments/:id/proof` | GET | Get payment proof image | PaymentVerification.jsx |
| P1 | `/api/broker/payments/stats` | GET | Get payment verification stats | PaymentVerification.jsx |
| P1 | `/api/broker/payments/history` | GET | Get past payment approvals | PaymentVerification.jsx |

### Settings APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P1 | `/api/broker/settings` | GET | Get broker settings | Settings.jsx |
| P1 | `/api/broker/settings` | PUT | Update broker settings | Settings.jsx |
| P2 | `/api/broker/settings/client-info` | PUT | Update client-facing info (UPI, support contact) | Settings.jsx |
| P2 | `/api/broker/settings/notifications` | PUT | Update notification preferences | Settings.jsx |

---

## Admin Module APIs

### Dashboard APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/admin/dashboard` | GET | Get admin dashboard data | Dashboard.jsx |
| P0 | `/api/admin/stats` | GET | Get platform stats (customers, brokers, AUM, active users) | Dashboard.jsx |
| P1 | `/api/admin/action-items` | GET | Get pending action items (KYC, withdrawals) | Dashboard.jsx |
| P1 | `/api/admin/activity` | GET | Get recent activity feed | Dashboard.jsx |

### Broker Management APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/admin/brokers` | GET | Get all brokers list | Brokers.jsx |
| P0 | `/api/admin/brokers/:id` | GET | Get broker details | Brokers.jsx |
| P0 | `/api/admin/brokers` | POST | Create new broker | Brokers.jsx |
| P0 | `/api/admin/brokers/:id` | PUT | Update broker details | Brokers.jsx |
| P0 | `/api/admin/brokers/:id` | DELETE | Delete broker | Brokers.jsx |
| P1 | `/api/admin/brokers/:id/block` | POST | Block broker | Brokers.jsx |
| P1 | `/api/admin/brokers/:id/unblock` | POST | Unblock broker | Brokers.jsx |
| P1 | `/api/admin/brokers/:id/compliance` | GET | Get broker compliance score | Brokers.jsx |

### Customer Management APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/admin/customers` | GET | Get all customers list | Customers.jsx |
| P0 | `/api/admin/customers/:id` | GET | Get customer details | Customers.jsx |
| P0 | `/api/admin/customers/:id` | PUT | Update customer details | Customers.jsx |
| P1 | `/api/admin/customers/:id/block` | POST | Block customer | Customers.jsx |
| P1 | `/api/admin/customers/:id/unblock` | POST | Unblock customer | Customers.jsx |
| P1 | `/api/admin/customers/:id/trading/enable` | POST | Enable trading for customer | Customers.jsx |
| P1 | `/api/admin/customers/:id/trading/disable` | POST | Disable trading for customer | Customers.jsx |
| P1 | `/api/admin/customers/:id/login-as` | POST | Login as customer (impersonation) | Customers.jsx |

### KYC Approval APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/admin/kyc` | GET | Get KYC requests (pending, approved, rejected) | KYC.jsx |
| P0 | `/api/admin/kyc/:id` | GET | Get KYC request details | KYC.jsx |
| P0 | `/api/admin/kyc/:id/approve` | POST | Approve KYC request | KYC.jsx |
| P0 | `/api/admin/kyc/:id/reject` | POST | Reject KYC request | KYC.jsx |
| P1 | `/api/admin/kyc/stats` | GET | Get KYC stats by status | KYC.jsx |

### System Logs APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P1 | `/api/admin/logs` | GET | Get system logs (with filters) | Logs.jsx |
| P1 | `/api/admin/logs/security` | GET | Get security logs | Logs.jsx |
| P1 | `/api/admin/logs/transactions` | GET | Get transaction logs | Logs.jsx |
| P1 | `/api/admin/logs/data` | GET | Get data access logs | Logs.jsx |
| P1 | `/api/admin/logs/system` | GET | Get system logs | Logs.jsx |
| P2 | `/api/admin/logs/export` | GET | Export logs as CSV/PDF | Logs.jsx |

### API Key Management APIs

| Priority | Endpoint | Method | Description | Page(s) |
|----------|----------|--------|-------------|---------|
| P0 | `/api/admin/api-keys` | GET | Get all API keys | ApiKeys.jsx |
| P0 | `/api/admin/api-keys` | POST | Generate new API key | ApiKeys.jsx |
| P0 | `/api/admin/api-keys/:id` | DELETE | Revoke API key | ApiKeys.jsx |
| P1 | `/api/admin/api-keys/:id/toggle` | PUT | Enable/Disable API key | ApiKeys.jsx |
| P1 | `/api/admin/api-keys/:id/scopes` | PUT | Update API key scopes | ApiKeys.jsx |
| P2 | `/api/admin/api-keys/revoke-all` | POST | Revoke all API keys | ApiKeys.jsx |

---

## Summary

### API Count by Section

| Section | Priority P0 | Priority P1 | Priority P2 | Total |
|---------|-------------|-------------|-------------|-------|
| **Common/Shared** | 7 | 7 | 1 | **15** |
| **Customer** | 12 | 15 | 7 | **34** |
| **Broker** | 18 | 15 | 5 | **38** |
| **Admin** | 15 | 13 | 2 | **30** |
| **Total** | **52** | **50** | **15** | **117** |

### Common APIs Breakdown

| Category | APIs | Used By |
|----------|------|---------|
| Authentication | 6 | Customer, Broker, Admin |
| Market Data | 4 | Customer, Broker |
| WebSocket | 2 | Customer, Broker, Admin |
| KYC Documents | 2 | Broker, Admin |
| File Upload | 2 | Customer, Broker |

### Module-Specific APIs

| Category | Customer | Broker | Admin | Total |
|----------|----------|--------|-------|-------|
| User/Profile | 4 | - | - | 4 |
| Watchlist | 6 | - | - | 6 |
| Orders | 7 | 4 | - | 11 |
| Portfolio | 3 | - | - | 3 |
| Funds | 7 | 3 | - | 10 |
| Dashboard | - | 5 | 4 | 9 |
| Client Management | - | 12 | - | 12 |
| Customer Management | - | - | 8 | 8 |
| Broker Management | - | - | 8 | 8 |
| KYC | 2 | 4 | 5 | 11 |
| Margin | - | 3 | - | 3 |
| Withdrawals | - | 4 | - | 4 |
| Payments | - | 6 | - | 6 |
| Logs | - | - | 6 | 6 |
| API Keys | - | - | 6 | 6 |
| Settings | 2 | 4 | - | 6 |
| Bank Accounts | 3 | - | - | 3 |
| Account Summary | 1 | - | - | 1 |

### Priority Definitions

- **P0 (Critical)**: Core functionality - must have for MVP
- **P1 (High)**: Important features - needed for full functionality
- **P2 (Medium)**: Nice to have - can be deferred

### WebSocket Connections (All in Common)

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `ws://api/market/stream` | Real-time market data | Customer, Broker |
| `ws://api/notifications/stream` | Real-time notifications | Customer, Broker, Admin |
| `ws://api/orders/stream` | Real-time order updates | Customer |
| `ws://api/broker/alerts/stream` | Real-time alerts | Broker |
| `ws://api/admin/activity/stream` | Real-time activity feed | Admin |

---

## Implementation Notes

### Common Services Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Common    │  │   Common    │  │   Common    │          │
│  │    Auth     │  │   Market    │  │   Upload    │          │
│  │   Service   │  │   Service   │  │   Service   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Customer   │  │   Broker    │  │   Admin     │          │
│  │   Module    │  │   Module    │  │   Module    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow (Common)

1. All modules use the same `/api/auth/login` endpoint
2. Role is determined by login type (Customer ID / Broker ID / Admin ID)
3. JWT token includes role information for authorization
4. Token refresh uses common `/api/auth/refresh-token` endpoint

### Response Format (Standard)

```json
{
  "success": true,
  "data": {},
  "message": "Success",
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### Error Response Format

```json
{
  "success": false,
  "data": null,
  "message": "Error message",
  "error": {
    "code": "ERR_001",
    "details": {}
  }
}
```

---

*Document generated: January 30, 2026*
*Version: 1.1 - Added Common/Shared APIs section*
