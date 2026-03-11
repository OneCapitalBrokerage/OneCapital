// Routes/customer/supportRoutes.js
// Customer Support Chat APIs

import express from 'express';
import multer from 'multer';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  createOrGetSession,
  getCurrentSession,
  getMessages,
  sendMessage,
  markRead,
  sendTyping,
} from '../../Controllers/customer/SupportController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

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
 * @route   POST /api/customer/support/sessions
 * @desc    Create a new support session or get existing one
 * @access  Private (Customer only)
 */
router.post('/support/sessions', createOrGetSession);

/**
 * @route   GET /api/customer/support/sessions/current
 * @desc    Get current active support session
 * @access  Private (Customer only)
 */
router.get('/support/sessions/current', getCurrentSession);

/**
 * @route   GET /api/customer/support/sessions/:sessionId/messages
 * @desc    Get messages for a session (cursor-based pagination)
 * @access  Private (Customer only)
 */
router.get('/support/sessions/:sessionId/messages', getMessages);

/**
 * @route   POST /api/customer/support/sessions/:sessionId/messages
 * @desc    Send a message in a session (with optional attachments)
 * @access  Private (Customer only)
 */
router.post('/support/sessions/:sessionId/messages', upload.array('attachments', 3), sendMessage);

/**
 * @route   POST /api/customer/support/sessions/:sessionId/read
 * @desc    Mark messages as read
 * @access  Private (Customer only)
 */
router.post('/support/sessions/:sessionId/read', markRead);

/**
 * @route   POST /api/customer/support/sessions/:sessionId/typing
 * @desc    Emit typing status
 * @access  Private (Customer only)
 */
router.post('/support/sessions/:sessionId/typing', sendTyping);

export default router;
