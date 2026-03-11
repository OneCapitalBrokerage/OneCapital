import mongoose from 'mongoose';
const { Schema } = mongoose;

const SupportSessionSchema = new Schema({
  // Session Identifier (auto-generated in pre-save)
  session_id: { type: String, unique: true },
  
  // Customer Info (denormalized for quick access)
  customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  customer_name: { type: String, required: true },
  
  // Broker Info (denormalized for admin filtering)
  broker_id: { type: Schema.Types.ObjectId, ref: 'Broker', required: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Session Details
  subject: { type: String, required: true, maxlength: 200 },
  created_by_role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  
  // Status
  status: { 
    type: String, 
    enum: ['open'],
    default: 'open'
  },
  
  // Last Message Info (for session list display)
  last_message_at: { type: Date, default: Date.now },
  last_message_preview: { type: String, default: '' },
  last_message_sender: { type: String, enum: ['customer', 'admin'] },
  
  // Unread Counts
  customer_unread_count: { type: Number, default: 0 },
  admin_unread_count: { type: Number, default: 1 }, // New session starts with 1 unread for admin
  
}, { timestamps: true });

// Indexes for common queries
SupportSessionSchema.index({ customer_id: 1, status: 1 });
SupportSessionSchema.index({ status: 1, last_message_at: -1 });
SupportSessionSchema.index({ broker_id_str: 1, status: 1 });
SupportSessionSchema.index({ admin_unread_count: -1 });

// Ensure only one open session per customer
SupportSessionSchema.index(
  { customer_id: 1, status: 1 }, 
  { unique: true, partialFilterExpression: { status: 'open' } }
);

// Generate session ID before save
SupportSessionSchema.pre('save', function(next) {
  if (!this.session_id) {
    this.session_id = `SUP${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }
  next();
});

export default mongoose.model('SupportSession', SupportSessionSchema);
