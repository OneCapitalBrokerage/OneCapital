const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const toValidDate = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const round2 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
};

const getIstClockDate = (utcDate = new Date()) => {
  const safeUtcDate = toValidDate(utcDate) || new Date();
  return new Date(safeUtcDate.getTime() + IST_OFFSET_MS);
};

const getMondayStartIstUtc = (nowUtc = new Date()) => {
  const istClock = getIstClockDate(nowUtc);
  const istWeekday = istClock.getUTCDay(); // 0=Sun ... 6=Sat in IST clock-space
  const daysSinceMonday = (istWeekday + 6) % 7;

  const mondayIstClock = new Date(istClock);
  mondayIstClock.setUTCHours(0, 0, 0, 0);
  mondayIstClock.setUTCDate(mondayIstClock.getUTCDate() - daysSinceMonday);

  return new Date(mondayIstClock.getTime() - IST_OFFSET_MS);
};

const getTradingWeekRangeFromDate = (nowUtc = new Date()) => {
  const weekStartUtc = getMondayStartIstUtc(nowUtc);
  const weekEndUtc = new Date(weekStartUtc.getTime() + WEEK_MS);
  return { weekStartUtc, weekEndUtc };
};

const getSettlementWindowRangeFromDate = (nowUtc = new Date()) => {
  const safeNow = toValidDate(nowUtc) || new Date();
  const istClock = getIstClockDate(safeNow);
  const istWeekday = istClock.getUTCDay(); // 0=Sun ... 6=Sat in IST clock-space
  const daysSinceSaturday = (istWeekday + 1) % 7;

  const saturdayIstClock = new Date(istClock);
  saturdayIstClock.setUTCHours(0, 0, 0, 0);
  saturdayIstClock.setUTCDate(saturdayIstClock.getUTCDate() - daysSinceSaturday);

  const mondayIstClock = new Date(saturdayIstClock);
  mondayIstClock.setUTCDate(mondayIstClock.getUTCDate() + 2);

  return {
    windowStartUtc: new Date(saturdayIstClock.getTime() - IST_OFFSET_MS),
    windowEndUtc: new Date(mondayIstClock.getTime() - IST_OFFSET_MS),
  };
};

const isWithinWeekendSettlementWindow = (nowUtc = new Date()) => {
  const safeNow = toValidDate(nowUtc);
  if (!safeNow) return false;
  const { windowStartUtc, windowEndUtc } = getSettlementWindowRangeFromDate(safeNow);
  return safeNow >= windowStartUtc && safeNow < windowEndUtc;
};

const parseSettlementMetadataFromNotes = (notes) => {
  const raw = String(notes || '').trim();
  if (!raw) return null;

  const parseJson = (input) => {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object') return parsed;
      return null;
    } catch {
      return null;
    }
  };

  const direct = parseJson(raw);
  if (direct) return direct;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return parseJson(jsonMatch[0]);
};

const buildSettlementMetadataNotes = ({
  mode = 'manual',
  weekStartUtc,
  weekEndUtc,
  cycleStartUtc,
  cycleEndUtc,
  settledAtUtc,
  brokerIdStr = '',
  brokerId = '',
  customerIdStr = '',
  runRef = '',
  note = '',
} = {}) => {
  const payload = {
    event: 'weekly_settlement',
    version: 2,
    mode,
    weekStart: weekStartUtc ? new Date(weekStartUtc).toISOString() : '',
    weekEnd: weekEndUtc ? new Date(weekEndUtc).toISOString() : '',
    cycleStart: cycleStartUtc ? new Date(cycleStartUtc).toISOString() : '',
    cycleEnd: cycleEndUtc ? new Date(cycleEndUtc).toISOString() : '',
    settledAt: settledAtUtc ? new Date(settledAtUtc).toISOString() : new Date().toISOString(),
    brokerIdStr: String(brokerIdStr || ''),
    brokerId: String(brokerId || ''),
    customerIdStr: String(customerIdStr || ''),
    runRef: String(runRef || ''),
    note: String(note || ''),
  };
  return JSON.stringify(payload);
};

const toSettlementRow = (transaction) => {
  if (!transaction || String(transaction.type || '').toLowerCase() !== 'weekly_settlement') return null;
  const timestamp = toValidDate(transaction.timestamp || transaction.createdAt);
  if (!timestamp) return null;

  return {
    transaction,
    timestamp,
    metadata: parseSettlementMetadataFromNotes(transaction.notes),
  };
};

const getLatestWeeklySettlement = (transactions = [], predicate = null) => {
  let latest = null;
  for (const tx of transactions || []) {
    const row = toSettlementRow(tx);
    if (!row) continue;
    if (typeof predicate === 'function' && !predicate(row)) continue;
    if (!latest || row.timestamp > latest.timestamp) latest = row;
  }
  return latest;
};

const hasSettlementInRange = ({ transactions = [], rangeStartUtc, rangeEndUtc }) => {
  const start = toValidDate(rangeStartUtc);
  const end = toValidDate(rangeEndUtc);
  if (!start || !end) return null;
  return getLatestWeeklySettlement(transactions, ({ timestamp }) => timestamp >= start && timestamp < end);
};

const hasSettlementInWeekRange = ({ transactions = [], weekStartUtc, weekEndUtc }) =>
  hasSettlementInRange({
    transactions,
    rangeStartUtc: weekStartUtc,
    rangeEndUtc: weekEndUtc,
  });

const hasSettlementInSettlementWindow = ({ transactions = [], windowStartUtc, windowEndUtc }) =>
  hasSettlementInRange({
    transactions,
    rangeStartUtc: windowStartUtc,
    rangeEndUtc: windowEndUtc,
  });

const resolveCurrentWeeklyBoundary = ({ transactions = [], nowUtc = new Date() } = {}) => {
  const safeNow = toValidDate(nowUtc) || new Date();
  const { weekStartUtc, weekEndUtc } = getTradingWeekRangeFromDate(safeNow);
  const latestSettlement = getLatestWeeklySettlement(transactions, ({ timestamp }) => timestamp <= safeNow);

  if (!latestSettlement) {
    return {
      boundaryStartUtc: weekStartUtc,
      boundaryType: 'trading_week_start',
      weekStartUtc,
      weekEndUtc,
      latestSettlement: null,
    };
  }

  const mode = String(latestSettlement.metadata?.mode || '').toLowerCase();
  const boundaryType = mode === 'auto' ? 'auto_settlement' : 'manual_settlement';

  return {
    boundaryStartUtc: latestSettlement.timestamp,
    boundaryType,
    weekStartUtc,
    weekEndUtc,
    latestSettlement,
  };
};

const createSettlementReference = (dateUtc = new Date()) => {
  const istClock = getIstClockDate(dateUtc);
  const y = istClock.getUTCFullYear();
  const m = String(istClock.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istClock.getUTCDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WS-${y}${m}${d}-${rand}`;
};

export {
  round2,
  toValidDate,
  getMondayStartIstUtc,
  getTradingWeekRangeFromDate,
  getSettlementWindowRangeFromDate,
  isWithinWeekendSettlementWindow,
  parseSettlementMetadataFromNotes,
  buildSettlementMetadataNotes,
  getLatestWeeklySettlement,
  hasSettlementInRange,
  hasSettlementInWeekRange,
  hasSettlementInSettlementWindow,
  resolveCurrentWeeklyBoundary,
  createSettlementReference,
};
