import mongoose from 'mongoose';

const { Schema } = mongoose;

const ClientPricingSchema = new Schema(
  {
    broker_id_str: { type: String, required: true, index: true },
    customer_id_str: { type: String, required: true, index: true },

    brokerage: {
      cash: {
        percent: { type: Number, default: 0.08 },
      },
      future: {
        percent: { type: Number, default: 0.08 },
      },
      option: {
        per_lot: { type: Number, default: 2 },
      },
    },

    spread: {
      cash: { type: Number, default: 0 },
      cash_mode: { type: String, enum: ['ABSOLUTE', 'PERCENT'], default: 'ABSOLUTE' },
      future: { type: Number, default: 0 },
      future_mode: { type: String, enum: ['ABSOLUTE', 'PERCENT'], default: 'ABSOLUTE' },
      option: { type: Number, default: 0 },
      option_mode: { type: String, enum: ['ABSOLUTE', 'PERCENT'], default: 'ABSOLUTE' },
      mcx: { type: Number, default: 0 },
      mcx_mode: { type: String, enum: ['ABSOLUTE', 'PERCENT'], default: 'ABSOLUTE' },
    },

    updated_by: { type: Schema.Types.ObjectId, ref: 'Broker' },
  },
  { timestamps: true }
);

ClientPricingSchema.index({ broker_id_str: 1, customer_id_str: 1 }, { unique: true });

export default mongoose.model('ClientPricing', ClientPricingSchema);
