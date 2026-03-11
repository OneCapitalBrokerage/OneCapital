import mongoose from 'mongoose';
const { Schema } = mongoose;

// Attachment schema for embedded documents
const AttachmentSchema = new Schema({
  url: { type: String, required: true },
  public_id: { type: String, required: true }, // Cloudinary public_id for deletion
  resource_type: { type: String, default: 'auto' },
  mime_type: { type: String, required: true },
  original_name: { type: String, required: true },
  size_bytes: { type: Number, required: true },
  uploaded_by_role: { type: String, enum: ['customer', 'admin'], required: true },
}, { _id: false });

const SupportMessageSchema = new Schema({
  // Session Reference
  session_id: { type: String, required: true, index: true },
  session_ref: { type: Schema.Types.ObjectId, ref: 'SupportSession', required: true },
  
  // Sender Info
  sender_role: { type: String, enum: ['customer', 'admin', 'system'], required: true },
  sender_id: { type: Schema.Types.ObjectId, refPath: 'sender_model' },
  sender_model: { type: String, enum: ['Customer', 'Admin'] },
  sender_name: { type: String, required: true },
  
  // Message Content
  message_type: { 
    type: String, 
    enum: ['text', 'attachment', 'system', 'mixed'],
    required: true
  },
  text: { type: String, maxlength: 4000 },
  attachments: { type: [AttachmentSchema], default: [] },
  
  // System Events (for message_type: 'system')
  system_event: { 
    type: String, 
    enum: ['session_created', 'session_closed', 'session_resolved', null],
    default: null
  },
  
  // Read Status
  read_by_customer_at: { type: Date },
  read_by_admin_at: { type: Date },
  
}, { timestamps: true });

// Indexes for message retrieval
SupportMessageSchema.index({ session_id: 1, createdAt: 1 });
SupportMessageSchema.index({ session_id: 1, createdAt: -1 });
SupportMessageSchema.index({ session_ref: 1 });

// Virtual to check if message has attachments
SupportMessageSchema.virtual('has_attachments').get(function() {
  return this.attachments && this.attachments.length > 0;
});

// Ensure JSON includes virtuals
SupportMessageSchema.set('toJSON', { virtuals: true });
SupportMessageSchema.set('toObject', { virtuals: true });

export default mongoose.model('SupportMessage', SupportMessageSchema);
