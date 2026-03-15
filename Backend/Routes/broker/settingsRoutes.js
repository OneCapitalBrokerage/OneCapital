// Routes/broker/settingsRoutes.js
// Broker Settings APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getSettings,
  updateSettings,
  updateClientInfo,
  updateNotifications,
  getClientInfoUploadSignature,
  discardClientInfoQrUpload,
} from '../../Controllers/broker/SettingsController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/broker/settings
 * @desc    Get broker settings
 * @access  Private (Broker only)
 */
router.get('/settings', getSettings);

/**
 * @route   PUT /api/broker/settings
 * @desc    Update broker settings
 * @access  Private (Broker only)
 */
router.put('/settings', updateSettings);

/**
 * @route   PUT /api/broker/settings/client-info
 * @desc    Update client-facing info (UPI, support contact)
 * @access  Private (Broker only)
 */
router.put('/settings/client-info', updateClientInfo);

/**
 * @route   GET /api/broker/settings/client-info/upload-signature
 * @desc    Get upload signature for client-info QR image
 * @access  Private (Broker only)
 */
router.get('/settings/client-info/upload-signature', getClientInfoUploadSignature);

/**
 * @route   POST /api/broker/settings/client-info/qr/discard
 * @desc    Delete a temporary QR upload that was not saved
 * @access  Private (Broker only)
 */
router.post('/settings/client-info/qr/discard', discardClientInfoQrUpload);

/**
 * @route   PUT /api/broker/settings/notifications
 * @desc    Update notification preferences
 * @access  Private (Broker only)
 */
router.put('/settings/notifications', updateNotifications);

export default router;
