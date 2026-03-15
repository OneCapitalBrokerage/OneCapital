import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema({
  // References
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_id_str: { type: String, required: true, index: true },
  broker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker', required: true },
  broker_id_str: { type: String, required: true, index: true },

  // Instrument
  instrument_token: { type: String, required: true, index: true },
  symbol: { type: String, required: true },
  exchange: { type: String, required: true }, // NSE, BSE, NFO, MCX
  segment: { type: String, required: true }, // EQUITY, F&O, COMMODITY
  tradingsymbol: { type: String },

  // Order Details
  side: { type: String, enum: ['BUY', 'SELL'], required: true },
  order_type: { type: String, enum: ['MARKET', 'LIMIT', 'SL', 'SL-M', 'OPTION_CHAIN'], required: true },
  product: { type: String, enum: ['MIS', 'CNC', 'NRML'], required: true },

  // Quantity
  quantity: { type: Number, required: true, min: 1 },
  lots: { type: Number, default: 1 },
  lot_size: { type: Number, default: 1 },
  units_per_contract: { type: Number, default: 0 }, // MCX overlay: >0 = MCX order

  // Prices
  price: { type: Number, default: 0 }, // Limit/avg entry price
  raw_entry_price: { type: Number, default: 0 },
  effective_entry_price: { type: Number, default: 0 },
  entry_spread_applied: { type: Number, default: 0 },
  trigger_price: { type: Number, default: 0 }, // Stop-loss trigger
  stop_loss: { type: Number, default: 0 },
  target: { type: Number, default: 0 },
  increase_price: { type: Number, default: 0 }, // Jobbing price

  // Execution
  filled_qty: { type: Number, default: 0 },
  pending_qty: { type: Number },
  avg_fill_price: { type: Number, default: 0 },

  // Status (canonical field)
  status: {
    type: String,
    enum: ['PENDING', 'OPEN', 'EXECUTED', 'PARTIALLY_FILLED', 'CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'HOLD'],
    default: 'PENDING',
    index: true
  },
  // Legacy alias — kept in sync via pre-save hook
  order_status: { type: String },

  // Category (canonical — auto-derived from product via pre-save)
  category: {
    type: String,
    enum: ['INTRADAY', 'DELIVERY', 'F&O'],
    index: true
  },
  // Legacy alias — kept in sync via pre-save hook
  order_category: { type: String },

  // CNC Approval (for Broker)
  requires_approval: { type: Boolean, default: false },
  approval_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  approved_at: { type: Date },
  rejection_reason: { type: String },
  rejected_at: { type: Date },
  cancelled_at: { type: Date },

  // Per-order exit permission (broker-controlled, overrides global holdingsExitAllowed)
  // false (default) = locked; broker must explicitly enable per order
  // true = customer can exit this specific order regardless of global toggle
  exit_allowed: { type: Boolean, default: false },

  // Exit Info
  exit_reason: { type: String, enum: ['manual', 'stop_loss', 'target', 'expiry', 'square_off'] },
  exit_price: { type: Number },
  raw_exit_price: { type: Number, default: 0 },
  effective_exit_price: { type: Number, default: 0 },
  exit_spread_applied: { type: Number, default: 0 },
  exit_at: { type: Date },
  closed_ltp: { type: Number },     // Legacy alias for exit_price
  closed_at: { type: Date },        // Legacy alias for exit_at
  came_From: { type: String },      // Source tab: Open, Hold, Overnight, Holdings
  pricing_bucket: { type: String, enum: ['CASH', 'FUTURE', 'OPTION', 'MCX'] },

  // Settlement
  settlement_status: {
    type: String,
    enum: ['pending', 'settled', 'failed'],
    default: 'pending'
  },

  // Financials
  brokerage: { type: Number, default: 0 },
  brokerage_breakdown: { type: mongoose.Schema.Types.Mixed },
  margin_blocked: { type: Number, default: 0 },
  margin_released_at: { type: Date },   // Set on close/cancel/reject — idempotency guard
  realized_pnl: { type: Number, default: 0 },

  // Broker Order Reference
  broker_order_id: { type: String, index: true },
  exchange_order_id: { type: String },

  // Validity lifecycle
  validity_mode: {
    type: String,
    enum: ['INTRADAY_DAY', 'INSTRUMENT_EXPIRY', 'EQUITY_7D'],
  },
  validity_started_at: { type: Date },
  validity_expires_at: { type: Date },
  validity_extended_count: { type: Number, default: 0 },
  validity_extensions: [{
    from: { type: Date },
    to: { type: Date },
    extended_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
    extended_by_str: { type: String },
    reason: { type: String },
    extended_at: { type: Date },
  }],

  // Metadata
  meta: { type: mongoose.Schema.Types.Mixed },

  // Timestamps
  placed_at: { type: Date, default: Date.now },
  executed_at: { type: Date },
  modified_at: { type: Date },

}, { timestamps: true });

// Pre-save hook: sync category from product + sync legacy aliases
OrderSchema.pre('save', function(next) {
  // Auto-populate category from product
  if (this.product) {
    const productToCat = { MIS: 'INTRADAY', CNC: 'DELIVERY', NRML: 'F&O' };
    this.category = productToCat[this.product] || 'INTRADAY';
  }
  // Sync legacy aliases
  this.order_status = this.status;
  this.order_category = this.category;
  // Sync exit field aliases
  if (this.exit_price && !this.closed_ltp) this.closed_ltp = this.exit_price;
  if (this.closed_ltp && !this.exit_price) this.exit_price = this.closed_ltp;
  if (this.exit_at && !this.closed_at) this.closed_at = this.exit_at;
  if (this.closed_at && !this.exit_at) this.exit_at = this.closed_at;
  next();
});

OrderSchema.index({ customer_id_str: 1, status: 1 });
OrderSchema.index({ broker_id_str: 1, approval_status: 1 });
OrderSchema.index({ category: 1, status: 1 });
OrderSchema.index({ placed_at: -1 });
OrderSchema.index({ validity_expires_at: 1, status: 1 });

export default mongoose.model("Order", OrderSchema);
