import mongoose from 'mongoose';
const { Schema } = mongoose;

const FundTransactionSchema = new Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Transaction Type
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'brokerage', 'charge', 'refund', 'transfer', 'margin_call'],
    required: true
  },
  
  // Amount
  amount: { type: Number, required: true },
  balance_before: { type: Number, required: true },
  balance_after: { type: Number, required: true },
  
  // Payment Details (for deposits)
  payment_method: { 
    type: String, 
    enum: ['upi', 'netbanking', 'neft', 'rtgs', 'imps', 'cheque', 'cash', 'internal']
  },
  payment_reference: { type: String },
  bank_reference: { type: String },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Description
  description: { type: String },
  remarks: { type: String },
  
  // Related Order (for brokerage charges)
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  
  // Processing Info
  processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  processed_at: { type: Date },
  
}, { timestamps: true });

FundTransactionSchema.index({ customer_id_str: 1, createdAt: -1 });
FundTransactionSchema.index({ broker_id_str: 1, type: 1 });
FundTransactionSchema.index({ status: 1 });

export default mongoose.model('FundTransaction', FundTransactionSchema);