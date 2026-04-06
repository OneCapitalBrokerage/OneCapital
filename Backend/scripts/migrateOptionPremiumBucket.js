/**
 * One-time migration: Migrate option_premium fields to new bucket structure.
 *
 * This script:
 * 1. Migrates option_limit_percentage → option_premium.limit_percentage
 * 2. Migrates option_premium_used → option_premium.used
 * 3. Recalculates option_premium.used and commodity_option.used from actual open orders
 * 4. Updates order.meta.margin_hold for existing option orders
 *
 * Run with: node Backend/scripts/migrateOptionPremiumBucket.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wolf';

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v) => Number(toNumber(v).toFixed(2));

const isOptionSymbol = (symbol) => {
  if (!symbol) return false;
  const s = String(symbol).toUpperCase();
  return s.endsWith('CE') || s.endsWith('PE') || s.endsWith('CALL') || s.endsWith('PUT');
};

const isMCX = (order) => {
  const exchange = String(order.exchange || '').toUpperCase();
  const segment = String(order.segment || '').toUpperCase();
  return exchange.includes('MCX') || segment.includes('MCX');
};

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const funds = db.collection('funds');
  const orders = db.collection('orders');

  // Get all funds
  const allFunds = await funds.find({}).toArray();
  console.log(`Found ${allFunds.length} fund records to migrate`);

  let migratedCount = 0;
  let errorCount = 0;

  for (const fund of allFunds) {
    try {
      const customer_id_str = fund.customer_id_str;
      const broker_id_str = fund.broker_id_str;

      // Get all active option orders for this customer
      const activeEquityOptions = await orders.find({
        customer_id_str,
        broker_id_str,
        status: { $in: ['OPEN', 'PENDING', 'EXECUTED'] },
        $and: [
          { $nor: [
            { exchange: { $regex: /MCX/i } },
            { segment: { $regex: /MCX/i } },
          ]},
          { $or: [
            { symbol: { $regex: /CE$/i } },
            { symbol: { $regex: /PE$/i } },
            { symbol: { $regex: /CALL$/i } },
            { symbol: { $regex: /PUT$/i } },
          ]},
        ],
      }).toArray();

      const activeMcxOptions = await orders.find({
        customer_id_str,
        broker_id_str,
        status: { $in: ['OPEN', 'PENDING', 'EXECUTED'] },
        $and: [
          { $or: [
            { exchange: { $regex: /MCX/i } },
            { segment: { $regex: /MCX/i } },
          ]},
          { $or: [
            { symbol: { $regex: /CE$/i } },
            { symbol: { $regex: /PE$/i } },
            { symbol: { $regex: /CALL$/i } },
            { symbol: { $regex: /PUT$/i } },
          ]},
        ],
      }).toArray();

      // Calculate expected usage from active orders
      const expectedEquityOptionUsed = round2(
        activeEquityOptions.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
      );
      const expectedCommodityOptionUsed = round2(
        activeMcxOptions.reduce((sum, o) => sum + toNumber(o.margin_blocked), 0)
      );

      // Get limit percentage (prefer existing, fallback to legacy, then default)
      const limitPercent = toNumber(
        fund.option_premium?.limit_percentage ?? fund.option_limit_percentage ?? 10
      );
      const commodityLimitPercent = toNumber(
        fund.commodity_option?.limit_percentage ?? 10
      );

      // Build update object
      const updateObj = {
        $set: {
          'option_premium.limit_percentage': limitPercent,
          'option_premium.used': expectedEquityOptionUsed,
          'commodity_option.limit_percentage': commodityLimitPercent,
          'commodity_option.used': expectedCommodityOptionUsed,
          // Also update legacy fields for backward compatibility
          'option_premium_used': expectedEquityOptionUsed,
        },
      };

      // Update the fund
      await funds.updateOne({ _id: fund._id }, updateObj);

      // Update order.meta.margin_hold for equity option orders
      for (const order of activeEquityOptions) {
        await orders.updateOne(
          { _id: order._id },
          {
            $set: {
              'meta.margin_hold.bucket': 'option_premium',
              'meta.margin_hold.isOption': true,
            },
          }
        );
      }

      // Update order.meta.margin_hold for MCX option orders
      for (const order of activeMcxOptions) {
        await orders.updateOne(
          { _id: order._id },
          {
            $set: {
              'meta.margin_hold.bucket': 'commodity_option',
              'meta.margin_hold.isOption': true,
            },
          }
        );
      }

      migratedCount++;
      
      if (activeEquityOptions.length > 0 || activeMcxOptions.length > 0) {
        console.log(
          `[${customer_id_str}] Migrated: equity_options=${activeEquityOptions.length} (Rs${expectedEquityOptionUsed}), mcx_options=${activeMcxOptions.length} (Rs${expectedCommodityOptionUsed})`
        );
      }
    } catch (error) {
      console.error(`Error migrating fund ${fund._id}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  - Migrated: ${migratedCount} funds`);
  console.log(`  - Errors: ${errorCount}`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
