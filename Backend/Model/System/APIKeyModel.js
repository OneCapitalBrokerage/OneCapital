import mongoose from 'mongoose';
const { Schema } = mongoose;

const APIKeySchema = new Schema({
  // Key Details
  name: { type: String, required: true },
  key: { type: String, required: true, unique: true }, // Hashed
  key_prefix: { type: String, required: true }, // First 8 chars for display
  key_hint: { type: String }, // Last 4 chars
  
  // Scopes/Permissions
  scopes: [{
    type: String,
    enum: ['read', 'write', 'trades', 'admin', 'webhooks']
  }],
  
  // Status
  is_active: { type: Boolean, default: true },
  
  // Usage
  last_used_at: { type: Date },
  usage_count: { type: Number, default: 0 },
  
  // Limits
  rate_limit: { type: Number, default: 100 }, // requests per minute
  daily_limit: { type: Number, default: 10000 },
  
  // Expiration
  expires_at: { type: Date },
  
  // Audit
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  revoked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  revoked_at: { type: Date },
  
}, { timestamps: true });

APIKeySchema.index({ key: 1 });
APIKeySchema.index({ is_active: 1 });

export default mongoose.model('APIKey', APIKeySchema);