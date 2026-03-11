// services/cronLock.js
// Distributed cron lock using Redis SET NX EX.
// Prevents duplicate cron execution when multiple instances start
// (e.g., brief overlap during Render deploys, or accidental double-worker start).
// Falls back to direct execution if Redis is unavailable.

import { createClient } from 'redis';

let lockClient = null;
let lockReady = false;

async function getLockClient() {
  if (lockClient && lockReady) return lockClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    lockClient = createClient({ url: redisUrl });
    lockClient.on('error', () => { lockReady = false; });
    lockClient.on('ready', () => { lockReady = true; });
    await lockClient.connect();
    return lockClient;
  } catch (err) {
    console.error('[CronLock] Redis connection failed:', err.message);
    lockClient = null;
    return null;
  }
}

/**
 * Run fn inside a distributed Redis lock.
 * If the lock is already held (another instance is running this job), skip silently.
 * Falls back to running fn directly if Redis is unavailable.
 *
 * @param {string} lockKey   - Unique key for this cron job (e.g. 'cron:squareoff:315pm')
 * @param {number} ttlSeconds - Lock TTL — should exceed max expected job duration
 * @param {Function} fn       - Async function to run under the lock
 */
export async function withLock(lockKey, ttlSeconds, fn) {
  const client = await getLockClient();

  if (!client || !lockReady) {
    console.warn(`[CronLock] Redis unavailable — running '${lockKey}' without distributed lock`);
    return fn();
  }

  // SET key 1 NX EX ttl — atomic acquire: returns 'OK' if acquired, null if already held
  const acquired = await client.set(lockKey, '1', { NX: true, EX: ttlSeconds });

  if (!acquired) {
    console.log(`[CronLock] '${lockKey}' already running on another instance — skipping`);
    return;
  }

  try {
    await fn();
  } finally {
    // Release lock so it doesn't block the next scheduled run unnecessarily
    await client.del(lockKey).catch(() => {});
  }
}
