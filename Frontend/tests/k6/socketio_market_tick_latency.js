import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '2m';
const SESSION_SECONDS = Number(__ENV.SESSION_SECONDS || 25);
const MODE = String(__ENV.MODE || 'quote').toLowerCase();
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const REQUIRE_TRACE = String(__ENV.REQUIRE_TRACE || 'true').toLowerCase() !== 'false';

const rawBaseUrl = __ENV.BASE_URL || __ENV.BASE_API_URL || 'http://localhost:8080/api';
const baseHttpUrl = normalizeBaseHttpUrl(rawBaseUrl);
const socketUrl = `${baseHttpUrl.replace(/^http/i, 'ws')}/socket.io/?EIO=4&transport=websocket`;

const tokenList = parseTokens(__ENV.TOKENS || '256265,260105,265');
const subscribePayload = tokenList.map((token) => ({ instrument_token: token }));

const wsHandshakeRate = new Rate('ws_handshake_rate');
const namespaceConnectRate = new Rate('namespace_connect_rate');
const socketSessionsWithTicksRate = new Rate('socket_sessions_with_ticks_rate');
const connectErrorRate = new Rate('connect_error_rate');
const tickTracePresentRate = new Rate('tick_trace_present_rate');

const namespaceConnectMs = new Trend('namespace_connect_ms');
const tickInterarrivalMs = new Trend('tick_interarrival_ms');
const tickWireMs = new Trend('tick_wire_ms');
const tickServerToClientMs = new Trend('tick_server_to_client_ms');
const tickSourceToClientMs = new Trend('tick_source_to_client_ms');
const tickSeqGap = new Trend('tick_seq_gap');

const ticksTotal = new Counter('ticks_total');
const ticksWithTrace = new Counter('ticks_with_trace');
const ticksWithoutTrace = new Counter('ticks_without_trace');
const seqGapEvents = new Counter('seq_gap_events');
const subscribeRequests = new Counter('subscribe_requests');

const thresholds = {
  ws_handshake_rate: ['rate>0.99'],
  namespace_connect_rate: ['rate>0.99'],
  socket_sessions_with_ticks_rate: ['rate>0.95'],
  connect_error_rate: ['rate<0.01'],
  tick_interarrival_ms: ['p(99)<5000'],
};

if (REQUIRE_TRACE) {
  thresholds.tick_wire_ms = ['p(95)<500', 'p(99)<1500'];
  thresholds.tick_server_to_client_ms = ['p(95)<1200', 'p(99)<4000'];
  thresholds.tick_source_to_client_ms = ['p(95)<20000'];
}

export const options = {
  scenarios: {
    market_socket: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '5s',
    },
  },
  thresholds,
};

function normalizeBaseHttpUrl(input) {
  return String(input || 'http://localhost:8080/api')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

function parseTokens(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function socketEventPacket(eventName, ...args) {
  return `42/market,${JSON.stringify([eventName, ...args])}`;
}

function isTickEvent(name) {
  return (
    name === 'market_update' ||
    name === 'quote_update' ||
    name === 'ticker_update' ||
    name === 'index_update'
  );
}

export default function () {
  const response = ws.connect(socketUrl, {}, (socket) => {
    const connectStartTs = Date.now();
    let namespaceConnected = false;
    let subscribed = false;
    let sawTick = false;

    const lastSeqByToken = new Map();
    const lastClientTsByToken = new Map();

    socket.on('open', () => {
      const authPacket = AUTH_TOKEN
        ? `40/market,${JSON.stringify({ token: AUTH_TOKEN })}`
        : '40/market';
      socket.send(authPacket);
    });

    socket.on('message', (rawMessage) => {
      const message = String(rawMessage || '');
      if (!message) return;

      // Engine.IO heartbeat.
      if (message === '2') {
        socket.send('3');
        return;
      }

      // Namespace connect ack.
      if (message.startsWith('40/market')) {
        if (!namespaceConnected) {
          namespaceConnected = true;
          namespaceConnectRate.add(true);
          namespaceConnectMs.add(Date.now() - connectStartTs);
        }

        if (!subscribed) {
          socket.send(socketEventPacket('subscribe', subscribePayload, MODE));
          subscribeRequests.add(1);
          subscribed = true;
        }
        return;
      }

      // Namespace connect error.
      if (message.startsWith('44/market')) {
        namespaceConnectRate.add(false);
        connectErrorRate.add(1);
        socket.close();
        return;
      }

      if (!message.startsWith('42/market,')) return;

      const payload = safeParseJSON(message.slice('42/market,'.length));
      if (!Array.isArray(payload) || payload.length < 2) return;

      const eventName = payload[0];
      const data = payload[1];
      if (!isTickEvent(eventName)) return;
      if (!data || data.instrument_token == null) return;

      const now = Date.now();
      const token = String(data.instrument_token);

      sawTick = true;
      ticksTotal.add(1);

      const lastClientTs = lastClientTsByToken.get(token);
      if (lastClientTs != null) {
        tickInterarrivalMs.add(now - lastClientTs, { token, mode: MODE });
      }
      lastClientTsByToken.set(token, now);

      const trace = data.__trace && typeof data.__trace === 'object' ? data.__trace : null;
      if (!trace) {
        tickTracePresentRate.add(false);
        ticksWithoutTrace.add(1);
        return;
      }

      tickTracePresentRate.add(true);
      ticksWithTrace.add(1);

      const serverEmitTs = finiteNumber(trace.serverEmitTs);
      const serverReceiveTs = finiteNumber(trace.serverReceiveTs);
      const exchangeTsMs = finiteNumber(trace.exchangeTsMs);
      const seq = finiteNumber(trace.seq);

      if (serverEmitTs != null) {
        tickWireMs.add(now - serverEmitTs, { token, mode: MODE });
      }
      if (serverReceiveTs != null) {
        tickServerToClientMs.add(now - serverReceiveTs, { token, mode: MODE });
      }
      if (exchangeTsMs != null) {
        tickSourceToClientMs.add(now - exchangeTsMs, { token, mode: MODE });
      }

      if (seq != null) {
        const prevSeq = lastSeqByToken.get(token);
        if (prevSeq != null) {
          const gap = seq - prevSeq;
          if (gap > 1) {
            seqGapEvents.add(1);
            tickSeqGap.add(gap, { token, mode: MODE });
          }
        }
        lastSeqByToken.set(token, seq);
      }
    });

    socket.on('error', () => {
      connectErrorRate.add(1);
    });

    socket.setTimeout(() => {
      if (subscribed) {
        socket.send(socketEventPacket('unsubscribe', subscribePayload, MODE));
      }
      socket.close();
    }, SESSION_SECONDS * 1000);

    socket.on('close', () => {
      if (!namespaceConnected) {
        namespaceConnectRate.add(false);
      }
      socketSessionsWithTicksRate.add(sawTick);
    });
  });

  const handshakeOk = check(response, {
    'ws handshake status is 101': (res) => res && res.status === 101,
  });

  wsHandshakeRate.add(handshakeOk);
  if (!handshakeOk) {
    connectErrorRate.add(1);
  }

  sleep(1);
}
