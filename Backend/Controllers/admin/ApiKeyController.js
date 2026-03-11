// Controllers/admin/ApiKeyController.js
// Admin API Key Management - Generate and manage API keys

import asyncHandler from 'express-async-handler';
import crypto from 'crypto';

// In-memory API key storage (in production, use MongoDB)
const apiKeys = new Map();

// Generate a secure API key
const generateApiKey = () => {
  const prefix = 'wlf';
  const key = crypto.randomBytes(24).toString('hex');
  return `${prefix}_${key}`;
};

// API Key scopes
const SCOPES = {
  READ_MARKET: 'read:market',
  READ_ORDERS: 'read:orders',
  WRITE_ORDERS: 'write:orders',
  READ_FUNDS: 'read:funds',
  WRITE_FUNDS: 'write:funds',
  READ_USERS: 'read:users',
  WRITE_USERS: 'write:users',
  ADMIN: 'admin',
};

/**
 * @desc     Get all API keys
 * @route    GET /api/admin/api-keys
 * @access   Private (Admin only)
 */
const getAllApiKeys = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  let keys = Array.from(apiKeys.values());

  // Filter by status
  if (status && status !== 'all') {
    const isActive = status === 'active';
    keys = keys.filter(key => key.isActive === isActive);
  }

  // Sort by creation date (newest first)
  keys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Paginate
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const paginatedKeys = keys.slice(skip, skip + parseInt(limit));

  // Mask the actual keys for security
  const maskedKeys = paginatedKeys.map(key => ({
    id: key.id,
    name: key.name,
    keyPreview: `${key.key.substring(0, 8)}...${key.key.slice(-4)}`,
    scopes: key.scopes,
    isActive: key.isActive,
    lastUsed: key.lastUsed,
    usageCount: key.usageCount,
    createdAt: key.createdAt,
    createdBy: key.createdBy,
    expiresAt: key.expiresAt,
  }));

  res.status(200).json({
    success: true,
    apiKeys: maskedKeys,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: keys.length,
      pages: Math.ceil(keys.length / parseInt(limit)),
    },
  });
});

/**
 * @desc     Generate new API key
 * @route    POST /api/admin/api-keys
 * @access   Private (Admin only)
 */
const createApiKey = asyncHandler(async (req, res) => {
  const { name, scopes = [], expiresInDays } = req.body;
  const adminId = req.user._id;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'API key name is required.',
    });
  }

  // Validate scopes
  const validScopes = Object.values(SCOPES);
  const invalidScopes = scopes.filter(s => !validScopes.includes(s));
  if (invalidScopes.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid scopes: ${invalidScopes.join(', ')}`,
      validScopes,
    });
  }

  const key = generateApiKey();
  const id = `KEY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const apiKeyData = {
    id,
    name,
    key,
    scopes: scopes.length > 0 ? scopes : [SCOPES.READ_MARKET],
    isActive: true,
    lastUsed: null,
    usageCount: 0,
    createdAt: new Date(),
    createdBy: adminId,
    expiresAt: expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null,
  };

  apiKeys.set(id, apiKeyData);

  // Return the full key only once (on creation)
  res.status(201).json({
    success: true,
    message: 'API key created successfully. Store this key securely - it will not be shown again.',
    apiKey: {
      id: apiKeyData.id,
      name: apiKeyData.name,
      key: apiKeyData.key, // Full key only shown on creation
      scopes: apiKeyData.scopes,
      expiresAt: apiKeyData.expiresAt,
    },
  });
});

/**
 * @desc     Revoke (delete) API key
 * @route    DELETE /api/admin/api-keys/:id
 * @access   Private (Admin only)
 */
const revokeApiKey = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!apiKeys.has(id)) {
    return res.status(404).json({
      success: false,
      message: 'API key not found.',
    });
  }

  apiKeys.delete(id);

  res.status(200).json({
    success: true,
    message: 'API key revoked successfully.',
  });
});

/**
 * @desc     Toggle API key active/inactive
 * @route    PUT /api/admin/api-keys/:id/toggle
 * @access   Private (Admin only)
 */
const toggleApiKey = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const apiKey = apiKeys.get(id);
  if (!apiKey) {
    return res.status(404).json({
      success: false,
      message: 'API key not found.',
    });
  }

  apiKey.isActive = !apiKey.isActive;
  apiKeys.set(id, apiKey);

  res.status(200).json({
    success: true,
    message: `API key ${apiKey.isActive ? 'enabled' : 'disabled'} successfully.`,
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      isActive: apiKey.isActive,
    },
  });
});

/**
 * @desc     Update API key scopes
 * @route    PUT /api/admin/api-keys/:id/scopes
 * @access   Private (Admin only)
 */
const updateApiKeyScopes = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { scopes } = req.body;

  const apiKey = apiKeys.get(id);
  if (!apiKey) {
    return res.status(404).json({
      success: false,
      message: 'API key not found.',
    });
  }

  if (!scopes || !Array.isArray(scopes)) {
    return res.status(400).json({
      success: false,
      message: 'Scopes array is required.',
    });
  }

  // Validate scopes
  const validScopes = Object.values(SCOPES);
  const invalidScopes = scopes.filter(s => !validScopes.includes(s));
  if (invalidScopes.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid scopes: ${invalidScopes.join(', ')}`,
      validScopes,
    });
  }

  apiKey.scopes = scopes;
  apiKeys.set(id, apiKey);

  res.status(200).json({
    success: true,
    message: 'API key scopes updated successfully.',
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes,
    },
  });
});

/**
 * @desc     Revoke all API keys
 * @route    POST /api/admin/api-keys/revoke-all
 * @access   Private (Admin only)
 */
const revokeAllApiKeys = asyncHandler(async (req, res) => {
  const { confirm } = req.body;

  if (confirm !== 'REVOKE_ALL') {
    return res.status(400).json({
      success: false,
      message: 'Please confirm by sending { "confirm": "REVOKE_ALL" }',
    });
  }

  const count = apiKeys.size;
  apiKeys.clear();

  res.status(200).json({
    success: true,
    message: `All ${count} API keys have been revoked.`,
  });
});

// Middleware to validate API key (for use in other routes)
const validateApiKey = async (req, res, next) => {
  const apiKeyHeader = req.headers['x-api-key'];

  if (!apiKeyHeader) {
    return res.status(401).json({
      success: false,
      message: 'API key is required.',
    });
  }

  // Find the key
  let foundKey = null;
  for (const [, keyData] of apiKeys) {
    if (keyData.key === apiKeyHeader) {
      foundKey = keyData;
      break;
    }
  }

  if (!foundKey) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key.',
    });
  }

  if (!foundKey.isActive) {
    return res.status(403).json({
      success: false,
      message: 'API key is disabled.',
    });
  }

  if (foundKey.expiresAt && new Date() > new Date(foundKey.expiresAt)) {
    return res.status(403).json({
      success: false,
      message: 'API key has expired.',
    });
  }

  // Update usage stats
  foundKey.lastUsed = new Date();
  foundKey.usageCount += 1;

  // Attach key info to request
  req.apiKey = {
    id: foundKey.id,
    name: foundKey.name,
    scopes: foundKey.scopes,
  };

  next();
};

export {
  getAllApiKeys,
  createApiKey,
  revokeApiKey,
  toggleApiKey,
  updateApiKeyScopes,
  revokeAllApiKeys,
  validateApiKey,
  SCOPES,
};
