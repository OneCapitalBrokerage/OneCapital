# Wolf — Profile, Registration & KYC Planning Document

**Created:** 2026-02-23
**Scope:** Profile page cleanup, registration form redesign, broker reference code system, KYC-based trading auth guard, and all related routes/modules.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Task A — Remove Stats Card from Profile](#2-task-a--remove-stats-card-from-profile)
3. [Task B — Trading Auth Guard (KYC-Gated Access)](#3-task-b--trading-auth-guard-kyc-gated-access)
4. [Task C — Registration Form Redesign (Demat Account Opening)](#4-task-c--registration-form-redesign-demat-account-opening)
5. [Task D — Broker Reference Code System](#5-task-d--broker-reference-code-system)
6. [Task E — Post-Registration Flow & Status Page](#6-task-e--post-registration-flow--status-page)
7. [Task F — Profile Page Final Structure](#7-task-f--profile-page-final-structure)
8. [Backend Changes Required](#8-backend-changes-required)
9. [New Routes Needed](#9-new-routes-needed)
10. [Execution Phases](#10-execution-phases)

---

## 1. Current State Assessment

### Profile Page — What Exists

File: `src/modules/customer/Profile.jsx`

| Section | Status | Notes |
|---|---|---|
| User Card (name, email, clientId) | ✅ Keep | Core identity card |
| **Stats Card** (Invested / Current / P&L) | ❌ Remove | Not relevant on Profile |
| KYC Verification widget | ✅ Keep | Links to `/kyc-documents` |
| Bank Accounts list | ✅ Keep | Links to `/profile/bank-account/add` |
| Menu Items (Order Book, Payments, Settings…) | ✅ Keep | Navigation hub |

The `stats` state, `getAccountSummary()` API call, and `formatCurrency()` utility can all be removed alongside the card.

### Registration Form — Current State

File: `src/modules/auth/Signup.jsx`

Currently collects **5 fields only:**
- Full Name (as per PAN)
- Mobile Number / Email (combined field)
- Preferred User ID
- Password + Confirm Password
- Terms checkbox

**What is missing for a demat account application:**
- Date of birth
- Gender
- PAN number
- Aadhaar number
- Residential address (street, city, state, pincode)
- Occupation
- Nominee details (name, relationship, DOB)
- Segments interested in (Equity, F&O etc.)
- Broker reference code (the key new addition)
- Document uploads (PAN, Aadhaar, photo, signature, bank proof)

### Backend Registration Model — Current State

File: `Backend/Model/RegistrationModel.js` (active model used by RegistrationController)

Has fields: `name`, `email`, `phone`, `userId`, `password`, `documents`, `brokerId`, `status`, basic address.
**Missing:** DOB, gender, PAN number, Aadhaar number, occupation, nominee, segments, broker reference code lookup.

### KYC / Trading Guard — Current State

- `Customer` model has `trading_enabled: Boolean` (default: `false`) and `kyc_status` enum.
- `RequireCustomerAuth` in `App.jsx` only checks `isAuthenticated` — **no check for `trading_enabled` or `kyc_status`**.
- Trading routes (Watchlist, Orders, Portfolio, Funds) are accessible immediately after login regardless of KYC state.
- **There is no trading gate anywhere in the frontend.**

### Broker Reference Code — Current State

- `Broker` model has `broker_id` (10-digit system ID) but **no human-readable reference code field**.
- `RegistrationModel` has `brokerId` (ObjectId) but the registration form doesn't ask for any broker identifier.
- Currently, when the admin approves a registration they manually supply `brokerId` in the API call. There is no automated broker-to-registration routing.

---

## 2. Task A — Remove Stats Card from Profile

### What to remove in `Profile.jsx`

1. **State:** Remove `stats` useState and `setStats` logic.
2. **API call:** Remove `customerApi.getAccountSummary()` from the `Promise.all` in `fetchProfile`.
3. **JSX:** Remove the entire `{/* Stats Card */}` block (lines ~150–180).
4. **Helper:** Remove `formatCurrency` helper if not used anywhere else on the page.

### Result

Profile page becomes: User Card → KYC Verification → Bank Accounts → Menu Items.
Cleaner and focused on identity/account management, not trading performance.

---

## 3. Task B — Trading Auth Guard (KYC-Gated Access)

### The Problem

A newly registered customer can log in and immediately access Watchlist, Orders, Portfolio, and Funds — all trading features — before their KYC has been approved. This is incorrect from a compliance perspective. Trading must be gated behind:

1. `kyc_status === 'verified'` on the Customer record, AND
2. `trading_enabled === true` (set by broker/admin after KYC approval)

### Design

#### Backend — Customer Profile API must return trading status

`GET /customer/profile` (or `GET /customer/auth/me`) must include:
```json
{
  "trading_enabled": false,
  "kyc_status": "pending",
  "status": "pending_kyc"
}
```

These fields should already be present in `CustomerModel`. Verify the profile controller returns them.

#### Frontend — AuthContext must store trading status

`AuthContext` state needs to expose:
- `user.trading_enabled` (boolean)
- `user.kyc_status` (string)
- `user.status` (string)

These come from the login/profile response and are already available if the profile API returns them.

#### Frontend — New `RequireTradingEnabled` guard component

Create a route wrapper in `App.jsx`:

```jsx
const RequireTradingEnabled = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.trading_enabled) return <Navigate to="/kyc-pending" replace />;
  return children;
};
```

#### Frontend — New `/kyc-pending` page

A dedicated page shown when a user is authenticated but trading is not yet enabled.

**Displays:**
- Friendly message: "Your account is being verified"
- Current KYC status with step progress
- What's pending (Aadhaar / PAN / Bank Proof — each with status badge)
- CTA: "Complete KYC" button → navigates to `/kyc-documents`
- If KYC is submitted: "Under Review" state with estimated timeline
- If KYC is rejected: Rejection reason + "Resubmit" CTA

**Route:** `/kyc-pending` — accessible without `RequireTradingEnabled` guard.

#### Apply guard to trading routes in `App.jsx`

Wrap all trading routes with `RequireTradingEnabled`:

```jsx
// Trading routes (require KYC approval)
<Route element={<RequireCustomerAuth><RequireTradingEnabled><CustomerLayout /></RequireTradingEnabled></RequireCustomerAuth>}>
  <Route path="/watchlist" element={<Watchlist />} />
  <Route path="/orders" element={<Orders />} />
  <Route path="/portfolio" element={<Portfolio />} />
  <Route path="/funds" element={<Funds />} />
</Route>

// Profile route (always accessible after login - to complete KYC)
<Route element={<RequireCustomerAuth><CustomerLayout /></RequireCustomerAuth>}>
  <Route path="/profile" element={<Profile />} />
</Route>
```

**Note:** Profile, KYC Documents, Bank Account pages must remain accessible without trading guard so users can complete KYC.

#### Login redirect logic

After login, check `trading_enabled`:
- If `true` → navigate to `/watchlist` (current behavior)
- If `false` → navigate to `/kyc-pending`

Update `AuthContext` login handler or the `LandingRoute` component.

---

## 4. Task C — Registration Form Redesign (Demat Account Opening)

### Overview

The current signup form is minimal (5 fields). For a proper demat account application — as required by SEBI/CDSL/NSDL and broker compliance — we need a **multi-step form** collecting all necessary personal, contact, document, and preference data.

The registration is **not a trading account creation** — it is an **application** that goes to a broker's panel for review and approval. Only after approval does the customer account get created with login access.

### Multi-Step Registration Flow

```
Step 1: Broker Code         → enter broker reference code (validates broker)
Step 2: Personal Info       → name, DOB, gender, PAN, Aadhaar, occupation
Step 3: Contact & Address   → mobile, email, address (street, city, state, PIN)
Step 4: Account Security    → userId, password, confirm password
Step 5: Nominee Details     → nominee name, relationship, DOB (optional but recommended)
Step 6: Segments            → which markets to trade (Equity, F&O, Commodity, Currency)
Step 7: Document Upload     → PAN card, Aadhaar front/back, passport photo, signature
Step 8: Review & Submit     → summary of all info, terms agreement, submit
```

### Step-by-Step Field Specification

#### Step 1 — Broker Reference Code
```
Fields:
  broker_code         String     required    "Enter your broker's reference code"
                                             Validated live against API
                                             Shows broker name after validation (trust signal)

UI hint: "Get this code from your broker/advisor"
```

#### Step 2 — Personal Information
```
Fields:
  full_name           String     required    "Full name as per PAN card"
  date_of_birth       Date       required    Date picker, must be 18+ years
  gender              Enum       required    Male / Female / Other
  pan_number          String     required    Format: ABCDE1234F (10 chars, validated)
  aadhaar_number      String     required    12 digits (masked input, stored encrypted)
  occupation          Enum       required    Salaried / Business / Professional / Student / Retired / Others
  annual_income       Enum       optional    <1L / 1-5L / 5-10L / 10-25L / >25L (for F&O eligibility)
```

#### Step 3 — Contact & Address
```
Fields:
  mobile_number       String     required    10 digits, +91 prefix, OTP verification
  whatsapp_number     String     optional    "Same as mobile" toggle
  email               String     required    Email format, verification link sent
  address_street      String     required
  address_city        String     required
  address_state       String     required    Dropdown (Indian states)
  address_pincode     String     required    6 digits
```

#### Step 4 — Account Security
```
Fields:
  user_id             String     required    Alphanumeric, check availability API call
  password            String     required    Min 8 chars, strength indicator
  confirm_password    String     required    Must match

Note: user_id becomes the customer's login ID after account creation
```

#### Step 5 — Nominee (Optional Step)
```
Fields:
  nominee_name        String     optional    Full name
  nominee_relation    Enum       optional    Father / Mother / Spouse / Son / Daughter / Brother / Sister / Other
  nominee_dob         Date       optional    If minor, guardian details required
  nominee_guardian    String     optional    Required if nominee age < 18

UI: Can be skipped with "Add Later" — but SEBI recommends nominees
```

#### Step 6 — Trading Segments
```
Fields:
  segments            Array      optional    Checkboxes: Equity / F&O / Commodity / Currency
                                             Default: Equity selected
  Note: F&O requires income proof (annual_income >= 5L or income document)
```

#### Step 7 — Document Upload
```
Documents (all uploaded to Cloudinary via signed URL):
  pan_card_front      Image      required    Clear photo of PAN card
  aadhaar_front       Image      required    Aadhaar card front
  aadhaar_back        Image      required    Aadhaar card back
  passport_photo      Image      required    White background, recent
  signature           Image      required    Signature on white paper, scanned/photographed
  bank_proof          Image      required    Cancelled cheque / first page of passbook
  income_proof        Image      optional    Required if F&O selected (IT return / salary slip)
```

#### Step 8 — Review & Submit
```
Displays summary of all entered info (read-only).
User can go back to any step to edit.

Checkboxes:
  ☐ I confirm that all information is correct and matches my KYC documents
  ☐ I agree to the Terms of Service, Privacy Policy, and Risk Disclosure Document
  ☐ I consent to processing of my personal data for account opening purposes
  ☐ I understand the risks associated with derivatives trading (if F&O selected)

Submit button: "Submit Application"
```

### UI Component Architecture

```
src/modules/auth/Signup.jsx          → Main orchestrator component
src/modules/auth/signup/
  StepProgress.jsx                   → Step indicator at the top
  Step1BrokerCode.jsx                → Broker code entry + validation
  Step2PersonalInfo.jsx              → Personal details form
  Step3ContactAddress.jsx            → Contact + address form
  Step4Security.jsx                  → UserID + password
  Step5Nominee.jsx                   → Nominee details
  Step6Segments.jsx                  → Trading preferences
  Step7Documents.jsx                 → Document upload UI
  Step8Review.jsx                    → Final review + submit
```

### State Management

Use a single `formData` object in the parent `Signup.jsx`, passed down to each step. Each step receives a `onUpdate(fields)` callback to update the parent state. Steps validate independently before allowing `Next`.

```js
const [formData, setFormData] = useState({
  // Step 1
  broker_code: '', broker_id: null, broker_name: '',
  // Step 2
  full_name: '', date_of_birth: '', gender: '',
  pan_number: '', aadhaar_number: '', occupation: '', annual_income: '',
  // Step 3
  mobile_number: '', whatsapp_number: '', email: '',
  address: { street: '', city: '', state: '', pincode: '' },
  // Step 4
  user_id: '', password: '', confirm_password: '',
  // Step 5
  nominee_name: '', nominee_relation: '', nominee_dob: '', nominee_guardian: '',
  // Step 6
  segments: ['EQUITY'],
  // Step 7
  documents: {
    pan_card_front: null, aadhaar_front: null, aadhaar_back: null,
    passport_photo: null, signature: null, bank_proof: null, income_proof: null,
  },
  // Meta
  terms_agreed: false, data_consent: false,
});
```

### API Flow

```
Step 1:
  GET /api/broker/verify-code?code=WOLF01
  → { valid: true, broker_name: "Arjun Securities" }

Step 3 (OTP, future feature):
  POST /api/customer/register/request-otp
  → Sends OTP to mobile/email

Step 4 (User ID check):
  GET /api/customer/register/check-userid?userId=RAHUL123
  → { available: true/false }

Step 7 (Document upload):
  GET /api/customer/register/upload-signature
  → Cloudinary signed URL params (timestamp, signature, folder)
  Upload directly to Cloudinary → get URL back
  Store URL in formData.documents

Final Submit (Step 8):
  POST /api/customer/register
  Body: all formData fields
  → { success: true, registrationId: "...", message: "Application submitted" }
  → Navigate to /registration-status/:registrationId
```

---

## 5. Task D — Broker Reference Code System

### The Problem

Registrations need to go to the correct broker's panel — but we can't expose a dropdown of all broker names/IDs to the public signup form. We need a compact, non-guessable identifier that a broker can share with prospective customers.

### Design: Broker Reference Code

Each `Broker` gets a unique, human-readable **reference code** (also called `invite_code` or `referral_code`):

**Format:** `[A-Z0-9]{6,8}` — e.g., `WOLF01`, `ARJUN2024`, `MKT0042`

**Properties:**
- Auto-generated on broker creation (or set by broker in their settings)
- Unique across all brokers
- Case-insensitive (normalize to uppercase)
- Short enough to share via WhatsApp, visiting card, etc.
- Does NOT reveal broker email, phone, or business details

### Backend Changes

#### 1. Add `reference_code` to BrokerModel

```js
// BrokerModel.js — add field
reference_code: {
  type: String,
  unique: true,
  uppercase: true,
  trim: true,
  index: true,
},
```

Auto-generate on broker creation: e.g., `WOLF` + last 4 digits of `broker_id`, or random alphanumeric.

#### 2. New public API endpoint: Verify Broker Code

```
GET /api/broker/verify-code?code=WOLF01
Access: Public (no auth)

Response (valid):
{
  "valid": true,
  "broker_id": "BRK0000000001",
  "broker_name": "Wolf Securities",
  "city": "Mumbai"           ← limited info, no email/phone
}

Response (invalid):
{
  "valid": false,
  "message": "Invalid broker code"
}
```

#### 3. Registration stores broker reference

`RegistrationModel` already has `brokerId` (ObjectId). The controller resolves `broker_code` → `brokerId` before saving.

```js
// RegistrationController.submitRegistration
const broker = await BrokerModel.findOne({ reference_code: broker_code.toUpperCase() });
if (!broker) {
  return res.status(400).json({ success: false, message: 'Invalid broker code.' });
}
registration.brokerId = broker._id;
registration.broker_id_str = broker.broker_id;
```

#### 4. Broker panel only sees its registrations

`GET /broker/registrations` already filters by `broker_id_str`. With this change, registrations automatically appear in the right broker's panel as soon as they're submitted.

#### 5. Broker panel — Display & Share Code

In the broker settings/dashboard, show their `reference_code` prominently with a "Copy" and "Share" button.

### UX on Registration Form

Step 1 is the broker code entry:
```
┌─────────────────────────────────────────────┐
│  Enter Broker Code                          │
│                                             │
│  ┌──────────────────────────────────┐ [✓]  │
│  │  WOLF01                          │       │
│  └──────────────────────────────────┘       │
│                                             │
│  ✅ Arjun Securities · Mumbai               │
│                                             │
│  "Get this code from your broker or         │
│   financial advisor"                        │
│                                             │
│  [Continue without code] ← small grey link  │
└─────────────────────────────────────────────┘
```

- Live validation on blur (debounced 500ms)
- Shows broker name + city after successful validation (builds trust)
- "Continue without code" option — registration goes to unassigned pool (admin assigns broker later)
- If broker code is invalid → clear error, do not allow proceeding

---

## 6. Task E — Post-Registration Flow & Status Page

### After Submit → Registration Tracking Page

**Route:** `/registration-status/:registrationId`
**File:** `src/modules/auth/RegistrationStatus.jsx` (new)

After submitting the application, user should NOT be redirected to login. They should see a status tracking page.

**States the page shows:**

```
Status: pending
→ "Application Received"
→ "Your Demat account application has been submitted to [Broker Name]"
→ "Application ID: REG-XXXXXXXX" (copyable)
→ "We will notify you via SMS/Email once reviewed"
→ Document checklist (what was uploaded, green ticks)

Status: under_review
→ "Under Review"
→ "Your documents are being verified by our team"
→ Estimated: 1–2 business days

Status: approved
→ "Application Approved! 🎉"
→ "Your account has been created"
→ "Login with your User ID: [userId]"
→ CTA: "Login Now" → /login

Status: rejected
→ "Application Rejected"
→ Reason: [rejection_reason]
→ CTA: "Update & Resubmit" → back to signup form (pre-filled)

Status: resubmit_required
→ "Documents Need Resubmission"
→ "[review_notes]"
→ CTA: "Resubmit Documents"
```

**API:** `GET /api/customer/register/:id/status` — already implemented in backend.

**Persistence:** Store `registrationId` in `localStorage` so user can return to check status without URL.

---

## 7. Task F — Profile Page Final Structure

After cleanup, the Profile page should follow this layout:

```
┌──────────────────────────────────────────┐
│ Profile                          [Edit]  │ ← header
├──────────────────────────────────────────┤
│ 👤 Rahul Sharma                          │
│    rahul@example.com                     │ ← User Card
│    Client ID: RHL0000001                 │
├──────────────────────────────────────────┤
│ KYC Verification          [Pending] →   │
│  🔴 Aadhaar  🔴 PAN  🔴 Bank            │ ← KYC widget (existing)
├──────────────────────────────────────────┤
│ Bank Accounts                   [+ Add] │
│  🏦 HDFC Bank  ****4321  Primary        │ ← Bank accounts (existing)
├──────────────────────────────────────────┤
│ 📖 Order Book                            │
│ 💳 Payments                              │
│ ❓ Help & Support                        │ ← Menu items (existing)
│ ℹ️  About                                │
│ ⚙️  Settings                             │
├──────────────────────────────────────────┤
│ [Logout]                                 │
└──────────────────────────────────────────┘
```

**Remove:** Stats Card (Invested / Current / P&L)
**Remove from `fetchProfile`:** `getAccountSummary()` API call
**Remove:** `stats` state, `setStats`, `formatCurrency` (if only used for stats)

---

## 8. Backend Changes Required

### Summary of Backend Work

| Task | File | Change |
|---|---|---|
| Add `reference_code` to Broker | `BrokerModel.js` | New field, auto-generate on create |
| Broker code verification API | New route + controller | `GET /broker/verify-code` |
| Registration controller update | `RegistrationController.js` | Accept `broker_code`, resolve to `brokerId` |
| Expand RegistrationModel fields | `RegistrationModel.js` | Add DOB, gender, PAN, Aadhaar, occupation, income, nominee, segments |
| KYCRequestModel alignment | `KYCRequestModel.js` | Sync fields with RegistrationModel or merge them |
| Profile API returns trading status | Auth/Profile controller | Ensure `trading_enabled`, `kyc_status`, `status` in response |
| Broker panel — show reference code | BrokerController.js | Return `reference_code` in broker profile API |

### RegistrationModel — Fields to Add

```js
// New fields for RegistrationModel.js
date_of_birth:    { type: Date },
gender:           { type: String, enum: ['male', 'female', 'other'] },
pan_number:       { type: String },
aadhaar_number:   { type: String },  // store encrypted
occupation:       { type: String, enum: ['salaried', 'business', 'professional', 'student', 'retired', 'other'] },
annual_income:    { type: String, enum: ['below_1l', '1l_5l', '5l_10l', '10l_25l', 'above_25l'] },

// Nominee
nominee: {
  name:         { type: String },
  relation:     { type: String },
  date_of_birth: { type: Date },
  guardian:     { type: String },
},

// Segments
segments_requested: [{ type: String, enum: ['EQUITY', 'F&O', 'COMMODITY', 'CURRENCY'] }],

// Documents — expand existing
documents: {
  pan_card_front:  { url, public_id, uploaded_at },
  aadhaar_front:   { url, public_id, uploaded_at },
  aadhaar_back:    { url, public_id, uploaded_at },
  passport_photo:  { url, public_id, uploaded_at },
  signature:       { url, public_id, uploaded_at },
  bank_proof:      { url, public_id, uploaded_at },
  income_proof:    { url, public_id, uploaded_at },  // optional
},

// Consent
terms_agreed:    { type: Boolean, default: false },
data_consent:    { type: Boolean, default: false },
```

### New Broker Controller Endpoint

```
GET  /api/broker/verify-code     → verifyBrokerCode (public)
```

```js
const verifyBrokerCode = asyncHandler(async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ valid: false, message: 'Code is required' });

  const broker = await BrokerModel.findOne(
    { reference_code: code.toUpperCase(), status: 'active' },
    'broker_id name company_name address.city'  // only safe public fields
  );

  if (!broker) return res.json({ valid: false, message: 'Invalid or inactive broker code' });

  return res.json({
    valid: true,
    broker_id: broker.broker_id,
    broker_name: broker.company_name || broker.name,
    city: broker.address?.city || '',
  });
});
```

---

## 9. New Routes Needed

### Frontend Routes

| Route | Component | Auth Guard | Notes |
|---|---|---|---|
| `/signup` | `Signup.jsx` (multi-step) | GuestOnly | Existing route, redesign component |
| `/registration-status/:id` | `RegistrationStatus.jsx` | Public | New page |
| `/kyc-pending` | `KYCPending.jsx` | RequireCustomerAuth | New page, shown when not trading-enabled |

### Backend Routes

| Method | Route | Controller | Auth |
|---|---|---|---|
| `GET` | `/api/broker/verify-code` | BrokerController | Public |
| `GET` | `/api/customer/register/check-userid` | RegistrationController | Public |
| `POST` | `/api/customer/register` | RegistrationController | Public (update to handle all fields) |
| `POST` | `/api/customer/register/:id/documents` | RegistrationController | Public (already exists) |
| `GET` | `/api/customer/register/:id/status` | RegistrationController | Public (already exists) |

---

## 10. Execution Phases

### Phase 1 — Quick Wins (Profile Cleanup + Auth Guard)

1. **Remove Stats Card** from `Profile.jsx`
   - Remove `stats` state, `getAccountSummary` call, stats JSX block, `formatCurrency` if unused.

2. **Add `trading_enabled` check** in `App.jsx`
   - Create `RequireTradingEnabled` guard component
   - Apply to Watchlist, Orders, Portfolio, Funds routes
   - Keep Profile, KYC-Documents, Bank-Account unguarded
   - Update login redirect logic

3. **Create `/kyc-pending` page** (`src/modules/customer/KYCPending.jsx`)
   - Show KYC step progress (Aadhaar / PAN / Bank each with status)
   - CTA buttons based on current state
   - Pull KYC data from `customerApi.getKycDocuments()`

### Phase 2 — Broker Reference Code (Backend + Broker Panel)

1. Add `reference_code` field to `BrokerModel.js` (auto-generate)
2. Create `GET /api/broker/verify-code` route + controller
3. Update `RegistrationController.submitRegistration` to accept and resolve `broker_code`
4. Add `reference_code` display in broker dashboard/settings panel
5. Run migration script to generate codes for existing brokers

### Phase 3 — Registration Form Redesign

1. Expand `RegistrationModel.js` with new fields (DOB, gender, PAN, Aadhaar, occupation, nominee, segments, documents)
2. Update `RegistrationController.submitRegistration` to handle all new fields
3. Add `GET /api/customer/register/check-userid` endpoint
4. Redesign `src/modules/auth/Signup.jsx` as multi-step orchestrator
5. Build individual step components in `src/modules/auth/signup/`
6. Implement document upload flow using existing `getUploadSignature` endpoint

### Phase 4 — Registration Status Tracking

1. Create `src/modules/auth/RegistrationStatus.jsx`
2. Add `/registration-status/:id` route in `App.jsx`
3. Connect to `GET /api/customer/register/:id/status`
4. Store `registrationId` in `localStorage` on submit
5. Add navigation: after successful submit → `/registration-status/:id`

---

## Key Design Decisions

### Why multi-step registration?
A single-page form with 20+ fields causes high drop-off. Multi-step guides users progressively, validates per step, and allows saving progress.

### Why broker code over broker dropdown?
- Security: don't expose all broker names/data publicly
- Privacy: a broker's client base is business-sensitive info
- UX: compact code is easy to share (WhatsApp, visiting card)
- Flexibility: broker can rotate code if misused (future feature)
- Same pattern used by many fintech apps (Zerodha uses referral codes, etc.)

### Why keep KYC documents as a post-login flow?
Registration → Broker reviews → Account created → Customer logs in → Completes KYC (Aadhaar/PAN/Bank documents). This is the actual SEBI-compliant flow. Registration collects the intent + basic info. Post-login KYC is where official document verification happens against the created Customer record.

### Two-model architecture
`RegistrationModel` = pre-login application (no customer account exists yet)
`CustomerKYCModel` = post-login document verification (tied to a Customer record)
These serve different purposes and should remain separate.

### What happens when admin/broker approves registration?
1. `RegistrationModel.status` → `'approved'`
2. Backend creates `Customer` record:
   - Copies fields from registration (name, email, phone, pan, dob, address etc.)
   - Sets `kyc_status: 'pending'` (document verification still needed)
   - Sets `trading_enabled: false`
   - Links `broker_id` from the registration
3. Customer can now **login** but sees `/kyc-pending`
4. Customer uploads post-login KYC documents
5. Broker/admin approves KYC documents → sets `trading_enabled: true`
6. Customer now accesses full trading app

---

## Verification Checklist

- [ ] Stats Card removed from Profile — `getAccountSummary` call gone
- [ ] `RequireTradingEnabled` guard applied to all 4 trading routes
- [ ] `/kyc-pending` page shows real KYC document statuses
- [ ] Broker login → still routes to their dashboard (guard doesn't affect broker)
- [ ] `GET /api/broker/verify-code` returns only safe public fields (no email/phone)
- [ ] Registration form — all 8 steps implemented with per-step validation
- [ ] `broker_code` Step 1 — live validation, shows broker name on success
- [ ] Document upload — uses Cloudinary signed URL, not direct to backend
- [ ] After submit → navigates to `/registration-status/:id`
- [ ] `RegistrationModel` updated with all new fields
- [ ] Existing broker `reference_code` migration script written
- [ ] `eslint` passes on all touched files
- [ ] `npm run build` passes
