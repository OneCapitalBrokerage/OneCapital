// Routes/admin/supportRoutes.js
// Admin Support Chat APIs

import express from 'express';
import multer from 'multer';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import {
  getAllSessions,
  getSession,
  getMessages,
  sendMessage,
  markRead,
  resolveSession,
  closeSession,
  sendTyping,
  getUnreadCount,
} from '../../Controllers/admin/SupportController.js';

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(protect, requireAdmin);

// Multer configuration for attachments
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 3, // Max 3 files per request
  },
});

/**
 * @route   GET /api/admin/support/sessions
 * @desc    Get all support sessions with filtering and pagination
 * @access  Private (Admin only)
 */
router.get('/support/sessions', getAllSessions);

/**
 * @route   GET /api/admin/support/unread-count
 * @desc    Get total unread count across all sessions
 * @access  Private (Admin only)
 */
router.get('/support/unread-count', getUnreadCount);

/**
 * @route   GET /api/admin/support/sessions/:sessionId
 * @desc    Get a specific support session
 * @access  Private (Admin only)
 */
router.get('/support/sessions/:sessionId', getSession);

/**
 * @route   GET /api/admin/support/sessions/:sessionId/messages
 * @desc    Get messages for a session (cursor-based pagination)
 * @access  Private (Admin only)
 */
router.get('/support/sessions/:sessionId/messages', getMessages);

/**
 * @route   POST /api/admin/support/sessions/:sessionId/messages
 * @desc    Send a message in a session (with optional attachments)
 * @access  Private (Admin only)
 */
router.post('/support/sessions/:sessionId/messages', upload.array('attachments', 3), sendMessage);

/**
 * @route   POST /api/admin/support/sessions/:sessionId/read
 * @desc    Mark messages as read
 * @access  Private (Admin only)
 */
router.post('/support/sessions/:sessionId/read', markRead);

/**
 * @route   POST /api/admin/support/sessions/:sessionId/resolve
 * @desc    Resolve and delete a support session
 * @access  Private (Admin only)
 */
router.post('/support/sessions/:sessionId/resolve', resolveSession);

/**
 * @route   POST /api/admin/support/sessions/:sessionId/close
 * @desc    Close and delete a support session (without resolution)
 * @access  Private (Admin only)
 */
router.post('/support/sessions/:sessionId/close', closeSession);

/**
 * @route   POST /api/admin/support/sessions/:sessionId/typing
 * @desc    Emit typing status
 * @access  Private (Admin only)
 */
router.post('/support/sessions/:sessionId/typing', sendTyping);

export default router;
