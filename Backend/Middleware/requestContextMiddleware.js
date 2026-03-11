import crypto from 'crypto';

const buildRequestId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const attachRequestContext = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.trim().length > 0
    ? incoming.trim()
    : buildRequestId();

  req.request_id = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};

export default attachRequestContext;
