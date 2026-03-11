
import mongoose from 'mongoose';
const {Schema} = mongoose;

const PositionSchema = new Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Instrument
  instrument_token: { type: String, required: true },
  symbol: { type: String, required: true },
  exchange: { type: String, required: true },
  segment: { type: String, required: true },
  
  // Position Details
  product: { type: String, enum: ['MIS', 'NRML', 'CNC'], required: true },
  side: { type: String, enum: ['LONG', 'SHORT'], required: true },
  
  // Quantity
  quantity: { type: Number, required: true },
  overnight_qty: { type: Number, default: 0 },
  multiplier: { type: Number, default: 1 }, // Lot size for F&O
  
  // Prices
  avg_price: { type: Number, required: true },
  last_price: { type: Number, default: 0 },
  close_price: { type: Number, default: 0 },
  
  // P&L
  unrealized_pnl: { type: Number, default: 0 },
  realized_pnl: { type: Number, default: 0 },
  total_pnl: { type: Number, default: 0 },
  day_pnl: { type: Number, default: 0 },
  
  // Margin
  margin_used: { type: Number, default: 0 },
  
  // Status
  is_open: { type: Boolean, default: true },
  opened_at: { type: Date, default: Date.now },
  closed_at: { type: Date },
  
}, { timestamps: true });

PositionSchema.index({ customer_id_str: 1, is_open: 1 });

export default mongoose.model('Position', PositionSchema);
