import mongoose from 'mongoose';
const { Schema } = mongoose;

const WithdrawalRequestSchema = new Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker', required: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Amount
  amount: { type: Number, required: true },
  approved_amount: { type: Number, default: 0 },
  request_ref: { type: String, default: '' },
  
  // Bank Account
  bank_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
  bank_details: {
    bank_name: { type: String },
    account_number_masked: { type: String },
    ifsc_code: { type: String },
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // Processing
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  reviewed_at: { type: Date },
  rejection_reason: { type: String },
  
  // Transfer Details
  utr_number: { type: String },
  transferred_at: { type: Date },
  
  // Priority
  is_high_value: { type: Boolean, default: false }, // > threshold
  
}, { timestamps: true });

WithdrawalRequestSchema.index({ broker_id_str: 1, status: 1 });
WithdrawalRequestSchema.index({ createdAt: -1 });
WithdrawalRequestSchema.index({ request_ref: 1 });

export default mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);
