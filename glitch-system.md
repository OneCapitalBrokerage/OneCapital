# Glitch System Plan

## Goal

Design a per-client glitch system that can intentionally make orders, P&L, and settlement views behave badly for testing or product steering, while still being:

1. reversible
2. isolated to selected accounts
3. safe to disable without manual data repair(not important)
4. no need to be compatible with the existing order and settlement pipeline

This document is planning only. No implementation is included here.

---

## Non-Negotiable Guardrails

If this system exists, it should follow these rules:

2. it must be gated by an explicit per-client flag
3. disabling it must restore normal behavior without database surgery
4. all glitch actions must be auditable
6. both modern and legacy order paths must be covered, because the app still uses both

The clean implementation is a fault-injection and overlay layer, not direct corruption of `OrdersModel` and `FundModel`.

---

## Current Context

### 1. There is already a per-client toggle pattern

The broker client detail page already uses the same pattern for:

- trading enablement
- holdings exit
- settlement participation

Current flow:

1. toggle in `Frontend/src/modules/broker/ClientDetail.jsx`
2. API call in `Frontend/src/api/broker.js`
3. broker route in `Backend/Routes/broker/clientRoutes.js`
4. persistence in `Backend/Controllers/broker/ClientController.js`
5. customer flag stored in `Backend/Model/Auth/CustomerModel.js`

This is the exact pattern a glitch toggle should follow.


### 2. Order creation and lifecycle are split across old and new paths

The app currently uses:

- `POST /api/customer/postOrder` for customer placement from the order sheet
- `POST /orders/updateOrder` for legacy lifecycle updates
- newer customer order routes in parallel

Important files:

- `Backend/Controllers/legacy/orderController.js`
- `Backend/Controllers/customer/TradingController.js`
- `Backend/Routes/orderRoute.js`
- `Backend/Routes/customer/orderRoutes.js`

This matters because a glitch system that only hooks one path will be incomplete.

### 3. Closed-order settlement already converges correctly

Order closes eventually hit `Backend/services/closeOrderAndSettle.js`.

That service already:

1. computes exit pricing
2. computes gross and net P&L (malfunction this)
3. writes `realized_pnl` to the order
4. updates `fund.pnl_balance`
5. appends a ledger row into `fund.transactions`

This is the canonical settlement path and should stay canonical.

### 5. Customer portfolio and order views are mostly reconstructed from orders

Customer-facing screens currently derive a lot of state from:

- `GET /customer/orders`
- `GET /customer/order-book`
- `GET /customer/portfolio/holdings`
- `GET /customer/funds`
- live socket ticks from `/market`

Important nuance:

1. the main customer pages already synthesize positions from orders
2. `HoldingModel` and `PositionsModel` are not clearly the primary source of truth
3. there is no clear live mark-to-market write path into those models

That makes a response overlay approach more practical than trying to corrupt and later repair multiple backend projections.

### 6. The order book already supports synthetic rows

`OrderBookController.js` already injects `OrderAttemptModel` failures as synthetic rejected rows.

That means the codebase already has one pattern for showing customer-visible "bad order" behavior without it necessarily being a real economic order.

This is useful for a glitch system.

---

## Core Design Decision

### Recommended approach

Build the glitch system as a overlay and fault-injection layer.

That means:


1. customer-facing APIs merge the glitch overlay into normal responses
2. disabling glitch simply stops applying that overlay
1. directly overwriting `order.realized_pnl`
2. directly overwriting `fund.pnl_balance`
3. directly inserting fake irreversible settlement rows into `fund.transactions`
4. mutating real account balances 
If you want the account to "look broken" but recover cleanly, the system should distort what the customer sees and how some requests resolve, not poison the base state.


## What is implemented
Backend (5 files changed, 1 new file)
Backend/Model/Auth/CustomerModel.js
Added 4 fields: glitch_enabled (Boolean, default false), glitch_enabled_by (Broker ref), glitch_enabled_at (Date), glitch_disabled_at (Date).

Backend/Controllers/broker/ClientController.js

Added toggleGlitch handler — validates enabled: boolean, writes all 4 audit fields, returns { glitchEnabled }.
Updated getClientById to include glitchEnabled: customer.glitch_enabled === true in the response.
Exported toggleGlitch.
Backend/Routes/broker/clientRoutes.js
Added router.put('/clients/:id/glitch', toggleGlitch) — same pattern as settlement/trading/holdings routes.

Backend/services/glitchOverlay.js (new)
Pure overlay module with 5 malfunction transforms:

Type	What the customer sees
Active orders	Frozen in PENDING_APPROVAL — can't exit or modify
Closed P&L	All profitable realized P&L shown as losses
Holdings	All quantities zeroed (positions appear exited)
Fund balance	Margins at 10%, withdrawable at 0, P&L negated
Settlement status	settled → unsettled, latestSettlementAt → null
Overlay fires only when req.user.glitch_enabled === true and req.user.isImpersonation !== true — the broker viewing via impersonation always sees real data.

Overlay hooked into 4 controllers (8 endpoints total):

TradingController.js → getOrders, getHoldings, getPositions
OrderBookController.js → getOrderBook
FundController.js → getBalance
OrderHistoryController.js → getOrderHistory, getTodayOrders, getTradeBook, getPnlReport
Frontend (2 files changed)
Frontend/src/api/broker.js
Added toggleGlitch(clientId, enabled) → PUT /broker/clients/:id/glitch.

Frontend/src/modules/broker/ClientDetail.jsx

Added handleToggleGlitch handler (same pattern as handleToggleSettlement).
Added Glitch Mode toggle row immediately after the Settlement toggle — same bg-red-600 / bg-gray-300 CSS pattern, bug_report icon, label text shows "Active — client views are distorted" / "Inactive — client sees normal data". Disabled when account is blocked or admin-blocked.