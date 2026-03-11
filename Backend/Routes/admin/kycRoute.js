// Routes/admin/kycRoute.js
// Admin KYC Approval APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import {
  getAllKycRequests,
  getKycById,
  approveKyc,
  rejectKyc,
  getKycStats,
} from '../../Controllers/admin/KycController.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(protect, requireAdmin);

// GET /api/admin/kyc
router.get('/kyc', getAllKycRequests);

// GET /api/admin/kyc/stats - MUST be before /kyc/:id to prevent param capture
router.get('/kyc/stats', getKycStats);

// GET /api/admin/kyc/:id
router.get('/kyc/:id', getKycById);

// POST /api/admin/kyc/:id/approve
router.post('/kyc/:id/approve', approveKyc);

// POST /api/admin/kyc/:id/reject
router.post('/kyc/:id/reject', rejectKyc);

export default router;
