import mongoose from 'mongoose';
const { Schema } = mongoose;

const BrokerSchema = new Schema({
  // Login Credentials
  broker_id: { type: String, required: true, unique: true }, // Auto-generated 10-digit
  password: { type: String, required: true }, // Hashed

  // Profile
  name: { type: String, required: true }, // Company/Firm name
  owner_name: { type: String, required: true }, // Owner's name
  email: { type: String, unique: true, sparse: true },
  phone: { type: String },
  avatar: { type: String }, // Cloudinary URL
  
  // Business Details
  company_name: { type: String },
  registration_number: { type: String },
  gst_number: { type: String },
  
  // Contact Info (Client Facing)
  support_contact: { type: String },
  support_email: { type: String },
  upi_id: { type: String }, // For fund transfers
  payment_qr_url: { type: String },
  payment_qr_public_id: { type: String },
  payment_qr_settings: {
    scale: { type: Number, default: 1 },
    offset_x: { type: Number, default: 0 },
    offset_y: { type: Number, default: 0 },
    padding: { type: Number, default: 8 },
  },
  bank_transfer_details: {
    bank_name: { type: String },
    account_holder_name: { type: String },
    account_number: { type: String },
    ifsc_code: { type: String },
    account_type: { type: String, enum: ['savings', 'current'], default: 'current' },
  },
  
  // Address
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'blocked', 'pending_verification', 'suspended'],
    default: 'pending_verification'
  },
  
  // Compliance
  compliance_score: { type: Number, default: 100, min: 0, max: 100 },
  kyc_verified: { type: Boolean, default: false },
  
  // Settings
  settings: {
    default_order_type: { type: String, enum: ['MIS', 'NRML', 'CNC'], default: 'MIS' },
    biometric_login: { type: Boolean, default: false },
    settlement: {
      auto_weekly_settlement_enabled: { type: Boolean, default: true },
    },
    notifications: {
      trade_executions: { type: Boolean, default: true },
      margin_alerts: { type: Boolean, default: true },
      client_onboarding: { type: Boolean, default: true },
    }
  },
  
  // Stats (Cached/Computed)
  stats: {
    total_clients: { type: Number, default: 0 },
    active_clients: { type: Number, default: 0 },
    total_aum: { type: Number, default: 0 }, // Assets Under Management
  },
  
  // Reference Code (shared with prospective customers for registration routing)
  reference_code: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
    index: true,
  },

  // Security
  last_login: { type: Date },
  failed_login_attempts: { type: Number, default: 0 },

}, { timestamps: true });

// Auto-generate reference_code before save if not set
BrokerSchema.pre('save', function(next) {
  if (!this.reference_code && this.broker_id) {
    // e.g. "WOLF" + last 4 chars of broker_id → "WOLF0001"
    const prefix = (this.company_name || this.name || 'BRK')
      .replace(/[^A-Z0-9]/gi, '')
      .substring(0, 4)
      .toUpperCase()
      .padEnd(4, 'X');
    const suffix = String(this.broker_id).replace(/[^0-9]/g, '').slice(-4).padStart(4, '0');
    this.reference_code = prefix + suffix;
  }
  next();
});

export default mongoose.model('Broker', BrokerSchema);
