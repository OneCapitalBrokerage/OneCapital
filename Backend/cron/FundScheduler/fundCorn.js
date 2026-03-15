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
 * Reconcile fund margin for a single customer.
 * Recomputes expected intraday/delivery used values from active orders,
 * corrects any drift, and logs corrections.
 *
 * @param {Object} fund - Mongoose fund document (mutated in-memory; caller must save)
 * @returns {{ intradayFixed: boolean, deliveryFixed: boolean }}
 */
async function reconcileFundMargin(fund) {
  const { customer_id_str, broker_id_str } = fund;

  const activeMisOrders = await Order.find({
    customer_id_str,
    broker_id_str,
    product: { $in: INTRADAY_PRODUCTS },
    status: { $in: ACTIVE_STATUSES },
  }).select('margin_blocked symbol').lean();

  const expectedIntradayUsed = round2(
    activeMisOrders.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
  );

  // Non-MCX equity delivery orders → reconcile delivery.used_limit
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

  const expectedDeliveryUsed = round2(
    activeDeliveryOrders.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
  );

  // MCX delivery orders → reconcile commodity_delivery.used_limit
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

  const expectedCommodityDeliveryUsed = round2(
    activeMcxDeliveryOrders.reduce((sum, o) => toNumber(o.margin_blocked) > 0 ? sum + toNumber(o.margin_blocked) : sum, 0)
  );

  const currentIntradayUsed = round2(toNumber(fund.intraday?.used_limit));
  const currentDeliveryUsed = round2(toNumber(fund.delivery?.used_limit));
  const currentCommodityDeliveryUsed = round2(toNumber(fund.commodity_delivery?.used_limit));

  let intradayFixed = false;
  let deliveryFixed = false;
  let commodityFixed = false;

  if (currentIntradayUsed !== expectedIntradayUsed) {
    const drift = round2(currentIntradayUsed - expectedIntradayUsed);
    console.log(
      `[CRON] Reconcile intraday ${customer_id_str}: was Rs${currentIntradayUsed}, expected Rs${expectedIntradayUsed} (drift Rs${drift})`
    );

    fund.intraday.used_limit = expectedIntradayUsed;
    fund.transactions.push({
      type: 'margin_reconcile_intraday',
      amount: round2(Math.abs(drift)),
      notes: `Midnight reconcile: intraday corrected from Rs${currentIntradayUsed} to Rs${expectedIntradayUsed} (drift Rs${drift}) | ${activeMisOrders.length} active MIS orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    intradayFixed = true;
  }

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
      notes: `Midnight reconcile: delivery corrected from Rs${currentDeliveryUsed} to Rs${expectedDeliveryUsed} (drift Rs${drift}) | ${activeDeliveryOrders.length} active equity delivery orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    deliveryFixed = true;
  }

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
      notes: `Midnight reconcile: commodity delivery corrected from Rs${currentCommodityDeliveryUsed} to Rs${expectedCommodityDeliveryUsed} (drift Rs${drift}) | ${activeMcxDeliveryOrders.length} active MCX delivery orders`,
      status: 'completed',
      timestamp: new Date(),
    });
    commodityFixed = true;
  }

  if (intradayFixed || deliveryFixed || commodityFixed) {
    fund.last_calculated_at = new Date();
  }

  return { intradayFixed, deliveryFixed, commodityFixed };
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
            '_id customer_id_str broker_id_str intraday delivery overnight commodity_delivery transactions last_calculated_at option_premium_used option_limit'
          );

          let intradayFixedCount = 0;
          let deliveryFixedCount = 0;
          let commodityFixedCount = 0;
          let cleanCount = 0;

          for (const fund of allFunds) {
            try {
              const { intradayFixed, deliveryFixed, commodityFixed } = await reconcileFundMargin(fund);

              if (intradayFixed || deliveryFixed || commodityFixed) {
                await fund.save();
                if (intradayFixed) intradayFixedCount += 1;
                if (deliveryFixed) deliveryFixedCount += 1;
                if (commodityFixed) commodityFixedCount += 1;
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
            `[CRON] Reconciliation done: ${intradayFixedCount} intraday corrected, ${deliveryFixedCount} delivery corrected, ${commodityFixedCount} commodity corrected, ${cleanCount} clean.`
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
