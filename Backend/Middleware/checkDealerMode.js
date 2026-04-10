// Middleware/checkDealerMode.js
// Blocks trading and fund operations when customer is in Dealer Mode (view-only)

import CustomerModel from '../Model/Auth/CustomerModel.js';

/**
 * Check if request is from privileged impersonation (broker/admin managing client).
 * Brokers/admins can still trade on behalf of customers even in dealer mode.
 */
const isPrivilegedImpersonation = (req) =>
  req.user?.isImpersonation &&
  ['broker', 'admin'].includes(req.user?.impersonatorRole);

/**
 * Middleware to block actions when customer account is in Dealer Mode.
 * In Dealer Mode, customers can only view data - no trading or fund operations.
 * Attach after `protect` middleware so `req.user` is populated.
 * 
 * @param {string} actionType - Type of action being blocked: 'trading' or 'funds'
 * @returns {Function} Express middleware function
 */
export const checkDealerMode = (actionType = 'trading') => {
  return async (req, res, next) => {
    try {
      // Privileged impersonation bypass - broker/admin can trade on behalf of customers
      if (isPrivilegedImpersonation(req)) {
        return next();
      }

      const customerId = req.user?._id || req.user?.id;
      if (!customerId) return next(); // Not a customer request

      const customer = await CustomerModel.findById(customerId)
        .select('dealer_mode')
        .lean();

      if (!customer) {
        return res.status(403).json({
          success: false,
          message: 'Account not found.',
          code: 'ACCOUNT_NOT_FOUND',
        });
      }

      if (customer.dealer_mode) {
        const messages = {
          trading: 'Your account is in Dealer Mode. Please contact your broker to place orders.',
          funds: 'Your account is in Dealer Mode. Please contact your broker for fund operations.',
        };

        return res.status(403).json({
          success: false,
          message: messages[actionType] || messages.trading,
          code: 'DEALER_MODE_ACTIVE',
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

// Convenience exports for common use cases
export const checkDealerModeTrading = checkDealerMode('trading');
export const checkDealerModeFunds = checkDealerMode('funds');
