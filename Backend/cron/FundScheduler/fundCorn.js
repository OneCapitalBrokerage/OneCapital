import cron from 'node-cron';
import Fund from '../../Model/FundManagement/FundModel.js';
import Order from '../../Model/Trading/OrdersModel.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';
import { withLock } from '../../services/cronLock.js';
import { runAutoWeeklySettlementForAllBrokers } from '../../services/weeklySettlementService.js';
import { isMCX } from '../../Utils/mcx/resolver.js';

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v) => Number(toNumber(v).toFixed(2));

const ACTIVE_STATUSES = ['OPEN', 'EXECUTED', 'HOLD', 'PENDING'];
const INTRADAY_PRODUCTS = ['MIS'];
const DELIVERY_PRODUCTS = ['CNC', 'NRML'];

/**
 * Helper to detect if a symbol is an option
 */
const isOptionSymbol = (symbol) => {
  const sym = String(symbol || '').toUpperCase();
  return sym.endsWith('CE') || sym.endsWith('PE') || sym.endsWith('CALL') || sym.endsWith('PUT');
};

/**
 * Reconcile fund margin for a single customer.
 * Recomputes expected intraday/delivery used values from active orders,
 * corrects any drift, and logs corrections.
 *
 * Buckets reconciled:
 * - intraday.used_limit: Non-MCX MIS orders (equity intraday) - excluding options
 * - commodity_intraday.used_limit: MCX MIS orders (commodity intraday) - excluding options
 * - delivery.used_limit: Non-MCX CNC/NRML orders (equity delivery) - excluding options
 * - commodity_delivery.used_limit: MCX CNC/NRML orders (commodity delivery) - excluding options
 * - commodity_option.used: MCX option orders (all products)
 * - option_premium_used: Non-MCX option orders (all products)
 *
 * @param {Object} fund - Mongoose fund document (mutated in-memory; caller must save)
 * @returns {{ intradayFixed: boolean, commodityIntradayFixed: boolean, deliveryFixed: boolean, commodityFixed: boolean, commodityOptionFixed: boolean, optionPremiumFixed: boolean }}
 */
async function reconcileFundMargin(fund) {
  const { customer_id_str, broker_id_str } = fund;

  // Non-MCX MIS orders (excluding options) → reconcile intraday.used_limit (equity intraday)
  const activeEquityMisOrders = await Order.find({
    customer_id_str,
    broker_id_str,
    product: { $in: INTRADAY_PRODUCTS },
    status: { $in: ACTIVE_STATUSES },
    $nor: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
  }).select('margin_blocked symbol').lean();

  // Filter out options from equity MIS
  const activeEquityMisNonOptions = activeEquityMisOrders.filter(o => !isOptionSymbol(o.symbol));

  const expectedIntradayUsed = round2(
    activeEquityMisNonOptions.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
  );

  // MCX MIS orders (excluding options) → reconcile commodity_intraday.used_limit
  const activeMcxMisOrders = await Order.find({
    customer_id_str,
    broker_id_str,
    product: { $in: INTRADAY_PRODUCTS },
    status: { $in: ACTIVE_STATUSES },
    $or: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
  }).select('margin_blocked symbol exchange segment').lean();

  // Filter out options from MCX MIS
  const activeMcxMisNonOptions = activeMcxMisOrders.filter(o => !isOptionSymbol(o.symbol));

  const expectedCommodityIntradayUsed = round2(
    activeMcxMisNonOptions.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
  );

  // Non-MCX equity delivery orders (excluding options) → reconcile delivery.used_limit
  const activeDeliveryOrders = await Order.find({
    customer_id_str,
    broker_id_str,
    product: { $in: DELIVERY_PRODUCTS },
    status: { $in: ACTIVE_STATUSES },
    $nor: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
  }).select('margin_blocked symbol').lean();

  // Filter out options from equity delivery
  const activeDeliveryNonOptions = activeDeliveryOrders.filter(o => !isOptionSymbol(o.symbol));

  const expectedDeliveryUsed = round2(
    activeDeliveryNonOptions.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
  );

  // MCX delivery orders (excluding options) → reconcile commodity_delivery.used_limit
  const activeMcxDeliveryOrders = await Order.find({
    customer_id_str,
    broker_id_str,
    product: { $in: DELIVERY_PRODUCTS },
    status: { $in: ACTIVE_STATUSES },
    $or: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
  }).select('margin_blocked symbol exchange segment').lean();

  // Filter out options from MCX delivery
  const activeMcxDeliveryNonOptions = activeMcxDeliveryOrders.filter(o => !isOptionSymbol(o.symbol));

  const expectedCommodityDeliveryUsed = round2(
    activeMcxDeliveryNonOptions.reduce((sum, o) => toNumber(o.margin_blocked) > 0 ? sum + toNumber(o.margin_blocked) : sum, 0)
  );

  // MCX option orders (all products) → reconcile commodity_option.used
  const activeMcxOptionOrders = await Order.find({
    customer_id_str,
    broker_id_str,
    status: { $in: ACTIVE_STATUSES },
    $or: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
    $or: [
      { symbol: { $regex: /CE$/i } },
      { symbol: { $regex: /PE$/i } },
      { symbol: { $regex: /CALL$/i } },
      { symbol: { $regex: /PUT$/i } },
    ],
  }).select('margin_blocked symbol').lean();

  const expectedCommodityOptionUsed = round2(
    activeMcxOptionOrders.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
  );

  // Non-MCX option orders (all products) → reconcile option_premium_used
  const activeEquityOptionOrders = await Order.find({
    customer_id_str,
    broker_id_str,
    status: { $in: ACTIVE_STATUSES },
    $nor: [
      { exchange: { $regex: /MCX/i } },
      { segment: { $regex: /MCX/i } },
    ],
    $or: [
      { symbol: { $regex: /CE$/i } },
      { symbol: { $regex: /PE$/i } },
      { symbol: { $regex: /CALL$/i } },
      { symbol: { $regex: /PUT$/i } },
    ],
  }).select('margin_blocked symbol').lean();

  const expectedOptionPremiumUsed = round2(
    activeEquityOptionOrders.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
  );

  const currentIntradayUsed = round2(toNumber(fund.intraday?.used_limit));
  const currentCommodityIntradayUsed = round2(toNumber(fund.commodity_intraday?.used_limit));
  const currentDeliveryUsed = round2(toNumber(fund.delivery?.used_limit));
  const currentCommodityDeliveryUsed = round2(toNumber(fund.commodity_delivery?.used_limit));
  const currentCommodityOptionUsed = round2(toNumber(fund.commodity_option?.used));
  const currentOptionPremiumUsed = round2(toNumber(fund.option_premium_used));

  let intradayFixed = false;
  let commodityIntradayFixed = false;
  let deliveryFixed = false;
  let commodityFixed = false;
  let commodityOptionFixed = false;
  let optionPremiumFixed = false;

  // Reconcile equity intraday (non-MCX MIS, non-options)
  if (currentIntradayUsed !== expectedIntradayUsed) {
    const drift = round2(currentIntradayUsed - expectedIntradayUsed);
    console.log(
      `[CRON] Reconcile intraday ${customer_id_str}: was Rs${currentIntradayUsed}, expected Rs${expectedIntradayUsed} (drift Rs${drift})`
    );

    fund.intraday.used_limit = expectedIntradayUsed;
    fund.transactions.push({
      type: 'margin_reconcile_intraday',
      amount: round2(Math.abs(drift)),
      notes: `Midnight reconcile: intraday corrected from Rs${currentIntradayUsed} to Rs${expectedIntradayUsed} (drift Rs${drift}) | ${activeEquityMisNonOptions.length} active equity MIS orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    intradayFixed = true;
  }

  // Reconcile commodity intraday (MCX MIS, non-options)
  if (currentCommodityIntradayUsed !== expectedCommodityIntradayUsed) {
    const drift = round2(currentCommodityIntradayUsed - expectedCommodityIntradayUsed);
    console.log(
      `[CRON] Reconcile commodity_intraday ${customer_id_str}: was Rs${currentCommodityIntradayUsed}, expected Rs${expectedCommodityIntradayUsed} (drift Rs${drift})`
    );

    if (!fund.commodity_intraday) fund.commodity_intraday = { available_limit: 0, used_limit: 0 };
    fund.commodity_intraday.used_limit = expectedCommodityIntradayUsed;

    fund.transactions.push({
      type: 'margin_reconcile_commodity_intraday',
      amount: round2(Math.abs(drift)),
      notes: `Midnight reconcile: commodity intraday corrected from Rs${currentCommodityIntradayUsed} to Rs${expectedCommodityIntradayUsed} (drift Rs${drift}) | ${activeMcxMisNonOptions.length} active MCX MIS orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    commodityIntradayFixed = true;
  }

  // Reconcile equity delivery (non-MCX CNC/NRML, non-options)
  if (currentDeliveryUsed !== expectedDeliveryUsed) {
    const drift = round2(currentDeliveryUsed - expectedDeliveryUsed);
    const overnightAdjustment = drift;
    console.log(
      `[CRON] Reconcile delivery ${customer_id_str}: was Rs${currentDeliveryUsed}, expected Rs${expectedDeliveryUsed} (drift Rs${drift})`
    );

    fund.delivery.used_limit = expectedDeliveryUsed;
    fund.overnight.available_limit = round2(toNumber(fund.overnight.available_limit) + overnightAdjustment);

    fund.transactions.push({
      type: 'margin_reconcile_delivery',
      amount: round2(Math.abs(drift)),
      notes: `Midnight reconcile: delivery corrected from Rs${currentDeliveryUsed} to Rs${expectedDeliveryUsed} (drift Rs${drift}) | ${activeDeliveryNonOptions.length} active equity delivery orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    deliveryFixed = true;
  }

  // Reconcile commodity delivery (MCX CNC/NRML, non-options)
  if (currentCommodityDeliveryUsed !== expectedCommodityDeliveryUsed) {
    const drift = round2(currentCommodityDeliveryUsed - expectedCommodityDeliveryUsed);
    console.log(
      `[CRON] Reconcile commodity_delivery ${customer_id_str}: was Rs${currentCommodityDeliveryUsed}, expected Rs${expectedCommodityDeliveryUsed} (drift Rs${drift})`
    );

    if (!fund.commodity_delivery) fund.commodity_delivery = { available_limit: 0, used_limit: 0 };
    fund.commodity_delivery.used_limit = expectedCommodityDeliveryUsed;

    fund.transactions.push({
      type: 'margin_reconcile_commodity',
      amount: round2(Math.abs(drift)),
      notes: `Midnight reconcile: commodity delivery corrected from Rs${currentCommodityDeliveryUsed} to Rs${expectedCommodityDeliveryUsed} (drift Rs${drift}) | ${activeMcxDeliveryNonOptions.length} active MCX delivery orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    commodityFixed = true;
  }

  // Reconcile commodity option (MCX options)
  if (currentCommodityOptionUsed !== expectedCommodityOptionUsed) {
    const drift = round2(currentCommodityOptionUsed - expectedCommodityOptionUsed);
    console.log(
      `[CRON] Reconcile commodity_option ${customer_id_str}: was Rs${currentCommodityOptionUsed}, expected Rs${expectedCommodityOptionUsed} (drift Rs${drift})`
    );

    if (!fund.commodity_option) fund.commodity_option = { limit_percentage: 10, used: 0 };
    fund.commodity_option.used = expectedCommodityOptionUsed;

    fund.transactions.push({
      type: 'margin_reconcile_commodity_option',
      amount: round2(Math.abs(drift)),
      notes: `Midnight reconcile: commodity option corrected from Rs${currentCommodityOptionUsed} to Rs${expectedCommodityOptionUsed} (drift Rs${drift}) | ${activeMcxOptionOrders.length} active MCX option orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    commodityOptionFixed = true;
  }

  // Reconcile option premium (equity options)
  if (currentOptionPremiumUsed !== expectedOptionPremiumUsed) {
    const drift = round2(currentOptionPremiumUsed - expectedOptionPremiumUsed);
    console.log(
      `[CRON] Reconcile option_premium ${customer_id_str}: was Rs${currentOptionPremiumUsed}, expected Rs${expectedOptionPremiumUsed} (drift Rs${drift})`
    );

    fund.option_premium_used = expectedOptionPremiumUsed;

    fund.transactions.push({
      type: 'margin_reconcile_option_premium',
      amount: round2(Math.abs(drift)),
      notes: `Midnight reconcile: option premium corrected from Rs${currentOptionPremiumUsed} to Rs${expectedOptionPremiumUsed} (drift Rs${drift}) | ${activeEquityOptionOrders.length} active equity option orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    optionPremiumFixed = true;
  }

  if (intradayFixed || commodityIntradayFixed || deliveryFixed || commodityFixed || commodityOptionFixed || optionPremiumFixed) {
    fund.last_calculated_at = new Date();
  }

  return { intradayFixed, commodityIntradayFixed, deliveryFixed, commodityFixed, commodityOptionFixed, optionPremiumFixed };
}

const FundCronJobs = () => {
  // ---------------------------------------------------------
  // Job: Weekly Settlement Auto-Run at Sunday 12:00 AM IST
  // Honors broker setting: settings.settlement.auto_weekly_settlement_enabled
  // ---------------------------------------------------------
  cron.schedule(
    '0 0 * * 0',
    async () => {
      await withLock('cron:fund:auto-weekly-settlement-0000-sunday', 480, async () => {
        console.log('[CRON] Running Auto Weekly Settlement (Sunday 00:00 IST)...');
        try {
          const summary = await runAutoWeeklySettlementForAllBrokers({ effectiveAt: new Date() });
          console.log(
            `[CRON] Auto weekly settlement done: attempted=${summary.attempted}, skipped=${summary.skipped}, failed=${summary.failed}`
          );

          await writeAuditSuccess({
            type: 'system',
            eventType: 'AUTO_WEEKLY_SETTLEMENT_CRON',
            category: 'funds',
            message: `Auto weekly settlement cron completed. ${summary.attempted} brokers were processed, ${summary.skipped} were skipped, and ${summary.failed} failed.`,
            actor: { type: 'system', id_str: 'SYSTEM', role: 'system' },
            source: 'cron',
            note: 'Sunday 00:00 IST auto weekly settlement run completed.',
            metadata: summary,
          });
        } catch (error) {
          console.error('[CRON] Error in auto weekly settlement cron:', error);
        }
      });
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );

  // ---------------------------------------------------------
  // Job: Midnight Margin Reconciliation at 12:05 AM IST
  // Runs AFTER squareoff cron (12:02 AM).
  // Corrects any drift between fund buckets and active orders.
  // ---------------------------------------------------------
  cron.schedule(
    '5 0 * * *',
    async () => {
      await withLock('cron:fund:midnight-reconcile-0005', 480, async () => {
        console.log('[CRON] Running Midnight Margin Reconciliation (00:05 IST)...');

        try {
          const allFunds = await Fund.find({}).select(
            '_id customer_id_str broker_id_str intraday delivery overnight commodity_delivery commodity_intraday commodity_option transactions last_calculated_at option_premium_used option_limit'
          );

          let intradayFixedCount = 0;
          let commodityIntradayFixedCount = 0;
          let deliveryFixedCount = 0;
          let commodityFixedCount = 0;
          let commodityOptionFixedCount = 0;
          let optionPremiumFixedCount = 0;
          let cleanCount = 0;

          for (const fund of allFunds) {
            try {
              const { intradayFixed, commodityIntradayFixed, deliveryFixed, commodityFixed, commodityOptionFixed, optionPremiumFixed } = await reconcileFundMargin(fund);

              if (intradayFixed || commodityIntradayFixed || deliveryFixed || commodityFixed || commodityOptionFixed || optionPremiumFixed) {
                await fund.save();
                if (intradayFixed) intradayFixedCount += 1;
                if (commodityIntradayFixed) commodityIntradayFixedCount += 1;
                if (deliveryFixed) deliveryFixedCount += 1;
                if (commodityFixed) commodityFixedCount += 1;
                if (commodityOptionFixed) commodityOptionFixedCount += 1;
                if (optionPremiumFixed) optionPremiumFixedCount += 1;
              } else {
                cleanCount += 1;
              }
            } catch (fundErr) {
              console.error(
                `[CRON] Reconcile failed for fund ${fund._id} (${fund.customer_id_str}):`,
                fundErr.message
              );
            }
          }

          console.log(
            `[CRON] Reconciliation done: ${intradayFixedCount} intraday corrected, ${commodityIntradayFixedCount} commodity intraday corrected, ${deliveryFixedCount} delivery corrected, ${commodityFixedCount} commodity delivery corrected, ${commodityOptionFixedCount} commodity option corrected, ${optionPremiumFixedCount} option premium corrected, ${cleanCount} clean.`
          );
        } catch (error) {
          console.error('[CRON] Error in midnight margin reconciliation:', error);
        }
      });
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );
};

export default FundCronJobs;
