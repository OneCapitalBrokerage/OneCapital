import cron from "node-cron";
import Order from "../../Model/Trading/OrdersModel.js";
import { isTradingDay } from "../marketCalendar.js";
import { attemptSquareoff } from "./attemptSquareoff.js";
import { withLock } from "../../services/cronLock.js";

// Helper to process list of orders
async function processCandidates(query, label) {
  try {
    const candidates = await Order.find(query).limit(1000);
    console.log(`[cron] ${label}: Found ${candidates.length} orders`);

    for (const orderDoc of candidates) {
      await attemptSquareoff(orderDoc);
    }
  } catch (err) {
    console.error(`[cron] Error in ${label}:`, err);
  }
}

export function stockSquareoffScheduler() {
  console.log('Stock Squareoff Scheduler Started...');

  // =========================================================
  // 1. MARKET CLOSE — 3:15 PM Mon-Fri (NSE/BSE/CDS)
  // Runs two passes back-to-back at market close:
  //   A. Intraday (MIS) squareoff — always close at 3:15 PM
  //   B. Same-day CNC/NRML expiry — close orders whose validity_expires_at <= now
  //      (equity 7D and F&O contracts both expire at exactly 3:15 PM IST)
  // =========================================================
  cron.schedule("15 15 * * 1-5", async () => {
    await withLock("cron:squareoff:market-close-315", 240, async () => {
      if (!isTradingDay(new Date())) {
        return console.log("[cron] Market holiday, skipping Market Close jobs.");
      }

      console.log(`[cron] Running MARKET CLOSE jobs (3:15 PM)`);

      // A: Intraday squareoff (MIS)
      await processCandidates(
        {
          category: "INTRADAY",
          status: { $in: ["OPEN", "EXECUTED"] },
          segment: { $not: /^MCX/ }
        },
        "INTRADAY_SQUAREOFF"
      );

      // B: Same-day CNC/NRML expiry (equity 7D + F&O contracts expiring today at 3:15 PM)
      const now = new Date();
      await processCandidates(
        {
          product: { $in: ["CNC", "NRML"] },
          status: { $in: ["OPEN", "EXECUTED", "HOLD"] },
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
  // 2. EQUITY LONGTERM EXPIRY CHECK - at 3:20 PM Mon-Fri
  // Runs AFTER intraday squareoff (3:15 PM).
  // Closes CNC/NRML/HOLD orders whose validity_expires_at <= now.
  // =========================================================
  cron.schedule("20 15 * * 1-5", async () => {
    await withLock("cron:squareoff:equity-expiry-320", 180, async () => {
      if (!isTradingDay(new Date())) {
        return console.log("[cron] Market holiday, skipping Equity Expiry Check.");
      }

      console.log(`[cron] Running EQUITY LONGTERM EXPIRY Check (3:20 PM)`);

      const now = new Date();

      await processCandidates(
        {
          product: { $in: ["CNC", "NRML"] },
          status: { $in: ["OPEN", "EXECUTED", "HOLD"] },
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
  // 3. INTRADAY SQUARE OFF - MCX MARKET
  // Time: 11:00 PM Mon-Fri (business cutoff)
  // =========================================================
  cron.schedule("0 23 * * 1-5", async () => {
    await withLock("cron:squareoff:mcx-close-2300", 240, async () => {
      if (!isTradingDay(new Date())) {
        return console.log("[cron] Market holiday, skipping MCX Intraday Squareoff.");
      }

      console.log(`[cron] Running MCX INTRADAY Auto-Squareoff (11:00 PM)`);

      await processCandidates(
        {
          category: "INTRADAY",
          status: { $in: ["OPEN", "EXECUTED"] },
          segment: { $regex: /^MCX/ }
        },
        "OPEN_INTRADAY_MCX"
      );
    });
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // =========================================================
  // 5. MIDNIGHT CLEANUP & EXPIRY FALLBACK (Daily 12:02 AM)
  // Safety pass: catches any expiry that was missed during market hours.
  // =========================================================
  cron.schedule("2 0 * * *", async () => {
    await withLock("cron:squareoff:midnight-0002", 480, async () => {
      console.log(`[cron] Running Midnight Maintenance`);

      // A. Intraday HOLD cleanup
      await processCandidates(
        {
          category: "INTRADAY",
          status: "HOLD"
        },
        "INTRADAY_HOLD_CLEANUP"
      );

      // B. Overnight / Delivery / F&O expiry fallback (canonical + legacy)
      const now = new Date();
      await processCandidates(
        {
          product: { $in: ["NRML", "CNC"] },
          status: { $in: ["OPEN", "EXECUTED", "HOLD"] },
          $or: [
            { validity_expires_at: { $lte: now } },
            // Legacy: orders where field never existed
            { validity_expires_at: { $exists: false } },
            // Orders with field explicitly null (F&O placed without expiry data)
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
