import BrokerModel from '../Model/Auth/BrokerModel.js';
import CustomerModel from '../Model/Auth/CustomerModel.js';
import FundModel from '../Model/FundManagement/FundModel.js';
import { writeAuditFailure, writeAuditSuccess } from '../Utils/AuditLogger.js';
import {
  buildSettlementMetadataNotes,
  createSettlementReference,
  getSettlementWindowRangeFromDate,
  getTradingWeekRangeFromDate,
  hasSettlementInSettlementWindow,
  isWithinWeekendSettlementWindow,
  round2,
  toValidDate,
} from '../Utils/weeklySettlement.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatUtcStamp = (value) => {
  const date = toValidDate(value);
  return date ? date.toISOString() : '';
};

const shouldRunAutoSettlement = (broker) => {
  const configured = broker?.settings?.settlement?.auto_weekly_settlement_enabled;
  if (configured === undefined || configured === null) return true;
  return Boolean(configured);
};

const ensureEffectiveAtWithinWeekendWindow = (effectiveAt) => {
  if (!isWithinWeekendSettlementWindow(effectiveAt)) {
    throw new Error('Weekend settlement can run only between Saturday 00:00 IST and Monday 00:00 IST.');
  }
};

const runWeeklySettlementForBroker = async ({
  brokerId,
  brokerIdStr,
  customerIdStr = null,
  mode = 'manual',
  effectiveAt = new Date(),
  note = '',
  force = false,
  req = null,
} = {}) => {
  const safeEffectiveAt = toValidDate(effectiveAt);
  if (!safeEffectiveAt) {
    throw new Error('Invalid effectiveAt date for weekly settlement.');
  }
  if (!brokerIdStr) {
    throw new Error('brokerIdStr is required for weekly settlement.');
  }

  ensureEffectiveAtWithinWeekendWindow(safeEffectiveAt);

  const { weekStartUtc, weekEndUtc } = getTradingWeekRangeFromDate(safeEffectiveAt);
  const { windowStartUtc, windowEndUtc } = getSettlementWindowRangeFromDate(safeEffectiveAt);
  const runRef = createSettlementReference(safeEffectiveAt);

  const fundQuery = { broker_id_str: brokerIdStr };
  if (customerIdStr) fundQuery.customer_id_str = customerIdStr;

  const funds = await FundModel.find(fundQuery)
    .select('_id customer_id customer_id_str broker_id_str pnl_balance transactions last_calculated_at');

  // Build a settlement-enabled lookup for all affected customers
  const customerIdStrs = funds.map((f) => f.customer_id_str).filter(Boolean);
  const settlementMap = await CustomerModel
    .find({ customer_id_str: { $in: customerIdStrs } })
    .select('customer_id_str settlement_enabled')
    .lean()
    .then((docs) => new Map(docs.map((d) => [d.customer_id_str, d.settlement_enabled])));

  let created = 0;
  let skippedExisting = 0;
  let skippedDisabled = 0;
  let failed = 0;
  const errors = [];

  for (const fund of funds) {
    try {
      if (!Array.isArray(fund.transactions)) fund.transactions = [];

      // Skip customers with settlement explicitly disabled (=== false; undefined treated as true)
      if (settlementMap.get(fund.customer_id_str) === false) {
        skippedDisabled += 1;
        continue;
      }

      const existingInWindow = hasSettlementInSettlementWindow({
        transactions: fund.transactions,
        windowStartUtc,
        windowEndUtc,
      });

      if (existingInWindow && !force) {
        skippedExisting += 1;
        continue;
      }

      fund.transactions.push({
        type: 'weekly_settlement',
        amount: round2(toNumber(fund.pnl_balance)),
        notes: buildSettlementMetadataNotes({
          mode,
          weekStartUtc,
          weekEndUtc,
          cycleStartUtc: windowStartUtc,
          cycleEndUtc: windowEndUtc,
          settledAtUtc: safeEffectiveAt,
          brokerIdStr,
          brokerId: brokerId || '',
          customerIdStr: fund.customer_id_str || '',
          runRef,
          note,
        }),
        status: 'completed',
        reference: runRef,
        processedBy: brokerId || undefined,
        timestamp: safeEffectiveAt,
      });
      fund.last_calculated_at = safeEffectiveAt;
      // Reset pnl_balance so the next session starts from a clean realized P&L ledger.
      fund.pnl_balance = 0;

      await fund.save();
      created += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        fundId: fund._id?.toString?.() || '',
        customerIdStr: fund.customer_id_str || '',
        error: error?.message || String(error),
      });
    }
  }

  const summary = {
    runRef,
    mode,
    weekStart: weekStartUtc.toISOString(),
    weekEnd: weekEndUtc.toISOString(),
    cycleStart: windowStartUtc.toISOString(),
    cycleEnd: windowEndUtc.toISOString(),
    settledAt: safeEffectiveAt.toISOString(),
    totalFunds: funds.length,
    created,
    skippedExisting,
    skippedDisabled,
    failed,
    force: Boolean(force),
    note: String(note || ''),
    errors,
    ...(customerIdStr ? { customerIdStr } : {}),
  };

  await writeAuditSuccess({
    req,
    type: 'transaction',
    eventType: 'WEEKLY_SETTLEMENT_RUN',
    category: 'funds',
    message: `Weekly settlement run ${runRef} for broker ${brokerIdStr} completed in ${mode} mode. ${created} fund records were settled, ${skippedExisting} were already settled in the current weekend cycle, ${skippedDisabled} were skipped (settlement disabled), and ${failed} failed.`,
    entity: {
      type: 'settlement_run',
      ref: runRef,
    },
    broker: {
      broker_id: brokerId,
      broker_id_str: brokerIdStr,
    },
    metadata: summary,
    note: `Trading week ${formatUtcStamp(weekStartUtc)} to ${formatUtcStamp(weekEndUtc)}. Settlement cycle ${formatUtcStamp(windowStartUtc)} to ${formatUtcStamp(windowEndUtc)}. Settled at ${formatUtcStamp(safeEffectiveAt)}.${note ? ` ${note}` : ''}`,
    source: req ? 'api' : 'system',
  });

  if (failed > 0) {
    await writeAuditFailure({
      req,
      type: 'transaction',
      eventType: 'WEEKLY_SETTLEMENT_PARTIAL_FAILURE',
      category: 'funds',
      message: `Weekly settlement run ${runRef} for broker ${brokerIdStr} completed with ${failed} failed fund updates.`,
      entity: {
        type: 'settlement_run',
        ref: runRef,
      },
      broker: {
        broker_id: brokerId,
        broker_id_str: brokerIdStr,
      },
      metadata: {
        runRef,
        failed,
        errors,
      },
      note: 'Some customer fund records could not be updated during weekly settlement.',
      source: req ? 'api' : 'system',
    });
  }

  return summary;
};

const runAutoWeeklySettlementForAllBrokers = async ({ effectiveAt = new Date() } = {}) => {
  const brokers = await BrokerModel.find({})
    .select('_id broker_id settings status');

  const summary = {
    totalBrokers: brokers.length,
    attempted: 0,
    skipped: 0,
    failed: 0,
    runs: [],
  };

  for (const broker of brokers) {
    if (String(broker.status || '').toLowerCase() === 'blocked') {
      summary.skipped += 1;
      continue;
    }

    if (!shouldRunAutoSettlement(broker)) {
      summary.skipped += 1;
      continue;
    }

    summary.attempted += 1;
    try {
      const run = await runWeeklySettlementForBroker({
        brokerId: broker._id,
        brokerIdStr: broker.broker_id,
        mode: 'auto',
        effectiveAt,
        note: 'Auto weekly settlement (Sunday 00:00 IST)',
        force: false,
        req: null,
      });
      summary.runs.push({
        brokerIdStr: broker.broker_id,
        ...run,
      });
    } catch (error) {
      summary.failed += 1;
      summary.runs.push({
        brokerIdStr: broker.broker_id,
        error: error?.message || String(error),
      });
    }
  }

  return summary;
};

export {
  runWeeklySettlementForBroker,
  runAutoWeeklySettlementForAllBrokers,
};
