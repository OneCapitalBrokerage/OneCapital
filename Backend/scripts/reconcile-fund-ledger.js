import dotenv from 'dotenv';
import mongoose from 'mongoose';
import CustomerModel from '../Model/Auth/CustomerModel.js';
import FundModel from '../Model/FundManagement/FundModel.js';
import {
  getWeeklyRealizedFromOrders,
  reconcileMissingRealizedTransactions,
} from '../services/fundPnlCanonicalService.js';

dotenv.config({ path: './.env' });

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing Mongo URI. Set MONGODB_URI or MONGO_URL.');
  }

  const apply = process.argv.includes('--apply');
  const brokerIdStrArg = process.argv.find((arg) => arg.startsWith('--broker='));
  const customerIdArg = process.argv.find((arg) => arg.startsWith('--customer='));
  const brokerIdStr = brokerIdStrArg ? brokerIdStrArg.split('=')[1] : null;
  const customerId = customerIdArg ? customerIdArg.split('=')[1] : null;

  await mongoose.connect(uri);

  const customerQuery = {};
  if (brokerIdStr) customerQuery.broker_id_str = brokerIdStr;
  if (customerId) customerQuery.customer_id = customerId;

  const customers = await CustomerModel.find(customerQuery)
    .select('customer_id broker_id_str name')
    .lean();

  const report = [];

  for (const customer of customers) {
    // eslint-disable-next-line no-await-in-loop
    const fund = await FundModel.findOne({
      customer_id_str: customer.customer_id,
      broker_id_str: customer.broker_id_str,
    });
    if (!fund) continue;

    // eslint-disable-next-line no-await-in-loop
    const canonicalWeek = await getWeeklyRealizedFromOrders({
      fund,
      customerIdStr: customer.customer_id,
      brokerIdStr: customer.broker_id_str,
      nowUtc: new Date(),
    });

    const beforeFundSum = Number(
      (fund.transactions || [])
        .filter((tx) => {
          const ts = tx.timestamp ? new Date(tx.timestamp) : null;
          return (
            ts
            && ts >= canonicalWeek.boundaryStartUtc
            && (tx.type === 'realized_profit' || tx.type === 'realized_loss')
          );
        })
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0)
        .toFixed(2)
    );

    const reconciliation = reconcileMissingRealizedTransactions({
      fund,
      weekOrders: canonicalWeek.weekOrders,
      processedBy: undefined,
      dryRun: !apply,
    });

    if (apply && reconciliation.missingCount > 0) {
      // eslint-disable-next-line no-await-in-loop
      await fund.save();
    }

    const afterFundSum = Number(
      (fund.transactions || [])
        .filter((tx) => {
          const ts = tx.timestamp ? new Date(tx.timestamp) : null;
          return (
            ts
            && ts >= canonicalWeek.boundaryStartUtc
            && (tx.type === 'realized_profit' || tx.type === 'realized_loss')
          );
        })
        .reduce((sum, tx) => sum + toNumber(tx.amount), 0)
        .toFixed(2)
    );

    const diffBefore = Number((canonicalWeek.realizedPnlThisWeek - beforeFundSum).toFixed(2));
    const diffAfter = Number((canonicalWeek.realizedPnlThisWeek - afterFundSum).toFixed(2));

    if (Math.abs(diffBefore) > 0.009 || reconciliation.missingCount > 0) {
      report.push({
        customerId: customer.customer_id,
        customerName: customer.name,
        brokerIdStr: customer.broker_id_str,
        boundaryStart: canonicalWeek.boundaryStartUtc.toISOString(),
        realizedFromOrders: canonicalWeek.realizedPnlThisWeek,
        fundRealizedBefore: beforeFundSum,
        fundRealizedAfter: afterFundSum,
        diffBefore,
        diffAfter,
        missingCount: reconciliation.missingCount,
        missingPnlTotal: reconciliation.missingPnlTotal,
        missingOrderIds: reconciliation.missingOrders.map((order) => String(order._id)),
      });
    }
  }

  console.log(JSON.stringify({
    apply,
    scannedCustomers: customers.length,
    mismatches: report.length,
    report,
  }, null, 2));

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('reconcile-fund-ledger failed:', error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
