import mongoose from 'mongoose';

const WatchlistSchema = new mongoose.Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true },
  
  // Watchlist Group
  name: { type: String, default: 'Default' },
  is_default: { type: Boolean, default: false },
  
  // Instruments
  instruments: [{
    instrument_token: { type: String, required: true },
    symbol: { type: String, required: true },
    exchange: { type: String },
    segment: { type: String },
    added_at: { type: Date, default: Date.now },
    sort_order: { type: Number, default: 0 },
  }],
  
}, { timestamps: true });

WatchlistSchema.index({ customer_id_str: 1 });
WatchlistSchema.index({ customer_id_str: 1, name: 1 }, { unique: true });

export default mongoose.model('Watchlist', WatchlistSchema);