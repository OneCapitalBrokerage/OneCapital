import { isTradingDay } from '../cron/marketCalendar.js';
import { isMCX } from './mcx/resolver.js';

const IST_TIME_ZONE = 'Asia/Kolkata';
const MARKET_OPEN_TOTAL_MINUTES = 9 * 60 + 15;  // 09:15
const MARKET_CLOSE_TOTAL_MINUTES = 15 * 60 + 15; // 15:15
const MCX_MARKET_OPEN_TOTAL_MINUTES = 9 * 60; // 09:00
const MCX_MARKET_CLOSE_TOTAL_MINUTES = 23 * 60;  // 23:00 (business cutoff)

const toIstPseudoDate = (value = new Date()) =>
  new Date(new Date(value).toLocaleString('en-US', { timeZone: IST_TIME_ZONE }));

const toMinutes = (dateObj) => (dateObj.getHours() * 60) + dateObj.getMinutes();

export const getMarketOpenTimeParts = ({ exchange, segment } = {}) => {
  const mcx = isMCX({ exchange, segment });
  return {
    hour: 9,
    minute: mcx ? 0 : 15,
    value: mcx ? '09:00' : '09:15',
    label: mcx ? '9:00 AM' : '9:15 AM',
    messageLabel: mcx ? '9:00AM' : '9:15AM',
    sessionType: mcx ? 'MCX' : 'STANDARD',
  };
};

export const getMarketCloseTimeParts = ({ exchange, segment } = {}) => {
  const mcx = isMCX({ exchange, segment });
  return {
    hour: mcx ? 23 : 15,
    minute: mcx ? 0 : 15,
    value: mcx ? '23:00' : '15:15',
    label: mcx ? '11:00 PM' : '3:15 PM',
    messageLabel: mcx ? '11:00PM' : '3:15PM',
    sessionType: mcx ? 'MCX' : 'STANDARD',
  };
};

export const formatMarketClosedMessage = ({ exchange, segment } = {}) => {
  const { messageLabel: openLabel, sessionType } = getMarketOpenTimeParts({ exchange, segment });
  const { messageLabel: closeLabel } = getMarketCloseTimeParts({ exchange, segment });
  const prefix = sessionType === 'MCX' ? 'MCX Market Closed' : 'Market Closed';
  return `${prefix}. Open From ${openLabel} To ${closeLabel} On Working Days`;
};

const getCloseReason = ({ tradingDay, withinHours }) => {
  if (!tradingDay) return 'closed_day';
  if (!withinHours) return 'outside_hours';
  return 'open';
};

export const getStandardMarketStatus = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value);
  const istNow = toIstPseudoDate(now);
  const { value: marketOpen } = getMarketOpenTimeParts();
  const { value: marketClose } = getMarketCloseTimeParts();
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
    marketOpen,
    marketClose,
    sessionType: 'STANDARD',
  };
};

export const getMcxMarketStatus = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value);
  const istNow = toIstPseudoDate(now);
  const { value: marketOpen } = getMarketOpenTimeParts({ exchange: 'MCX' });
  const { value: marketClose } = getMarketCloseTimeParts({ exchange: 'MCX' });
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
    marketOpen,
    marketClose,
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
