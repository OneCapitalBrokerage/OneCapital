import AuditEventModel from '../Model/System/AuditEventModel.js';
import AuditAlertModel from '../Model/System/AuditAlertModel.js';
import WithdrawalRequestModel from '../Model/FundManagement/WithdrawalRequestModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const THRESHOLDS = {
  largeManualFundDelta: Number(process.env.AUDIT_ALERT_LARGE_FUND_DELTA || 50000),
  fundEditBurstCount: Number(process.env.AUDIT_ALERT_FUND_EDIT_BURST_COUNT || 5),
  fundEditBurstMinutes: Number(process.env.AUDIT_ALERT_FUND_EDIT_BURST_MIN || 15),
  marginBurstCount: Number(process.env.AUDIT_ALERT_MARGIN_BURST_COUNT || 6),
  marginBurstMinutes: Number(process.env.AUDIT_ALERT_MARGIN_BURST_MIN || 20),
  optionLimitWarningPercent: Number(process.env.AUDIT_ALERT_OPTION_LIMIT_WARN || 60),
  optionLimitCriticalPercent: Number(process.env.AUDIT_ALERT_OPTION_LIMIT_CRITICAL || 85),
};

const SEVERITY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toStringSafe = (value) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const pickFirstNumber = (...values) => {
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
};

const getHigherSeverity = (a = 'medium', b = 'medium') => {
  return (SEVERITY_RANK[a] || 0) >= (SEVERITY_RANK[b] || 0) ? a : b;
};

const buildGroupingQuery = (ruleKey, event) => {
  const query = {
    rule_key: ruleKey,
    status: { $in: ['open', 'acknowledged'] },
    last_seen_at: { $gte: new Date(Date.now() - DAY_MS) },
  };

  if (event.broker_id_str) query.broker_id_str = event.broker_id_str;
  if (event.customer_id_str) query.customer_id_str = event.customer_id_str;
  if (event.entity_ref) query.entity_ref = event.entity_ref;
  if (event.entity_type) query.entity_type = event.entity_type;

  return query;
};

const upsertAlert = async ({ ruleKey, severity, title, message, event, context = {}, tags = [] }) => {
  const query = buildGroupingQuery(ruleKey, event);
  const existing = await AuditAlertModel.findOne(query).sort({ last_seen_at: -1 });
  const now = new Date();

  if (existing) {
    existing.last_seen_at = now;
    existing.occurrence_count = Number(existing.occurrence_count || 1) + 1;
    existing.latest_event_id = event._id;
    existing.latest_event_ref = event.event_id || event._id?.toString() || '';
    existing.request_id = event.request_id || '';
    existing.message = message;
    existing.title = title;
    existing.event_type = event.event_type || existing.event_type;
    existing.severity = getHigherSeverity(existing.severity, severity);
    existing.amount_delta = Number(event.amount_delta || 0);
    existing.amount_abs = Math.abs(Number(event.amount_delta || 0));
    existing.context = {
      ...(existing.context || {}),
      ...(context || {}),
    };
    existing.tags = Array.from(new Set([...(existing.tags || []), ...tags]));
    await existing.save();
    return existing;
  }

  const created = await AuditAlertModel.create({
    rule_key: ruleKey,
    severity,
    title,
    message,
    event_type: event.event_type || '',

    actor_type: event.actor_type || 'system',
    actor_id: event.actor_id || undefined,
    actor_id_str: event.actor_id_str || '',

    broker_id: event.broker_id || undefined,
    broker_id_str: event.broker_id_str || '',
    customer_id: event.customer_id || undefined,
    customer_id_str: event.customer_id_str || '',

    entity_type: event.entity_type || '',
    entity_id: event.entity_id || undefined,
    entity_ref: event.entity_ref || '',

    latest_event_id: event._id,
    latest_event_ref: event.event_id || event._id?.toString() || '',
    request_id: event.request_id || '',

    amount_delta: Number(event.amount_delta || 0),
    amount_abs: Math.abs(Number(event.amount_delta || 0)),

    first_seen_at: now,
    last_seen_at: now,
    occurrence_count: 1,

    context: context || {},
    tags: tags || [],
    source: 'rule_engine',
  });

  return created;
};

const evaluatePaymentVerificationRule = async (event) => {
  if (event.event_type !== 'PAYMENT_VERIFY') return null;

  const amountDelta = Number(event.amount_delta || 0);
  const beforeBalance = pickFirstNumber(
    event.fund_before?.depositedCash,
    event.fund_before?.availableCash
  );
  const afterBalance = pickFirstNumber(
    event.fund_after?.depositedCash,
    event.fund_after?.availableCash
  );

  const noPositiveCredit = amountDelta <= 0;
  const beforeAfterMismatch =
    beforeBalance !== null && afterBalance !== null && afterBalance <= beforeBalance;

  if (!noPositiveCredit && !beforeAfterMismatch) return null;

  return upsertAlert({
    ruleKey: 'PAYMENT_VERIFY_WITHOUT_CREDIT_DELTA',
    severity: 'high',
    title: 'Payment verified without positive credit movement',
    message: `Payment verification for customer ${event.customer_id_str || 'unknown'} has no positive fund delta.`,
    event,
    context: {
      amountDelta,
      fundBefore: event.fund_before || {},
      fundAfter: event.fund_after || {},
    },
    tags: ['funds', 'payment', 'integrity'],
  });
};

const isGenericManualFundNote = (note) => {
  const normalized = toStringSafe(note).trim().toLowerCase();
  if (!normalized) return true;
  const generic = [
    'funds edited by broker',
    'funds added by broker',
    'funds edited',
    'fund update',
  ];
  return generic.includes(normalized);
};

const evaluateManualFundRules = async (event) => {
  if (!['FUND_MANUAL_EDIT', 'FUND_MANUAL_ADD'].includes(event.event_type)) return [];

  const alerts = [];
  const amountAbs = Math.abs(Number(event.amount_delta || 0));

  if (event.event_type === 'FUND_MANUAL_EDIT' && isGenericManualFundNote(event.note)) {
    alerts.push(
      await upsertAlert({
        ruleKey: 'FUND_MANUAL_EDIT_MISSING_REASON',
        severity: 'medium',
        title: 'Manual fund edit missing clear reason',
        message: `Fund edit for customer ${event.customer_id_str || 'unknown'} has no specific justification.`,
        event,
        context: {
          note: event.note || '',
          amountDelta: Number(event.amount_delta || 0),
        },
        tags: ['funds', 'manual_edit'],
      })
    );
  }

  if (amountAbs >= THRESHOLDS.largeManualFundDelta) {
    alerts.push(
      await upsertAlert({
        ruleKey: 'FUND_MANUAL_LARGE_DELTA',
        severity: amountAbs >= THRESHOLDS.largeManualFundDelta * 2 ? 'critical' : 'high',
        title: 'Large manual fund change detected',
        message: `Manual fund change of ${amountAbs.toFixed(2)} detected for customer ${event.customer_id_str || 'unknown'}.`,
        event,
        context: {
          amountDelta: Number(event.amount_delta || 0),
          threshold: THRESHOLDS.largeManualFundDelta,
        },
        tags: ['funds', 'manual_edit', 'high_value'],
      })
    );
  }

  if (event.actor_id_str) {
    const windowStart = new Date(Date.now() - THRESHOLDS.fundEditBurstMinutes * 60 * 1000);
    const burstCount = await AuditEventModel.countDocuments({
      createdAt: { $gte: windowStart },
      actor_id_str: event.actor_id_str,
      event_type: { $in: ['FUND_MANUAL_EDIT', 'FUND_MANUAL_ADD'] },
    });

    if (burstCount >= THRESHOLDS.fundEditBurstCount) {
      alerts.push(
        await upsertAlert({
          ruleKey: 'FUND_MANUAL_EDIT_BURST',
          severity: 'high',
          title: 'Frequent manual fund edits by same actor',
          message: `Actor ${event.actor_id_str} performed ${burstCount} manual fund edits in ${THRESHOLDS.fundEditBurstMinutes} minutes.`,
          event,
          context: {
            actorId: event.actor_id_str,
            burstCount,
            windowMinutes: THRESHOLDS.fundEditBurstMinutes,
          },
          tags: ['funds', 'manual_edit', 'frequency'],
        })
      );
    }
  }

  return alerts.filter(Boolean);
};

const evaluateWithdrawalRule = async (event) => {
  if (event.event_type !== 'WITHDRAWAL_APPROVE') return null;

  const invalidAmountDirection = Number(event.amount_delta || 0) >= 0;
  let missingChain = false;

  if (!event.entity_id) {
    missingChain = true;
  } else {
    const withdrawal = await WithdrawalRequestModel.findById(event.entity_id).select('status amount');
    if (!withdrawal || !['approved', 'completed'].includes(String(withdrawal.status || '').toLowerCase())) {
      missingChain = true;
    }
  }

  if (!invalidAmountDirection && !missingChain) return null;

  return upsertAlert({
    ruleKey: 'WITHDRAWAL_APPROVE_INVALID_CHAIN',
    severity: 'critical',
    title: 'Withdrawal approval integrity issue',
    message: `Withdrawal approval for customer ${event.customer_id_str || 'unknown'} has invalid debit direction or request chain.`,
    event,
    context: {
      amountDelta: Number(event.amount_delta || 0),
      invalidAmountDirection,
      missingChain,
      entityId: event.entity_id?.toString?.() || '',
    },
    tags: ['withdrawal', 'funds', 'integrity'],
  });
};

const evaluateMarginRules = async (event) => {
  if (!['MARGIN_LIMIT_UPDATE', 'OPTION_LIMIT_PERCENT_UPDATE'].includes(event.event_type)) return [];

  const alerts = [];

  const optionPercent = pickFirstNumber(
    event.margin_after?.optionLimitPercentage,
    event.margin_after?.option_limit_percentage,
    event.metadata?.updates?.optionLimitPercentage
  );

  if (optionPercent !== null && optionPercent >= THRESHOLDS.optionLimitWarningPercent) {
    alerts.push(
      await upsertAlert({
        ruleKey: 'OPTION_LIMIT_EXTREME_VALUE',
        severity: optionPercent >= THRESHOLDS.optionLimitCriticalPercent ? 'critical' : 'high',
        title: 'High option limit percentage configured',
        message: `Option limit set to ${optionPercent}% for customer ${event.customer_id_str || 'unknown'}.`,
        event,
        context: {
          optionLimitPercentage: optionPercent,
          warningThreshold: THRESHOLDS.optionLimitWarningPercent,
          criticalThreshold: THRESHOLDS.optionLimitCriticalPercent,
        },
        tags: ['margin', 'option_limit'],
      })
    );
  }

  if (event.broker_id_str && event.customer_id_str) {
    const windowStart = new Date(Date.now() - THRESHOLDS.marginBurstMinutes * 60 * 1000);
    const burstCount = await AuditEventModel.countDocuments({
      createdAt: { $gte: windowStart },
      broker_id_str: event.broker_id_str,
      customer_id_str: event.customer_id_str,
      event_type: { $in: ['MARGIN_LIMIT_UPDATE', 'OPTION_LIMIT_PERCENT_UPDATE'] },
    });

    if (burstCount >= THRESHOLDS.marginBurstCount) {
      alerts.push(
        await upsertAlert({
          ruleKey: 'MARGIN_UPDATE_BURST',
          severity: 'high',
          title: 'Frequent margin limit changes',
          message: `Broker ${event.broker_id_str} changed margin/option limits ${burstCount} times for customer ${event.customer_id_str} in ${THRESHOLDS.marginBurstMinutes} minutes.`,
          event,
          context: {
            brokerId: event.broker_id_str,
            customerId: event.customer_id_str,
            burstCount,
            windowMinutes: THRESHOLDS.marginBurstMinutes,
          },
          tags: ['margin', 'frequency'],
        })
      );
    }
  }

  return alerts.filter(Boolean);
};

const evaluateAuditEventForAlerts = async (eventDoc) => {
  if (!eventDoc) return [];

  const event = eventDoc.toObject ? eventDoc.toObject() : eventDoc;
  const eventType = toStringSafe(event.event_type).toUpperCase();
  if (!eventType) return [];

  event.event_type = eventType;
  const generatedAlerts = [];

  const paymentAlert = await evaluatePaymentVerificationRule(event);
  if (paymentAlert) generatedAlerts.push(paymentAlert);

  const manualFundAlerts = await evaluateManualFundRules(event);
  generatedAlerts.push(...manualFundAlerts);

  const withdrawalAlert = await evaluateWithdrawalRule(event);
  if (withdrawalAlert) generatedAlerts.push(withdrawalAlert);

  const marginAlerts = await evaluateMarginRules(event);
  generatedAlerts.push(...marginAlerts);

  return generatedAlerts.filter(Boolean);
};

export {
  evaluateAuditEventForAlerts,
};

export default evaluateAuditEventForAlerts;
