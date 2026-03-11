import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  runWeeklySettlement,
  runCustomerSettlement,
  getWeeklySettlementHistory,
} from '../../Controllers/broker/SettlementController.js';

const router = express.Router();

router.use(protect);

router.post('/settlement/weekly/run', runWeeklySettlement);
router.post('/settlement/customer/:customerIdStr/run', runCustomerSettlement);
router.get('/settlement/weekly/history', getWeeklySettlementHistory);

export default router;
