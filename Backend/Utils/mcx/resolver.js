/**
 * MCX Root Resolver — maps tradingsymbol / instrument name to root spec.
 */

import { MCX_ROOT_SPECS } from './rootSpecs.js';

/**
 * Returns true if the exchange/segment indicates MCX.
 */
export const isMCX = ({ exchange, segment } = {}) => {
  const ex = String(exchange || '').toUpperCase();
  const seg = String(segment || '').toUpperCase();
  return ex.includes('MCX') || seg.includes('MCX');
};

/**
 * Extract root symbol from an instrument name or tradingsymbol.
 *
 * Instrument.name is already the clean root (e.g. 'GOLD').
 * Tradingsymbol has expiry suffix (e.g. 'GOLD26APRFUT', 'CRUDEOILM26MARFUT').
 *
 * Strategy: try direct lookup first (covers instrument.name),
 * then strip trailing digits+month+FUT/CE/PE suffix.
 */
export const resolveRootSymbol = (nameOrSymbol) => {
  const input = String(nameOrSymbol || '').toUpperCase().trim();
  if (!input) return null;

  // Direct lookup — handles instrument.name which is already the root
  if (MCX_ROOT_SPECS.has(input)) return input;

  // Strip tradingsymbol suffix: e.g. GOLD26APRFUT -> GOLD
  // Pattern: ROOT + 2-digit year + 3-letter month + FUT/CE/PE
  const match = input.match(/^([A-Z]+?)(\d{2}[A-Z]{3}(?:FUT|CE|PE))$/);
  if (match && MCX_ROOT_SPECS.has(match[1])) return match[1];

  // Fallback: strip trailing FUT/CE/PE and any digits
  const fallback = input.replace(/\d{2}[A-Z]{3}(?:FUT|CE|PE)$/, '');
  if (fallback && MCX_ROOT_SPECS.has(fallback)) return fallback;

  return null;
};

/**
 * Get the full root spec for a given name or tradingsymbol.
 */
export const getRootSpec = (nameOrSymbol) => {
  const root = resolveRootSymbol(nameOrSymbol);
  return root ? MCX_ROOT_SPECS.get(root) : null;
};
