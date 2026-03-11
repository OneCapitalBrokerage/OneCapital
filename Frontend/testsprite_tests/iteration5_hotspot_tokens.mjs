// TestSprite Iteration 5: Hotspot token consistency
// Track 3 highly active tokens across a session, check seq gaps and timing consistency
import { chromium } from 'playwright';
import { parseTraceLog, printReport, summarizeMetrics, APP_URL, COLLECT_SECONDS, setupAuthPage } from './helpers.mjs';

const allTraces = [];

(async () => {
  const duration = COLLECT_SECONDS > 20 ? COLLECT_SECONDS : 45;
  console.log(`[Iteration 5] Hotspot token consistency — collecting for ${duration}s`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await setupAuthPage(page);

  page.on('console', (msg) => {
    const text = msg.text();
    const parsed = parseTraceLog(text);
    if (parsed) allTraces.push(parsed);
  });

  await page.goto(`${APP_URL}/watchlist`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(`${APP_URL}/watchlist`, { waitUntil: 'load', timeout: 30000 })
  );

  await page.waitForTimeout(duration * 1000);

  // Find top 3 most active tokens
  const tokenCounts = {};
  for (const t of allTraces) {
    const tk = t.token || t.instrument_token;
    if (tk) tokenCounts[tk] = (tokenCounts[tk] || 0) + 1;
  }

  const hotspots = Object.entries(tokenCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([token]) => token);

  console.log(`\n  Top 3 hotspot tokens: ${hotspots.join(', ')}`);

  printReport('Iteration 5 — All tokens combined', allTraces);

  for (const token of hotspots) {
    const tokenTraces = allTraces.filter(t => (t.token || t.instrument_token) === token);
    printReport(`Iteration 5 — Token ${token}`, tokenTraces);

    // Sequence gap analysis
    const seqs = tokenTraces.map(t => t.seq).filter(s => s != null);
    let gaps = 0;
    let maxGap = 0;
    for (let i = 1; i < seqs.length; i++) {
      const gap = seqs[i] - seqs[i - 1];
      if (gap > 1) {
        gaps++;
        maxGap = Math.max(maxGap, gap);
      }
    }
    console.log(`    Seq gaps: ${gaps}, max gap: ${maxGap}, total seqs: ${seqs.length}`);

    // Cadence consistency
    const timestamps = tokenTraces.map(t => t.clientReceiveTs).filter(Boolean);
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    if (intervals.length) {
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const stddev = Math.sqrt(intervals.reduce((a, v) => a + (v - avg) ** 2, 0) / intervals.length);
      console.log(`    Tick interval: avg=${avg.toFixed(0)}ms stddev=${stddev.toFixed(0)}ms (${intervals.length} intervals)`);
      console.log(stddev > avg ? '    WARN: High cadence variance — possible scheduling issue' : '    OK: Cadence is stable');
    }
  }

  // Global vs per-token verdict
  const globalWire = summarizeMetrics(allTraces, 'wireMs');
  const perTokenP95s = hotspots.map(token => {
    const tt = allTraces.filter(t => (t.token || t.instrument_token) === token);
    return summarizeMetrics(tt, 'wireMs').p95;
  }).filter(Boolean);

  if (globalWire.p95 != null && perTokenP95s.length) {
    const maxTokenP95 = Math.max(...perTokenP95s);
    const ratio = maxTokenP95 / globalWire.p95;
    console.log(`\n  Global wireMs p95: ${globalWire.p95.toFixed(1)}ms`);
    console.log(`  Worst token wireMs p95: ${maxTokenP95.toFixed(1)}ms`);
    console.log(ratio > 3
      ? '  VERDICT: Lag is token-specific, not global scheduling'
      : '  VERDICT: Lag is global UI scheduling, not token-specific');
  }

  await browser.close();
})();
