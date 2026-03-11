# k6 Load Testing (Render Capacity)

## Script

- `render_capacity_mixed.js`
  - API page-mix load (watchlist/orders/portfolio style reads)
  - Market Socket.IO session load
  - Supports setup login via customer credentials

## Install k6

- macOS: `brew install k6`
- Ubuntu/Debian: see https://k6.io/docs/get-started/installation/

## Quick Start

Run both API + socket scenarios:

```bash
k6 run Frontend/tests/k6/render_capacity_mixed.js \
  -e BASE_API_URL=https://api.your-domain.com/api \
  -e LOGIN_ID=YOUR_CUSTOMER_ID_OR_EMAIL \
  -e LOGIN_PASSWORD=YOUR_PASSWORD \
  -e DURATION=5m \
  -e API_RATE=25 \
  -e SOCKET_VUS=100
```

Run API only:

```bash
k6 run Frontend/tests/k6/render_capacity_mixed.js \
  -e ENABLE_WS=false \
  -e BASE_API_URL=https://api.your-domain.com/api \
  -e LOGIN_ID=YOUR_CUSTOMER_ID_OR_EMAIL \
  -e LOGIN_PASSWORD=YOUR_PASSWORD \
  -e DURATION=5m \
  -e API_RATE=40
```

Run socket only:

```bash
k6 run Frontend/tests/k6/render_capacity_mixed.js \
  -e ENABLE_API=false \
  -e BASE_API_URL=https://api.your-domain.com/api \
  -e LOGIN_ID=YOUR_CUSTOMER_ID_OR_EMAIL \
  -e LOGIN_PASSWORD=YOUR_PASSWORD \
  -e DURATION=5m \
  -e SOCKET_VUS=200 \
  -e SESSION_SECONDS=45 \
  -e TOKENS=256265,260105,265
```

Use existing token instead of login:

```bash
k6 run Frontend/tests/k6/render_capacity_mixed.js \
  -e BASE_API_URL=https://api.your-domain.com/api \
  -e AUTH_TOKEN=YOUR_BEARER_TOKEN \
  -e DURATION=5m
```

## Step-Up Method (Find Capacity)

1. Start low and stable:
   - `API_RATE=20`, `SOCKET_VUS=50`, `DURATION=5m`
2. Increase 25-40% each run:
   - 20 -> 30 -> 45 -> 65 -> 90 ...
3. Stop when either:
   - p95 latency degrades sharply, or
   - failure rate rises above threshold.
4. Keep 20-30% safety margin below that point.

## Useful Env Vars

- `BASE_API_URL` default: `http://localhost:8080/api`
- `LOGIN_ID` / `LOGIN_PASSWORD` for setup login
- `AUTH_TOKEN` (if already available)
- `ENABLE_API` default: `true`
- `ENABLE_WS` default: `true`
- `API_RATE` default: `25` (iterations/sec)
- `API_PREALLOCATED_VUS` default: `50`
- `API_MAX_VUS` default: `400`
- `SOCKET_VUS` default: `100`
- `SESSION_SECONDS` default: `30`
- `DURATION` default: `5m`
- `SOCKET_MODE` default: `quote`
- `TOKENS` default: `256265,260105,265`
