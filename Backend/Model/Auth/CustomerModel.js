import mongoose from 'mongoose';
const { Schema } = mongoose;

const CustomerSchema = new Schema({
  // Login Credentials
  customer_id: { type: String, required: true, unique: true }, // Auto-generated 10-digit
  password: { type: String, required: true }, // Hashed
  
  // Profile
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  avatar: { type: String }, // Cloudinary URL
  date_of_birth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  
  // KYC Details
  pan_number: { type: String },
  aadhar_number: { type: String }, // Last 4 digits only stored
  
  // Address
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
  },
  
  // Broker Linkage
  broker_id: { type: Schema.Types.ObjectId, ref: 'Broker', required: true },
  broker_id_str: { type: String, required: true }, // Denormalized for quick queries
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'blocked', 'inactive', 'pending_kyc'],
    default: 'pending_kyc'
  },
  
  // KYC Status
  kyc_status: {
    type: String,
    enum: ['pending', 'under_review', 'verified', 'rejected'],
    default: 'pending'
  },
  kyc_verified_at: { type: Date },
  kyc_request_id: { type: Schema.Types.ObjectId, ref: 'KYCRequest' },
  
  // Trading Permissions
  trading_enabled: { type: Boolean, default: false },
  holdings_exit_allowed: { type: Boolean, default: false },

  // Settlement Participation (broker-controlled)
  settlement_enabled: { type: Boolean, default: true },
  settlement_disabled_reason: { type: String },
  settlement_disabled_at: { type: Date },
  settlement_disabled_by: { type: Schema.Types.ObjectId, ref: 'Broker' },
  restriction_reason: { type: String },
  segments_allowed: [{
    type: String,
    enum: ['EQUITY', 'F&O', 'COMMODITY', 'CURRENCY']
  }],

  // Admin Warning System
  admin_warning_active: { type: Boolean, default: false },
  admin_warning_message: { type: String, default: '' },
  admin_warning_created_at: { type: Date },
  admin_warning_updated_at: { type: Date },
  admin_warning_created_by: { type: Schema.Types.ObjectId, ref: 'Admin' },

  // Block tracking (formalized)
  block_reason: { type: String },
  blocked_at: { type: Date },
  blocked_by: { type: Schema.Types.ObjectId, ref: 'Admin' },
  trading_disabled_reason: { type: String },
  
  // Settings
  settings: {
    biometric_login: { type: Boolean, default: false },
    notifications: {
      order_updates: { type: Boolean, default: true },
      price_alerts: { type: Boolean, default: true },
      fund_updates: { type: Boolean, default: true },
    }
  },
  
  // Security
  last_login: { type: Date },
  last_active: { type: Date },
  failed_login_attempts: { type: Number, default: 0 },
  
}, { timestamps: true });

// Indexes
CustomerSchema.index({ broker_id: 1, status: 1 });
CustomerSchema.index({ broker_id_str: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ phone: 1 });

export default mongoose.model('Customer', CustomerSchema);
