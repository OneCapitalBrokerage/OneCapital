// Routes/broker/index.js
// Broker route aggregator

import express from 'express';
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import clientRoutes from './clientRoutes.js';
import fundRoutes from './fundRoutes.js';
import marginRoutes from './marginRoutes.js';
import kycRoutes from './kycRoutes.js';
import orderRoutes from './orderRoutes.js';
import withdrawalRoutes from './withdrawalRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import registrationRoutes from './registrationRoutes.js';
import settlementRoutes from './settlementRoutes.js';

const router = express.Router();

// Public broker auth routes (must be mounted before protected routes)
router.use('/', authRoutes);

// Mount all broker routes
// Dashboard & Profile
router.use('/', dashboardRoutes);

// Client Management
router.use('/', clientRoutes);

// Fund & Margin Management
router.use('/', fundRoutes);
router.use('/', marginRoutes);

// Approvals
router.use('/', kycRoutes);
router.use('/', orderRoutes);
router.use('/', withdrawalRoutes);
router.use('/', paymentRoutes);

// Settings
router.use('/', settingsRoutes);
router.use('/', settlementRoutes);

// Registration Applications
router.use('/', registrationRoutes);

export default router;
