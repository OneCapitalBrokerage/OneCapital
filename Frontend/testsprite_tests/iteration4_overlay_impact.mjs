// TestSprite Iteration 4: Full overlay impact (market depth / chart / option chain)
// Open overlays from watchlist, close them, verify quotes resume immediately
import { chromium } from 'playwright';
import { parseTraceLog, printReport, summarizeMetrics, APP_URL, setupAuthPage } from './helpers.mjs';

const DWELL_SECONDS = Number(process.env.DWELL_SECONDS || 12);

const phases = { baseline: [], during_overlay: [], after_overlay: [] };
let currentPhase = 'baseline';

(async () => {
  console.log(`[Iteration 4] Overlay impact — ${DWELL_SECONDS}s per phase`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await setupAuthPage(page);

  page.on('console', (msg) => {
    const text = msg.text();
    const parsed = parseTraceLog(text);
    if (parsed) {
      parsed._phase = currentPhase;
      phases[currentPhase].push(parsed);
    }
  });

  await page.goto(`${APP_URL}/watchlist`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(`${APP_URL}/watchlist`, { waitUntil: 'load', timeout: 30000 })
  );

  // Phase 1: Baseline on watchlist
  console.log('[Phase 1] Watchlist baseline...');
  currentPhase = 'baseline';
  await page.waitForTimeout(DWELL_SECONDS * 1000);

  // Phase 2: Try to open overlays (chart view, market depth)
  console.log('[Phase 2] Opening overlays...');
  currentPhase = 'during_overlay';

  // Try clicking first watchlist item to open chart/depth overlay
  const selectors = [
    '[data-testid="watchlist-item"]',
    '.watchlist-row',
    '.instrument-row',
    'tr[class*="watchlist"]',
    '.watchlist-card',
    'table tbody tr',
  ];

  let clicked = false;
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      clicked = true;
      console.log(`  Clicked: ${sel}`);
      break;
    }
  }
  if (!clicked) console.log('  WARN: Could not find watchlist item to click');

  await page.waitForTimeout(DWELL_SECONDS * 1000);

  // Try to open chart view if available
  const chartSelectors = [
    '[data-testid="chart-btn"]',
    'button:has-text("Chart")',
    '.chart-toggle',
    'a[href*="chart"]',
  ];
  for (const sel of chartSelectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      console.log(`  Opened chart: ${sel}`);
      await page.waitForTimeout(5000);
      break;
    }
  }

  // Phase 3: Close overlays, return to watchlist
  console.log('[Phase 3] Closing overlays, back to watchlist...');
  currentPhase = 'after_overlay';

  // Press Escape or click back
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');

  // Navigate back to watchlist root
  try {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  } catch { /* ignore */ }

  await page.waitForTimeout(DWELL_SECONDS * 1000);

  // Reports
  printReport('Iteration 4 — Baseline (before overlay)', phases.baseline);
  printReport('Iteration 4 — During overlay', phases.during_overlay);
  printReport('Iteration 4 — After overlay close', phases.after_overlay);

  // Pass/fail
  const baseWire = summarizeMetrics(phases.baseline, 'wireMs');
  const afterWire = summarizeMetrics(phases.after_overlay, 'wireMs');

  if (baseWire.p95 != null && afterWire.p95 != null) {
    const ratio = afterWire.p95 / baseWire.p95;
    console.log(`  After/Baseline wireMs p95 ratio = ${ratio.toFixed(2)}x`);
    console.log(ratio > 2
      ? '  FAIL: Persistent quote lag after overlay close'
      : '  PASS: Quote cadence resumed normally');
  } else {
    console.log('  INFO: Not enough data for before/after comparison');
  }

  await browser.close();
})();
