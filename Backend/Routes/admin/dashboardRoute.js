// Routes/admin/dashboardRoute.js
// Admin Dashboard APIs - P0

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import { getDashboard, getStats, getActionItems, getActivityFeed } from '../../Controllers/admin/DashboardController.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(protect, requireAdmin);

// GET /api/admin/dashboard
router.get('/dashboard', getDashboard);

// GET /api/admin/stats
router.get('/stats', getStats);

// GET /api/admin/action-items
router.get('/action-items', getActionItems);

// GET /api/admin/activity
router.get('/activity', getActivityFeed);

export default router;
