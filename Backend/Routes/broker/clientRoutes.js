// Routes/broker/clientRoutes.js
// Broker Client Management APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  toggleHoldingsExit,
  toggleOrderExitAllowed,
  loginAsClient,
  getClientCredentials,
  getClientHoldings,
  getClientPositions,
  getClientLedger,
  getClientPricing,
  updateClientPricing,
  getDeletedClients,
  restoreClient,
  convertOrderToHold,
  extendOrderValidity,
  setClientSettlement,
  toggleDealerMode,
  adjustHolding,
} from '../../Controllers/broker/ClientController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

/**
 * @route   GET /api/broker/clients
 * @desc    Get all clients for this broker
 * @access  Private (Broker only)
 */
router.get('/clients', getAllClients);

/**
 * @route   POST /api/broker/clients
 * @desc    Create new client
 * @access  Private (Broker only)
 */
router.post('/clients', createClient);

/**
 * @route   GET /api/broker/clients/:id
 * @desc    Get client details
 * @access  Private (Broker only)
 */
router.get('/clients/:id', getClientById);

/**
 * @route   PUT /api/broker/clients/:id
 * @desc    Update client details
 * @access  Private (Broker only)
 */
router.put('/clients/:id', updateClient);

/**
 * @route   DELETE /api/broker/clients/:id
 * @desc    Delete client
 * @access  Private (Broker only)
 */
router.delete('/clients/:id', deleteClient);

/**
 * @route   PUT /api/broker/clients/:id/holdings-exit
 * @desc    Toggle client holdings exit permission
 * @access  Private (Broker only)
 */
router.put('/clients/:id/holdings-exit', toggleHoldingsExit);

/**
 * @route   PUT /api/broker/clients/:clientId/orders/:orderId/exit-toggle
 * @desc    Toggle per-order exit permission for a specific customer order
 * @access  Private (Broker only)
 */
router.put('/clients/:clientId/orders/:orderId/exit-toggle', toggleOrderExitAllowed);

/**
 * @route   POST /api/broker/clients/:id/login-as
 * @desc    Login as client (impersonation)
 * @access  Private (Broker only)
 */
router.post('/clients/:id/login-as', loginAsClient);

/**
 * @route   GET /api/broker/clients/:id/credentials
 * @desc    Get client credentials
 * @access  Private (Broker only)
 */
router.get('/clients/:id/credentials', getClientCredentials);

/**
 * @route   GET /api/broker/clients/:id/holdings
 * @desc    Get client holdings
 * @access  Private (Broker only)
 */
router.get('/clients/:id/holdings', getClientHoldings);

/**
 * @route   GET /api/broker/clients/:id/positions
 * @desc    Get client positions
 * @access  Private (Broker only)
 */
router.get('/clients/:id/positions', getClientPositions);

/**
 * @route   GET /api/broker/clients/:id/ledger
 * @desc    Get client ledger
 * @access  Private (Broker only)
 */
router.get('/clients/:id/ledger', getClientLedger);

/**
 * @route   GET /api/broker/clients/:id/pricing
 * @desc    Get client brokerage/spread pricing
 * @access  Private (Broker only)
 */
router.get('/clients/:id/pricing', getClientPricing);

/**
 * @route   PUT /api/broker/clients/:id/pricing
 * @desc    Update client brokerage/spread pricing
 * @access  Private (Broker only)
 */
router.put('/clients/:id/pricing', updateClientPricing);

/**
 * @route   POST /api/broker/clients/:id/orders/:orderId/convert-to-hold
 * @desc    Convert an intraday order to HOLD
 * @access  Private (Broker only)
 */
router.post('/clients/:id/orders/:orderId/convert-to-hold', convertOrderToHold);

/**
 * @route   POST /api/broker/clients/:id/orders/:orderId/extend-validity
 * @desc    Extend validity of an equity longterm order by 7 days
 * @access  Private (Broker only)
 */
router.post('/clients/:id/orders/:orderId/extend-validity', extendOrderValidity);

/**
 * @route   PUT /api/broker/clients/:id/settlement
 * @desc    Enable or disable settlement participation for a client
 * @access  Private (Broker only)
 */
router.put('/clients/:id/settlement', setClientSettlement);

/**
 * @route   PUT /api/broker/clients/:id/dealer-mode
 * @desc    Toggle Dealer Mode (view-only mode) for a client
 * @access  Private (Broker only)
 */
router.put('/clients/:id/dealer-mode', toggleDealerMode);

/**
 * @route   PUT /api/broker/clients/:id/orders/:orderId/holding-adjustment
 * @desc    Broker-only silent holdings quantity/lots correction
 * @access  Private (Broker only)
 */
router.put('/clients/:id/orders/:orderId/holding-adjustment', adjustHolding);

/**
 * @route   GET /api/broker/clients-deleted
 * @desc    Get deleted clients (recycle bin)
 * @access  Private (Broker only)
 */
router.get('/clients-deleted', getDeletedClients);

/**
 * @route   POST /api/broker/clients-deleted/:id/restore
 * @desc    Restore a deleted client
 * @access  Private (Broker only)
 */
router.post('/clients-deleted/:id/restore', restoreClient);

export default router;
