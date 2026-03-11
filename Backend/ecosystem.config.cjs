// Backend/ecosystem.config.cjs
//
// TWO MODES:
//
//  1. Single instance (local dev, default):
//       pm2 start index.js --name wolf-backend
//     All roles enabled by default. One port. No conflicts.
//
//  2. Split mode (production simulation / Render equivalent):
//       pm2 start ecosystem.config.cjs
//     Requires local Redis running (REDIS_URL in .env).
//     wolf-worker owns feed + crons + triggers on port 8082 (internal only).
//     wolf-api serves all client HTTP + Socket.IO on port 8080.
//     Frontend always points to port 8080 only.
//
// PORT NOTE:
//   wolf-worker runs on PORT 8082 to avoid PM2 port conflict.
//   Clients NEVER connect to 8082 — the Redis adapter bridges
//   market ticks from wolf-worker to wolf-api clients transparently.
//
// SCALING NOTE:
//   wolf-api instances: safe to increase (stateless HTTP + Socket.IO via Redis).
//   wolf-worker instances: always keep at 1 — it owns the Kite feed and crons.

module.exports = {
  apps: [

    // ─────────────────────────────────────────────────────────────────────────
    // WORKER — Singleton. Owns Kite feed, all crons, order trigger engine.
    // Never scale above 1 instance.
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'OC-Worker',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',          // fork = independent process, not cluster
      watch: false,
      autorestart: true,
      max_restarts: 10,           // stop restart loop after 10 failures
      min_uptime: '10s',          // must stay up 10s to count as a successful start
      restart_delay: 4000,        // wait 4s between crash restarts
      kill_timeout: 8000,         // 8s graceful shutdown before SIGKILL
      error_file: 'logs/worker-error.log',
      out_file: 'logs/worker-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 8082,               // internal only — no client ever connects here
        ENABLE_WS_FEED: 'true',
        ENABLE_CRONS: 'true',
        ENABLE_ORDER_TRIGGER_ENGINE: 'true',
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // API — Stateless HTTP + Socket.IO (synced via Redis adapter).
    // Safe to scale instances up. Clients always connect here.
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'OC-Api',
      script: 'index.js',
      instances: 4,               // 2 for local dev; increase on Render as needed
      exec_mode: 'cluster',       // cluster = PM2 master shares port 8080
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 8000,
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        // PORT not set — reads from config.js or defaults to 8081 in index.js
        // Set PORT in your .env file (e.g. PORT=8080)
        ENABLE_WS_FEED: 'false',
        ENABLE_CRONS: 'false',
        ENABLE_ORDER_TRIGGER_ENGINE: 'false',
      },
    },

  ],
};
