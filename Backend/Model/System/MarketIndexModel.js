import mongoose from 'mongoose';
const { Schema } = mongoose;

const MarketIndexSchema = new Schema({
  // Index Info
  symbol: { type: String, required: true, unique: true }, // NIFTY 50, SENSEX
  name: { type: String, required: true },
  exchange: { type: String, required: true },
  
  // Prices
  last_price: { type: Number, default: 0 },
  open: { type: Number, default: 0 },
  high: { type: Number, default: 0 },
  low: { type: Number, default: 0 },
  close: { type: Number, default: 0 },
  
  // Change
  change: { type: Number, default: 0 },
  change_percent: { type: Number, default: 0 },
  
  // Volume
  volume: { type: Number, default: 0 },
  
  // Timestamps
  last_updated: { type: Date, default: Date.now },
  
}, { timestamps: true });

export default mongoose.model('MarketIndex', MarketIndexSchema);