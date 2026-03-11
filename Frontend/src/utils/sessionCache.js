const CACHE_PREFIX = 'customer_view_cache:';

const getCacheKey = (key) => `${CACHE_PREFIX}${key}`;

export const readSessionCache = (key, ttlMs) => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(getCacheKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const timestamp = Number(parsed?.timestamp);
    if (!Number.isFinite(timestamp)) {
      window.sessionStorage.removeItem(getCacheKey(key));
      return null;
    }

    const ageMs = Date.now() - timestamp;
    if (Number.isFinite(ttlMs) && ttlMs > 0 && ageMs > ttlMs) {
      window.sessionStorage.removeItem(getCacheKey(key));
      return null;
    }

    return {
      data: parsed?.data ?? null,
      ageMs,
      timestamp,
    };
  } catch {
    return null;
  }
};

export const writeSessionCache = (key, data) => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      getCacheKey(key),
      JSON.stringify({
        timestamp: Date.now(),
        data,
      })
    );
  } catch {
    // Ignore storage quota / serialization failures.
  }
};

export const clearSessionCache = (key) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getCacheKey(key));
  } catch {
    // Ignore storage failures.
  }
};
