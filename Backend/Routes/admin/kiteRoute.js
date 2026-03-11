// Routes/admin/kiteRoute.js
// Admin Kite management routes

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import { generateKiteTOTP } from '../../Controllers/admin/KiteController.js';

const router = express.Router();

router.use(protect, requireAdmin);

// POST /api/admin/kite/totp/generate
router.post('/kite/totp/generate', generateKiteTOTP);

export default router;
