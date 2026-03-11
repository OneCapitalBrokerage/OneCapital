const IST_TIME_ZONE = 'Asia/Kolkata';
const MARKET_OPEN_TOTAL_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_TOTAL_MINUTES = 15 * 60 + 15;

// Sync this list with Backend/cron/marketCalendar.js.
const MARKET_HOLIDAYS = new Set([
  '2025-01-26',
  '2025-02-26',
  '2025-03-14',
  '2025-03-31',
  '2025-04-06',
  '2025-04-10',
  '2025-04-14',
  '2025-04-18',
  '2025-05-01',
  '2025-06-07',
  '2025-07-06',
  '2025-08-15',
  '2025-08-27',
  '2025-10-02',
  '2025-10-21',
  '2025-10-22',
  '2025-11-05',
  '2025-12-25',
  '2026-01-26',
  '2026-03-03',
  '2026-03-26',
  '2026-03-31',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-09-14',
  '2026-10-02',
  '2026-10-20',
  '2026-11-10',
  '2026-11-24',
  '2026-12-25',
]);

const toIstPseudoDate = (value = new Date()) =>
  new Date(new Date(value).toLocaleString('en-US', { timeZone: IST_TIME_ZONE }));

const getIstDateString = (value = new Date()) =>
  new Date(value).toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });

const toMinutes = (dateObj) => (dateObj.getHours() * 60) + dateObj.getMinutes();

export const getMarketStatusIST = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value);
  const istNow = toIstPseudoDate(now);
  const dayOfWeek = istNow.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const dateKey = getIstDateString(now);
  const isHoliday = MARKET_HOLIDAYS.has(dateKey);
  const isTradingDay = !isWeekend && !isHoliday;
  const totalMinutes = toMinutes(istNow);
  const isWithinHours =
    totalMinutes >= MARKET_OPEN_TOTAL_MINUTES &&
    totalMinutes <= MARKET_CLOSE_TOTAL_MINUTES;
  const isOpen = isTradingDay && isWithinHours;

  let reason = 'open';
  if (!isTradingDay) reason = isHoliday ? 'holiday' : 'weekend';
  else if (!isWithinHours) reason = 'outside_hours';

  return {
    isOpen,
    isTradingDay,
    isWeekend,
    isHoliday,
    isWithinHours,
    reason,
    marketOpen: '09:15',
    marketClose: '15:15',
    timezone: IST_TIME_ZONE,
    dateKey,
    istNow,
  };
};

export const isMarketOpenIST = (value = new Date()) =>
  getMarketStatusIST(value).isOpen;

