import mongoose from 'mongoose';
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  // Recipient
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'user_type' },
  user_id_str: { type: String, required: true, index: true },
  user_type: { type: String, enum: ['Admin', 'Broker', 'Customer'], required: true },
  
  // Content
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['order', 'fund', 'kyc', 'alert', 'system', 'promo'],
    required: true
  },
  
  // Action
  action_url: { type: String },
  action_data: { type: Schema.Types.Mixed },
  
  // Status
  is_read: { type: Boolean, default: false },
  read_at: { type: Date },
  
  // Priority
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  
  // Expiry
  expires_at: { type: Date },
  
}, { timestamps: true });

NotificationSchema.index({ user_id_str: 1, is_read: 1, createdAt: -1 });
NotificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Notification', NotificationSchema);