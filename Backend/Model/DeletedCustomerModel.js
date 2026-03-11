// Model/DeletedCustomerModel.js
// Soft-deleted customer records for restore functionality

import mongoose from 'mongoose';

const DeletedCustomerSchema = new mongoose.Schema({
  // Original customer data
  original_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  customer_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  phone: {
    type: String,
  },
  password: {
    type: String,
  },
  
  // Broker reference
  attached_broker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broker',
  },
  
  // Role
  role: {
    type: String,
  },

  // Original customer data snapshot
  original_data: {
    type: mongoose.Schema.Types.Mixed,
  },

  // Archived related data
  archived_fund: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  archived_orders: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  archived_holdings: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  archived_positions: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  archived_watchlist: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  data_summary: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  // Original creation date
  original_created_at: {
    type: Date,
  },

  // Deletion info
  deleted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broker',
  },
  deleted_at: {
    type: Date,
    default: Date.now,
  },
  deletion_reason: {
    type: String,
  },
  
  // Expiry for permanent deletion (30 days)
  expires_at: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  },
  
}, { timestamps: true });

// Index for auto-deletion after expiry
DeletedCustomerSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Index for broker queries
DeletedCustomerSchema.index({ attached_broker_id: 1, deleted_at: -1 });

const DeletedCustomerModel = mongoose.model('DeletedCustomer', DeletedCustomerSchema);

export default DeletedCustomerModel;
