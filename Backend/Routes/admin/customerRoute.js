// Routes/admin/customerRoute.js
// Admin Customer Management APIs

import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import { requireAdmin } from '../../Middleware/roleMiddleware.js';
import {
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  blockCustomer,
  unblockCustomer,
  enableTrading,
  disableTrading,
  toggleHoldingsExit,
  toggleGlitch,
  getCustomerCredentials,
  loginAsCustomer,
  setWarning,
  clearWarning,
  clearStatement,
} from '../../Controllers/admin/CustomerController.js';

const router = express.Router();

router.use(protect, requireAdmin);

router.get('/customers', getAllCustomers);
router.get('/customers/:id', getCustomerById);
router.put('/customers/:id', updateCustomer);
router.post('/customers/:id/block', blockCustomer);
router.post('/customers/:id/unblock', unblockCustomer);
router.post('/customers/:id/trading/enable', enableTrading);
router.post('/customers/:id/trading/disable', disableTrading);
router.put('/customers/:id/holdings-exit', toggleHoldingsExit);
router.put('/customers/:id/glitch', toggleGlitch);
router.get('/customers/:id/credentials', getCustomerCredentials);
router.post('/customers/:id/login-as', loginAsCustomer);
router.post('/customers/:id/warning', setWarning);
router.delete('/customers/:id/warning', clearWarning);
router.delete('/customers/:id/statement', clearStatement);

export default router;
