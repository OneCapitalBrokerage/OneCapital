import mongoose from 'mongoose';
import OrderAttemptModel from '../Model/Trading/OrderAttemptModel.js';

const toUpper = (value) => String(value || '').trim().toUpperCase();
const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toObjectId = (value) => {
  if (!value) return undefined;
  const str = String(value);
  if (!mongoose.Types.ObjectId.isValid(str)) return undefined;
  return new mongoose.Types.ObjectId(str);
};

const inferFailureCode = ({ code, reason, status }) => {
  if (code) return toUpper(code);

  const text = String(reason || '').toLowerCase();
  if (text.includes('insufficient') || text.includes('fund')) return 'INSUFFICIENT_FUNDS';
  if (text.includes('option') && text.includes('limit')) return 'OPTION_LIMIT';
  if (text.includes('trading') && (text.includes('disabled') || text.includes('not available'))) {
    return 'TRADING_DISABLED';
  }
  if (text.includes('validation') || text.includes('required') || text.includes('must be')) {
    return 'VALIDATION_ERROR';
  }
  if (Number(status) >= 500) return 'SYSTEM_ERROR';
  return 'ORDER_ATTEMPT_FAILED';
};

const extractSource = (payload = {}) => {
  return (
    payload?.came_From ||
    payload?.meta?.from ||
    payload?.meta?.source ||
    'order_sheet'
  );
};

const normalizeProduct = (value) => {
  const product = toUpper(value);
  if (['MIS', 'CNC', 'NRML'].includes(product)) return product;
  return product || 'MIS';
};

const normalizeSide = (value) => {
  const side = toUpper(value);
  if (['BUY', 'SELL'].includes(side)) return side;
  return side || 'BUY';
};

const normalizeOrderType = (value) => {
  const type = toUpper(value);
  return type || 'MARKET';
};

const logFailedOrderAttempt = async ({
  req,
  payload = {},
  reason,
  code,
  status = 400,
  details = null,
} = {}) => {
  try {
    const user = req?.user || {};
    const body = payload || {};

    const customerIdStr = String(
      body.customer_id_str || user.customer_id || ''
    ).trim();
    const brokerIdStr = String(
      body.broker_id_str ||
      user.stringBrokerId ||
      user.broker_id_str ||
      user.attached_broker_id ||
      ''
    ).trim();

    if (!customerIdStr || !brokerIdStr) return null;

    const side = normalizeSide(body.side);
    const product = normalizeProduct(body.product);
    const orderType = normalizeOrderType(body.order_type || body.orderType);
    const failureReason = String(reason || 'Order attempt failed');
    const failureCode = inferFailureCode({ code, reason: failureReason, status });
    const symbol = String(body.symbol || '').trim() || 'UNKNOWN';
    const exchange = String(body.exchange || body.segment || 'NSE').trim() || 'NSE';
    const segment = String(body.segment || body.exchange || 'NSE').trim() || 'NSE';
    const instrumentToken = body.instrument_token ?? body.instrumentToken;

    await OrderAttemptModel.create({
      customer_id: toObjectId(body.customer_id || user._id),
      customer_id_str: customerIdStr,
      broker_id: toObjectId(body.broker_id || user.mongoBrokerId || user.broker_id),
      broker_id_str: brokerIdStr,

      instrument_token: instrumentToken == null ? null : String(instrumentToken),
      symbol,
      exchange,
      segment,
      side,
      product,
      order_type: orderType,

      quantity: toNumber(body.quantity, 0),
      lots: toNumber(body.lots, 0),
      lot_size: toNumber(body.lot_size || body.lotSize, 0),
      price: toNumber(body.price, 0),
      raw_entry_price: toNumber(body.raw_entry_price ?? body.price, 0),

      failure_code: failureCode,
      failure_reason: failureReason.slice(0, 1000),
      http_status: toNumber(status, 400),

      source: String(extractSource(body)).slice(0, 100),
      source_endpoint: String(req?.originalUrl || req?.baseUrl || '').slice(0, 200),
      source_method: toUpper(req?.method || '').slice(0, 12),
      meta: {
        trigger_price: toNumber(body.trigger_price, 0),
        stop_loss: toNumber(body.stop_loss, 0),
        target: toNumber(body.target, 0),
        validity: body?.meta?.validity || null,
        details: details || null,
      },
    });
  } catch (error) {
    console.error('[OrderAttemptLogger] Failed to record order attempt:', error?.message || error);
  }

  return null;
};

export {
  logFailedOrderAttempt,
};
