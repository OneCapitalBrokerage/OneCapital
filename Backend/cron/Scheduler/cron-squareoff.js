import cron from "node-cron";
import Order from "../../Model/Trading/OrdersModel.js";
import { attemptSquareoff } from "./attemptSquareoff.js";
import { withLock } from "../../services/cronLock.js";
import { getCachedSnapshot } from "../../services/livePriceCache.js";

const INTRADAY_ACTIVE_STATUSES = ["OPEN", "EXECUTED", "PARTIALLY_FILLED"];
const EXPIRY_ACTIVE_STATUSES = ["OPEN", "EXECUTED", "PARTIALLY_FILLED", "HOLD"];
const DEFAULT_CANDIDATE_LIMIT = Number.parseInt(process.env.SQUAREOFF_CANDIDATE_LIMIT || "1000", 10);
const DEFAULT_SQUAREOFF_CONCURRENCY = Number.parseInt(process.env.SQUAREOFF_CONCURRENCY || "25", 10);
const IST_OFFSET_MINUTES = 330;

function setISTTime(date, hour, minute) {
  const base = new Date(date);
  const istMs = base.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const istDate = new Date(istMs);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth();
  const day = istDate.getUTCDate();
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000);
}

function toOrderToken(order) {
  const token = order?.instrument_token || order?.security_Id || null;
  return token ? String(token) : null;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function summarizePriceSources(sourceCounts) {
  const entries = Object.entries(sourceCounts).filter(([, count]) => count > 0);
  if (entries.length === 0) return "none";
  return entries.map(([source, count]) => `${source}:${count}`).join(", ");
}

async function runWithConcurrency(items, limit, worker) {
  if (!Array.isArray(items) || items.length === 0) return;

  const concurrency = Math.min(items.length, toPositiveInt(limit, DEFAULT_SQUAREOFF_CONCURRENCY));
  let index = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) return;
      await worker(items[currentIndex], currentIndex);
    }
  }));
}

async function processCandidates(query, label, options = {}) {
  const startedAt = Date.now();
  const candidateLimit = toPositiveInt(options.limit, DEFAULT_CANDIDATE_LIMIT);

  try {
    const candidates = await Order.find(query)
      .sort({ validity_expires_at: 1, placed_at: 1, createdAt: 1 })
      .limit(candidateLimit)
      .lean();

    const tokens = [...new Set(candidates.map(toOrderToken).filter(Boolean))];
    const snapshot = getCachedSnapshot(tokens);
    const warmTokenCount = tokens.filter((token) => Number(snapshot?.[token]?.ltp || 0) > 0).length;

    console.log(`[cron] ${label}: Found ${candidates.length} orders (${warmTokenCount}/${tokens.length} token(s) warm in cache)`);

    if (candidates.length === 0) {
      return;
    }

    const stats = {
      closed: 0,
      skipped: 0,
      failed: 0,
      priceSources: {
        feed_cache: 0,
        stored_price_fallback: 0,
        provided_exit_price: 0,
        unavailable: 0,
      },
    };

    await runWithConcurrency(candidates, options.concurrency, async (orderDoc) => {
      const result = await attemptSquareoff(orderDoc, { snapshot });
      const action = String(result?.action || "");
      const priceSource = result?.result?.priceSource || (result?.reason === 'exit_price_unavailable' ? 'unavailable' : null);

      if (priceSource && stats.priceSources[priceSource] !== undefined) {
        stats.priceSources[priceSource] += 1;
      }

      if (result?.ok && action.startsWith("closed_")) {
        stats.closed += 1;
        return;
      }

      if (result?.ok) {
        stats.skipped += 1;
        return;
      }

      stats.failed += 1;
      console.warn(`[cron] ${label}: Failed order ${orderDoc?._id}: ${result?.reason || result?.result?.error || 'unknown_error'}`);
    });

    const durationMs = Date.now() - startedAt;
    console.log(`[cron] ${label}: Closed=${stats.closed} Skipped=${stats.skipped} Failed=${stats.failed} DurationMs=${durationMs} PriceSources=${summarizePriceSources(stats.priceSources)}`);
  } catch (err) {
    console.error(`[cron] Error in ${label}:`, err);
  }
}

function buildExpiredIntradayQuery(segmentFilter, cutoffAt) {
  return {
    category: "INTRADAY",
    status: { $in: INTRADAY_ACTIVE_STATUSES },
    segment: segmentFilter,
    $or: [
      { validity_expires_at: { $lte: cutoffAt } },
      { validity_expires_at: { $exists: false } },
      { validity_expires_at: null },
    ],
  };
}

export function stockSquareoffScheduler() {
  console.log('Stock Squareoff Scheduler Started...');

  // =========================================================
  // 1. MARKET CLOSE — 3:15 PM Mon-Fri (NSE/BSE/CDS)
  // =========================================================
  cron.schedule("15 15 * * 1-5", async () => {
    await withLock("cron:squareoff:market-close-315", 240, async () => {
      console.log(`[cron] Running MARKET CLOSE jobs (3:15 PM)`);

      await processCandidates(
        {
          category: "INTRADAY",
          status: { $in: INTRADAY_ACTIVE_STATUSES },
          segment: { $not: /^MCX/ },
        },
        "INTRADAY_SQUAREOFF"
      );

      const now = new Date();
      await processCandidates(
        {
          product: { $in: ["CNC", "NRML"] },
          status: { $in: EXPIRY_ACTIVE_STATUSES },
          validity_expires_at: { $lte: now },
        },
        "SAME_DAY_LONGTERM_EXPIRY"
      );
    });
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // =========================================================
  // 1b. MARKET CLOSE RECOVERY — 3:16 PM Mon-Fri
  // Retry any stale non-MCX intraday order that missed the exact 3:15 run.
  // =========================================================
  cron.schedule("16 15 * * 1-5", async () => {
    await withLock("cron:squareoff:market-close-recovery-316", 240, async () => {
      const cutoffAt = setISTTime(new Date(), 15, 15);
      console.log(`[cron] Running MARKET CLOSE recovery (3:16 PM) for cutoff ${cutoffAt.toISOString()}`);

      await processCandidates(
        buildExpiredIntradayQuery({ $not: /^MCX/ }, cutoffAt),
        "INTRADAY_SQUAREOFF_RECOVERY"
      );
    });
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // =========================================================
  // 2. EQUITY LONGTERM EXPIRY CHECK - at 3:20 PM Mon-Fri
  // =========================================================
  cron.schedule("20 15 * * 1-5", async () => {
    await withLock("cron:squareoff:equity-expiry-320", 180, async () => {
      console.log(`[cron] Running EQUITY LONGTERM EXPIRY Check (3:20 PM)`);

      const now = new Date();
      await processCandidates(
        {
          product: { $in: ["CNC", "NRML"] },
          status: { $in: EXPIRY_ACTIVE_STATUSES },
          validity_expires_at: { $lte: now },
        },
        "EQUITY_EXPIRY_CHECK"
      );
    });
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // =========================================================
  // 3. MCX INTRADAY SQUARE OFF - 11:00 PM Mon-Fri
  // =========================================================
  cron.schedule("0 23 * * 1-5", async () => {
    await withLock("cron:squareoff:mcx-close-2300", 240, async () => {
      console.log(`[cron] Running MCX INTRADAY Auto-Squareoff (11:00 PM)`);

      await processCandidates(
        {
          category: "INTRADAY",
          status: { $in: INTRADAY_ACTIVE_STATUSES },
          segment: { $regex: /^MCX/ },
        },
        "OPEN_INTRADAY_MCX"
      );
    });
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // =========================================================
  // 3b. MCX RECOVERY - 11:01 PM Mon-Fri
  // Retry any stale MCX intraday order that missed the exact 11:00 run.
  // =========================================================
  cron.schedule("1 23 * * 1-5", async () => {
    await withLock("cron:squareoff:mcx-recovery-2301", 240, async () => {
      const cutoffAt = setISTTime(new Date(), 23, 0);
      console.log(`[cron] Running MCX recovery (11:01 PM) for cutoff ${cutoffAt.toISOString()}`);

      await processCandidates(
        buildExpiredIntradayQuery({ $regex: /^MCX/ }, cutoffAt),
        "OPEN_INTRADAY_MCX_RECOVERY"
      );
    });
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // =========================================================
  // 4. MIDNIGHT CLEANUP & EXPIRY FALLBACK (Daily 12:02 AM)
  // =========================================================
  cron.schedule("2 0 * * *", async () => {
    await withLock("cron:squareoff:midnight-0002", 480, async () => {
      console.log(`[cron] Running Midnight Maintenance`);

      await processCandidates(
        {
          category: "INTRADAY",
          status: "HOLD"
        },
        "INTRADAY_HOLD_CLEANUP"
      );

      const now = new Date();
      await processCandidates(
        {
          category: "INTRADAY",
          status: { $in: INTRADAY_ACTIVE_STATUSES },
          $or: [
            { validity_expires_at: { $lte: now } },
            { validity_expires_at: { $exists: false } },
            { validity_expires_at: null },
          ],
        },
        "STALE_INTRADAY_FALLBACK"
      );

      await processCandidates(
        {
          product: { $in: ["NRML", "CNC"] },
          status: { $in: EXPIRY_ACTIVE_STATUSES },
          $or: [
            { validity_expires_at: { $lte: now } },
            { validity_expires_at: { $exists: false } },
            { validity_expires_at: null },
          ],
        },
        "OVERNIGHT_EXPIRY_FALLBACK"
      );
    });
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
}
