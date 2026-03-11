const PAYMENT_TYPES = new Set(['credit', 'withdrawal']);
const TRADING_TYPES = new Set(['realized_profit', 'realized_loss']);
const ADJUSTMENT_TYPES = new Set(['adjustment']);
const VALID_CATEGORIES = new Set(['all', 'payment', 'trading', 'margin', 'adjustment']);
const PAYMENT_CONTEXT_KEYWORDS = ['payment', 'fund', 'deposit', 'withdraw', 'payout', 'bank'];

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toLower = (value) => String(value || '').trim().toLowerCase();

const toDisplayText = (value = '', maxLen = 96) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 3)}...` : clean;
};

const hasPaymentContext = (tx) => {
  const notes = toLower(tx?.notes || tx?.description || '');
  if (!notes) return false;
  return PAYMENT_CONTEXT_KEYWORDS.some((keyword) => notes.includes(keyword));
};

const inferCategory = (tx) => {
  const rawType = toLower(tx?.type);

  if (PAYMENT_TYPES.has(rawType)) return 'payment';
  if (rawType === 'debit' && hasPaymentContext(tx)) return 'payment';
  if (ADJUSTMENT_TYPES.has(rawType) && hasPaymentContext(tx)) return 'payment';

  if (TRADING_TYPES.has(rawType)) return 'trading';
  if (rawType.startsWith('margin_')) return 'margin';
  if (ADJUSTMENT_TYPES.has(rawType)) return 'adjustment';

  return 'adjustment';
};

const extractExitReason = (notes = '') => {
  const match = String(notes || '').match(/Reason:\s*([A-Za-z_ ]+)/i);
  if (!match) return '';
  const reason = match[1].trim().replace(/_/g, ' ').toLowerCase();
  if (!reason) return '';
  return reason.charAt(0).toUpperCase() + reason.slice(1);
};

const resolveTitleAndSubtitle = (tx, category, rawType) => {
  const notes = String(tx?.notes || tx?.description || '');
  const cleanNotes = toDisplayText(notes, 110);
  const exitReason = extractExitReason(notes);
  const signedAmount = toNumber(tx?.amount);

  if (rawType === 'credit') {
    return {
      title: 'Funds Added',
      subtitle: cleanNotes || 'Payment received',
    };
  }

  if (rawType === 'withdrawal') {
    return {
      title: 'Funds Deducted',
      subtitle: cleanNotes || 'Withdrawal processed',
    };
  }

  if (rawType === 'adjustment') {
    return {
      title: signedAmount >= 0 ? 'Funds Added' : 'Funds Deducted',
      subtitle: 'Balance adjusted',
    };
  }

  if (rawType === 'realized_profit') {
    return {
      title: 'Trade Profit Settled',
      subtitle: exitReason ? `Exit reason: ${exitReason}` : 'Credited to net cash',
    };
  }

  if (rawType === 'realized_loss') {
    return {
      title: 'Trade Loss Settled',
      subtitle: exitReason ? `Exit reason: ${exitReason}` : 'Debited from net cash',
    };
  }

  if (rawType === 'weekly_settlement') {
    return {
      title: 'Weekly Settlement Checkpoint',
      subtitle: 'Settlement boundary recorded for weekly session',
    };
  }

  if (rawType === 'margin_refunded_rejection') {
    return {
      title: 'Margin Added',
      subtitle: 'Margin returned to available balance',
    };
  }

  if (rawType === 'margin_locked_delivery') {
    return {
      title: 'Margin Deducted',
      subtitle: 'Margin blocked for delivery position',
    };
  }

  if (rawType === 'margin_released_midnight_intraday') {
    return {
      title: 'Margin Added',
      subtitle: 'Intraday margin released',
    };
  }

  if (rawType === 'margin_released_midnight_delivery') {
    return {
      title: 'Margin Added',
      subtitle: 'Delivery margin released',
    };
  }

  if (category === 'payment') {
    return {
      title: 'Payment Activity',
      subtitle: cleanNotes || 'Account payment update',
    };
  }

  if (category === 'trading') {
    return {
      title: 'Trading Settlement',
      subtitle: cleanNotes || 'Trade-related settlement entry',
    };
  }

  if (category === 'margin') {
    return {
      title: signedAmount >= 0 ? 'Margin Added' : 'Margin Deducted',
      subtitle: 'Margin balance updated',
    };
  }

  if (category === 'adjustment') {
    return {
      title: signedAmount >= 0 ? 'Funds Added' : 'Funds Deducted',
      subtitle: 'Balance adjusted',
    };
  }

  return {
    title: 'Account Activity',
    subtitle: cleanNotes || 'Statement entry',
  };
};

const resolveDirection = (rawType, amount, category) => {
  if (rawType === 'withdrawal' || rawType === 'realized_loss' || rawType === 'margin_locked_delivery') {
    return 'debit';
  }

  if (
    rawType === 'credit' ||
    rawType === 'realized_profit' ||
    rawType === 'margin_refunded_rejection' ||
    rawType === 'margin_released_midnight_intraday' ||
    rawType === 'margin_released_midnight_delivery'
  ) {
    return 'credit';
  }

  if (rawType === 'weekly_settlement') return 'neutral';

  if (category === 'payment') {
    return amount >= 0 ? 'credit' : 'debit';
  }

  if (amount > 0) return 'credit';
  if (amount < 0) return 'debit';
  return 'neutral';
};

const normalizeStatus = (value) => {
  const status = toLower(value);
  if (!status) return 'completed';
  if (status === 'pending' || status === 'processing' || status === 'pending_proof' || status === 'open') {
    return 'pending';
  }
  if (status === 'failed' || status === 'rejected' || status === 'cancelled' || status === 'error') {
    return 'failed';
  }
  return 'completed';
};

const getTimestampDate = (tx) => {
  const rawValue = tx?.timestamp || tx?.createdAt || tx?.date;
  const date = rawValue ? new Date(rawValue) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
};

const sanitizeFundTransactionCategory = (value) => {
  const normalized = toLower(value || 'all');
  return VALID_CATEGORIES.has(normalized) ? normalized : 'all';
};

const getFundTransactionCategory = (tx) => inferCategory(tx);

const matchesFundTransactionCategory = (tx, category) => {
  const normalizedCategory = sanitizeFundTransactionCategory(category);
  if (normalizedCategory === 'all') return true;
  return inferCategory(tx) === normalizedCategory;
};

const mapFundTransactionForCustomer = (tx) => {
  const rawType = toLower(tx?.type);
  const category = inferCategory(tx);
  const signedAmount = toNumber(tx?.amount);
  const direction = resolveDirection(rawType, signedAmount, category);
  const { title, subtitle } = resolveTitleAndSubtitle(tx, category, rawType);
  const timestamp = getTimestampDate(tx);

  return {
    id: tx?._id?.toString?.() || tx?.id?.toString?.() || '',
    timestamp: timestamp.toISOString(),
    category,
    direction,
    amount: Math.abs(signedAmount),
    signedAmount,
    title,
    subtitle,
    status: normalizeStatus(tx?.status),
    reference: String(tx?.reference || '').trim(),
    rawType,
  };
};

const getFundTransactionDate = (tx) => getTimestampDate(tx);

export {
  getFundTransactionCategory,
  getFundTransactionDate,
  mapFundTransactionForCustomer,
  matchesFundTransactionCategory,
  sanitizeFundTransactionCategory,
};
