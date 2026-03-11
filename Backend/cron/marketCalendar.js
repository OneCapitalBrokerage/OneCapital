// NSE Trading Holidays
// Source: https://www.nseindia.com/resources/exchange-communication-holidays
// Last Updated: 2026-02-10

const marketHolidays = [
  // 2025
  "2025-01-26",
  "2025-02-26",
  "2025-03-14",
  "2025-03-31",
  "2025-04-06",
  "2025-04-10",
  "2025-04-14",
  "2025-04-18",
  "2025-05-01",
  "2025-06-07",
  "2025-07-06",
  "2025-08-15",
  "2025-08-27",
  "2025-10-02",
  "2025-10-21",
  "2025-10-22",
  "2025-11-05",
  "2025-12-25",
  // 2026
  "2026-01-26", // Republic Day
  "2026-03-03", // Holi
  "2026-03-26", // Ram Navami
  "2026-03-31", // Mahavir Jayanti
  "2026-04-03", // Good Friday
  "2026-04-14", // Dr. Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day
  "2026-05-28", // Eid ul-Adha
  "2026-06-26", // Muharram
  "2026-09-14", // Ganesh Chaturthi
  "2026-10-02", // Gandhi Jayanti
  "2026-10-20", // Dasara
  "2026-11-10", // Diwali-Balipratipada
  "2026-11-24", // Guru Nanak Jayanti
  "2026-12-25", // Christmas
];
const holidaySet = new Set(marketHolidays);

export function isTradingDay(dateObj = new Date()) {
  const indianDateStr = dateObj.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }); 

  const indianDate = new Date(dateObj.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const dayOfWeek = indianDate.getDay();

  // Weekend Check (Sat=6, Sun=0)
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  // Holiday Check
  if (holidaySet.has(indianDateStr)) return false;

  return true;
}
