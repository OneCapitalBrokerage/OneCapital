import mongoose from 'mongoose';
const { Schema } = mongoose;

const KYCRequestSchema = new Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customer_id_str: { type: String },
  broker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  broker_id_str: { type: String, index: true },
  
  // Personal Info
  full_name: { type: String, required: true },
  name_as_per_aadhaar: { type: String, required: true },
  date_of_birth: { type: Date, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  
  // Contact
  email: { type: String, required: true },
  phone: { type: String, required: true },
  whatsapp: { type: String },
  mobileNumber: {
    type: String,
    required: true,
    match: [/^[6-9]\d{9}$/, 'Invalid mobile number'],
  },
  whatsappNumber: {
    type: String,
    required: true,
    match: [/^[6-9]\d{9}$/, 'Invalid WhatsApp number'],
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },

  // KYC Documents
  pan_number: { type: String, required: true },
  aadhar_number: { type: String, required: true }, // Encrypted

  // Address
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },

  // Documents
  documents: {
    pan_card: {
      url: { type: String, required: true },
      public_id: { type: String },
      uploaded_at: { type: Date, default: Date.now },
    },
    aadhar_front: {
      url: { type: String, required: true },
      public_id: { type: String },
      uploaded_at: { type: Date, default: Date.now },
    },
    aadhar_back: {
      url: { type: String, required: true },
      public_id: { type: String },
      uploaded_at: { type: Date, default: Date.now },
    },
    photo: {
      url: { type: String },
      public_id: { type: String },
      uploaded_at: { type: Date },
    },
    address_proof: {
      url: { type: String },
      public_id: { type: String },
      uploaded_at: { type: Date },
    },
    bank_statement: {
      url: { type: String },
      public_id: { type: String },
      uploaded_at: { type: Date },
    },
  },

  // Status
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'resubmit_required'],
    default: 'pending',
    index: true
  },
  
  // Review
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, refPath: 'reviewed_by_type' },
  reviewed_by_type: { type: String, enum: ['Broker', 'Admin'] },
  reviewed_at: { type: Date },
  review_notes: { type: String },
  rejection_reason: { type: String },
  
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broker',
  },
  
  reviewedAt: {
    type: Date,
  },

  // ===== TELEGRAM TRACKING =====
  telegramSent: {
    type: Boolean,
    default: false,
  },
  telegramMessageId: {
    type: String,
  },

  // ===== LINKED CUSTOMER (after approval) =====
  linkedCustomerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
  },

}, { timestamps: true });

KYCRequestSchema.index({ status: 1, createdAt: -1 });
KYCRequestSchema.index({ broker_id_str: 1, status: 1 });
KYCRequestSchema.index({ pan_number: 1 });
KYCRequestSchema.index({ phone: 1 });

export default mongoose.model('KYCRequest', KYCRequestSchema);
