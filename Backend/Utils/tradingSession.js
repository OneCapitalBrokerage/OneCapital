import { isTradingDay } from '../cron/marketCalendar.js';
import { isMCX } from './mcx/resolver.js';

const IST_TIME_ZONE = 'Asia/Kolkata';
const MARKET_OPEN_TOTAL_MINUTES = 9 * 60 + 15;  // 09:15
const MARKET_CLOSE_TOTAL_MINUTES = 15 * 60 + 15; // 15:15
const MCX_MARKET_OPEN_TOTAL_MINUTES = 9 * 60 + 15; // 09:15
const MCX_MARKET_CLOSE_TOTAL_MINUTES = 23 * 60;  // 23:00 (business cutoff)

const toIstPseudoDate = (value = new Date()) =>
  new Date(new Date(value).toLocaleString('en-US', { timeZone: IST_TIME_ZONE }));

const toMinutes = (dateObj) => (dateObj.getHours() * 60) + dateObj.getMinutes();

const getCloseReason = ({ tradingDay, withinHours }) => {
  if (!tradingDay) return 'closed_day';
  if (!withinHours) return 'outside_hours';
  return 'open';
};

export const getStandardMarketStatus = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value);
  const istNow = toIstPseudoDate(now);
  const tradingDay = isTradingDay(now);
  const totalMinutes = toMinutes(istNow);
  const withinHours =
    totalMinutes >= MARKET_OPEN_TOTAL_MINUTES &&
    totalMinutes <= MARKET_CLOSE_TOTAL_MINUTES;

  return {
    isOpen: tradingDay && withinHours,
    tradingDay,
    withinHours,
    reason: getCloseReason({ tradingDay, withinHours }),
    istNow,
    timezone: IST_TIME_ZONE,
    marketOpen: '09:15',
    marketClose: '15:15',
    sessionType: 'STANDARD',
  };
};

export const getMcxMarketStatus = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value);
  const istNow = toIstPseudoDate(now);
  const tradingDay = isTradingDay(now);
  const totalMinutes = toMinutes(istNow);
  const withinHours =
    totalMinutes >= MCX_MARKET_OPEN_TOTAL_MINUTES &&
    totalMinutes <= MCX_MARKET_CLOSE_TOTAL_MINUTES;

  return {
    isOpen: tradingDay && withinHours,
    tradingDay,
    withinHours,
    reason: getCloseReason({ tradingDay, withinHours }),
    istNow,
    timezone: IST_TIME_ZONE,
    marketOpen: '09:15',
    marketClose: '23:00',
    sessionType: 'MCX',
  };
};

export const getMarketStatusForInstrument = ({ exchange, segment, now } = {}) => {
  const ts = now || new Date();
  if (isMCX({ exchange, segment })) return getMcxMarketStatus(ts);
  return getStandardMarketStatus(ts);
};

export const isStandardMarketOpen = (value = new Date()) =>
  getStandardMarketStatus(value).isOpen;
