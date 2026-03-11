import mongoose from 'mongoose';
const { Schema } = mongoose;

const HoldingSchema = new Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Instrument
  instrument_token: { type: String, required: true },
  symbol: { type: String, required: true },
  exchange: { type: String, required: true },
  isin: { type: String }, // For demat reference
  
  // Quantity
  quantity: { type: Number, required: true },
  t1_quantity: { type: Number, default: 0 }, // T+1 (not settled)
  collateral_qty: { type: Number, default: 0 }, // Pledged
  
  // Prices
  avg_price: { type: Number, required: true },
  last_price: { type: Number, default: 0 },
  close_price: { type: Number, default: 0 },
  
  // P&L
  pnl: { type: Number, default: 0 },
  pnl_percent: { type: Number, default: 0 },
  day_change: { type: Number, default: 0 },
  day_change_percent: { type: Number, default: 0 },
  
  // Investment
  invested_value: { type: Number, default: 0 },
  current_value: { type: Number, default: 0 },
  
}, { timestamps: true });

HoldingSchema.index({ symbol: 1 });

export default mongoose.model('Holding', HoldingSchema);
