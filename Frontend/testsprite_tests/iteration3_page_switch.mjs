// TestSprite Iteration 3: Page-switch perceived lag
// Navigate: Watchlist -> Orders -> Portfolio -> Watchlist, capture first tick after each nav
import { chromium } from 'playwright';
import { parseTraceLog, printReport, APP_URL, setupAuthPage } from './helpers.mjs';

const DWELL_SECONDS = Number(process.env.DWELL_SECONDS || 15);
const CYCLES = Number(process.env.CYCLES || 2);

const allTraces = [];
const navEvents = [];

const ROUTES = [
  { name: 'Watchlist', path: '/watchlist' },
  { name: 'Orders', path: '/orders' },
  { name: 'Portfolio', path: '/portfolio' },
  { name: 'Watchlist', path: '/watchlist' },
];

(async () => {
  console.log(`[Iteration 3] Page-switch lag — ${CYCLES} cycles, ${DWELL_SECONDS}s dwell per page`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await setupAuthPage(page);

  let currentPage = '';
  let navTs = 0;
  let firstTickAfterNav = false;

  page.on('console', (msg) => {
    const text = msg.text();
    const parsed = parseTraceLog(text);
    if (!parsed) return;
    parsed._page = currentPage;
    allTraces.push(parsed);

    if (!firstTickAfterNav && navTs > 0) {
      firstTickAfterNav = true;
      const freshMs = Date.now() - navTs;
      navEvents.push({ page: currentPage, firstTickMs: freshMs });
    }
  });

  // Initial load
  await page.goto(`${APP_URL}/watchlist`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
    page.goto(`${APP_URL}/watchlist`, { waitUntil: 'load', timeout: 30000 })
  );

  for (let cycle = 0; cycle < CYCLES; cycle++) {
    console.log(`[Cycle ${cycle + 1}/${CYCLES}]`);
    for (const route of ROUTES) {
      currentPage = route.name;
      firstTickAfterNav = false;
      navTs = Date.now();
      console.log(`  Navigating to ${route.name} (${route.path})...`);

      // Use client-side navigation if possible, fall back to goto
      try {
        await page.evaluate((p) => {
          if (window.__navigate) { window.__navigate(p); return; }
          window.history.pushState({}, '', p);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, route.path);
      } catch {
        await page.goto(`${APP_URL}${route.path}`, { waitUntil: 'load', timeout: 15000 });
      }

      await page.waitForTimeout(DWELL_SECONDS * 1000);
    }
  }

  // Report
  printReport('Iteration 3 — All pages combined', allTraces);

  console.log('\n  First-tick-after-navigation times:');
  console.log('  ' + '-'.repeat(40));
  for (const ev of navEvents) {
    const status = ev.firstTickMs > 2000 ? 'SLOW' : 'OK';
    console.log(`  ${ev.page.padEnd(12)} ${ev.firstTickMs.toFixed(0).padStart(6)}ms  [${status}]`);
  }

  // Per-page breakdown
  for (const route of ROUTES) {
    const pageTraces = allTraces.filter(t => t._page === route.name);
    if (pageTraces.length) {
      printReport(`Iteration 3 — ${route.name} only`, pageTraces);
    }
  }

  await browser.close();
})();
