/**
 * Script to create a demo customer in MongoDB
 * Run with: node scripts/createDemoCustomer.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from Backend/.env regardless of cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Import models
import '../Model/Auth/CustomerModel.js';
import '../Model/Auth/BrokerModel.js';
const Customer = mongoose.model('Customer');
const Broker = mongoose.model('Broker');

// Database connection
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

// Create demo customer
const createDemoCustomer = async () => {
  try {
    await connectDB();

    const hasBrokerId = {
      broker_id: { $exists: true, $type: 'string', $nin: ['', null] },
    };
    
    // Find an active broker with a valid broker_id, or create one if none exists
    let broker = await Broker.findOne({ status: 'active', ...hasBrokerId }).sort({ updatedAt: -1 });
    if (!broker) {
      console.log('No active broker with broker_id found, checking for any valid broker...');
      broker = await Broker.findOne(hasBrokerId).sort({ updatedAt: -1 });
    }

    if (!broker) {
      console.log('No broker found, creating a demo broker...');
      const ts = Date.now().toString().slice(-6);
      broker = await Broker.create({
        broker_id: `BROKER${ts}`,
        password: 'BrokerPass123!',
        name: 'Demo Broker',
        owner_name: 'Demo Owner',
        email: `broker+${ts}@example.com`,
        phone: '9999999999',
        status: 'active',
      });
    }
    
    console.log('Using broker:', broker.broker_id, '-', broker.name);
    
    // Check if demo customer already exists
    const existingCustomer = await Customer.findOne({ customer_id: 'Wolf' });
    if (existingCustomer) {
      console.log('Demo customer already exists:', existingCustomer.customer_id);
      console.log('Email:', existingCustomer.email);
      console.log('Login with password: Wolf@1234');
      process.exit(0);
    }
    
    // Create demo customer
    const demoCustomer = new Customer({
      // Login Credentials
      customer_id: 'Wolf',
      password: 'Wolf@1234',
      
      // Profile
      name: 'Demo Customer',
      email: 'demo@example.com',
      phone: '9876543210',
      date_of_birth: new Date('1990-01-01'),
      gender: 'male',
      
      // Address
      address: {
        street: '123 Demo Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      },
      
      // Broker Linkage
      broker_id: broker._id,
      broker_id_str: broker.broker_id,
      
      // Status
      status: 'active',
      kyc_status: 'pending',
      
      // Trading Permissions
      trading_enabled: true,
      segments_allowed: ['EQUITY', 'F&O'],
      
      // Settings
      settings: {
        biometric_login: false,
        notifications: {
          order_updates: true,
          price_alerts: true,
          fund_updates: true,
        }
      },
    });
    
    const savedCustomer = await demoCustomer.save();
    console.log('Demo customer created successfully!');
    console.log('Customer ID:', savedCustomer.customer_id);
    console.log('Email:', savedCustomer.email);
    console.log('Login with password: Wolf@1234');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating demo customer:', error);
    process.exit(1);
  }
};

createDemoCustomer();
