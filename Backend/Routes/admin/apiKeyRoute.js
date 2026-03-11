// Routes/admin/apiKeyRoute.js
// Admin API Key Management APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import {
  getAllApiKeys,
  createApiKey,
  revokeApiKey,
  toggleApiKey,
  updateApiKeyScopes,
  revokeAllApiKeys,
} from '../../Controllers/admin/ApiKeyController.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(protect, requireAdmin);

// GET /api/admin/api-keys
router.get('/api-keys', getAllApiKeys);

// POST /api/admin/api-keys
router.post('/api-keys', createApiKey);

// POST /api/admin/api-keys/revoke-all - MUST be before /:id routes
router.post('/api-keys/revoke-all', revokeAllApiKeys);

// DELETE /api/admin/api-keys/:id
router.delete('/api-keys/:id', revokeApiKey);

// PUT /api/admin/api-keys/:id/toggle
router.put('/api-keys/:id/toggle', toggleApiKey);

// PUT /api/admin/api-keys/:id/scopes
router.put('/api-keys/:id/scopes', updateApiKeyScopes);

export default router;
