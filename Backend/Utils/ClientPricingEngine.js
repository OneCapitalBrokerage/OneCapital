import ClientPricingModel from '../Model/Trading/ClientPricingModel.js';

export const INITIAL_CLIENT_PRICING = Object.freeze({
  brokerage: {
    cash: {
      percent: 0.08,
    },
    future: {
      percent: 0.08,
    },
    option: {
      per_lot: 2,
    },
  },
  spread: {
    cash: 0,
    future: 0,
    option: 0,
    mcx: 0,
  },
});

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (value) => Number(toNumber(value).toFixed(2));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeSide = (side) => (String(side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY');

const pickLegacySymmetricRate = (values, fallback) => {
  const finite = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (finite.length === 0) return fallback;
  return Math.max(...finite);
};

const normalizeSpread = (spread = {}) => ({
  cash: clamp(toNumber(spread.cash, INITIAL_CLIENT_PRICING.spread.cash), -1000, 1000),
  future: clamp(toNumber(spread.future, INITIAL_CLIENT_PRICING.spread.future), -1000, 1000),
  option: clamp(toNumber(spread.option, INITIAL_CLIENT_PRICING.spread.option), -1000, 1000),
  mcx: clamp(toNumber(spread.mcx, INITIAL_CLIENT_PRICING.spread.mcx), -1000, 1000),
});

const normalizeBrokerage = (brokerage = {}) => {
  const legacyCashFuture = brokerage.cash_future || {};
  const legacyOptions = brokerage.options || {};

  const legacyTurnoverPercent = pickLegacySymmetricRate(
    [legacyCashFuture.buy, legacyCashFuture.sell],
    INITIAL_CLIENT_PRICING.brokerage.cash.percent
  );
  const legacyOptionPerLot = pickLegacySymmetricRate(
    [legacyOptions.buy_per_lot, legacyOptions.sell_per_lot],
    INITIAL_CLIENT_PRICING.brokerage.option.per_lot
  );

  return {
    cash: {
      percent: clamp(
        toNumber(
          brokerage.cash?.percent,
          legacyTurnoverPercent
        ),
        0,
        100
      ),
    },
    future: {
      percent: clamp(
        toNumber(
          brokerage.future?.percent,
          legacyTurnoverPercent
        ),
        0,
        100
      ),
    },
    option: {
      per_lot: clamp(
        toNumber(
          brokerage.option?.per_lot ?? brokerage.option?.perLot,
          legacyOptionPerLot
        ),
        0,
        100000
      ),
    },
  };
};

export const normalizeClientPricing = (pricing = {}) => ({
  brokerage: normalizeBrokerage(pricing.brokerage),
  spread: normalizeSpread(pricing.spread),
});

const buildSeedPricingDoc = ({ updatedBy } = {}) => {
  const normalized = normalizeClientPricing(INITIAL_CLIENT_PRICING);
  return {
    brokerage: normalized.brokerage,
    spread: normalized.spread,
    ...(updatedBy ? { updated_by: updatedBy } : {}),
  };
};

const hasModernBrokerageShape = (brokerage = {}) =>
  brokerage?.cash?.percent != null &&
  brokerage?.future?.percent != null &&
  brokerage?.option?.per_lot != null;

export const ensureClientPricingConfig = async ({ brokerIdStr, customerIdStr, updatedBy } = {}) => {
  if (!brokerIdStr || !customerIdStr) {
    return normalizeClientPricing(INITIAL_CLIENT_PRICING);
  }

  const query = {
    broker_id_str: String(brokerIdStr),
    customer_id_str: String(customerIdStr),
  };

  let doc = await ClientPricingModel.findOne(query);

  if (!doc) {
    doc = await ClientPricingModel.create({
      broker_id_str: query.broker_id_str,
      customer_id_str: query.customer_id_str,
      ...buildSeedPricingDoc({ updatedBy }),
    });
    return normalizeClientPricing({
      brokerage: doc.brokerage,
      spread: doc.spread,
    });
  }

  const normalized = normalizeClientPricing({
    brokerage: doc.brokerage,
    spread: doc.spread,
  });

  if (!hasModernBrokerageShape(doc.brokerage || {})) {
    doc.brokerage = normalized.brokerage;
    doc.spread = normalized.spread;
    if (updatedBy) doc.updated_by = updatedBy;
    await doc.save();
  }

  return normalized;
};

export const getClientPricingConfig = async ({ brokerIdStr, customerIdStr, updatedBy } = {}) =>
  ensureClientPricingConfig({ brokerIdStr, customerIdStr, updatedBy });

export const inferPricingBucket = ({ exchange, segment, symbol, orderType }) => {
  const ex = String(exchange || '').toUpperCase();
  const seg = String(segment || '').toUpperCase();
  const sym = String(symbol || '').toUpperCase();
  const ordType = String(orderType || '').toUpperCase();

  const isOption =
    sym.endsWith('CE') ||
    sym.endsWith('PE') ||
    sym.endsWith('CALL') ||
    sym.endsWith('PUT') ||
    seg.includes('OPT') ||
    ordType === 'OPTION_CHAIN';
  if (isOption) return 'OPTION';

  const isFuture =
    sym.includes('FUT') ||
    seg.includes('FUT') ||
    seg.includes('NFO') ||
    seg.includes('BFO') ||
    seg.includes('F&O') ||
    seg === 'FO' ||
    seg === 'NRML' ||
    ex.includes('MCX') ||
    seg.includes('MCX');
  if (isFuture) return 'FUTURE';

  return 'CASH';
};

export const inferSpreadBucket = ({ exchange, segment, symbol, orderType }) => {
  const ex = String(exchange || '').toUpperCase();
  const seg = String(segment || '').toUpperCase();

  if (ex.includes('MCX') || seg.includes('MCX')) return 'MCX';

  const pricingBucket = inferPricingBucket({ exchange, segment, symbol, orderType });
  if (pricingBucket === 'OPTION') return 'OPTION';
  if (pricingBucket === 'FUTURE') return 'FUTURE';
  return 'CASH';
};

export const getSpreadForBucket = (pricing, bucket) => {
  const spread = pricing?.spread || INITIAL_CLIENT_PRICING.spread;
  const key = String(bucket || 'CASH').toUpperCase();
  if (key === 'MCX') return toNumber(spread.mcx, 0);
  if (key === 'OPTION') return toNumber(spread.option, 0);
  if (key === 'FUTURE') return toNumber(spread.future, 0);
  return toNumber(spread.cash, 0);
};

export const applySpreadToPrice = ({ rawPrice, side, spread }) => {
  const safeRaw = toNumber(rawPrice, 0);
  const safeSpread = toNumber(spread, 0);
  const normalizedSide = normalizeSide(side);
  const appliedSpread = normalizedSide === 'BUY' ? safeSpread : -safeSpread;
  const effectivePrice = round2(safeRaw + appliedSpread);

  return {
    rawPrice: round2(safeRaw),
    effectivePrice,
    appliedSpread: round2(appliedSpread),
  };
};

export const getClosingSide = (entrySide) => (normalizeSide(entrySide) === 'BUY' ? 'SELL' : 'BUY');

export const resolveLots = ({ lots, quantity, lotSize }) => {
  const qty = toNumber(quantity, 0);
  const lot = Math.max(1, toNumber(lotSize, 1));
  const inputLots = toNumber(lots, 0);

  if (inputLots > 0) return inputLots;
  if (qty > 0) return Math.max(1, qty / lot);
  return 1;
};

export const calculateBrokerageForLeg = ({
  pricing,
  bucket,
  side,
  quantity,
  lotSize,
  lots,
  effectivePrice,
}) => {
  const normalizedSide = normalizeSide(side);
  const normalizedBucket = String(bucket || 'CASH').toUpperCase();
  const qty = Math.max(0, toNumber(quantity, 0));
  const price = Math.max(0, toNumber(effectivePrice, 0));
  const resolvedLots = resolveLots({ lots, quantity: qty, lotSize });

  if (normalizedBucket === 'OPTION') {
    const perLot = toNumber(
      pricing?.brokerage?.option?.per_lot,
      INITIAL_CLIENT_PRICING.brokerage.option.per_lot
    );

    return {
      amount: round2(perLot * resolvedLots),
      mode: 'FLAT_PER_LOT',
      rate: round2(perLot),
      basis: round2(resolvedLots),
      side: normalizedSide,
    };
  }

  const rate =
    normalizedBucket === 'FUTURE' || normalizedBucket === 'MCX'
      ? toNumber(
          pricing?.brokerage?.future?.percent,
          INITIAL_CLIENT_PRICING.brokerage.future.percent
        )
      : toNumber(
          pricing?.brokerage?.cash?.percent,
          INITIAL_CLIENT_PRICING.brokerage.cash.percent
        );

  const turnover = qty * price;
  return {
    amount: round2((turnover * rate) / 100),
    mode: 'PERCENT',
    rate: round2(rate),
    basis: round2(turnover),
    side: normalizedSide,
  };
};

export const buildEntryBrokerageSnapshot = ({
  pricing,
  bucket,
  side,
  quantity,
  lotSize,
  lots,
  effectivePrice,
}) => {
  const entry = calculateBrokerageForLeg({
    pricing,
    bucket,
    side,
    quantity,
    lotSize,
    lots,
    effectivePrice,
  });
  const amount = round2(entry.amount);

  return {
    amount,
    breakdown: {
      entry: {
        ...entry,
        amount,
      },
      total: amount,
      pricingBucket: String(bucket || 'CASH').toUpperCase(),
    },
  };
};
