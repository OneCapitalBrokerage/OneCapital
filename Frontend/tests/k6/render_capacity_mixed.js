import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_API_URL = normalizeApiBase(__ENV.BASE_API_URL || 'http://localhost:8080/api');
const BASE_WS_URL = BASE_API_URL.replace(/\/api$/i, '').replace(/^http/i, 'ws');

const AUTH_TOKEN = String(__ENV.AUTH_TOKEN || '').trim();
const LOGIN_ID = String(__ENV.LOGIN_ID || '').trim();
const LOGIN_PASSWORD = String(__ENV.LOGIN_PASSWORD || '').trim();

const TOKENS = parseTokens(__ENV.TOKENS || '256265,260105,265');
const API_RATE = toInt(__ENV.API_RATE, 25);
const API_PREALLOCATED_VUS = toInt(__ENV.API_PREALLOCATED_VUS, 50);
const API_MAX_VUS = toInt(__ENV.API_MAX_VUS, 400);
const SOCKET_VUS = toInt(__ENV.SOCKET_VUS, 100);
const SESSION_SECONDS = toInt(__ENV.SESSION_SECONDS, 30);
const DURATION = __ENV.DURATION || '5m';
const ENABLE_API = String(__ENV.ENABLE_API || 'true').toLowerCase() !== 'false';
const ENABLE_WS = String(__ENV.ENABLE_WS || 'true').toLowerCase() !== 'false';
const SOCKET_MODE = String(__ENV.SOCKET_MODE || 'quote').toLowerCase();

const apiSuccessRate = new Rate('api_success_rate');
const apiFailureRate = new Rate('api_failure_rate');
const apiEndpointMs = new Trend('api_endpoint_ms');
const apiHttp5xx = new Counter('api_http_5xx_total');

const wsHandshakeRate = new Rate('ws_handshake_rate');
const wsNamespaceRate = new Rate('ws_namespace_connect_rate');
const wsSessionsWithTicks = new Rate('ws_sessions_with_ticks_rate');
const wsTickCount = new Counter('ws_ticks_total');
const wsWireMs = new Trend('ws_wire_ms');

const scenarios = {};
if (ENABLE_API) {
  scenarios.api_mix = {
    executor: 'constant-arrival-rate',
    exec: 'apiMix',
    rate: API_RATE,
    timeUnit: '1s',
    duration: DURATION,
    preAllocatedVUs: API_PREALLOCATED_VUS,
    maxVUs: API_MAX_VUS,
    gracefulStop: '10s',
  };
}
if (ENABLE_WS) {
  scenarios.market_socket = {
    executor: 'constant-vus',
    exec: 'marketSocket',
    vus: SOCKET_VUS,
    duration: DURATION,
    gracefulStop: '10s',
  };
}

if (Object.keys(scenarios).length === 0) {
  throw new Error('Enable at least one scenario: ENABLE_API=true and/or ENABLE_WS=true');
}

export const options = {
  scenarios,
  thresholds: {
    api_success_rate: ['rate>0.97'],
    api_failure_rate: ['rate<0.03'],
    api_endpoint_ms: ['p(95)<1500', 'p(99)<3000'],
    ws_handshake_rate: ['rate>0.98'],
    ws_namespace_connect_rate: ['rate>0.98'],
    ws_sessions_with_ticks_rate: ['rate>0.9'],
  },
};

function toInt(raw, fallback) {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeApiBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/?$/i, '/api');
}

function parseTokens(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function authHeaders(token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function extractToken(response) {
  const json = response.json();
  return (
    json?.token ||
    json?.accessToken ||
    json?.data?.token ||
    json?.data?.accessToken ||
    ''
  );
}

export function setup() {
  if (AUTH_TOKEN) {
    return { token: AUTH_TOKEN };
  }

  if (!LOGIN_ID || !LOGIN_PASSWORD) {
    throw new Error(
      'Provide AUTH_TOKEN or LOGIN_ID + LOGIN_PASSWORD for setup() login.'
    );
  }

  const payload = LOGIN_ID.includes('@')
    ? { email: LOGIN_ID, password: LOGIN_PASSWORD }
    : { customerId: LOGIN_ID, password: LOGIN_PASSWORD };

  const res = http.post(
    `${BASE_API_URL}/customer/auth/login`,
    JSON.stringify(payload),
    { headers: authHeaders(''), tags: { endpoint: 'setup_login' } }
  );

  const ok = check(res, {
    'setup login status 200': (r) => r.status === 200,
  });
  if (!ok) {
    throw new Error(
      `Login failed. status=${res.status} body=${String(res.body || '').slice(0, 300)}`
    );
  }

  const token = extractToken(res);
  if (!token) {
    throw new Error('Login response did not include token/accessToken.');
  }

  return { token };
}

function pageRequestMix(token) {
  const headers = authHeaders(token);
  const profile = Math.random();
  const snapshotBody = JSON.stringify({
    items: TOKENS.map((instrument_token) => ({ instrument_token })),
  });

  // Weighted mix that approximates real app behavior.
  if (profile < 0.45) {
    // Watchlist page
    return [
      {
        name: 'watchlist_get',
        method: 'GET',
        url: `${BASE_API_URL}/customer/watchlist`,
        body: null,
        params: { headers, tags: { endpoint: 'watchlist_get' } },
      },
      {
        name: 'indexes_get',
        method: 'GET',
        url: `${BASE_API_URL}/instruments/indexes`,
        body: null,
        params: { headers, tags: { endpoint: 'indexes_get' } },
      },
      {
        name: 'quotes_snapshot_post',
        method: 'POST',
        url: `${BASE_API_URL}/quotes/snapshot`,
        body: snapshotBody,
        params: { headers, tags: { endpoint: 'quotes_snapshot_post' } },
      },
    ];
  }

  if (profile < 0.75) {
    // Orders page
    return [
      {
        name: 'orders_get',
        method: 'GET',
        url: `${BASE_API_URL}/customer/orders?page=1&limit=20`,
        body: null,
        params: { headers, tags: { endpoint: 'orders_get' } },
      },
      {
        name: 'order_book_get',
        method: 'GET',
        url: `${BASE_API_URL}/customer/order-book?section=all&bucket=all&page=1&limit=20`,
        body: null,
        params: { headers, tags: { endpoint: 'order_book_get' } },
      },
    ];
  }

  // Portfolio page
  return [
    {
      name: 'portfolio_holdings_get',
      method: 'GET',
      url: `${BASE_API_URL}/customer/portfolio/holdings`,
      body: null,
      params: { headers, tags: { endpoint: 'portfolio_holdings_get' } },
    },
    {
      name: 'portfolio_positions_get',
      method: 'GET',
      url: `${BASE_API_URL}/customer/portfolio/positions`,
      body: null,
      params: { headers, tags: { endpoint: 'portfolio_positions_get' } },
    },
  ];
}

export function apiMix(data) {
  const token = data?.token || '';
  const requests = pageRequestMix(token);
  const responses = http.batch(
    requests.map((req) => ({
      method: req.method,
      url: req.url,
      body: req.body,
      params: req.params,
    }))
  );

  for (let i = 0; i < responses.length; i += 1) {
    const req = requests[i];
    const res = responses[i];
    const ok = res.status >= 200 && res.status < 300;

    check(res, {
      [`${req.name} 2xx`]: (r) => r.status >= 200 && r.status < 300,
    });

    apiSuccessRate.add(ok, { endpoint: req.name });
    apiFailureRate.add(!ok, { endpoint: req.name });
    apiEndpointMs.add(res.timings.duration, { endpoint: req.name });
    if (res.status >= 500) apiHttp5xx.add(1, { endpoint: req.name });
  }

  sleep(Math.random() * 0.7 + 0.2);
}

function socketEventPacket(eventName, ...args) {
  return `42/market,${JSON.stringify([eventName, ...args])}`;
}

export function marketSocket(data) {
  const token = data?.token || '';
  const socketUrl = `${BASE_WS_URL}/socket.io/?EIO=4&transport=websocket`;
  const subscribePayload = TOKENS.map((instrument_token) => ({ instrument_token }));

  const response = ws.connect(socketUrl, {}, (socket) => {
    let namespaceConnected = false;
    let subscribed = false;
    let sawTick = false;

    socket.on('open', () => {
      const authPacket = token
        ? `40/market,${JSON.stringify({ token })}`
        : '40/market';
      socket.send(authPacket);
    });

    socket.on('message', (rawMessage) => {
      const message = String(rawMessage || '');
      if (!message) return;

      // Engine.IO ping/pong
      if (message === '2') {
        socket.send('3');
        return;
      }

      if (message.startsWith('40/market')) {
        if (!namespaceConnected) {
          namespaceConnected = true;
          wsNamespaceRate.add(true);
        }
        if (!subscribed) {
          socket.send(socketEventPacket('subscribe', subscribePayload, SOCKET_MODE));
          subscribed = true;
        }
        return;
      }

      if (!message.startsWith('42/market,')) return;

      let payload;
      try {
        payload = JSON.parse(message.slice('42/market,'.length));
      } catch {
        return;
      }
      if (!Array.isArray(payload) || payload.length < 2) return;
      const eventName = payload[0];
      const tick = payload[1];
      if (
        eventName !== 'market_update' &&
        eventName !== 'quote_update' &&
        eventName !== 'ticker_update' &&
        eventName !== 'index_update'
      ) {
        return;
      }

      if (!tick || tick.instrument_token == null) return;
      sawTick = true;
      wsTickCount.add(1);

      const serverEmitTs = Number(tick?.__trace?.serverEmitTs);
      if (Number.isFinite(serverEmitTs)) {
        wsWireMs.add(Date.now() - serverEmitTs, {
          token: String(tick.instrument_token),
          mode: SOCKET_MODE,
        });
      }
    });

    socket.on('close', () => {
      if (!namespaceConnected) wsNamespaceRate.add(false);
      wsSessionsWithTicks.add(sawTick);
    });

    socket.setTimeout(SESSION_SECONDS * 1000, () => {
      if (subscribed) {
        socket.send(socketEventPacket('unsubscribe', subscribePayload, SOCKET_MODE));
      }
      socket.close();
    });
  });

  const handshakeOk = check(response, {
    'ws handshake is 101': (r) => r && r.status === 101,
  });
  wsHandshakeRate.add(handshakeOk);
  sleep(1);
}
