import mongoose from 'mongoose';
const { Schema } = mongoose;

const SystemLogSchema = new Schema({
  // Log Type
  type: { 
    type: String, 
    enum: ['security', 'data', 'transaction', 'system', 'audit'],
    required: true,
    index: true
  },
  
  // Severity
  severity: { 
    type: String, 
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
    index: true
  },
  
  // Content
  title: { type: String, required: true },
  description: { type: String },
  details: { type: Schema.Types.Mixed }, // JSON data
  
  // Actor
  actor_id: { type: mongoose.Schema.Types.ObjectId, refPath: 'actor_type' },
  actor_type: { type: String, enum: ['Admin', 'Broker', 'Customer', 'System'] },
  actor_id_str: { type: String },
  actor_name: { type: String },
  
  // Target
  target_id: { type: mongoose.Schema.Types.ObjectId },
  target_type: { type: String },
  target_id_str: { type: String },
  
  // Request Info
  ip_address: { type: String },
  user_agent: { type: String },
  endpoint: { type: String },
  method: { type: String },
  
  // Response
  status_code: { type: Number },
  response_time: { type: Number }, // in ms
  
}, { timestamps: true });

SystemLogSchema.index({ createdAt: -1 });
SystemLogSchema.index({ type: 1, severity: 1 });
SystemLogSchema.index({ actor_id_str: 1 });

export default mongoose.model('SystemLog', SystemLogSchema);