import mongoose from 'mongoose';
const { Schema } = mongoose;

const DeletedRecordSchema = new Schema({
  // Original Record
  original_collection: { type: String, required: true },
  original_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  original_data: { type: Schema.Types.Mixed, required: true },
  
  // Deletion Info
  deleted_by: { type: mongoose.Schema.Types.ObjectId, refPath: 'deleted_by_type' },
  deleted_by_type: { type: String, enum: ['Admin', 'Broker', 'System'] },
  deletion_reason: { type: String },
  
  // Retention
  can_restore: { type: Boolean, default: true },
  restore_until: { type: Date }, // After this, permanent delete
  
}, { timestamps: true });

DeletedRecordSchema.index({ original_collection: 1, original_id: 1 });
DeletedRecordSchema.index({ createdAt: -1 });

export default mongoose.model('DeletedRecord', DeletedRecordSchema);