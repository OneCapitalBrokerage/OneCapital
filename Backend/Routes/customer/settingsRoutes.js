// Routes/customer/settingsRoutes.js
// Customer Settings APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getSettings,
  updateSettings,
  changePassword,
  updateNotifications,
  uploadProfilePhoto,
  getProfilePhotoUploadSignature,
  getWarning,
} from '../../Controllers/customer/SettingsController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/customer/settings
 * @desc    Get customer settings
 * @access  Private (Customer only)
 */
router.get('/settings', getSettings);

/**
 * @route   PUT /api/customer/settings
 * @desc    Update settings
 * @access  Private (Customer only)
 */
router.put('/settings', updateSettings);

/**
 * @route   POST /api/customer/change-password
 * @desc    Change password
 * @access  Private (Customer only)
 */
router.post('/change-password', changePassword);

/**
 * @route   PUT /api/customer/settings/notifications
 * @desc    Update notification preferences
 * @access  Private (Customer only)
 */
router.put('/settings/notifications', updateNotifications);

/**
 * @route   PUT /api/customer/profile/photo
 * @desc    Save profile photo URL after Cloudinary upload
 * @access  Private (Customer only)
 */
router.put('/profile/photo', uploadProfilePhoto);

/**
 * @route   GET /api/customer/profile/photo-upload-signature
 * @desc    Get Cloudinary upload signature for profile photo
 * @access  Private (Customer only)
 */
router.get('/profile/photo-upload-signature', getProfilePhotoUploadSignature);

/**
 * @route   GET /api/customer/warning
 * @desc    Get active admin warning for current customer
 * @access  Private (Customer only)
 */
router.get('/warning', getWarning);

export default router;
