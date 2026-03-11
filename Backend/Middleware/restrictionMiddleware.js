// Middleware/restrictionMiddleware.js
// Enforces account-level restrictions on customer actions

import CustomerModel from '../Model/Auth/CustomerModel.js';
import { getStandardMarketStatus } from '../Utils/tradingSession.js';

const isBrokerImpersonationBypass = (req) =>
  req.user?.isImpersonation && req.user?.impersonatorRole === 'broker';

const isCustomerPlacementRoute = (req) => {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'POST') return false;

  const routePath = `${req.baseUrl || ''}${req.path || ''}`.toLowerCase();
  return routePath.endsWith('/postorder') || routePath.endsWith('/orders');
};

const buildMarketClosedPayload = () => {
  const status = getStandardMarketStatus();
  return {
    success: false,
    code: 'MARKET_CLOSED',
    message: 'Market Closed. Open From 9:15AM To 3:15PM On Working Days',
    marketStatus: {
      isOpen: status.isOpen,
      tradingDay: status.tradingDay,
      reason: status.reason,
      marketOpen: status.marketOpen,
      marketClose: status.marketClose,
      timezone: status.timezone,
      serverTimeIst: status.istNow.toISOString(),
    },
  };
};

/**
 * Middleware to check that the customer's account is active and trading is enabled.
 * Attach after `protect` middleware so `req.user` is populated.
 * Returns 403 with a clear reason when restricted.
 */
export const requireTrading = async (req, res, next) => {
  try {
    // Broker impersonation bypass - brokers managing clients should not be blocked
    if (isBrokerImpersonationBypass(req)) {
      return next();
    }

    const customerId = req.user?._id || req.user?.id;
    if (!customerId) return next(); // Not a customer request

    const customer = await CustomerModel.findById(customerId)
      .select('status trading_enabled')
      .lean();

    if (!customer) {
      return res.status(403).json({
        success: false,
        message: 'Account not found.',
        code: 'ACCOUNT_NOT_FOUND',
      });
    }

    if (customer.status === 'blocked' || customer.status === 'inactive' || !customer.trading_enabled) {
      return res.status(403).json({
        success: false,
        message: 'Order placement is not available right now. Please try again later.',
      });
    }

    if (isCustomerPlacementRoute(req)) {
      const marketStatus = getStandardMarketStatus();
      if (!marketStatus.isOpen) {
        return res.status(403).json(buildMarketClosedPayload());
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};
