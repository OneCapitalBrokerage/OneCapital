/**
 * Script to create a demo fund record for a customer
 * Run with: node scripts/createDemoFund.js [customer_id]
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from Backend/.env regardless of cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import '../Model/Auth/CustomerModel.js';
import '../Model/FundManagement/FundModel.js';

const Customer = mongoose.model('Customer');
const Fund = mongoose.model('Fund');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URL || process.env.MONGODB_URL || 'mongodb://localhost:27017/wolftrading';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const createDemoFund = async () => {
  try {
    await connectDB();

    const customerId = process.argv[2] || 'Wolf';
    const customer = await Customer.findOne({ customer_id: customerId });

    if (!customer) {
      console.error(`Customer not found for customer_id: ${customerId}`);
      process.exit(1);
    }

    const existing = await Fund.findOne({ customer_id_str: customer.customer_id });
    if (existing) {
      console.log(`Fund already exists for customer_id: ${customer.customer_id}`);
      process.exit(0);
    }

    const fund = await Fund.create({
      customer_id: customer._id,
      customer_id_str: customer.customer_id,
      broker_id_str: customer.broker_id_str,
      net_available_balance: 100000,
      intraday: {
        available_limit: 100000,
        used_limit: 0,
      },
      overnight: {
        available_limit: 100000,
        used_limit: 0,
      },
      option_limit_percentage: 10,
    });

    console.log('Fund created successfully for', customer.customer_id);
    console.log('Intraday limit:', fund.intraday?.available_limit);
    console.log('Overnight limit:', fund.overnight?.available_limit);

    process.exit(0);
  } catch (error) {
    console.error('Error creating fund:', error);
    process.exit(1);
  }
};

createDemoFund();
