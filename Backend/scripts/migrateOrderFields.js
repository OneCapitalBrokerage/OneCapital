/**
 * One-time migration: Set `category` and `order_status`/`order_category` on existing orders.
 *
 * Run with: node Backend/scripts/migrateOrderFields.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wolf';

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const orders = db.collection('orders');

  // 1. Set category from product
  const misCat = await orders.updateMany(
    { product: 'MIS', $or: [{ category: { $exists: false } }, { category: null }] },
    { $set: { category: 'INTRADAY', order_category: 'INTRADAY' } }
  );
  console.log(`MIS → INTRADAY: ${misCat.modifiedCount} orders`);

  const cncCat = await orders.updateMany(
    { product: 'CNC', $or: [{ category: { $exists: false } }, { category: null }] },
    { $set: { category: 'DELIVERY', order_category: 'DELIVERY' } }
  );
  console.log(`CNC → DELIVERY: ${cncCat.modifiedCount} orders`);

  const nrmlCat = await orders.updateMany(
    { product: 'NRML', $or: [{ category: { $exists: false } }, { category: null }] },
    { $set: { category: 'F&O', order_category: 'F&O' } }
  );
  console.log(`NRML → F&O: ${nrmlCat.modifiedCount} orders`);

  // 2. Sync order_status from status where missing
  const statusSync = await orders.updateMany(
    { status: { $exists: true }, $or: [{ order_status: { $exists: false } }, { order_status: null }] },
    [{ $set: { order_status: '$status' } }]
  );
  console.log(`Synced order_status: ${statusSync.modifiedCount} orders`);

  // 3. Set settlement_status on closed orders
  const settled = await orders.updateMany(
    { status: 'CLOSED', $or: [{ settlement_status: { $exists: false } }, { settlement_status: null }] },
    { $set: { settlement_status: 'settled' } }
  );
  console.log(`Set settlement_status=settled on closed: ${settled.modifiedCount} orders`);

  const pending = await orders.updateMany(
    { status: { $ne: 'CLOSED' }, $or: [{ settlement_status: { $exists: false } }, { settlement_status: null }] },
    { $set: { settlement_status: 'pending' } }
  );
  console.log(`Set settlement_status=pending on open: ${pending.modifiedCount} orders`);

  // 4. Sync exit field aliases
  const exitSync = await orders.updateMany(
    { exit_price: { $exists: true, $gt: 0 }, $or: [{ closed_ltp: { $exists: false } }, { closed_ltp: null }] },
    [{ $set: { closed_ltp: '$exit_price' } }]
  );
  console.log(`Synced closed_ltp from exit_price: ${exitSync.modifiedCount} orders`);

  const closedLtpSync = await orders.updateMany(
    { closed_ltp: { $exists: true, $gt: 0 }, $or: [{ exit_price: { $exists: false } }, { exit_price: null }] },
    [{ $set: { exit_price: '$closed_ltp' } }]
  );
  console.log(`Synced exit_price from closed_ltp: ${closedLtpSync.modifiedCount} orders`);

  console.log('Migration complete.');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
