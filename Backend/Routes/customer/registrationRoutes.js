// Routes/customer/registrationRoutes.js
// Customer Registration & KYC APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  submitRegistration,
  uploadDocuments,
  checkStatus,
  getUploadSignature,
  checkUserId,
} from '../../Controllers/customer/RegistrationController.js';

const router = express.Router();

// --- PUBLIC ROUTES (No auth required) ---

/**
 * @route   POST /api/customer/register
 * @desc    Submit new customer registration
 * @access  Public
 */
router.post('/register', submitRegistration);

/**
 * @route   GET /api/customer/register/:id/status
 * @desc    Check registration status
 * @access  Public
 */
router.get('/register/:id/status', checkStatus);

/**
 * @route   GET /api/customer/register/upload-signature
 * @desc    Get Cloudinary signature for direct upload
 * @access  Public
 */
router.get('/register/upload-signature', getUploadSignature);

/**
 * @route   GET /api/customer/register/check-userid
 * @desc    Check if a user ID is available
 * @access  Public
 */
router.get('/register/check-userid', checkUserId);

/**
 * @route   POST /api/customer/register/:id/documents
 * @desc    Upload KYC documents
 * @access  Public (with registration ID)
 */
router.post('/register/:id/documents', uploadDocuments);

// --- PROTECTED ROUTES ---
router.use(protect);

/**
 * @route   GET /api/customer/kyc
 * @desc    Get KYC status & details (for logged-in customer)
 * @access  Private (Customer only)
 */
router.get('/kyc', async (req, res) => {
  const customer = req.user;
  
  res.status(200).json({
    success: true,
    kyc: {
      status: customer.kyc_status || 'pending',
      panNumber: customer.pan_number ? customer.pan_number.substring(0, 5) + '****' + customer.pan_number.slice(-1) : null,
      aadharNumber: customer.aadhar_number ? '****-****-' + customer.aadhar_number.slice(-4) : null,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      verifiedAt: customer.kyc_verified_at,
    },
  });
});

export default router;
