/**
 * MCX Root Specs — frontend display layer.
 * Lightweight copy of backend rootSpecs for UI labels and quantity derivation.
 */

const specs = [
  { root: 'ALUMINI',    units_per_contract: 1000, contract_size: '1 MT',        quote_basis: 'Rs/kg' },
  { root: 'ALUMINIUM',  units_per_contract: 5000, contract_size: '5 MT',        quote_basis: 'Rs/kg' },
  { root: 'CARDAMOM',   units_per_contract: 100,  contract_size: '100 kg',      quote_basis: 'Rs/kg' },
  { root: 'COPPER',     units_per_contract: 2500, contract_size: '2500 kg',     quote_basis: 'Rs/kg' },
  { root: 'COTTON',     units_per_contract: 25,   contract_size: '25 bales',    quote_basis: 'Rs/bale' },
  { root: 'COTTONOIL',  units_per_contract: 500,  contract_size: '5 MT',        quote_basis: 'Rs/10kg' },
  { root: 'CRUDEOIL',   units_per_contract: 100,  contract_size: '100 barrels', quote_basis: 'Rs/barrel' },
  { root: 'CRUDEOILM',  units_per_contract: 10,   contract_size: '10 barrels',  quote_basis: 'Rs/barrel' },
  { root: 'ELECDMBL',   units_per_contract: 50,   contract_size: '50 MWh',      quote_basis: 'Rs/MWh' },
  { root: 'GOLD',       units_per_contract: 100,  contract_size: '1000 grams',  quote_basis: 'Rs/10g' },
  { root: 'GOLDGUINEA', units_per_contract: 1,    contract_size: '8 grams',     quote_basis: 'Rs/8g' },
  { root: 'GOLDM',      units_per_contract: 10,   contract_size: '100 grams',   quote_basis: 'Rs/10g' },
  { root: 'GOLDPETAL',  units_per_contract: 1,    contract_size: '1 gram',      quote_basis: 'Rs/g' },
  { root: 'GOLDTEN',    units_per_contract: 1,    contract_size: '10 grams',    quote_basis: 'Rs/10g' },
  { root: 'KAPAS',      units_per_contract: 200,  contract_size: '4 MT',        quote_basis: 'Rs/20kg' },
  { root: 'LEAD',       units_per_contract: 5000, contract_size: '5 MT',        quote_basis: 'Rs/kg' },
  { root: 'LEADMINI',   units_per_contract: 1000, contract_size: '1 MT',        quote_basis: 'Rs/kg' },
  { root: 'MCXBULLDEX', units_per_contract: 30,   contract_size: '30 index',    quote_basis: 'index pts' },
  { root: 'MCXMETLDEX', units_per_contract: 40,   contract_size: '40 index',    quote_basis: 'index pts' },
  { root: 'MENTHAOIL',  units_per_contract: 360,  contract_size: '360 kg',      quote_basis: 'Rs/kg' },
  { root: 'NATGASMINI', units_per_contract: 250,  contract_size: '250 MMBTU',   quote_basis: 'Rs/MMBTU' },
  { root: 'NATURALGAS', units_per_contract: 1250, contract_size: '1250 MMBTU',  quote_basis: 'Rs/MMBTU' },
  { root: 'NICKEL',     units_per_contract: 250,  contract_size: '250 kg',      quote_basis: 'Rs/kg' },
  { root: 'SILVER',     units_per_contract: 30,   contract_size: '30 kg',       quote_basis: 'Rs/kg' },
  { root: 'SILVERM',    units_per_contract: 5,    contract_size: '5 kg',        quote_basis: 'Rs/kg' },
  { root: 'SILVERMIC',  units_per_contract: 1,    contract_size: '1 kg',        quote_basis: 'Rs/kg' },
  { root: 'STEELREBAR', units_per_contract: 5,    contract_size: '5 MT',        quote_basis: 'Rs/tonne' },
  { root: 'ZINC',       units_per_contract: 5000, contract_size: '5 MT',        quote_basis: 'Rs/kg' },
  { root: 'ZINCMINI',   units_per_contract: 1000, contract_size: '1 MT',        quote_basis: 'Rs/kg' },
];

const MCX_SPECS = new Map(specs.map(s => [s.root, s]));

/**
 * Check if exchange/segment indicates MCX.
 */
export const isMcxSegment = (exchange, segment) => {
  const ex = String(exchange || '').toUpperCase();
  const seg = String(segment || '').toUpperCase();
  return ex.includes('MCX') || seg.includes('MCX');
};

/**
 * Extract MCX root from tradingsymbol or instrument name.
 * Handles formats: exact root ("GOLD"), futures ("GOLD24DECFUT"),
 * options ("GOLD25MAR7500CE"), or any prefix that matches a known root.
 */
const resolveRoot = (symbolOrName) => {
  const input = String(symbolOrName || '').toUpperCase().trim();
  if (!input) return null;
  // Exact match
  if (MCX_SPECS.has(input)) return input;
  // Standard futures: ROOT + YY + MMM + FUT
  const futMatch = input.match(/^([A-Z]+?)(\d{2}[A-Z]{3}(?:FUT|CE|PE))$/);
  if (futMatch && MCX_SPECS.has(futMatch[1])) return futMatch[1];
  // Options with strike: ROOT + YY + MMM + STRIKE + CE/PE
  const optMatch = input.match(/^([A-Z]+?)(\d{2}[A-Z]{3}\d+(?:CE|PE))$/);
  if (optMatch && MCX_SPECS.has(optMatch[1])) return optMatch[1];
  // Longest-prefix fallback: find the longest known root that the symbol starts with
  let best = null;
  for (const root of MCX_SPECS.keys()) {
    if (input.startsWith(root) && (!best || root.length > best.length)) {
      best = root;
    }
  }
  return best;
};

/**
 * Get MCX display spec for a symbol or instrument name.
 * Returns { root, units_per_contract, contract_size, quote_basis } or null.
 */
export const getMcxSpec = (symbolOrName) => {
  const root = resolveRoot(symbolOrName);
  return root ? MCX_SPECS.get(root) : null;
};
