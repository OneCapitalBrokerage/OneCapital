// Model/RegistrationModel.js
// Legacy Registration Model - Backward compatibility
// New code should use Model/KYC/KYCRequestModel.js

import mongoose from 'mongoose';
const { Schema } = mongoose;

const RegistrationSchema = new Schema({
  // Personal Info
  name: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  email: { type: String },
  phone: { type: String },
  mobileNumber: { type: String },
  whatsappNumber: { type: String },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  
  // KYC Details
  panNumber: { type: String },
  aadharNumber: { type: String },

  // Signup Credentials (stored during registration)
  userId: { type: String },
  password: { type: String },
  
  // Address
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
  },
  
  // Occupation & Income
  occupation: { type: String, enum: ['salaried', 'business', 'professional', 'student', 'retired', 'other'] },
  annual_income: { type: String, enum: ['below_1l', '1l_5l', '5l_10l', '10l_25l', 'above_25l'] },

  // Nominee
  nominee: {
    name: { type: String },
    relation: { type: String },
    date_of_birth: { type: Date },
    guardian: { type: String },
  },

  // Bank details
  bank_details: {
    bank_name: { type: String },
    account_holder_name: { type: String },
    account_number: { type: String },
    ifsc_code: { type: String },
    account_type: { type: String, enum: ['savings', 'current'] },
  },

  // Trading segments
  segments_requested: [{ type: String, enum: ['EQUITY', 'F&O', 'COMMODITY', 'CURRENCY'] }],

  // Documents
  documents: {
    aadhaarFront: {
      url: { type: String },
      public_id: { type: String },
      uploadedAt: { type: Date },
    },
    aadhaarBack: {
      url: { type: String },
      public_id: { type: String },
      uploadedAt: { type: Date },
    },
    panCard: {
      url: { type: String },
      public_id: { type: String },
      uploadedAt: { type: Date },
    },
    passportPhoto: {
      url: { type: String },
      public_id: { type: String },
      uploadedAt: { type: Date },
    },
    signature: {
      url: { type: String },
      public_id: { type: String },
      uploadedAt: { type: Date },
    },
    bankProof: {
      url: { type: String },
      public_id: { type: String },
      uploadedAt: { type: Date },
    },
    incomeProof: {
      url: { type: String },
      public_id: { type: String },
      uploadedAt: { type: Date },
    },
  },

  // Broker reference
  brokerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  broker_id_str: { type: String },   // denormalized string broker_id for fast filtering
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'resubmit_required'],
    default: 'pending',
    index: true
  },
  
  // Review
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker' },
  reviewedAt: { type: Date },
  rejectionReason: { type: String },
  
  // Consent
  terms_agreed: { type: Boolean, default: false },
  data_consent: { type: Boolean, default: false },

  // Source
  ipAddress: { type: String },
  userAgent: { type: String },

}, { timestamps: true });

// Indexes
RegistrationSchema.index({ status: 1, createdAt: -1 });
RegistrationSchema.index({ brokerId: 1, status: 1 });
RegistrationSchema.index({ panNumber: 1 });
RegistrationSchema.index({ phone: 1 });
RegistrationSchema.index({ email: 1 });
RegistrationSchema.index({ userId: 1 });

const RegistrationModel = mongoose.model('Registration', RegistrationSchema);

export default RegistrationModel;
