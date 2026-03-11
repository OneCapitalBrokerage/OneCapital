// Routes/admin/logsRoute.js
// Admin System Logs APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import {
  getAllLogs,
  getSecurityLogs,
  getTransactionLogs,
  getDataLogs,
  getSystemLogs,
  clearLogs,
  exportLogs,
} from '../../Controllers/admin/LogsController.js';
import {
  getAuditAlerts,
  getAuditAlertStats,
} from '../../Controllers/admin/AuditAlertController.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(protect, requireAdmin);

// GET /api/admin/logs
router.get('/logs', getAllLogs);

// DELETE /api/admin/logs
router.delete('/logs', clearLogs);

// GET /api/admin/logs/export - must be before type-specific routes
router.get('/logs/export', exportLogs);

// GET /api/admin/logs/alerts
router.get('/logs/alerts', getAuditAlerts);

// GET /api/admin/logs/alerts/stats
router.get('/logs/alerts/stats', getAuditAlertStats);

// GET /api/admin/logs/security
router.get('/logs/security', getSecurityLogs);

// GET /api/admin/logs/transactions
router.get('/logs/transactions', getTransactionLogs);

// GET /api/admin/logs/data
router.get('/logs/data', getDataLogs);

// GET /api/admin/logs/system
router.get('/logs/system', getSystemLogs);

export default router;
