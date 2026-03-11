# React Doctor Report

Date: 2026-02-23
Scope: Customer critical pages with live trading impact (`Watchlist`, `Orders`, `Portfolio`, `Funds`, `Option Chain`) plus shared market-data modules (`SocketContext`, `useMarketTicks`, `useOptionChain`).

## Checkup Log

- [x] Context loaded for customer routes/layouts (`src/App.jsx`, `src/layouts/CustomerLayout.jsx`)
- [x] Shared socket/market tick flow reviewed (`src/context/SocketContext.jsx`, `src/hooks/useMarketTicks.js`)
- [x] Watchlist reviewed (post-fix validation pass)
- [x] Orders reviewed
- [x] Portfolio reviewed
- [x] Funds reviewed
- [x] Option Chain + option hook reviewed
- [x] `react-doctor` CLI attempted
- [ ] Prioritized implementation plan execution

## Architecture Context (Customer)

- Customer primary routes under layout: `/watchlist`, `/orders`, `/portfolio`, `/funds`, `/profile` (`src/App.jsx:143`)
- `CustomerLayout` wraps pages with `BottomNavigation` and shared shell (`src/layouts/CustomerLayout.jsx:7`)
- WebSocket market stream is global via `MarketDataProvider -> useMarketTicks` (`src/context/SocketContext.jsx:25`)

## Tooling Note

- `react-doctor` command attempted with skill-recommended command:
  - `npx -y react-doctor@latest . --verbose --diff`
- Current environment cannot reach npm registry (`EAI_AGAIN` for `registry.npmjs.org`), so no automated doctor score was produced in this run.

## Findings

### P0 (highest impact)

1. Portfolio summary is stale vs live ticks
- Evidence: `summary` uses only stored `allHoldings/allPositions` pnl values and does not depend on `livePrices` (`src/modules/customer/Portfolio.jsx:558`, `src/modules/customer/Portfolio.jsx:575`)
- Impact: Net P&L card can diverge from row-level live P&L during fast market moves, which is a trading-decision risk.
- Fix direction: derive summary from `displayRows` (live-resolved values) or maintain incremental live aggregate keyed by token.

2. Option chain updates process full chain token set every loop
- Evidence: `useOptionChain` iterates whole `tokenMapRef` every frame-loop cycle and clones chain rows on updates (`src/hooks/useOptionChain.js:182`, `src/hooks/useOptionChain.js:212`, `src/hooks/useOptionChain.js:222`)
- Impact: with large option universes, CPU pressure rises and UI responsiveness can degrade under high tick rates.
- Fix direction: update only visible strike window tokens, or keep static chain metadata + separate `liveByToken` map and render from that.

### P1 (high impact)

1. Orders filter triggers network refetch but filter is not applied locally
- Evidence: `fetchOrders` runs on `selectedFilter` changes (`src/modules/customer/Orders.jsx:157`), but list render only filters by `searchTerm` (`src/modules/customer/Orders.jsx:357`)
- Impact: unnecessary API load, loading flicker, and user-visible mismatch (filter UI appears active but does not actually filter by date).
- Fix direction: remove `selectedFilter` from fetch effect; implement in-memory date filter logic on mapped orders.

2. OptionChain can hide chain when spot is unavailable/zero
- Evidence: filtered rows return empty when `!currentPrice` (`src/modules/customer/OptionChain.jsx:204`), while chain may still be present.
- Impact: blank chain in temporary spot-tick gaps even when option chain data exists.
- Fix direction: fallback to center-window by middle index or first strike when spot price is unavailable.

3. OptionChain add-to-watchlist status timers are unmanaged
- Evidence: `setTimeout` used without cleanup (`src/modules/customer/OptionChain.jsx:324`, `src/modules/customer/OptionChain.jsx:327`)
- Impact: possible state updates after unmount and timer leaks on rapid navigation.
- Fix direction: store timer ids in refs and clear in cleanup.

4. Option underlying resolve request has race/no cancellation guard
- Evidence: async lookup in effect writes state without mounted/request guard (`src/modules/customer/OptionChain.jsx:93`, `src/modules/customer/OptionChain.jsx:110`)
- Impact: stale response can win during fast instrument switches.
- Fix direction: request id ref or abort/cancel flag in effect cleanup.

### P2 (medium impact)

1. Funds page has no focus/revisit refresh behavior
- Evidence: single fetch on mount only (`src/modules/customer/Funds.jsx:112`)
- Impact: balances/history can remain stale after external actions until remount/manual revisit.
- Fix direction: add lightweight refresh on window focus or route re-entry; optionally add explicit pull-to-refresh.

2. Orders/Portfolio live loops still run RAF heartbeat continuously
- Evidence: perpetual `requestAnimationFrame` loops (`src/modules/customer/Orders.jsx:222`, `src/modules/customer/Portfolio.jsx:487`)
- Impact: baseline background compute overhead even with minimal updates.
- Fix direction: gate loops by visibility and active token presence; consider adaptive cadence.

## Watchlist Status (already improved)

Previously identified watchlist-level issues have been addressed in code (delta subscriptions, ref-based map comparisons, reduced full refreshes, instrument resolve dedupe, etc.) in:
- `src/modules/customer/Watchlist.jsx`
- `src/hooks/useMarketTicks.js`

Remaining recommendation: keep stress-testing with high tick bursts (NFO option-heavy lists) to validate no regressions in subscription churn.

## Execution Plan (trade safety first)

### Phase 1: Correctness hardening (P0)
1. Make Portfolio summary fully live-consistent with row P&L.
2. Rework OptionChain live update model to avoid full-chain hot-path scans.

### Phase 2: High-impact reliability/UX (P1)
1. Fix Orders filter contract (real filtering + no refetch-on-filter-toggle).
2. Add OptionChain guards:
   - no-spot fallback rendering
   - timeout cleanup
   - stale async response protection.

### Phase 3: Efficiency polishing (P2)
1. Add Funds refresh-on-focus strategy.
2. Add visibility-aware throttling for Orders/Portfolio RAF loops.

## Verification Checklist (for implementation phase)

- [ ] `eslint` passes for touched files
  - Current baseline errors:
    - `src/hooks/useOptionChain.js:148` (`err` unused)
    - `src/modules/customer/Funds.jsx:27` (`error` state currently unused)
    - `src/modules/customer/OptionChain.jsx:85` and `src/modules/customer/OptionChain.jsx:148` (`react-hooks/set-state-in-effect`)
- [x] `npm run build` passes
- [ ] Manual test: rapid tab switches and route changes do not create stale updates
- [ ] Manual test: high-frequency websocket feed keeps UI responsive on low-end device profile
- [ ] Manual test: Portfolio header P&L matches summed visible live positions/holdings
