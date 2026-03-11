import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getKycDocuments,
  submitAadhaar,
  submitPan,
  submitBankProof,
  getUploadSignature,
} from '../../Controllers/customer/CustomerKYCController.js';

const router = express.Router();

router.use(protect);

router.get('/kyc-documents', getKycDocuments);
router.post('/kyc-documents/aadhaar', submitAadhaar);
router.post('/kyc-documents/pan', submitPan);
router.post('/kyc-documents/bank-proof', submitBankProof);
router.get('/kyc-documents/upload-signature', getUploadSignature);

export default router;
