import mongoose from 'mongoose';

const OrderAttemptSchema = new mongoose.Schema(
  {
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customer_id_str: { type: String, required: true, index: true },
    broker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
    broker_id_str: { type: String, required: true, index: true },

    instrument_token: { type: String, index: true },
    symbol: { type: String, required: true, index: true },
    exchange: { type: String, default: 'NSE' },
    segment: { type: String, default: 'NSE' },

    side: { type: String, default: 'BUY' },
    product: { type: String, default: 'MIS', index: true },
    order_type: { type: String, default: 'MARKET' },

    quantity: { type: Number, default: 0 },
    lots: { type: Number, default: 0 },
    lot_size: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    raw_entry_price: { type: Number, default: 0 },

    failure_code: { type: String, required: true, index: true },
    failure_reason: { type: String, required: true },
    http_status: { type: Number, default: 400 },

    source: { type: String, default: 'order_sheet' },
    source_endpoint: { type: String },
    source_method: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

OrderAttemptSchema.index({ customer_id_str: 1, broker_id_str: 1, product: 1, createdAt: -1 });
OrderAttemptSchema.index({ customer_id_str: 1, broker_id_str: 1, createdAt: -1 });
OrderAttemptSchema.index({ customer_id_str: 1, broker_id_str: 1, failure_code: 1, createdAt: -1 });

export default mongoose.model('OrderAttempt', OrderAttemptSchema);
