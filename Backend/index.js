import 'dotenv/config';
import dotenv from "dotenv";
import http from "http";
import { createClient } from "redis";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { createIO, setFeedSubscriber, setFeedUnsubscriber, setFeedModeSetter, setSubCommandPublisher, syncGlobalWatchlistTokens } from "./sockets/io.js";
import { KiteWebSocket } from './services/KiteWebSocket.js';
import { startMasterRefreshCron } from './cron/masterRefresh.js';
import { setFeedInstance } from "./services/feedState.js";
import { config } from "./config.js";
import { stockSquareoffScheduler } from './cron/Scheduler/cron-squareoff.js';
import FundCronJobs from './cron/FundScheduler/fundCorn.js';
import { isMarketOpen } from './Utils/marketStatus.js';
import { startAutoLoginCron, checkAndRefreshOnStartup } from './cron/autoLoginCron.js';
import {
  ORDER_TRIGGER_COMMAND_CHANNEL,
  applyTriggerCommand,
  configureOrderTriggerSync,
  loadOpenOrders,
  reconcileOpenOrderTriggers,
} from './Utils/OrderManager.js';

// ---------------------------------------------------------------------------
// Process role toggles — set these env vars to 'false' on API-only instances
// to prevent duplicate feed connections and cron execution in multi-instance mode.
//
//   API-only instance (scale horizontally, stateless HTTP):
//     ENABLE_WS_FEED=false  ENABLE_CRONS=false  ENABLE_ORDER_TRIGGER_ENGINE=false
//
//   Worker instance (keep as single instance):
//     ENABLE_WS_FEED=true  ENABLE_CRONS=true  ENABLE_ORDER_TRIGGER_ENGINE=true
//
//   Single-instance / default (no env vars needed — all default to enabled):
//     (no overrides required)
// ---------------------------------------------------------------------------
const ENABLE_WS_FEED             = process.env.ENABLE_WS_FEED             !== 'false';
const ENABLE_CRONS               = process.env.ENABLE_CRONS               !== 'false';
const ENABLE_ORDER_TRIGGER_ENGINE = process.env.ENABLE_ORDER_TRIGGER_ENGINE !== 'false';

const app = createApp();
const server = http.createServer(app);

// createIO now returns { io, market } (market = namespace)
const { io, market } = await createIO(server);

// Attach socket.io namespace to express app for controllers to emit events
app.set('io', market);

// --- Market feed (Kite WebSocket) ---
export let lmf = null;
if (ENABLE_WS_FEED) {
  lmf = new KiteWebSocket();
  setFeedSubscriber((list, subscriptionType) => lmf.subscribe(list, subscriptionType));
  setFeedUnsubscriber((list) => lmf.unsubscribe(list));
  setFeedModeSetter((list, mode) => lmf.setMode(list, mode));
  setFeedInstance(lmf);
} else {
  console.log('[Startup] WS feed disabled (ENABLE_WS_FEED=false)');
}

// --- Subscription command bridge ---
// In split mode, API instances cannot call lmf.subscribe() directly.
// Bridge: wolf-api publishes subscribe commands to Redis → wolf-worker executes them on lmf.
// This is subscribe-command-only (not per-tick) so there is zero impact on tick latency.
let triggerCommandPublisher = null;
if (process.env.REDIS_URL) {
  if (ENABLE_WS_FEED) {
    // Wolf-worker: listen for subscribe commands forwarded by API instances
    try {
      const subCmdClient = createClient({ url: process.env.REDIS_URL });
      subCmdClient.on('error', err => console.error('[SubBridge] Redis error:', err.message));
      await subCmdClient.connect();
      await subCmdClient.subscribe('kite:subscribe', (message) => {
        try {
          const { list, subscriptionType } = JSON.parse(message);
          if (lmf) lmf.subscribe(list, subscriptionType);
        } catch (e) { /* ignore malformed messages */ }
      });
      await subCmdClient.subscribe('kite:unsubscribe', (message) => {
        try {
          const { list } = JSON.parse(message);
          if (lmf) lmf.unsubscribe(list);
        } catch (e) { /* ignore malformed messages */ }
      });
      await subCmdClient.subscribe('kite:set_mode', (message) => {
        try {
          const { list, mode } = JSON.parse(message);
          if (lmf) lmf.setMode(list, mode);
        } catch (e) { /* ignore malformed messages */ }
      });
      await subCmdClient.subscribe('watchlist:global_sync', async () => {
        try {
          await syncGlobalWatchlistTokens();
        } catch (e) { /* ignore sync errors */ }
      });
      if (ENABLE_ORDER_TRIGGER_ENGINE) {
        await subCmdClient.subscribe(ORDER_TRIGGER_COMMAND_CHANNEL, async (message) => {
          try {
            const command = JSON.parse(message);
            await applyTriggerCommand(command);
          } catch (e) {
            console.error('[TriggerSync] Failed to apply command:', e?.message || e);
          }
        });
        console.log('[Startup] ✅ Trigger sync channel active (worker)');
      }
      console.log('[Startup] ✅ Subscription bridge active (worker — listening for commands)');
    } catch (err) {
      console.error('[Startup] Subscription bridge setup failed:', err.message);
    }
  } else {
    // Wolf-api: publish subscribe commands for wolf-worker to consume
    try {
      const pubCmdClient = createClient({ url: process.env.REDIS_URL });
      pubCmdClient.on('error', err => console.error('[SubBridge] Redis error:', err.message));
      await pubCmdClient.connect();
      setSubCommandPublisher(pubCmdClient);
      triggerCommandPublisher = pubCmdClient;
      console.log('[Startup] ✅ Subscription bridge active (api — publishing commands)');
    } catch (err) {
      console.error('[Startup] Subscription bridge setup failed:', err.message);
    }
  }
}

configureOrderTriggerSync({
  engineEnabled: ENABLE_ORDER_TRIGGER_ENGINE,
  publisher: triggerCommandPublisher,
});

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

await mongoose.connect(MONGODB_URI);
console.log("✅ Mongo connected");

// --- Order trigger engine ---
if (ENABLE_ORDER_TRIGGER_ENGINE) {
  await loadOpenOrders();
  const reconcileMsRaw = Number.parseInt(process.env.ORDER_TRIGGER_RECONCILE_MS || '30000', 10);
  const reconcileMs = Number.isFinite(reconcileMsRaw) && reconcileMsRaw >= 5000 ? reconcileMsRaw : 30000;
  const reconcileTimer = setInterval(() => {
    reconcileOpenOrderTriggers().catch((error) => {
      console.error('[OrderManager] Reconciliation failed:', error?.message || error);
    });
  }, reconcileMs);
  if (typeof reconcileTimer.unref === 'function') reconcileTimer.unref();
  console.log(`[Startup] Order trigger reconciliation scheduled every ${reconcileMs}ms`);
} else {
  console.log('[Startup] Order trigger engine disabled (ENABLE_ORDER_TRIGGER_ENGINE=false)');
}

// Check and refresh token on startup if needed
await checkAndRefreshOnStartup();

// Connect to Kite WebSocket after DB is ready
if (ENABLE_WS_FEED && lmf) {
  lmf.connect();
  // Subscribe all watchlist + index tokens globally (queued until Kite connects)
  syncGlobalWatchlistTokens().catch(err =>
    console.error('[GlobalRetain] Boot sync failed:', err.message)
  );
}

const PORT = Number(config?.port || process.env.PORT || 8081);
server.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);

  // --- Cron jobs (run only on designated worker instance) ---
  if (ENABLE_CRONS) {
    startAutoLoginCron();
    console.log("✅ Auto-login cron scheduled (7:55 AM IST daily)");
    FundCronJobs();
    stockSquareoffScheduler();
    startMasterRefreshCron();
  } else {
    console.log('[Startup] Cron jobs disabled (ENABLE_CRONS=false)');
  }

  console.log(`[Market Status] ${isMarketOpen() ? "🟢 OPEN" : "🔴 CLOSED"}`);
});
