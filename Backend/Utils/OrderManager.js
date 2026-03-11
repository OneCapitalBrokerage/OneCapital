import Order from '../Model/Trading/OrdersModel.js';
import { closeOrderAndSettle } from '../services/closeOrderAndSettle.js';
import { retainSystemTokens, releaseSystemTokens } from '../sockets/io.js';

export const ORDER_TRIGGER_COMMAND_CHANNEL = 'order:trigger:commands';

const TERMINAL_STATUSES = new Set(['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED']);

// token -> Map<orderId, triggerData>
export const activeTriggers = new Map();
// orderId -> token
const orderTokenIndex = new Map();

let triggerEngineEnabled = process.env.ENABLE_ORDER_TRIGGER_ENGINE !== 'false';
let commandPublisher = null;

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeToken = (value) => {
  const raw = value?.instrument_token ?? value?.instrumentToken ?? value?.security_Id ?? value;
  const token = Number.parseInt(raw, 10);
  if (!Number.isFinite(token) || token <= 0) return null;
  return String(token);
};

const normalizeOrderId = (value) => {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
};

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();

const isTerminalStatus = (status) => TERMINAL_STATUSES.has(normalizeStatus(status));

const hasRiskConfigured = ({ stop_loss, stopLoss, sl, target }) => {
  const stopLossValue = toNumber(stop_loss ?? stopLoss ?? sl, 0);
  const targetValue = toNumber(target, 0);
  return stopLossValue > 0 || targetValue > 0;
};

const shouldTrackOrder = (orderLike) => {
  if (!orderLike) return false;
  const status = orderLike.status ?? orderLike.order_status;
  if (isTerminalStatus(status)) return false;
  return hasRiskConfigured(orderLike);
};

const toTriggerData = (orderLike) => {
  const orderId = normalizeOrderId(orderLike?.orderId ?? orderLike?._id ?? orderLike?.id);
  const token = normalizeToken(orderLike?.instrument_token ?? orderLike?.security_Id ?? orderLike?.token);
  if (!orderId || !token) return null;

  return {
    orderId,
    token,
    side: String(orderLike.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    sl: toNumber(orderLike.stop_loss ?? orderLike.stopLoss ?? orderLike.sl, 0),
    target: toNumber(orderLike.target, 0),
    status: normalizeStatus(orderLike.status ?? orderLike.order_status),
  };
};

const getTokenBucket = (token, createIfMissing = false) => {
  if (!activeTriggers.has(token) && createIfMissing) {
    activeTriggers.set(token, new Map());
  }
  return activeTriggers.get(token) || null;
};

const retainTokenLocal = (token) => {
  retainSystemTokens([{ instrument_token: token }], 'quote');
};

const releaseTokenLocal = (token) => {
  releaseSystemTokens([{ instrument_token: token }]);
};

const removeByOrderIdLocal = (orderId, tokenHint = null) => {
  const normalizedOrderId = normalizeOrderId(orderId);
  if (!normalizedOrderId) return { removed: false };

  const indexedToken = orderTokenIndex.get(normalizedOrderId) || null;
  const candidateTokens = [];

  if (tokenHint) {
    const normalizedHint = normalizeToken(tokenHint);
    if (normalizedHint) candidateTokens.push(normalizedHint);
  }

  if (indexedToken && !candidateTokens.includes(indexedToken)) {
    candidateTokens.push(indexedToken);
  }

  let removed = false;

  for (const token of candidateTokens) {
    const bucket = getTokenBucket(token);
    if (!bucket || !bucket.has(normalizedOrderId)) continue;

    bucket.delete(normalizedOrderId);
    removed = true;

    if (bucket.size === 0) {
      activeTriggers.delete(token);
      releaseTokenLocal(token);
    }
  }

  if (!removed && indexedToken && activeTriggers.has(indexedToken)) {
    const bucket = getTokenBucket(indexedToken);
    if (bucket?.has(normalizedOrderId)) {
      bucket.delete(normalizedOrderId);
      removed = true;
      if (bucket.size === 0) {
        activeTriggers.delete(indexedToken);
        releaseTokenLocal(indexedToken);
      }
    }
  }

  if (removed || indexedToken) {
    orderTokenIndex.delete(normalizedOrderId);
  }

  return { removed };
};

const upsertLocal = (orderLike) => {
  const trigger = toTriggerData(orderLike);
  if (!trigger) return { tracked: false, reason: 'invalid_trigger_payload' };

  if (!shouldTrackOrder({ ...orderLike, ...trigger })) {
    removeByOrderIdLocal(trigger.orderId, trigger.token);
    return { tracked: false, reason: 'not_trackable' };
  }

  const previousToken = orderTokenIndex.get(trigger.orderId) || null;
  if (previousToken && previousToken !== trigger.token) {
    removeByOrderIdLocal(trigger.orderId, previousToken);
  }

  let bucket = getTokenBucket(trigger.token);
  if (!bucket) {
    bucket = getTokenBucket(trigger.token, true);
    retainTokenLocal(trigger.token);
  }

  bucket.set(trigger.orderId, trigger);
  orderTokenIndex.set(trigger.orderId, trigger.token);

  return { tracked: true, trigger };
};

const publishCommand = async (command) => {
  if (!commandPublisher) {
    console.warn('[OrderManager] Trigger engine disabled and no publisher configured. Command skipped:', command?.type);
    return;
  }

  try {
    await commandPublisher.publish(ORDER_TRIGGER_COMMAND_CHANNEL, JSON.stringify(command));
  } catch (error) {
    console.error('[OrderManager] Failed to publish trigger command:', error?.message || error);
  }
};

const dispatchCommand = async (command) => {
  if (triggerEngineEnabled) {
    return applyTriggerCommand(command);
  }
  return publishCommand(command);
};

export const configureOrderTriggerSync = ({ engineEnabled, publisher } = {}) => {
  if (typeof engineEnabled === 'boolean') {
    triggerEngineEnabled = engineEnabled;
  }
  if (publisher !== undefined) {
    commandPublisher = publisher || null;
  }
};

export const getTriggerEngineState = () => ({
  enabled: triggerEngineEnabled,
  trackedTokens: activeTriggers.size,
  trackedOrders: orderTokenIndex.size,
  hasPublisher: Boolean(commandPublisher),
});

export const applyTriggerCommand = async (command = {}) => {
  const type = String(command?.type || '').toUpperCase();

  switch (type) {
    case 'UPSERT_TRIGGER': {
      const order = command?.order || null;
      if (!order) return;
      upsertLocal(order);
      return;
    }

    case 'REMOVE_TRIGGER': {
      const order = command?.order || null;
      const orderId = normalizeOrderId(command?.orderId ?? order?._id ?? order?.id);
      if (!orderId) return;
      removeByOrderIdLocal(orderId, command?.token ?? order?.instrument_token ?? order?.security_Id);
      return;
    }

    case 'RELOAD_TRIGGERS':
      await loadOpenOrders();
      return;

    default:
      console.warn('[OrderManager] Unknown trigger command type:', command?.type);
  }
};

export const addToWatchlist = async (order) => {
  if (!order) return;
  await dispatchCommand({
    type: 'UPSERT_TRIGGER',
    order: {
      _id: order._id,
      instrument_token: order.instrument_token || order.security_Id,
      side: order.side,
      stop_loss: order.stop_loss,
      target: order.target,
      status: order.status || order.order_status,
      order_status: order.order_status,
    },
  });
};

export const updateTriggerInWatchlist = async (order) => {
  if (!order) return;
  const status = normalizeStatus(order.status || order.order_status);
  const hasRisk = hasRiskConfigured(order);

  if (isTerminalStatus(status) || !hasRisk) {
    await removeFromWatchlist(order);
    return;
  }

  await addToWatchlist(order);
};

export const removeFromWatchlist = async (orderOrRef) => {
  if (!orderOrRef) return;

  const orderId = normalizeOrderId(orderOrRef.orderId ?? orderOrRef._id ?? orderOrRef.id);
  const token = normalizeToken(orderOrRef.instrument_token ?? orderOrRef.security_Id ?? orderOrRef.token);
  if (!orderId) return;

  await dispatchCommand({
    type: 'REMOVE_TRIGGER',
    orderId,
    token,
    order: {
      _id: orderId,
      instrument_token: token,
    },
  });
};

export const loadOpenOrders = async () => {
  try {
    console.log('🔄 [OrderManager] Loading active triggers...');

    const activeOrders = await Order.find({
      status: { $nin: Array.from(TERMINAL_STATUSES) },
      $or: [
        { stop_loss: { $exists: true, $ne: null, $gt: 0 } },
        { target: { $exists: true, $ne: null, $gt: 0 } },
      ],
    }).select('_id instrument_token security_Id side stop_loss target status order_status').lean();

    const nextActiveTriggers = new Map();
    const nextOrderTokenIndex = new Map();

    for (const order of activeOrders) {
      const trigger = toTriggerData(order);
      if (!trigger) continue;
      if (!shouldTrackOrder({ ...order, ...trigger })) continue;

      let bucket = nextActiveTriggers.get(trigger.token);
      if (!bucket) {
        bucket = new Map();
        nextActiveTriggers.set(trigger.token, bucket);
      }

      bucket.set(trigger.orderId, trigger);
      nextOrderTokenIndex.set(trigger.orderId, trigger.token);
    }

    const previousTokens = new Set(activeTriggers.keys());
    const currentTokens = new Set(nextActiveTriggers.keys());

    activeTriggers.clear();
    orderTokenIndex.clear();
    for (const [token, bucket] of nextActiveTriggers.entries()) {
      activeTriggers.set(token, bucket);
    }
    for (const [orderId, token] of nextOrderTokenIndex.entries()) {
      orderTokenIndex.set(orderId, token);
    }

    for (const token of previousTokens) {
      if (!currentTokens.has(token)) {
        releaseTokenLocal(token);
      }
    }
    for (const token of currentTokens) {
      if (!previousTokens.has(token)) {
        retainTokenLocal(token);
      }
    }

    console.log(`✅ [OrderManager] System ready. Tracking ${orderTokenIndex.size} order trigger(s) across ${activeTriggers.size} token(s).`);
  } catch (error) {
    console.error('❌ [OrderManager] Failed to load orders:', error);
  }
};

export const reconcileOpenOrderTriggers = async () => {
  const before = {
    tokens: activeTriggers.size,
    orders: orderTokenIndex.size,
  };

  await loadOpenOrders();

  const after = {
    tokens: activeTriggers.size,
    orders: orderTokenIndex.size,
  };

  if (before.tokens !== after.tokens || before.orders !== after.orders) {
    console.log(
      `[OrderManager] Reconciled triggers: tokens ${before.tokens}->${after.tokens}, orders ${before.orders}->${after.orders}`
    );
  }
};

const evaluateTriggerHit = ({ side, sl, target }, ltp) => {
  if (side === 'BUY') {
    if (sl > 0 && ltp <= sl) return 'STOPLOSS_HIT';
    if (target > 0 && ltp >= target) return 'TARGET_HIT';
    return null;
  }

  if (sl > 0 && ltp >= sl) return 'STOPLOSS_HIT';
  if (target > 0 && ltp <= target) return 'TARGET_HIT';
  return null;
};

const getConfiguredExitPrice = (trigger, reason) => {
  if (reason === 'STOPLOSS_HIT') return toNumber(trigger?.sl, 0);
  if (reason === 'TARGET_HIT') return toNumber(trigger?.target, 0);
  return 0;
};

const executeExit = async (trigger, currentLtp, reason) => {
  const { orderId, token } = trigger;
  const configuredExitPrice = getConfiguredExitPrice(trigger, reason);
  const exitPrice = configuredExitPrice > 0 ? configuredExitPrice : currentLtp;

  console.log(
    `⚡ [OrderManager] Trigger hit. Order=${orderId}, token=${token}, reason=${reason}, ltp=${currentLtp}, exitPrice=${exitPrice}`
  );

  removeByOrderIdLocal(orderId, token);

  try {
    const exitReasonMap = {
      STOPLOSS_HIT: 'stop_loss',
      TARGET_HIT: 'target',
    };

    const result = await closeOrderAndSettle(orderId, {
      exitPrice,
      exitReason: exitReasonMap[reason] || 'manual',
      cameFrom: 'Open',
    });

    if (result.ok) {
      console.log(`✅ [OrderManager] Order ${orderId} closed & settled. P&L: ₹${result.pnl?.netPnl ?? 'N/A'}`);
      return;
    }

    if (result.error === 'already_closed_or_not_found') {
      return;
    }

    console.error(`❌ [OrderManager] Failed to close ${orderId}: ${result.error}`);
    upsertLocal(trigger);
  } catch (error) {
    console.error(`❌ [OrderManager] Execution error for ${orderId}:`, error);
    upsertLocal(trigger);
  }
};

export const onMarketTick = async ({ token, ltp }) => {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return;

  const bucket = getTokenBucket(normalizedToken);
  if (!bucket || bucket.size === 0) return;

  const currentLtp = toNumber(ltp, 0);
  if (currentLtp <= 0) return;

  const triggers = Array.from(bucket.values());
  for (const trigger of triggers) {
    const reason = evaluateTriggerHit(trigger, currentLtp);
    if (!reason) continue;
    await executeExit(trigger, currentLtp, reason);
  }
};
