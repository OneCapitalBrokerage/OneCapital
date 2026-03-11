// scripts/create-admin-user.js
// Run: node Backend/scripts/create-admin-user.js

import 'dotenv/config';
import mongoose from 'mongoose';
import AdminModel from '../Model/Auth/AdminModel.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

const ADMIN_CREDENTIALS = {
  admin_id: 'admin123',
  password: 'admin@123',
  name: 'Admin User',
  email: 'admin@wolf.com',
  is_active: true,
  permissions: ['manage_brokers', 'manage_customers', 'manage_kyc', 'view_logs', 'manage_api_keys', 'manage_funds'],
};

async function createAdminUser() {
  try {
    console.log('[Admin Setup] Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('[Admin Setup] Connected!');

    // Check if admin already exists
    const existingAdmin = await AdminModel.findOne({ admin_id: ADMIN_CREDENTIALS.admin_id });

    if (existingAdmin) {
      console.log('[Admin Setup] Admin user already exists!');
      console.log('  Admin ID:', existingAdmin.admin_id);
      console.log('  Name:', existingAdmin.name);
      console.log('  Role:', existingAdmin.role);
    } else {
      const admin = await AdminModel.create(ADMIN_CREDENTIALS);
      console.log('[Admin Setup] Admin user created successfully!');
      console.log('  Admin ID:', admin.admin_id);
      console.log('  Password:', ADMIN_CREDENTIALS.password);
      console.log('  Name:', admin.name);
      console.log('  Role:', admin.role);
    }

    // Clean up old admin from brokers collection if it exists
    const db = mongoose.connection.db;
    const brokers = db.collection('brokers');
    const oldAdmin = await brokers.findOne({ broker_id: 'admin123' });
    if (oldAdmin) {
      await brokers.deleteOne({ broker_id: 'admin123' });
      console.log('[Admin Setup] Removed old admin entry from brokers collection');
    }

    await mongoose.disconnect();
    console.log('[Admin Setup] Done!');
    process.exit(0);

  } catch (error) {
    console.error('[Admin Setup] Error:', error.message);
    process.exit(1);
  }
}

createAdminUser();
