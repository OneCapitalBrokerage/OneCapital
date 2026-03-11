// scripts/fix-login-id.js
// Migrates login_id -> broker_id, drops login_id index, removes login_id field
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URL = process.env.MONGODB_URI || process.env.MONGO_URL;

async function fix() {
  await mongoose.connect(MONGO_URL);
  const db = mongoose.connection.db;
  const brokers = db.collection('brokers');

  const all = await brokers.find({}).toArray();
  console.log('Total broker docs:', all.length);
  all.forEach(doc => {
    console.log('  -', doc.broker_id || 'NO_BROKER_ID', '| login_id:', doc.login_id || 'NONE', '| role:', doc.role || 'NONE', '| name:', doc.name);
  });

  // Copy login_id to broker_id if broker_id is missing
  for (const doc of all) {
    if (!doc.broker_id && doc.login_id) {
      console.log('Copying login_id to broker_id for:', doc.login_id);
      await brokers.updateOne({ _id: doc._id }, { $set: { broker_id: doc.login_id } });
    }
  }

  // Drop the login_id unique index
  try {
    await brokers.dropIndex('login_id_1');
    console.log('Dropped login_id_1 index');
  } catch (e) {
    console.log('Index login_id_1 not found or already dropped:', e.message);
  }

  // Remove login_id field from all docs
  const result = await brokers.updateMany({}, { $unset: { login_id: '' } });
  console.log('Removed login_id from', result.modifiedCount, 'docs');

  // Verify
  const updated = await brokers.find({}).toArray();
  updated.forEach(doc => {
    console.log('  AFTER:', doc.broker_id, '| login_id:', doc.login_id || 'REMOVED', '| role:', doc.role);
  });

  // Show remaining indexes
  const indexes = await brokers.indexes();
  console.log('\nRemaining indexes:');
  indexes.forEach(idx => console.log(' ', idx.name, JSON.stringify(idx.key)));

  await mongoose.disconnect();
  console.log('Done!');
}

fix().catch(e => { console.error(e); process.exit(1); });
