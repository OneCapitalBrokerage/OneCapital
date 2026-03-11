// TestSprite Iteration 1: Foreground baseline (watchlist only)
// Stay on watchlist tab, app in foreground, collect TickTraceJSON + WatchlistTraceJSON
import { chromium } from 'playwright';
import { parseTraceLog, printReport, APP_URL, COLLECT_SECONDS, setupAuthPage } from './helpers.mjs';

const tickTraces = [];
const watchlistTraces = [];

(async () => {
  console.log(`[Iteration 1] Foreground baseline — collecting for ${COLLECT_SECONDS}s on ${APP_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await setupAuthPage(page);

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[TickTraceJSON]')) {
      const parsed = parseTraceLog(text);
      if (parsed) tickTraces.push(parsed);
    }
    if (text.includes('[WatchlistTraceJSON]')) {
      const parsed = parseTraceLog(text);
      if (parsed) watchlistTraces.push(parsed);
    }
  });

  await page.goto(`${APP_URL}/watchlist`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(`${APP_URL}/watchlist`, { waitUntil: 'load', timeout: 30000 })
  );
  console.log('[Iteration 1] Page loaded, collecting traces...');

  await page.waitForTimeout(COLLECT_SECONDS * 1000);

  printReport('Iteration 1 — TickTrace (socket receive)', tickTraces);
  printReport('Iteration 1 — WatchlistTrace (render pipeline)', watchlistTraces);

  // Pass/fail checks
  const wireP95 = watchlistTraces.length ? null : tickTraces;
  let pass = true;
  if (tickTraces.length === 0 && watchlistTraces.length === 0) {
    console.log('  WARN: No trace entries collected. Is the market open / are tokens subscribed?');
    pass = false;
  }

  const { summarizeMetrics } = await import('./helpers.mjs');
  if (watchlistTraces.length) {
    const rtr = summarizeMetrics(watchlistTraces, 'receiveToRenderMs');
    if (rtr.p95 != null && rtr.p95 > 1000) {
      console.log(`  FAIL: receiveToRenderMs p95 = ${rtr.p95.toFixed(1)}ms (> 1000ms threshold)`);
      pass = false;
    }
  }
  if (tickTraces.length) {
    const wire = summarizeMetrics(tickTraces, 'wireMs');
    if (wire.p95 != null && wire.p95 > 500) {
      console.log(`  FAIL: wireMs p95 = ${wire.p95.toFixed(1)}ms (> 500ms threshold)`);
      pass = false;
    }
  }

  console.log(pass ? '\n  RESULT: PASS' : '\n  RESULT: NEEDS INVESTIGATION');

  await browser.close();
})();
