const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toLower = (value) => String(value || '').trim().toLowerCase();

const MANUAL_METHOD_LABELS = {
  upi: 'UPI',
  imps: 'IMPS',
  neft: 'NEFT',
  rtgs: 'RTGS',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  internal: 'Internal',
  other: 'Other',
};

const normalizeMethodKey = (value) => {
  const normalized = toLower(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!normalized) return 'other';
  return Object.prototype.hasOwnProperty.call(MANUAL_METHOD_LABELS, normalized)
    ? normalized
    : 'other';
};

const parseManualMethod = (tx = {}) => {
  const preferred = tx.method || tx.methodLabel || '';
  if (preferred) {
    const method = normalizeMethodKey(preferred);
    return { method, methodLabel: MANUAL_METHOD_LABELS[method] || MANUAL_METHOD_LABELS.other };
  }

  const noteText = String(tx.notes || tx.subtitle || tx.description || '').trim();
  const explicitMatch = noteText.match(/(?:manual deposit(?: recorded| entry)?|withdrawal entry|funds credited)\s*\(([^)]+)\)/i);
  if (explicitMatch?.[1]) {
    const method = normalizeMethodKey(explicitMatch[1]);
    return { method, methodLabel: MANUAL_METHOD_LABELS[method] || MANUAL_METHOD_LABELS.other };
  }

  const lowered = toLower(noteText);
  const matchedKey = Object.keys(MANUAL_METHOD_LABELS).find((key) => lowered.includes(key.replace(/_/g, ' ')) || lowered.includes(key));
  const method = matchedKey || 'other';
  return { method, methodLabel: MANUAL_METHOD_LABELS[method] || MANUAL_METHOD_LABELS.other };
};

const trimText = (value, maxLen = 84) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 3)}...` : clean;
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

const inferCategory = (rawType) => {
  if (rawType === 'credit' || rawType === 'withdrawal' || rawType === 'manual_deposit' || rawType === 'manual_withdrawal') return 'payment';
  if (rawType === 'realized_profit' || rawType === 'realized_loss') return 'trading';
  if (rawType.startsWith('margin_')) return 'margin';
  if (rawType === 'adjustment') return 'adjustment';
  return 'adjustment';
};

const normalizeDirection = (direction, signedAmount, rawType) => {
  const normalizedDirection = toLower(direction);
  if (normalizedDirection === 'credit' || normalizedDirection === 'debit' || normalizedDirection === 'neutral') {
    return normalizedDirection;
  }

  if (rawType === 'withdrawal' || rawType === 'manual_withdrawal' || rawType === 'realized_loss' || rawType === 'margin_locked_delivery') {
    return 'debit';
  }
  if (rawType === 'credit' || rawType === 'manual_deposit' || rawType === 'realized_profit') return 'credit';
  if (signedAmount > 0) return 'credit';
  if (signedAmount < 0) return 'debit';
  return 'neutral';
};

const normalizeUiTransaction = (tx = {}) => {
  const rawType = toLower(tx.rawType || tx.type);
  const manualMethodMeta = rawType === 'manual_deposit' || rawType === 'manual_withdrawal'
    ? parseManualMethod(tx)
    : { method: '', methodLabel: '' };
  const signedAmount = toNumber(
    tx.signedAmount,
    tx.direction === 'debit' ? -Math.abs(toNumber(tx.amount)) : toNumber(tx.amount)
  );
  const direction = normalizeDirection(tx.direction, signedAmount, rawType);
  const amount = Math.abs(toNumber(tx.amount, Math.abs(signedAmount)));
  const timestamp = tx.timestamp || tx.createdAt || tx.date || null;
  const category = toLower(tx.category) || inferCategory(rawType);

  return {
    id: tx.id || tx._id || '',
    timestamp,
    category,
    direction,
    amount,
    signedAmount,
    title: trimText(
      tx.title
      || (rawType === 'manual_deposit'
        ? 'Funds Credited'
        : rawType === 'manual_withdrawal'
          ? 'Funds Debited'
          : tx.description || tx.type || 'Account Activity'),
      72
    ),
    subtitle: trimText(
      tx.subtitle || ((rawType === 'manual_deposit' || rawType === 'manual_withdrawal') ? manualMethodMeta.methodLabel : tx.notes || ''),
      96
    ),
    status: normalizeStatus(tx.status),
    reference: String(tx.reference || '').trim(),
    rawType,
    method: manualMethodMeta.method,
    methodLabel: manualMethodMeta.methodLabel,
  };
};

const formatCurrency = (value) => {
  const amount = toNumber(value, 0);
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatSignedTransactionAmount = (tx) => {
  const amount = Math.abs(toNumber(tx?.amount, 0));
  const direction = toLower(tx?.direction);
  const sign = direction === 'credit' ? '+' : direction === 'debit' ? '-' : '';
  return `${sign}${formatCurrency(amount)}`;
};

const formatTransactionDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTransactionVisualMeta = (tx) => {
  const direction = toLower(tx?.direction);
  const category = toLower(tx?.category);

  if (category === 'payment' && direction === 'credit') {
    return {
      icon: 'south_west',
      iconClass: 'text-green-600',
      circleClass: 'bg-green-100',
      amountClass: 'text-green-600',
    };
  }

  if (category === 'payment' && direction === 'debit') {
    return {
      icon: 'north_east',
      iconClass: 'text-red-600',
      circleClass: 'bg-red-100',
      amountClass: 'text-red-600',
    };
  }

  if (category === 'trading') {
    return {
      icon: 'candlestick_chart',
      iconClass: 'text-[#137fec]',
      circleClass: 'bg-[#eaf3ff]',
      amountClass: direction === 'debit' ? 'text-red-600' : 'text-[#137fec]',
    };
  }

  if (category === 'margin') {
    return {
      icon: 'account_balance',
      iconClass: 'text-amber-600',
      circleClass: 'bg-amber-100',
      amountClass: direction === 'debit' ? 'text-amber-700' : 'text-[#111418]',
    };
  }

  return {
    icon: direction === 'credit' ? 'south_west' : 'north_east',
    iconClass: direction === 'credit' ? 'text-green-600' : 'text-[#617589]',
    circleClass: direction === 'credit' ? 'bg-green-100' : 'bg-gray-100',
    amountClass: direction === 'credit' ? 'text-green-600' : 'text-[#111418]',
  };
};

const getStatusMeta = (status) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'pending') {
    return { label: 'Pending', className: 'bg-amber-50 text-amber-700 border border-amber-100' };
  }
  if (normalized === 'failed') {
    return { label: 'Failed', className: 'bg-red-50 text-red-700 border border-red-100' };
  }
  return { label: 'Completed', className: 'bg-green-50 text-green-700 border border-green-100' };
};

export {
  formatCurrency,
  formatSignedTransactionAmount,
  formatTransactionDateTime,
  getStatusMeta,
  getTransactionVisualMeta,
  normalizeUiTransaction,
};
