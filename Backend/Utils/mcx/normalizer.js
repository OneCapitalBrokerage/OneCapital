/**
 * MCX Contract Normalizer — derives correct quantity and economics from lots + root spec.
 */

import { isMCX, getRootSpec } from './resolver.js';

/**
 * Normalize an MCX order's quantity and economic fields.
 *
 * Returns null if not MCX or root spec not found.
 *
 * @param {Object} params
 * @param {number} params.lots - Customer-entered contract count
 * @param {string} params.exchange
 * @param {string} params.segment
 * @param {string} [params.name] - Instrument.name (preferred for root resolution)
 * @param {string} [params.tradingsymbol]
 * @param {number} [params.tickSize]
 * @returns {Object|null}
 */
export const normalizeMcxOrder = ({ lots, exchange, segment, name, tradingsymbol, tickSize }) => {
  if (!isMCX({ exchange, segment })) return null;

  const spec = getRootSpec(name) || getRootSpec(tradingsymbol);
  if (!spec) {
    console.warn(
      `[mcx/normalizer] No root spec found for MCX instrument: name=${name}, tradingsymbol=${tradingsymbol}. Falling back to generic path.`
    );
    return null;
  }

  const safeLots = Math.max(1, Math.round(Number(lots) || 1));
  const quantity = safeLots * spec.units_per_contract;
  const tick = Number(tickSize) || spec.official_tick_size;

  return {
    isMcx: true,
    root: spec.root,
    units_per_contract: spec.units_per_contract,
    quantity,
    lots: safeLots,
    physical_contract_size: spec.official_contract_size,
    tick_value_per_contract: tick * spec.units_per_contract,
    quote_basis: spec.official_quote_basis,
  };
};

/**
 * Derive lots from a quantity value using a root spec.
 */
export const mcxLotsFromQuantity = (quantity, rootSpec) => {
  if (!rootSpec || !rootSpec.units_per_contract) return 1;
  return Math.max(1, Math.round(Number(quantity) / rootSpec.units_per_contract));
};
