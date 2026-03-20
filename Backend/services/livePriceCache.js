import { getFeedInstance } from './feedState.js';

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeToken = (value) => {
  if (value === null || value === undefined) return null;
  const token = String(value).trim();
  return token || null;
};

export function getCachedSnapshot(tokens = []) {
  const normalizedTokens = [...new Set(tokens.map(normalizeToken).filter(Boolean))];
  if (normalizedTokens.length === 0) return {};

  const feed = getFeedInstance();
  return feed?.getSnapshot?.(normalizedTokens) || {};
}

export function getCachedQuote(token, snapshot = null) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return null;

  if (snapshot && typeof snapshot === 'object' && snapshot[normalizedToken]) {
    return snapshot[normalizedToken];
  }

  const feed = getFeedInstance();
  return feed?.last?.get?.(normalizedToken) || null;
}

export function getCachedLtp(token, snapshot = null) {
  const quote = getCachedQuote(token, snapshot);
  const ltp = toNumber(quote?.ltp ?? quote?.last_price, 0);
  return {
    ltp: ltp > 0 ? ltp : 0,
    quote,
  };
}
