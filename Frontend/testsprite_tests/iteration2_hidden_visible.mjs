// TestSprite Iteration 2: Hidden/visible transition impact
// Keep watchlist live, background tab for 60s, return to foreground for 30s, compare metrics
import { chromium } from 'playwright';
import { parseTraceLog, printReport, summarizeMetrics, APP_URL, setupAuthPage } from './helpers.mjs';

const HIDDEN_SECONDS = Number(process.env.HIDDEN_SECONDS || 20);
const VISIBLE_SECONDS = Number(process.env.VISIBLE_SECONDS || 15);

const visibleTraces = [];
const hiddenTraces = [];
const recoveryTraces = [];

(async () => {
  console.log(`[Iteration 2] Hidden/visible transition — hidden=${HIDDEN_SECONDS}s visible=${VISIBLE_SECONDS}s`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await setupAuthPage(page);

  let phase = 'visible_before';

  page.on('console', (msg) => {
    const text = msg.text();
    for (const tag of ['[TickTraceJSON]', '[WatchlistTraceJSON]']) {
      if (!text.includes(tag)) continue;
      const parsed = parseTraceLog(text);
      if (!parsed) continue;
      if (phase === 'visible_before') visibleTraces.push(parsed);
      else if (phase === 'hidden') hiddenTraces.push(parsed);
      else if (phase === 'recovery') recoveryTraces.push(parsed);
    }
  });

  await page.goto(`${APP_URL}/watchlist`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(`${APP_URL}/watchlist`, { waitUntil: 'load', timeout: 30000 })
  );

  // Phase 1: visible baseline
  console.log('[Phase 1] Foreground baseline...');
  await page.waitForTimeout(VISIBLE_SECONDS * 1000);

  // Phase 2: simulate hidden tab via Page.setVisibility (emulation)
  console.log('[Phase 2] Simulating hidden tab...');
  phase = 'hidden';
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(HIDDEN_SECONDS * 1000);

  // Phase 3: return to visible
  console.log('[Phase 3] Returning to foreground...');
  phase = 'recovery';
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(VISIBLE_SECONDS * 1000);

  printReport('Iteration 2 — Visible (before hide)', visibleTraces);
  printReport('Iteration 2 — Hidden phase', hiddenTraces);
  printReport('Iteration 2 — Recovery (after refocus)', recoveryTraces);

  // Analysis
  const visBefore = summarizeMetrics(visibleTraces, 'wireMs');
  const recov = summarizeMetrics(recoveryTraces, 'wireMs');
  if (recov.p95 != null && visBefore.p95 != null) {
    const ratio = recov.p95 / visBefore.p95;
    console.log(`  Recovery wireMs p95 / baseline wireMs p95 = ${ratio.toFixed(2)}x`);
    if (ratio > 3) console.log('  WARN: Slow recovery after refocus');
    else console.log('  OK: Recovery latency within acceptable range');
  }

  console.log(hiddenTraces.length === 0
    ? '  OK: No render traces during hidden (RAF correctly paused)'
    : `  INFO: ${hiddenTraces.length} traces during hidden phase`);

  await browser.close();
})();
