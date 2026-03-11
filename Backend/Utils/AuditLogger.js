import mongoose from 'mongoose';
import AuditEventModel from '../Model/System/AuditEventModel.js';
import { evaluateAuditEventForAlerts } from '../services/auditAlertRules.js';

const toObjectId = (value) => {
  if (!value) return undefined;
  const str = String(value);
  if (!mongoose.Types.ObjectId.isValid(str)) return undefined;
  return new mongoose.Types.ObjectId(str);
};

const toStringSafe = (value) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const inferActorType = (role) => {
  const r = toStringSafe(role).toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'broker') return 'broker';
  if (r === 'customer') return 'customer';
  return 'system';
};

const inferActorIdStr = (user = {}) => {
  return (
    user.admin_id ||
    user.broker_id ||
    user.customer_id ||
    user.login_id ||
    user.stringBrokerId ||
    ''
  );
};

const inferBrokerMongoId = (req, explicit = {}) => {
  if (explicit.broker_id) return toObjectId(explicit.broker_id);

  const user = req?.user || {};
  if (user?.role === 'broker') return toObjectId(user._id);

  return toObjectId(
    user.mongoBrokerId || user.broker_id || user.attached_broker_id || undefined
  );
};

const inferBrokerIdStr = (req, explicit = {}) => {
  if (explicit.broker_id_str) return toStringSafe(explicit.broker_id_str);

  const user = req?.user || {};
  return toStringSafe(
    user.stringBrokerId || user.broker_id_str || user.login_id || user.broker_id || ''
  );
};

const inferCustomerMongoId = (req, explicit = {}) => {
  if (explicit.customer_id) return toObjectId(explicit.customer_id);

  const user = req?.user || {};
  if (user?.role === 'customer') return toObjectId(user._id);

  return undefined;
};

const inferCustomerIdStr = (req, explicit = {}) => {
  if (explicit.customer_id_str) return toStringSafe(explicit.customer_id_str);

  const user = req?.user || {};
  if (user?.role === 'customer') return toStringSafe(user.customer_id);

  return '';
};

const inferRequestMeta = (req) => {
  if (!req) {
    return {
      request_id: '',
      endpoint: '',
      method: '',
      ip_address: '',
      user_agent: '',
    };
  }

  return {
    request_id: toStringSafe(req.request_id || req.id || ''),
    endpoint: toStringSafe(req.originalUrl || req.baseUrl || req.path || ''),
    method: toStringSafe(req.method || '').toUpperCase(),
    ip_address: toStringSafe(req.ip || req.headers?.['x-forwarded-for'] || ''),
    user_agent: toStringSafe(req.headers?.['user-agent'] || ''),
  };
};

const sanitizeType = (value) => {
  const type = toStringSafe(value).toLowerCase();
  if (['security', 'transaction', 'data', 'system', 'error', 'audit'].includes(type)) {
    return type;
  }
  return 'audit';
};

const sanitizeSeverity = (value) => {
  const severity = toStringSafe(value).toLowerCase();
  if (['info', 'warning', 'error', 'critical'].includes(severity)) return severity;
  return 'info';
};

const writeAuditEvent = async ({
  req,
  type = 'audit',
  severity = 'info',
  eventType,
  category = 'audit',
  status = 'success',
  message,
  metadata = {},
  target = {},
  entity = {},
  broker = {},
  customer = {},
  amountDelta = 0,
  fundBefore,
  fundAfter,
  marginBefore,
  marginAfter,
  reason = '',
  note = '',
  source,
  actor = {},
} = {}) => {
  try {
    const user = req?.user || {};
    const actorType = actor.type || inferActorType(user.role);

    const doc = await AuditEventModel.create({
      type: sanitizeType(type),
      severity: sanitizeSeverity(severity),
      event_type: toStringSafe(eventType || 'GENERIC_AUDIT_EVENT').toUpperCase(),
      category: toStringSafe(category || 'audit').toLowerCase(),
      status,
      message: toStringSafe(message || 'Audit event'),
      metadata: metadata || {},

      actor_type: actorType,
      actor_id: toObjectId(actor.id || user._id),
      actor_id_str: toStringSafe(actor.id_str || inferActorIdStr(user)),
      actor_role: toStringSafe(actor.role || user.role || ''),

      impersonation: {
        is_impersonation: Boolean(user.isImpersonation),
        impersonator_role: toStringSafe(user.impersonatorRole || ''),
        impersonated_by: toObjectId(user.impersonatedBy || undefined),
      },

      target_type: toStringSafe(target.type || ''),
      target_id: toObjectId(target.id),
      target_id_str: toStringSafe(target.id_str || ''),

      broker_id: inferBrokerMongoId(req, broker),
      broker_id_str: inferBrokerIdStr(req, broker),
      customer_id: inferCustomerMongoId(req, customer),
      customer_id_str: inferCustomerIdStr(req, customer),

      entity_type: toStringSafe(entity.type || ''),
      entity_id: toObjectId(entity.id),
      entity_ref: toStringSafe(entity.ref || ''),

      amount_delta: Number.isFinite(Number(amountDelta)) ? Number(amountDelta) : 0,
      fund_before: fundBefore,
      fund_after: fundAfter,
      margin_before: marginBefore,
      margin_after: marginAfter,

      reason: toStringSafe(reason || ''),
      note: toStringSafe(note || ''),

      source: source || (req ? 'api' : 'system'),
      ...inferRequestMeta(req),
      timestamp: new Date(),
    });

    // Alert processing must not block or break business flow.
    Promise.resolve(evaluateAuditEventForAlerts(doc)).catch((error) => {
      console.error('[AuditLogger] Alert evaluation failed:', error?.message || error);
    });

    return doc;
  } catch (error) {
    console.error('[AuditLogger] Failed to persist audit event:', error?.message || error);
    return null;
  }
};

const writeAuditSuccess = async (payload = {}) => {
  return writeAuditEvent({ ...payload, status: payload.status || 'success' });
};

const writeAuditFailure = async (payload = {}) => {
  return writeAuditEvent({
    ...payload,
    status: payload.status || 'failed',
    severity: payload.severity || 'warning',
  });
};

export {
  writeAuditEvent,
  writeAuditSuccess,
  writeAuditFailure,
};
