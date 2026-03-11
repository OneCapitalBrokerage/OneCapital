import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '2m';
const BASE_API_URL = String(__ENV.BASE_API_URL || 'http://localhost:8080/api').replace(/\/+$/, '');
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const OPTION_UNDERLYING = __ENV.OPTION_UNDERLYING || '';
const OPTION_SEGMENT = __ENV.OPTION_SEGMENT || 'NFO';
const SNAPSHOT_TOKENS = parseTokens(__ENV.TOKENS || '256265,260105,265');

const apiOkRate = new Rate('api_status_ok_rate');
const apiFailureRate = new Rate('api_http_failure_rate');
const apiEndpointMs = new Trend('api_endpoint_ms');
const apiHttp5xx = new Counter('api_http_5xx_total');

export const options = {
  scenarios: {
    customer_api_mix: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '5s',
    },
  },
  thresholds: {
    api_status_ok_rate: ['rate>0.98'],
    api_http_failure_rate: ['rate<0.02'],
    api_endpoint_ms: ['p(95)<1200', 'p(99)<3000'],
  },
};

function parseTokens(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function authHeaders() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

function buildRequests() {
  const headers = authHeaders();
  const requests = [
    {
      name: 'watchlist_get',
      method: 'GET',
      url: `${BASE_API_URL}/customer/watchlist`,
      body: null,
      params: { headers, tags: { endpoint: 'watchlist_get' } },
    },
    {
      name: 'orders_get',
      method: 'GET',
      url: `${BASE_API_URL}/customer/orders`,
      body: null,
      params: { headers, tags: { endpoint: 'orders_get' } },
    },
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
    {
      name: 'order_book_get',
      method: 'GET',
      url: `${BASE_API_URL}/customer/order-book?section=all&bucket=all&page=1&limit=50`,
      body: null,
      params: { headers, tags: { endpoint: 'order_book_get' } },
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
      body: JSON.stringify({
        items: SNAPSHOT_TOKENS.map((token) => ({ instrument_token: token })),
      }),
      params: { headers, tags: { endpoint: 'quotes_snapshot_post' } },
    },
  ];

  if (OPTION_UNDERLYING) {
    requests.push({
      name: 'option_chain_get',
      method: 'GET',
      url: `${BASE_API_URL}/option-chain?name=${encodeURIComponent(OPTION_UNDERLYING)}&segment=${encodeURIComponent(OPTION_SEGMENT)}`,
      body: null,
      params: { headers, tags: { endpoint: 'option_chain_get' } },
    });
    requests.push({
      name: 'option_chain_expiries_get',
      method: 'GET',
      url: `${BASE_API_URL}/option-chain/expiries?name=${encodeURIComponent(OPTION_UNDERLYING)}&segment=${encodeURIComponent(OPTION_SEGMENT)}`,
      body: null,
      params: { headers, tags: { endpoint: 'option_chain_expiries_get' } },
    });
  }

  return requests;
}

export default function () {
  const requests = buildRequests();
  const responses = http.batch(requests.map((req) => ({
    method: req.method,
    url: req.url,
    body: req.body,
    params: req.params,
  })));

  for (let i = 0; i < responses.length; i += 1) {
    const req = requests[i];
    const res = responses[i];
    const ok = res.status >= 200 && res.status < 300;

    check(res, {
      [`${req.name} returns 2xx`]: (r) => r.status >= 200 && r.status < 300,
    });

    apiOkRate.add(ok, { endpoint: req.name });
    apiFailureRate.add(!ok, { endpoint: req.name });
    apiEndpointMs.add(res.timings.duration, { endpoint: req.name });
    if (res.status >= 500) {
      apiHttp5xx.add(1, { endpoint: req.name });
    }
  }

  sleep(Math.random() * 0.9 + 0.3);
}
