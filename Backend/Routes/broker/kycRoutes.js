// Routes/broker/kycRoutes.js
// Broker KYC Approval APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getKycRequests,
  getKycDetail,
  approveKyc,
  rejectKyc,
  getKycStats,
} from '../../Controllers/broker/KycController.js';

const router = express.Router();

router.use(protect);

router.get('/kyc', getKycRequests);
router.get('/kyc/stats', getKycStats);
router.get('/kyc/:id', getKycDetail);
router.post('/kyc/:id/approve', approveKyc);
router.post('/kyc/:id/reject', rejectKyc);

export default router;
