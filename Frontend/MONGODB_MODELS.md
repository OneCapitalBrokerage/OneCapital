# Wolf Trading Platform - MongoDB Models

This document outlines all MongoDB models required for the Wolf Trading Platform, organized by domain with field specifications.

---

## Table of Contents

1. [Existing Models (Keep)](#existing-models-keep)
2. [User & Authentication Models](#user--authentication-models)
3. [Trading Models](#trading-models)
4. [Fund Management Models](#fund-management-models)
5. [KYC & Compliance Models](#kyc--compliance-models)
6. [System & Configuration Models](#system--configuration-models)
7. [Model Relationships](#model-relationships)
8. [Summary](#summary)

---

## Existing Models (Keep)

These models already exist and will be retained with minimal changes.

### 1. KiteCredentialModel (Keep as-is)

**File:** `Model/KiteCredentialModel.js`

| Field | Type | Description |
|-------|------|-------------|
| api_key | String | Kite API key |
| api_secret | String | Kite API secret |
| access_token | String | Current access token |
| public_token | String | Public token |
| user_id | String | Kite user ID |
| broker | String | Broker name (ZERODHA) |
| login_time | Date | Last login time |
| token_expiry | Date | Token expiration |
| is_active | Boolean | Active status |
| kite_password | String | Encrypted password |
| totp_secret | String | Encrypted TOTP |
| auto_login_enabled | Boolean | Auto-login flag |

### 2. InstrumentModel (Keep as-is)

**File:** `Model/InstrumentModel.js`

| Field | Type | Description |
|-------|------|-------------|
| instrument_token | String | Unique instrument token |
| exchange_token | String | Exchange token |
| tradingsymbol | String | Trading symbol |
| name | String | Instrument name |
| last_price | Number | Last traded price |
| expiry | Date | Expiry date (for derivatives) |
| strike | Number | Strike price (for options) |
| tick_size | Number | Minimum price movement |
| lot_size | Number | Lot size |
| instrument_type | String | EQ, FUT, CE, PE |
| segment | String | NSE, BSE, NFO, etc. |
| exchange | String | Exchange name |
| canon_key | String | Canonical key (unique) |

---

## User & Authentication Models

### 4. AdminModel (NEW)

**File:** `Model/Auth/AdminModel.js`
**Purpose:** Super admin accounts for platform management

```javascript
const AdminSchema = new Schema({
  // Login Credentials
  admin_id: { type: String, required: true, unique: true }, // Auto-generated 10-digit
  password: { type: String, required: true }, // Hashed
  
  // Profile
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  avatar: { type: String }, // Cloudinary URL
  
  // Role & Permissions
  role: { type: String, default: 'admin', immutable: true },
  permissions: [{
    type: String,
    enum: ['manage_brokers', 'manage_customers', 'manage_kyc', 'view_logs', 'manage_api_keys', 'manage_funds']
  }],
  
  // Security
  is_active: { type: Boolean, default: true },
  last_login: { type: Date },
  failed_login_attempts: { type: Number, default: 0 },
  account_locked_until: { type: Date },
  
  // 2FA
  two_factor_enabled: { type: Boolean, default: false },
  two_factor_secret: { type: String },
  
}, { timestamps: true });
```

**Used By Pages:** Admin Login, Admin Dashboard, Admin Settings

---

### 5. BrokerModel (REDESIGN)

**File:** `Model/Auth/BrokerModel.js`
**Purpose:** Broker accounts that manage customers

```javascript
const BrokerSchema = new Schema({
  // Login Credentials
  broker_id: { type: String, required: true, unique: true }, // Auto-generated 10-digit
  password: { type: String, required: true }, // Hashed
  
  // Profile
  name: { type: String, required: true }, // Company/Firm name
  owner_name: { type: String, required: true }, // Owner's name
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  avatar: { type: String }, // Cloudinary URL
  
  // Business Details
  company_name: { type: String },
  registration_number: { type: String },
  gst_number: { type: String },
  
  // Contact Info (Client Facing)
  support_contact: { type: String },
  support_email: { type: String },
  upi_id: { type: String }, // For fund transfers
  
  // Address
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'blocked', 'pending_verification', 'suspended'],
    default: 'pending_verification'
  },
  
  // Compliance
  compliance_score: { type: Number, default: 100, min: 0, max: 100 },
  kyc_verified: { type: Boolean, default: false },
  
  // Settings
  settings: {
    default_order_type: { type: String, enum: ['MIS', 'NRML'], default: 'MIS' },
    biometric_login: { type: Boolean, default: false },
    notifications: {
      trade_executions: { type: Boolean, default: true },
      margin_alerts: { type: Boolean, default: true },
      client_onboarding: { type: Boolean, default: true },
    }
  },
  
  // Stats (Cached/Computed)
  stats: {
    total_clients: { type: Number, default: 0 },
    active_clients: { type: Number, default: 0 },
    total_aum: { type: Number, default: 0 }, // Assets Under Management
  },
  
  // Security
  last_login: { type: Date },
  failed_login_attempts: { type: Number, default: 0 },
  
}, { timestamps: true });
```

**Used By Pages:** Broker Login, Dashboard, Settings, Admin Brokers

---

### 6. CustomerModel (REDESIGN)

**File:** `Model/Auth/CustomerModel.js`
**Purpose:** End-user customer accounts

```javascript
const CustomerSchema = new Schema({
  // Login Credentials
  customer_id: { type: String, required: true, unique: true }, // Auto-generated 10-digit
  password: { type: String, required: true }, // Hashed
  
  // Profile
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  avatar: { type: String }, // Cloudinary URL
  date_of_birth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  
  // KYC Details
  pan_number: { type: String },
  aadhar_number: { type: String }, // Last 4 digits only stored
  
  // Address
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
  },
  
  // Broker Linkage
  broker_id: { type: Schema.Types.ObjectId, ref: 'Broker', required: true },
  broker_id_str: { type: String, required: true }, // Denormalized for quick queries
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'blocked', 'inactive', 'pending_kyc'],
    default: 'pending_kyc'
  },
  
  // KYC Status
  kyc_status: {
    type: String,
    enum: ['pending', 'under_review', 'verified', 'rejected'],
    default: 'pending'
  },
  kyc_verified_at: { type: Date },
  kyc_request_id: { type: Schema.Types.ObjectId, ref: 'KYCRequest' },
  
  // Trading Permissions
  trading_enabled: { type: Boolean, default: false },
  segments_allowed: [{
    type: String,
    enum: ['EQUITY', 'F&O', 'COMMODITY', 'CURRENCY']
  }],
  
  // Settings
  settings: {
    biometric_login: { type: Boolean, default: false },
    notifications: {
      order_updates: { type: Boolean, default: true },
      price_alerts: { type: Boolean, default: true },
      fund_updates: { type: Boolean, default: true },
    }
  },
  
  // Security
  last_login: { type: Date },
  last_active: { type: Date },
  failed_login_attempts: { type: Number, default: 0 },
  
}, { timestamps: true });

// Indexes
CustomerSchema.index({ broker_id: 1, status: 1 });
CustomerSchema.index({ broker_id_str: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ phone: 1 });
```

**Used By Pages:** Customer Login, Profile, Settings, Broker ClientList/Detail, Admin Customers

---

### 7. BankAccountModel (NEW)

**File:** `Model/Auth/BankAccountModel.js`
**Purpose:** Customer's linked bank accounts

```javascript
const BankAccountSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true },
  
  // Bank Details
  bank_name: { type: String, required: true },
  account_number: { type: String, required: true }, // Encrypted
  account_number_masked: { type: String }, // ****1234
  ifsc_code: { type: String, required: true },
  account_holder_name: { type: String, required: true },
  account_type: { type: String, enum: ['savings', 'current'], default: 'savings' },
  
  // Verification
  is_verified: { type: Boolean, default: false },
  verified_at: { type: Date },
  verification_method: { type: String, enum: ['penny_drop', 'manual', 'ifsc_lookup'] },
  
  // Status
  is_primary: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  
}, { timestamps: true });

BankAccountSchema.index({ customer_id: 1 });
BankAccountSchema.index({ customer_id_str: 1 });
```

**Used By Pages:** Customer AccountSettings, AddFunds, WithdrawFunds

---

### 8. SessionModel (NEW)

**File:** `Model/Auth/SessionModel.js`
**Purpose:** Track active sessions for all user types

```javascript
const SessionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, required: true, refPath: 'user_type' },
  user_id_str: { type: String, required: true },
  user_type: { type: String, enum: ['Admin', 'Broker', 'Customer'], required: true },
  
  // Token
  token: { type: String, required: true, unique: true },
  refresh_token: { type: String },
  
  // Session Info
  device_info: {
    device_type: { type: String }, // mobile, desktop, tablet
    os: { type: String },
    browser: { type: String },
    ip_address: { type: String },
  },
  
  // Timestamps
  expires_at: { type: Date, required: true },
  last_activity: { type: Date, default: Date.now },
  
  // Status
  is_active: { type: Boolean, default: true },
  logged_out_at: { type: Date },
  
}, { timestamps: true });

SessionSchema.index({ user_id: 1, is_active: 1 });
SessionSchema.index({ token: 1 });
SessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // TTL index
```

**Used By:** All Login pages, Session management

---

## Trading Models

### 9. OrderModel (REDESIGN)

**File:** `Model/Trading/OrdersModel.js`
**Purpose:** All trading orders (pending, executed, cancelled)

```javascript
const OrderSchema = new Schema({
  // References
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id: { type: Schema.Types.ObjectId, ref: 'Broker', required: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Instrument
  instrument_token: { type: String, required: true, index: true },
  symbol: { type: String, required: true },
  exchange: { type: String, required: true }, // NSE, BSE, NFO, MCX
  segment: { type: String, required: true }, // EQUITY, F&O, COMMODITY
  
  // Order Details
  side: { type: String, enum: ['BUY', 'SELL'], required: true },
  order_type: { type: String, enum: ['MARKET', 'LIMIT', 'SL', 'SL-M'], required: true },
  product: { type: String, enum: ['MIS', 'CNC', 'NRML'], required: true },
  
  // Quantity
  quantity: { type: Number, required: true, min: 1 },
  lots: { type: Number, default: 1 },
  lot_size: { type: Number, default: 1 },
  
  // Prices
  price: { type: Number, default: 0 }, // Limit price
  trigger_price: { type: Number, default: 0 }, // Stop-loss trigger
  stop_loss: { type: Number, default: 0 },
  target: { type: Number, default: 0 },
  
  // Execution
  filled_qty: { type: Number, default: 0 },
  pending_qty: { type: Number },
  avg_fill_price: { type: Number, default: 0 },
  
  // Status
  status: { 
    type: String, 
    enum: ['PENDING', 'OPEN', 'EXECUTED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
    default: 'PENDING',
    index: true
  },
  
  // Category
  category: {
    type: String,
    enum: ['INTRADAY', 'DELIVERY', 'F&O'],
    index: true
  },
  
  // CNC Approval (for Broker)
  requires_approval: { type: Boolean, default: false },
  approval_status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approved_by: { type: Schema.Types.ObjectId, ref: 'Broker' },
  approved_at: { type: Date },
  rejection_reason: { type: String },
  
  // Exit Info
  exit_reason: { type: String, enum: ['manual', 'stop_loss', 'target', 'expiry', 'square_off'] },
  exit_price: { type: Number },
  exit_at: { type: Date },
  
  // Financials
  brokerage: { type: Number, default: 0 },
  margin_blocked: { type: Number, default: 0 },
  realized_pnl: { type: Number, default: 0 },
  
  // Broker Order Reference
  broker_order_id: { type: String, index: true },
  exchange_order_id: { type: String },
  
  // Timestamps
  placed_at: { type: Date, default: Date.now },
  executed_at: { type: Date },
  
}, { timestamps: true });

OrderSchema.index({ customer_id_str: 1, status: 1 });
OrderSchema.index({ broker_id_str: 1, approval_status: 1 });
OrderSchema.index({ placed_at: -1 });
```

**Used By Pages:** Customer Orders, Broker CncOrderApprovals

---

### 10. HoldingModel (REDESIGN)

**File:** `Model/Trading/HoldingModel.js`
**Purpose:** Customer's delivery/CNC holdings

```javascript
const HoldingSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Instrument
  instrument_token: { type: String, required: true },
  symbol: { type: String, required: true },
  exchange: { type: String, required: true },
  isin: { type: String }, // For demat reference
  
  // Quantity
  quantity: { type: Number, required: true },
  t1_quantity: { type: Number, default: 0 }, // T+1 (not settled)
  collateral_qty: { type: Number, default: 0 }, // Pledged
  
  // Prices
  avg_price: { type: Number, required: true },
  last_price: { type: Number, default: 0 },
  close_price: { type: Number, default: 0 },
  
  // P&L
  pnl: { type: Number, default: 0 },
  pnl_percent: { type: Number, default: 0 },
  day_change: { type: Number, default: 0 },
  day_change_percent: { type: Number, default: 0 },
  
  // Investment
  invested_value: { type: Number, default: 0 },
  current_value: { type: Number, default: 0 },
  
}, { timestamps: true });

HoldingSchema.index({ customer_id_str: 1 });
HoldingSchema.index({ symbol: 1 });
```

**Used By Pages:** Customer Portfolio, Broker ClientDetail

---

### 11. PositionModel (REDESIGN)

**File:** `Model/Trading/PositionsModel.js`
**Purpose:** Intraday and F&O positions

```javascript
const PositionSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Instrument
  instrument_token: { type: String, required: true },
  symbol: { type: String, required: true },
  exchange: { type: String, required: true },
  segment: { type: String, required: true },
  
  // Position Details
  product: { type: String, enum: ['MIS', 'NRML'], required: true },
  side: { type: String, enum: ['LONG', 'SHORT'], required: true },
  
  // Quantity
  quantity: { type: Number, required: true },
  overnight_qty: { type: Number, default: 0 },
  multiplier: { type: Number, default: 1 }, // Lot size for F&O
  
  // Prices
  avg_price: { type: Number, required: true },
  last_price: { type: Number, default: 0 },
  close_price: { type: Number, default: 0 },
  
  // P&L
  unrealized_pnl: { type: Number, default: 0 },
  realized_pnl: { type: Number, default: 0 },
  total_pnl: { type: Number, default: 0 },
  day_pnl: { type: Number, default: 0 },
  
  // Margin
  margin_used: { type: Number, default: 0 },
  
  // Status
  is_open: { type: Boolean, default: true },
  opened_at: { type: Date, default: Date.now },
  closed_at: { type: Date },
  
}, { timestamps: true });

PositionSchema.index({ customer_id_str: 1, is_open: 1 });
PositionSchema.index({ broker_id_str: 1 });
```

**Used By Pages:** Customer Portfolio, Broker ClientDetail

---

### 12. WatchlistModel (REDESIGN)

**File:** `Model/Trading/WatchListModel.js`
**Purpose:** Customer's watchlist

```javascript
const WatchlistSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true },
  
  // Watchlist Group
  name: { type: String, default: 'Default' },
  is_default: { type: Boolean, default: false },
  
  // Instruments
  instruments: [{
    instrument_token: { type: String, required: true },
    symbol: { type: String, required: true },
    exchange: { type: String },
    segment: { type: String },
    added_at: { type: Date, default: Date.now },
    sort_order: { type: Number, default: 0 },
  }],
  
}, { timestamps: true });

WatchlistSchema.index({ customer_id_str: 1 });
WatchlistSchema.index({ customer_id_str: 1, name: 1 }, { unique: true });
```

**Used By Pages:** Customer Watchlist

---

## Fund Management Models

### 13. FundModel (REDESIGN)

**File:** `Model/FundManagement/FundModel.js`
**Purpose:** Customer's fund balance and limits

```javascript
const FundSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
  customer_id_str: { type: String, required: true, unique: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Available Balance
  available_balance: { type: Number, default: 0 },
  
  // Margins
  total_margin: { type: Number, default: 0 },
  used_margin: { type: Number, default: 0 },
  available_margin: { type: Number, default: 0 },
  
  // Collateral
  collateral_value: { type: Number, default: 0 },
  
  // Limits by Product
  intraday: {
    available: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
  },
  delivery: {
    available: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
  },
  
  // Withdrawable
  withdrawable_balance: { type: Number, default: 0 },
  
  // Broker's Limit Settings
  limit_settings: {
    intraday_multiplier: { type: Number, default: 1 },
    f_and_o_enabled: { type: Boolean, default: true },
    max_order_value: { type: Number, default: 0 }, // 0 = unlimited
  },
  
  // Last Updated
  last_calculated_at: { type: Date, default: Date.now },
  
}, { timestamps: true });

FundSchema.index({ broker_id_str: 1 });
```

**Used By Pages:** Customer Funds, Broker Funds/Margin

---

### 14. FundTransactionModel (NEW)

**File:** `Model/FundManagement/FundTransactionModel.js`
**Purpose:** All fund movements (add, withdraw, charges)

```javascript
const FundTransactionSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Transaction Type
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'brokerage', 'charge', 'refund', 'transfer', 'margin_call'],
    required: true
  },
  
  // Amount
  amount: { type: Number, required: true },
  balance_before: { type: Number, required: true },
  balance_after: { type: Number, required: true },
  
  // Payment Details (for deposits)
  payment_method: { 
    type: String, 
    enum: ['upi', 'netbanking', 'neft', 'rtgs', 'imps', 'cheque', 'cash', 'internal']
  },
  payment_reference: { type: String },
  bank_reference: { type: String },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Description
  description: { type: String },
  remarks: { type: String },
  
  // Related Order (for brokerage charges)
  order_id: { type: Schema.Types.ObjectId, ref: 'Order' },
  
  // Processing Info
  processed_by: { type: Schema.Types.ObjectId, ref: 'Broker' },
  processed_at: { type: Date },
  
}, { timestamps: true });

FundTransactionSchema.index({ customer_id_str: 1, createdAt: -1 });
FundTransactionSchema.index({ broker_id_str: 1, type: 1 });
FundTransactionSchema.index({ status: 1 });
```

**Used By Pages:** Customer Funds, AccountSummary

---

### 15. WithdrawalRequestModel (NEW)

**File:** `Model/FundManagement/WithdrawalRequestModel.js`
**Purpose:** Customer withdrawal requests pending approval

```javascript
const WithdrawalRequestSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id: { type: Schema.Types.ObjectId, ref: 'Broker', required: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Amount
  amount: { type: Number, required: true },
  
  // Bank Account
  bank_account_id: { type: Schema.Types.ObjectId, ref: 'BankAccount', required: true },
  bank_details: {
    bank_name: { type: String },
    account_number_masked: { type: String },
    ifsc_code: { type: String },
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // Processing
  reviewed_by: { type: Schema.Types.ObjectId, ref: 'Broker' },
  reviewed_at: { type: Date },
  rejection_reason: { type: String },
  
  // Transfer Details
  utr_number: { type: String },
  transferred_at: { type: Date },
  
  // Priority
  is_high_value: { type: Boolean, default: false }, // > threshold
  
}, { timestamps: true });

WithdrawalRequestSchema.index({ broker_id_str: 1, status: 1 });
WithdrawalRequestSchema.index({ createdAt: -1 });
```

**Used By Pages:** Customer WithdrawFunds, Broker WithdrawalRequests

---

### 16. PaymentProofModel (NEW)

**File:** `Model/FundManagement/PaymentProofModel.js`
**Purpose:** Customer submitted payment proofs for verification

```javascript
const PaymentProofSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Amount
  amount: { type: Number, required: true },
  
  // Proof
  proof_type: { type: String, enum: ['screenshot', 'pdf', 'other'] },
  proof_url: { type: String, required: true }, // Cloudinary URL
  proof_public_id: { type: String },
  file_size: { type: String },
  
  // Payment Details
  payment_method: { type: String, enum: ['upi', 'neft', 'rtgs', 'imps', 'cheque'] },
  payment_reference: { type: String },
  payment_date: { type: Date },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
    index: true
  },
  
  // Verification
  verified_by: { type: Schema.Types.ObjectId, ref: 'Broker' },
  verified_at: { type: Date },
  rejection_reason: { type: String },
  
  // Linked Transaction (after verification)
  fund_transaction_id: { type: Schema.Types.ObjectId, ref: 'FundTransaction' },
  
}, { timestamps: true });

PaymentProofSchema.index({ broker_id_str: 1, status: 1 });
PaymentProofSchema.index({ createdAt: -1 });
```

**Used By Pages:** Customer AddFunds, Broker PaymentVerification

---

## KYC & Compliance Models

### 17. KYCRequestModel (REDESIGN from RegistrationModel)

**File:** `Model/KYC/KYCRequestModel.js`
**Purpose:** KYC verification requests

```javascript
const KYCRequestSchema = new Schema({
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer' },
  customer_id_str: { type: String },
  broker_id: { type: Schema.Types.ObjectId, ref: 'Broker' },
  broker_id_str: { type: String, index: true },
  
  // Personal Info
  full_name: { type: String, required: true },
  name_as_per_aadhaar: { type: String, required: true },
  date_of_birth: { type: Date, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  
  // Contact
  email: { type: String, required: true },
  phone: { type: String, required: true },
  whatsapp: { type: String },
  
  // KYC Documents
  pan_number: { type: String, required: true },
  aadhar_number: { type: String, required: true }, // Encrypted
  
  // Address
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  
  // Documents
  documents: {
    pan_card: {
      url: { type: String, required: true },
      public_id: { type: String },
      uploaded_at: { type: Date, default: Date.now },
    },
    aadhar_front: {
      url: { type: String, required: true },
      public_id: { type: String },
      uploaded_at: { type: Date, default: Date.now },
    },
    aadhar_back: {
      url: { type: String, required: true },
      public_id: { type: String },
      uploaded_at: { type: Date, default: Date.now },
    },
    photo: {
      url: { type: String },
      public_id: { type: String },
      uploaded_at: { type: Date },
    },
    address_proof: {
      url: { type: String },
      public_id: { type: String },
      uploaded_at: { type: Date },
    },
    bank_statement: {
      url: { type: String },
      public_id: { type: String },
      uploaded_at: { type: Date },
    },
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'resubmit_required'],
    default: 'pending',
    index: true
  },
  
  // Review
  reviewed_by: { type: Schema.Types.ObjectId, refPath: 'reviewed_by_type' },
  reviewed_by_type: { type: String, enum: ['Broker', 'Admin'] },
  reviewed_at: { type: Date },
  review_notes: { type: String },
  rejection_reason: { type: String },
  
  // Source
  ip_address: { type: String },
  user_agent: { type: String },
  
}, { timestamps: true });

KYCRequestSchema.index({ status: 1, createdAt: -1 });
KYCRequestSchema.index({ broker_id_str: 1, status: 1 });
KYCRequestSchema.index({ pan_number: 1 });
KYCRequestSchema.index({ phone: 1 });
```

**Used By Pages:** Customer Signup, KycDetails, Broker Approvals, Admin KYC

---

## System & Configuration Models

### 18. SystemLogModel (NEW)

**File:** `Model/System/SystemLogModel.js`
**Purpose:** System activity and audit logs

```javascript
const SystemLogSchema = new Schema({
  // Log Type
  type: { 
    type: String, 
    enum: ['security', 'data', 'transaction', 'system', 'audit'],
    required: true,
    index: true
  },
  
  // Severity
  severity: { 
    type: String, 
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
    index: true
  },
  
  // Content
  title: { type: String, required: true },
  description: { type: String },
  details: { type: Schema.Types.Mixed }, // JSON data
  
  // Actor
  actor_id: { type: Schema.Types.ObjectId, refPath: 'actor_type' },
  actor_type: { type: String, enum: ['Admin', 'Broker', 'Customer', 'System'] },
  actor_id_str: { type: String },
  actor_name: { type: String },
  
  // Target
  target_id: { type: Schema.Types.ObjectId },
  target_type: { type: String },
  target_id_str: { type: String },
  
  // Request Info
  ip_address: { type: String },
  user_agent: { type: String },
  endpoint: { type: String },
  method: { type: String },
  
  // Response
  status_code: { type: Number },
  response_time: { type: Number }, // in ms
  
}, { timestamps: true });

SystemLogSchema.index({ createdAt: -1 });
SystemLogSchema.index({ type: 1, severity: 1 });
SystemLogSchema.index({ actor_id_str: 1 });
```

**Used By Pages:** Admin Logs

---

### 19. APIKeyModel (NEW)

**File:** `Model/System/APIKeyModel.js`
**Purpose:** API keys for external integrations

```javascript
const APIKeySchema = new Schema({
  // Key Details
  name: { type: String, required: true },
  key: { type: String, required: true, unique: true }, // Hashed
  key_prefix: { type: String, required: true }, // First 8 chars for display
  key_hint: { type: String }, // Last 4 chars
  
  // Scopes/Permissions
  scopes: [{
    type: String,
    enum: ['read', 'write', 'trades', 'admin', 'webhooks']
  }],
  
  // Status
  is_active: { type: Boolean, default: true },
  
  // Usage
  last_used_at: { type: Date },
  usage_count: { type: Number, default: 0 },
  
  // Limits
  rate_limit: { type: Number, default: 100 }, // requests per minute
  daily_limit: { type: Number, default: 10000 },
  
  // Expiration
  expires_at: { type: Date },
  
  // Audit
  created_by: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  revoked_by: { type: Schema.Types.ObjectId, ref: 'Admin' },
  revoked_at: { type: Date },
  
}, { timestamps: true });

APIKeySchema.index({ key: 1 });
APIKeySchema.index({ is_active: 1 });
```

**Used By Pages:** Admin ApiKeys

---

### 20. NotificationModel (NEW)

**File:** `Model/System/NotificationModel.js`
**Purpose:** In-app notifications

```javascript
const NotificationSchema = new Schema({
  // Recipient
  user_id: { type: Schema.Types.ObjectId, required: true, refPath: 'user_type' },
  user_id_str: { type: String, required: true, index: true },
  user_type: { type: String, enum: ['Admin', 'Broker', 'Customer'], required: true },
  
  // Content
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['order', 'fund', 'kyc', 'alert', 'system', 'promo'],
    required: true
  },
  
  // Action
  action_url: { type: String },
  action_data: { type: Schema.Types.Mixed },
  
  // Status
  is_read: { type: Boolean, default: false },
  read_at: { type: Date },
  
  // Priority
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  
  // Expiry
  expires_at: { type: Date },
  
}, { timestamps: true });

NotificationSchema.index({ user_id_str: 1, is_read: 1, createdAt: -1 });
NotificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
```

**Used By Pages:** All pages (notification bell)

---

### 21. MarketIndexModel (NEW)

**File:** `Model/System/MarketIndexModel.js`
**Purpose:** Cache market indices data

```javascript
const MarketIndexSchema = new Schema({
  // Index Info
  symbol: { type: String, required: true, unique: true }, // NIFTY 50, SENSEX
  name: { type: String, required: true },
  exchange: { type: String, required: true },
  
  // Prices
  last_price: { type: Number, default: 0 },
  open: { type: Number, default: 0 },
  high: { type: Number, default: 0 },
  low: { type: Number, default: 0 },
  close: { type: Number, default: 0 },
  
  // Change
  change: { type: Number, default: 0 },
  change_percent: { type: Number, default: 0 },
  
  // Volume
  volume: { type: Number, default: 0 },
  
  // Timestamps
  last_updated: { type: Date, default: Date.now },
  
}, { timestamps: true });
```

**Used By Pages:** Customer Watchlist, Broker Dashboard

---

### 22. DeletedRecordModel (NEW - Archive)

**File:** `Model/System/DeletedRecordModel.js`
**Purpose:** Archive for soft-deleted records

```javascript
const DeletedRecordSchema = new Schema({
  // Original Record
  original_collection: { type: String, required: true },
  original_id: { type: Schema.Types.ObjectId, required: true },
  original_data: { type: Schema.Types.Mixed, required: true },
  
  // Deletion Info
  deleted_by: { type: Schema.Types.ObjectId, refPath: 'deleted_by_type' },
  deleted_by_type: { type: String, enum: ['Admin', 'Broker', 'System'] },
  deletion_reason: { type: String },
  
  // Retention
  can_restore: { type: Boolean, default: true },
  restore_until: { type: Date }, // After this, permanent delete
  
}, { timestamps: true });

DeletedRecordSchema.index({ original_collection: 1, original_id: 1 });
DeletedRecordSchema.index({ createdAt: -1 });
```

**Used By:** Backend - archiving deleted customers, brokers, etc.

---

## Model Relationships

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ADMIN                                          │
│  ┌─────────┐                                                             │
│  │  Admin  │──────────────────┐                                          │
│  └─────────┘                  │                                          │
│       │                       ▼                                          │
│       │              ┌─────────────────┐                                 │
│       │              │    APIKey       │                                 │
│       │              └─────────────────┘                                 │
│       │              ┌─────────────────┐                                 │
│       └──────────────│   SystemLog    │                                  │
│                      └─────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           BROKER                                         │
│  ┌─────────┐                                                             │
│  │ Broker  │──────────────────────────────────────┐                      │
│  └─────────┘                                      │                      │
│       │                                           │                      │
│       │ 1:N                                       │                      │
│       ▼                                           ▼                      │
│  ┌──────────┐      ┌────────────┐     ┌────────────────────┐            │
│  │ Customer │◄────►│   Fund     │     │ WithdrawalRequest  │            │
│  └──────────┘      └────────────┘     └────────────────────┘            │
│       │                  │                                               │
│       │ 1:N              │ 1:N                                          │
│       ▼                  ▼                                               │
│  ┌──────────┐      ┌────────────────┐                                   │
│  │  Order   │      │ FundTransaction│                                   │
│  └──────────┘      └────────────────┘                                   │
│       │                                                                  │
│       │ 1:N                                                              │
│       ▼                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐             │
│  │ Holding  │  │ Position │  │ Watchlist │  │ BankAccount │             │
│  └──────────┘  └──────────┘  └───────────┘  └─────────────┘             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        KYC FLOW                                          │
│                                                                          │
│  Customer ────► KYCRequest ────► Broker/Admin (Review)                  │
│                     │                                                    │
│                     ▼                                                    │
│               [Documents on Cloudinary]                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    SHARED MODELS                                         │
│                                                                          │
│  ┌────────────────┐  ┌─────────────┐  ┌──────────────────┐              │
│  │   Instrument   │  │   Session   │  │   Notification   │              │
│  │   (Market)     │  │   (Auth)    │  │   (All Users)    │              │
│  └────────────────┘  └─────────────┘  └──────────────────┘              │
│                                                                          │
│  ┌────────────────┐  ┌─────────────┐                                    │
│  │  MarketIndex   │  │DeletedRecord│                                    │
│  │   (Cache)      │  │  (Archive)  │                                    │
│  └────────────────┘  └─────────────┘                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

### Models Count

| Category | Models | Status |
|----------|--------|--------|
| **Keep (Credentials)** | 2 | KiteCredential, Instrument |
| **User & Auth** | 5 | Admin, Broker, Customer, BankAccount, Session |
| **Trading** | 4 | Order, Holding, Position, Watchlist |
| **Fund Management** | 4 | Fund, FundTransaction, WithdrawalRequest, PaymentProof |
| **KYC & Compliance** | 1 | KYCRequest |
| **System & Config** | 5 | SystemLog, APIKey, Notification, MarketIndex, DeletedRecord |
| **Total** | **21** | |

### Models by Priority

| Priority | Models |
|----------|--------|
| **P0 (MVP)** | Admin, Broker, Customer, Session, Order, Holding, Position, Fund, FundTransaction, KYCRequest |
| **P1 (Core)** | BankAccount, Watchlist, WithdrawalRequest, PaymentProof, Notification |
| **P2 (Extended)** | SystemLog, APIKey, MarketIndex, DeletedRecord |

### Index Strategy

All models include indexes for:
- Primary keys and foreign keys
- Common query patterns (status, dates)
- Text search fields where needed
- TTL indexes for session/notification expiry

---

*Document generated: January 30, 2026*
*Version: 1.0*
