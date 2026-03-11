// Shared helpers for TestSprite iterations
export function parseTraceLog(text) {
  const match = text.match(/\[(?:TickTraceJSON|WatchlistTraceJSON)\]\s*(.+)/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

export function computePercentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function summarizeMetrics(entries, field) {
  const vals = entries.map(e => e[field]).filter(v => v != null && Number.isFinite(v));
  if (!vals.length) return { count: 0, p50: null, p95: null, min: null, max: null };
  return {
    count: vals.length,
    p50: computePercentile(vals, 50),
    p95: computePercentile(vals, 95),
    min: Math.min(...vals),
    max: Math.max(...vals),
  };
}

export function printReport(title, entries) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total trace entries: ${entries.length}`);

  const fields = ['wireMs', 'receiveToRafMs', 'receiveToRenderMs', 'totalToRenderMs',
                  'serverProcessMs', 'totalMs', 'sourceToClientMs', 'rafToRenderMs'];
  for (const f of fields) {
    const s = summarizeMetrics(entries, f);
    if (s.count > 0) {
      console.log(`  ${f.padEnd(22)} count=${String(s.count).padStart(4)}  p50=${fmt(s.p50)}  p95=${fmt(s.p95)}  min=${fmt(s.min)}  max=${fmt(s.max)}`);
    }
  }
  console.log('');
}

function fmt(v) { return v == null ? '  N/A' : `${v.toFixed(1).padStart(8)}ms`; }

export const APP_URL = process.env.APP_URL || 'http://localhost:5173';
export const API_URL = process.env.API_URL || 'http://localhost:8080/api';
export const COLLECT_SECONDS = Number(process.env.COLLECT_SECONDS || 30);

export async function loginAndGetTokens() {
  const res = await fetch(`${API_URL}/customer/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: '3113946310', password: 'Demo@8008' }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Login failed: ${data.message}`);
  return { token: data.token, refreshToken: data.refreshToken, user: data.user };
}

export async function setupAuthPage(page) {
  const { token, refreshToken, user } = await loginAndGetTokens();
  await page.addInitScript(({ token, refreshToken, user }) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('MARKET_TICK_TRACE', 'true');
    localStorage.setItem('MARKET_TICK_TRACE_LIMIT', '99999');
    localStorage.setItem('WATCHLIST_TRACE', 'true');
    localStorage.setItem('WATCHLIST_TRACE_LIMIT', '99999');
  }, { token, refreshToken, user });
  return { token, refreshToken, user };
}
