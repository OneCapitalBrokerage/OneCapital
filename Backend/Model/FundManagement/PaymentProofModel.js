import mongoose from 'mongoose';
const { Schema } = mongoose;

const PaymentProofSchema = new Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  customer_id_str: { type: String, required: true, index: true },
  customer_name: { type: String },
  broker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  broker_id_str: { type: String, required: true, index: true },

  amount: { type: Number, required: true, min: 1 },

  // Request details
  payment_method: { type: String, enum: ['upi'], default: 'upi' },
  payment_reference: { type: String },
  payment_date: { type: Date },
  utr_number: { type: String }, // UTR or transaction ID (optional, user-provided)
  transaction_id: { type: String }, // Alternative reference ID (optional)

  // Proof upload details (DEPRECATED - screenshot proof no longer required)
  proof_type: { type: String, enum: ['image'], default: 'image' },
  proof_url: { type: String },
  proof_public_id: { type: String },
  file_size: { type: String },
  proof_uploaded_at: { type: Date },

  // Request lifecycle:
  // pending -> verified/rejected (pending_proof deprecated, kept for existing records)
  status: {
    type: String,
    enum: ['pending_proof', 'pending', 'verified', 'rejected'],
    default: 'pending',
    index: true,
  },

  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  reviewed_at: { type: Date },
  rejection_reason: { type: String },
  verification_note: { type: String },
  verified_amount: { type: Number },

  // Reserved for future accounting linkage
  fund_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'FundTransaction' },
}, { timestamps: true });

PaymentProofSchema.index({ broker_id_str: 1, status: 1 });
PaymentProofSchema.index({ customer_id_str: 1, createdAt: -1 });
PaymentProofSchema.index({ createdAt: -1 });

export default mongoose.model('PaymentProof', PaymentProofSchema);
