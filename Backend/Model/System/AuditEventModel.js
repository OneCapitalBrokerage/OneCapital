import mongoose from 'mongoose';

const { Schema } = mongoose;

const AuditEventSchema = new Schema(
  {
    event_id: {
      type: String,
      unique: true,
      index: true,
      default: () => `AUD_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    },

    // Legacy admin logs compatibility
    type: {
      type: String,
      enum: ['security', 'transaction', 'data', 'system', 'error', 'audit'],
      default: 'audit',
      index: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info',
      index: true,
    },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },

    // Canonical audit fields
    event_type: { type: String, required: true, index: true },
    category: { type: String, default: 'audit', index: true },
    status: {
      type: String,
      enum: ['attempt', 'success', 'failed', 'rejected'],
      default: 'success',
      index: true,
    },

    actor_type: {
      type: String,
      enum: ['admin', 'broker', 'customer', 'system'],
      default: 'system',
      index: true,
    },
    actor_id: { type: Schema.Types.ObjectId, index: true },
    actor_id_str: { type: String, index: true },
    actor_role: { type: String },

    impersonation: {
      is_impersonation: { type: Boolean, default: false },
      impersonator_role: { type: String },
      impersonated_by: { type: Schema.Types.ObjectId },
    },

    target_type: { type: String, index: true },
    target_id: { type: Schema.Types.ObjectId, index: true },
    target_id_str: { type: String, index: true },

    broker_id: { type: Schema.Types.ObjectId, index: true },
    broker_id_str: { type: String, index: true },
    customer_id: { type: Schema.Types.ObjectId, index: true },
    customer_id_str: { type: String, index: true },

    entity_type: { type: String, index: true },
    entity_id: { type: Schema.Types.ObjectId, index: true },
    entity_ref: { type: String, index: true },

    amount_delta: { type: Number, default: 0 },
    fund_before: { type: Schema.Types.Mixed },
    fund_after: { type: Schema.Types.Mixed },
    margin_before: { type: Schema.Types.Mixed },
    margin_after: { type: Schema.Types.Mixed },

    reason: { type: String },
    note: { type: String },

    source: { type: String, enum: ['api', 'cron', 'system', 'ws'], default: 'api', index: true },

    request_id: { type: String, index: true },
    endpoint: { type: String },
    method: { type: String },
    ip_address: { type: String },
    user_agent: { type: String },

    // Explicit timestamp for compatibility with older logs payload shape
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

AuditEventSchema.index({ createdAt: -1 });
AuditEventSchema.index({ type: 1, createdAt: -1 });
AuditEventSchema.index({ event_type: 1, createdAt: -1 });
AuditEventSchema.index({ broker_id_str: 1, customer_id_str: 1, createdAt: -1 });
AuditEventSchema.index({ category: 1, status: 1, createdAt: -1 });
AuditEventSchema.index({ broker_id_str: 1, event_type: 1, createdAt: -1 });
AuditEventSchema.index({ customer_id_str: 1, event_type: 1, createdAt: -1 });
AuditEventSchema.index({ amount_delta: 1, createdAt: -1 });
AuditEventSchema.index({ source: 1, category: 1, createdAt: -1 });

export default mongoose.model('AuditEvent', AuditEventSchema);
