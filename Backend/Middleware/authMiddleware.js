import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import AdminModel from '../Model/Auth/AdminModel.js';
import BrokerModel from '../Model/Auth/BrokerModel.js';
import CustomerModel from '../Model/Auth/CustomerModel.js';
import { isBlacklisted } from '../Controllers/common/AuthController.js';

const buildSessionExpiredPayload = () => ({
  success: false,
  code: 'SESSION_EXPIRED',
  message: 'Session expired. Please login again.',
});

const buildSuspendedPayload = () => ({
  success: false,
  code: 'ACCOUNT_SUSPENDED',
  message: 'Account suspended.',
});

const buildInactivePayload = () => ({
  success: false,
  code: 'ACCOUNT_INACTIVE',
  message: 'Account inactive. Please contact your broker.',
});

// protect middleware: verifies bearer token, checks blacklist, loads user
const protect = asyncHandler(async (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authorized' });

  if (typeof isBlacklisted === 'function') {
    if (await isBlacklisted(token)) {
      return res.status(401).json(buildSessionExpiredPayload());
    }
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) return res.status(401).json({ message: 'Token invalid' });

    if (decoded.role === 'admin') {
      req.user = await AdminModel.findById(decoded.id).select('-password');
    } else if (decoded.role === 'broker') {
      req.user = await BrokerModel.findById(decoded.id).select('-password');
      if (req.user) {
        req.user.stringBrokerId =
          decoded.stringBrokerId ||
          req.user.broker_id ||
          null;
        req.user.mongoBrokerId = decoded.mongoBrokerId || req.user._id || null;
        // Compatibility layer for broker controllers that still read login_id
        req.user.login_id = req.user.broker_id;
      }
    } else if (decoded.role === 'customer') {
      req.user = await CustomerModel.findById(decoded.id).select('-password');
    } else {
      // fallback: try to find in any collection
      req.user = await AdminModel.findById(decoded.id).select('-password')
        || await BrokerModel.findById(decoded.id).select('-password')
        || await CustomerModel.findById(decoded.id).select('-password');
    }

    if (!req.user) return res.status(401).json({ message: 'User not found in database' });

    if (decoded.role === 'customer') {
      const brokerIdStr =
        decoded.stringBrokerId ||
        req.user.broker_id_str ||
        req.user.attached_broker_id?.toString() ||
        null;
      const brokerMongoId = decoded.mongoBrokerId || req.user.broker_id || req.user.attached_broker_id || null;
      req.user.stringBrokerId = brokerIdStr;
      req.user.mongoBrokerId = brokerMongoId;
      if (!req.user.customer_id && decoded.customer_id) {
        req.user.customer_id = decoded.customer_id;
      }
      // Carry forward broker impersonation flags for requireTrading bypass
      if (decoded.isImpersonation) {
        req.user.isImpersonation = true;
        req.user.impersonatorRole = decoded.impersonatorRole;
        req.user.impersonatedBy = decoded.impersonatedBy;
      }

      const isAdminImpersonation =
        decoded.isImpersonation && decoded.impersonatorRole === 'admin';

      if (!isAdminImpersonation) {
        if (req.user.status === 'blocked') {
          return res.status(403).json(buildSuspendedPayload());
        }

        if (req.user.status === 'inactive') {
          return res.status(403).json(buildInactivePayload());
        }
      }
    }

    req.role = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid' });
  }
});

export { protect };
