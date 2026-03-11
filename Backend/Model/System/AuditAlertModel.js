import mongoose from 'mongoose';

const { Schema } = mongoose;

const AuditAlertSchema = new Schema(
  {
    alert_id: {
      type: String,
      unique: true,
      index: true,
      default: () => `ALRT_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    },
    rule_key: { type: String, required: true, index: true },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved', 'ignored'],
      default: 'open',
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    event_type: { type: String, index: true },

    actor_type: { type: String, enum: ['admin', 'broker', 'customer', 'system'], default: 'system' },
    actor_id: { type: Schema.Types.ObjectId, index: true },
    actor_id_str: { type: String, index: true },

    broker_id: { type: Schema.Types.ObjectId, index: true },
    broker_id_str: { type: String, index: true },
    customer_id: { type: Schema.Types.ObjectId, index: true },
    customer_id_str: { type: String, index: true },

    entity_type: { type: String, index: true },
    entity_id: { type: Schema.Types.ObjectId, index: true },
    entity_ref: { type: String, index: true },

    latest_event_id: { type: Schema.Types.ObjectId, ref: 'AuditEvent', index: true },
    latest_event_ref: { type: String, index: true },
    request_id: { type: String, index: true },

    amount_delta: { type: Number, default: 0 },
    amount_abs: { type: Number, default: 0 },

    first_seen_at: { type: Date, default: Date.now, index: true },
    last_seen_at: { type: Date, default: Date.now, index: true },
    occurrence_count: { type: Number, default: 1 },

    context: { type: Schema.Types.Mixed, default: {} },
    tags: [{ type: String }],

    source: { type: String, enum: ['rule_engine', 'manual'], default: 'rule_engine', index: true },
    resolution_note: { type: String, default: '' },
    resolved_by: { type: Schema.Types.ObjectId },
    resolved_by_str: { type: String, default: '' },
    resolved_at: { type: Date },
  },
  { timestamps: true }
);

AuditAlertSchema.index({ status: 1, severity: -1, last_seen_at: -1 });
AuditAlertSchema.index({ rule_key: 1, broker_id_str: 1, customer_id_str: 1, status: 1 });
AuditAlertSchema.index({ broker_id_str: 1, status: 1, last_seen_at: -1 });
AuditAlertSchema.index({ customer_id_str: 1, status: 1, last_seen_at: -1 });
AuditAlertSchema.index({ event_type: 1, createdAt: -1 });

export default mongoose.model('AuditAlert', AuditAlertSchema);
