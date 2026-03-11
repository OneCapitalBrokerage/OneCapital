// Routes/customer/index.js
// Customer route aggregator

import express from 'express';
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import fundRoutes from './fundRoutes.js';
import orderRoutes from './orderRoutes.js';
import portfolioRoutes from './portfolioRoutes.js';
import watchlistRoutes from './watchlistRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import bankAccountRoutes from './bankAccountRoutes.js';
import kycDocumentRoutes from './kycDocumentRoutes.js';
import registrationRoutes from './registrationRoutes.js';
import supportRoutes from './supportRoutes.js';

const router = express.Router();

// Mount all customer routes

// Authentication (public routes)
router.use('/', authRoutes);

// Registration & KYC
router.use('/', registrationRoutes);

// Dashboard & Profile
router.use('/', dashboardRoutes);

// Trading
router.use('/', orderRoutes);
router.use('/', portfolioRoutes);
router.use('/', watchlistRoutes);

// Funds
router.use('/', fundRoutes);

// Settings
router.use('/', settingsRoutes);

// Bank Accounts
router.use('/', bankAccountRoutes);

// KYC Documents
router.use('/', kycDocumentRoutes);

// Support Chat
router.use('/', supportRoutes);

export default router;
