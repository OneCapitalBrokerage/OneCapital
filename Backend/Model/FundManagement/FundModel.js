import mongoose from 'mongoose';

const FundSchema = new mongoose.Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
  customer_id_str: { type: String, required: true, unique: true },
  broker_id_str: { type: String, required: true, index: true },
  
  // Available Balance (legacy + current)
  available_balance: { type: Number, default: 0 },
  net_available_balance: { type: Number, default: 0 },

  // Realized P&L balance (accumulated profits/losses from closed trades, starts at 0)
  pnl_balance: { type: Number, default: 0 },

  // Opening Balance (broker-assigned trading capital for the day)
  opening_balance: { type: Number, default: 0 },
  
  // Margins
  total_margin: { type: Number, default: 0 },
  used_margin: { type: Number, default: 0 },
  available_margin: { type: Number, default: 0 },
  
  // Collateral
  collateral_value: { type: Number, default: 0 },
  
  // Limits by Product (legacy shape uses available_limit/used_limit)
  intraday: {
    available: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    available_limit: { type: Number, default: 0 },
    used_limit: { type: Number, default: 0 },
  },
  delivery: {
    available: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    available_limit: { type: Number, default: 0 },
    used_limit: { type: Number, default: 0 },
  },
  overnight: {
    available_limit: { type: Number, default: 0 },
    used_limit: { type: Number, default: 0 },
  },
  commodity_delivery: {
    available_limit: { type: Number, default: 0 },
    used_limit: { type: Number, default: 0 },
  },
  commodity_intraday: {
    available_limit: { type: Number, default: 0 },
    used_limit: { type: Number, default: 0 },
  },
  commodity_option: {
    limit_percentage: { type: Number, default: 10 },
    used: { type: Number, default: 0 },
  },
  
  // Withdrawable
  withdrawable_balance: { type: Number, default: 0 },
  
  // Broker's Limit Settings
  limit_settings: {
    intraday_multiplier: { type: Number, default: 1 },
    f_and_o_enabled: { type: Boolean, default: true },
    max_order_value: { type: Number, default: 0 }, // 0 = unlimited
  },

  // Option limit percentage (legacy)
  option_limit_percentage: { type: Number, default: 10 },

  // Optional tracker for option premium consumption
  option_premium_used: { type: Number, default: 0 },

  // Transaction ledger used by customer funds history/summary cards
  transactions: [{
    type: { type: String },
    amount: { type: Number, default: 0 },
    notes: { type: String },
    status: { type: String },
    reference: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
    timestamp: { type: Date, default: Date.now },
  }],
  
  // Last Updated
  last_calculated_at: { type: Date, default: Date.now },
  
}, { timestamps: true });

export default mongoose.model('Fund', FundSchema);
