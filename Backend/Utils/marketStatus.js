import { getStandardMarketStatus, isStandardMarketOpen } from './tradingSession.js';

export function getISTTime(date = new Date()) {
  return getStandardMarketStatus(date).istNow;
}

export function getISTDateString(date = new Date()) {
  return getISTTime(date).toLocaleDateString('en-CA');
}

export function isMarketOpen(date = new Date()) {
  return isStandardMarketOpen(date);
}

export function logMarketStatus(date = new Date()) {
  const status = getStandardMarketStatus(date);
  const isOpen = status.isOpen;
  return isOpen;
}

export { getStandardMarketStatus };

