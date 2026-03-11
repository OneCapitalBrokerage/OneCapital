import { isTradingDay } from '../cron/marketCalendar.js';

const IST_TIME_ZONE = 'Asia/Kolkata';
const MARKET_OPEN_TOTAL_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_TOTAL_MINUTES = 15 * 60 + 15;

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
  };
};

export const isStandardMarketOpen = (value = new Date()) =>
  getStandardMarketStatus(value).isOpen;

