import mongoose from 'mongoose';
const { Schema } = mongoose;

const AdminSchema = new Schema({
  // Login Credentials
  admin_id: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // Profile
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  avatar: { type: String },

  // Role & Permissions
  role: { type: String, default: 'admin', immutable: true },
  permissions: [{
    type: String,
    enum: ['manage_brokers', 'manage_customers', 'manage_kyc', 'view_logs', 'manage_api_keys', 'manage_funds']
  }],

  // Security
  is_active: { type: Boolean, default: true },
  last_login: { type: Date },
  failed_login_attempts: { type: Number, default: 0 },
  account_locked_until: { type: Date },

}, { timestamps: true });

export default mongoose.model('Admin', AdminSchema);
