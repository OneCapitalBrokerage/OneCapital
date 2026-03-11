// Routes/broker/registrationRoutes.js
// Broker Registration Application Management

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getRegistrations,
  getRegistrationDetail,
  approveRegistration,
  rejectRegistration,
  getRegistrationStats,
} from '../../Controllers/broker/RegistrationController.js';

const router = express.Router();

router.use(protect);

/**
 * @route   GET /api/broker/registrations/stats
 * @desc    Get registration counts by status
 * @access  Private (Broker only)
 */
router.get('/registrations/stats', getRegistrationStats);

/**
 * @route   GET /api/broker/registrations
 * @desc    List registration applications for this broker
 * @access  Private (Broker only)
 */
router.get('/registrations', getRegistrations);

/**
 * @route   GET /api/broker/registrations/:id
 * @desc    Get full registration details
 * @access  Private (Broker only)
 */
router.get('/registrations/:id', getRegistrationDetail);

/**
 * @route   POST /api/broker/registrations/:id/approve
 * @desc    Approve registration → create customer account
 * @access  Private (Broker only)
 */
router.post('/registrations/:id/approve', approveRegistration);

/**
 * @route   POST /api/broker/registrations/:id/reject
 * @desc    Reject registration with reason
 * @access  Private (Broker only)
 */
router.post('/registrations/:id/reject', rejectRegistration);

export default router;
