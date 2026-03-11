import mongoose from 'mongoose';
const { Schema } = mongoose;

const SessionSchema = new Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'user_type' },
  user_id_str: { type: String, required: true },
  user_type: { type: String, enum: ['Admin', 'Broker', 'Customer'], required: true },
  
  // Token
  token: { type: String, required: true, unique: true },
  refresh_token: { type: String },
  
  // Session Info
  device_info: {
    device_type: { type: String }, // mobile, desktop, tablet
    os: { type: String },
    browser: { type: String },
    ip_address: { type: String },
  },
  
  // Timestamps
  expires_at: { type: Date, required: true },
  last_activity: { type: Date, default: Date.now },
  
  // Status
  is_active: { type: Boolean, default: true },
  logged_out_at: { type: Date },
  
}, { timestamps: true });

SessionSchema.index({ user_id: 1, is_active: 1 });
SessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model('Session', SessionSchema);