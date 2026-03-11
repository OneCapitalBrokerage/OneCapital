// Middleware/roleMiddleware.js
// Role-based access control middleware

/**
 * Middleware to check if user is an admin
 */
export const requireAdmin = (req, res, next) => {
  // Check if user exists and has admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

/**
 * Middleware to check if user is a broker or admin
 */
export const requireBroker = (req, res, next) => {
  // Check if user exists and has broker or admin role
  if (!req.user || !['broker', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Broker privileges required.'
    });
  }
  next();
};

/**
 * Middleware to check if user is a customer
 */
export const requireCustomer = (req, res, next) => {
  // Check if user exists
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  next();
};

/**
 * Middleware to allow access to admins and brokers
 */
export const requireAdminOrBroker = (req, res, next) => {
  // Check if user exists and has admin or broker role
  if (!req.user || !['admin', 'broker'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or broker privileges required.'
    });
  }
  next();
};