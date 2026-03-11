/**
 * Script to create a demo broker and customer in MongoDB
 * Run with: node scripts/createDemoData.js
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

// Import models
import '../Model/Auth/BrokerModel.js';
import '../Model/Auth/CustomerModel.js';
const Broker = mongoose.model('Broker');
const Customer = mongoose.model('Customer');

// Database connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URL || 'mongodb://localhost:27017/wolftrading';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Create demo broker
const createDemoBroker = async () => {
  try {
    // Check if demo broker already exists
    const existingBroker = await Broker.findOne({ broker_id: 'BROKER001' });
    if (existingBroker) {
      console.log('Demo broker already exists:', existingBroker.broker_id);
      return existingBroker;
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('BrokerPass123!', saltRounds);
    
    // Create demo broker
    const demoBroker = new Broker({
      // Login Credentials
      broker_id: 'BROKER001',
      password: hashedPassword,
      
      // Profile
      name: 'Demo Broker Firm',
      owner_name: 'Broker Manager',
      email: 'broker@example.com',
      phone: '9876543211',
      
      // Business Details
      company_name: 'Demo Broker Private Ltd',
      registration_number: 'REG123456789',
      gst_number: 'GSTIN123456789',
      
      // Contact Info
      support_contact: '9876543211',
      support_email: 'support@demobroker.com',
      upi_id: 'broker@upi',
      
      // Address
      address: {
        street: '456 Broker Avenue',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
      },
      
      // Status
      status: 'active',
      kyc_verified: true,
      
      // Settings
      settings: {
        default_order_type: 'MIS',
        biometric_login: false,
        notifications: {
          trade_executions: true,
          fund_updates: true,
        }
      },
    });
    
    const savedBroker = await demoBroker.save();
    console.log('Demo broker created successfully!');
    console.log('Broker ID:', savedBroker.broker_id);
    console.log('Email:', savedBroker.email);
    return savedBroker;
  } catch (error) {
    console.error('Error creating demo broker:', error);
    throw error;
  }
};

// Create demo customer
const createDemoCustomer = async (broker) => {
  try {
    // Check if demo customer already exists
    const existingCustomer = await Customer.findOne({ customer_id: 'DEMO001' });
    if (existingCustomer) {
      console.log('Demo customer already exists:', existingCustomer.customer_id);
      console.log('Email:', existingCustomer.email);
      console.log('Login with password: DemoPass123!');
      return existingCustomer;
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('DemoPass123!', saltRounds);
    
    // Create demo customer
    const demoCustomer = new Customer({
      // Login Credentials
      customer_id: 'DEMO001',
      password: hashedPassword,
      
      // Profile
      name: 'Demo Customer',
      email: 'demo@example.com',
      phone: '9876543210',
      date_of_birth: new Date('1990-01-01'),
      gender: 'male',
      
      // KYC Details
      pan_number: 'ABCDE1234F',
      aadhar_number: '1234', // Last 4 digits
      
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
      kyc_status: 'verified',
      kyc_verified_at: new Date(),
      
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
    console.log('Login with password: DemoPass123!');
    return savedCustomer;
  } catch (error) {
    console.error('Error creating demo customer:', error);
    throw error;
  }
};

// Main function
const createDemoData = async () => {
  try {
    await connectDB();
    
    // Create demo broker
    const broker = await createDemoBroker();
    
    // Create demo customer
    await createDemoCustomer(broker);
    
    console.log('\n✅ Demo data setup complete!');
    console.log('You can now login to the frontend with:');
    console.log('- Customer ID: DEMO001');
    console.log('- Password: DemoPass123!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error setting up demo data:', error);
    process.exit(1);
  }
};

createDemoData();