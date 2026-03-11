// Model/UserWatchlistModel.js
// User Watchlist Model - Legacy alias
// Points to Trading/WatchListModel for backward compatibility

import mongoose from 'mongoose';

const UserWatchlistSchema = new mongoose.Schema({
  // Customer reference
  customer_id_str: { type: String, required: true, index: true },
  broker_id_str: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  
  // Watchlist name
  name: { type: String, default: 'Watchlist 1' },
  
  // Instruments list
  instruments: [{
    symbol: { type: String, required: true },
    name: { type: String },
    instrumentToken: { type: String },
    exchange: { type: String, default: 'NSE' },
    segment: { type: String },
    instrument_type: { type: String, default: null },
    lot_size: { type: Number, default: null },
    expiry: { type: Date, default: null },
    addedAt: { type: Date, default: Date.now },
    sortOrder: { type: Number, default: 0 },
  }],
  
}, { timestamps: true });

// Indexes
UserWatchlistSchema.index({ customer_id_str: 1, broker_id_str: 1 });
UserWatchlistSchema.index({ customer_id_str: 1, broker_id_str: 1, name: 1 }, { unique: true });
UserWatchlistSchema.index({ userId: 1 });

const UserWatchlistModel = mongoose.model('UserWatchlist', UserWatchlistSchema);

export default UserWatchlistModel;
