// Routes/admin/index.js
// Admin route aggregator

import express from 'express';
import dashboardRoute from './dashboardRoute.js';
import brokerRoute from './brokerRoute.js';
import customerRoute from './customerRoute.js';
import kycRoute from './kycRoute.js';
import logsRoute from './logsRoute.js';
import apiKeyRoute from './apiKeyRoute.js';
import supportRoutes from './supportRoutes.js';
import kiteRoute from './kiteRoute.js';

const router = express.Router();

// Mount all admin routes
router.use('/', dashboardRoute);
router.use('/', brokerRoute);
router.use('/', customerRoute);
router.use('/', kycRoute);
router.use('/', logsRoute);
router.use('/', apiKeyRoute);
router.use('/', supportRoutes);
router.use('/', kiteRoute);

export default router;
