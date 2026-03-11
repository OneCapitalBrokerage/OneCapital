import mongoose from 'mongoose';
const { Schema } = mongoose;

const documentSchema = {
  url: { type: String },
  public_id: { type: String },
  uploaded_at: { type: Date },
};

const STATUS_ENUM = ['not_submitted', 'pending', 'in_process', 'approved', 'rejected'];

const CustomerKYCSchema = new Schema({
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    unique: true,
  },
  customer_id_str: { type: String, required: true },

  // Aadhaar Card
  aadhaar: {
    number: { type: String },           // masked: ****1234
    number_full: { type: String },      // full 12-digit (backend only)
    front: documentSchema,
    back: documentSchema,
    status: { type: String, enum: STATUS_ENUM, default: 'not_submitted' },
    submitted_at: { type: Date },
    reviewed_at: { type: Date },
    rejection_reason: { type: String },
  },

  // PAN Card
  pan: {
    number: { type: String },           // ABCDE1234F
    front: documentSchema,
    back: documentSchema,
    signature: documentSchema,
    status: { type: String, enum: STATUS_ENUM, default: 'not_submitted' },
    submitted_at: { type: Date },
    reviewed_at: { type: Date },
    rejection_reason: { type: String },
  },

  // Bank Proof (passbook / cancelled cheque)
  bank_proof: {
    document: documentSchema,
    status: { type: String, enum: STATUS_ENUM, default: 'not_submitted' },
    submitted_at: { type: Date },
    reviewed_at: { type: Date },
    rejection_reason: { type: String },
  },

  // Overall KYC status
  overall_status: {
    type: String,
    enum: ['not_submitted', 'partial', 'pending', 'in_process', 'approved', 'rejected'],
    default: 'not_submitted',
  },

}, { timestamps: true });

CustomerKYCSchema.index({ customer_id_str: 1 });
CustomerKYCSchema.index({ overall_status: 1 });

// Helper to recalculate overall_status from individual statuses
CustomerKYCSchema.methods.recalculateOverallStatus = function () {
  const statuses = [
    this.aadhaar?.status || 'not_submitted',
    this.pan?.status || 'not_submitted',
    this.bank_proof?.status || 'not_submitted',
  ];

  if (statuses.every(s => s === 'approved')) {
    this.overall_status = 'approved';
  } else if (statuses.some(s => s === 'rejected')) {
    this.overall_status = 'rejected';
  } else if (statuses.every(s => s === 'not_submitted')) {
    this.overall_status = 'not_submitted';
  } else if (statuses.some(s => s === 'in_process')) {
    this.overall_status = 'in_process';
  } else if (statuses.some(s => s === 'pending')) {
    this.overall_status = 'pending';
  } else {
    this.overall_status = 'partial';
  }
};

export default mongoose.model('CustomerKYC', CustomerKYCSchema);
