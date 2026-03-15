// Routes/admin/brokerRoute.js
// Admin Broker Management APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import {
  getAllBrokers,
  getBrokerById,
  createBroker,
  updateBroker,
  updateReferenceCode,
  deleteBroker,
  blockBroker,
  unblockBroker,
  getBrokerCompliance,
  getBrokerCredentials,
} from '../../Controllers/admin/BrokerController.js';

const router = express.Router();

router.use(protect, requireAdmin);

router.get('/brokers', getAllBrokers);
router.post('/brokers', createBroker);
router.get('/brokers/:id', getBrokerById);
router.put('/brokers/:id', updateBroker);
router.put('/brokers/:id/reference-code', updateReferenceCode);
router.delete('/brokers/:id', deleteBroker);
router.post('/brokers/:id/block', blockBroker);
router.post('/brokers/:id/unblock', unblockBroker);
router.get('/brokers/:id/compliance', getBrokerCompliance);
router.get('/brokers/:id/credentials', getBrokerCredentials);

export default router;
