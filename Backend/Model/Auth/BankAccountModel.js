import mongoose from 'mongoose';
const { Schema } = mongoose;

const BankAccountSchema = new Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true },
  
  // Bank Details
  bank_name: { type: String, required: true },
  account_number: { type: String, required: true }, // Encrypted
  account_number_masked: { type: String }, // ****1234
  ifsc_code: { type: String, required: true },
  account_holder_name: { type: String, required: true },
  account_type: { type: String, enum: ['savings', 'current'], default: 'savings' },
  
  // Verification
  is_verified: { type: Boolean, default: false },
  verified_at: { type: Date },
  verification_method: { type: String, enum: ['penny_drop', 'manual', 'ifsc_lookup'] },
  
  // Status
  is_primary: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  
}, { timestamps: true });

BankAccountSchema.index({ customer_id: 1 });
BankAccountSchema.index({ customer_id_str: 1 });

export default mongoose.model('BankAccount', BankAccountSchema);