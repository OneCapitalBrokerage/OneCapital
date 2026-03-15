/**
 * MCX Root Specs — static overlay data from mcx_normalized_table_2026-03-14.xlsx
 *
 * Each entry defines the contract economics for one MCX commodity root.
 * This data never mutates the raw Zerodha instrument collection.
 */

const specs = [
  { root: 'ALUMINI',      units_per_contract: 1000, official_contract_size: '1 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.05 },
  { root: 'ALUMINIUM',    units_per_contract: 5000, official_contract_size: '5 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.05 },
  { root: 'CARDAMOM',     units_per_contract: 100,  official_contract_size: '100 kg',      official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'COPPER',       units_per_contract: 2500, official_contract_size: '2500 kg',     official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.05 },
  { root: 'COTTON',       units_per_contract: 25,   official_contract_size: '25 bales',    official_contract_unit: 'bales',   official_quote_basis: 'Rs per bale (170 kg)',official_quote_unit_size: 1,  official_tick_size: 10 },
  { root: 'COTTONOIL',    units_per_contract: 500,  official_contract_size: '5 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per 10 kg',        official_quote_unit_size: 10, official_tick_size: 0.1 },
  { root: 'CRUDEOIL',     units_per_contract: 100,  official_contract_size: '100 barrels', official_contract_unit: 'barrels',  official_quote_basis: 'Rs per barrel',       official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'CRUDEOILM',    units_per_contract: 10,   official_contract_size: '10 barrels',  official_contract_unit: 'barrels',  official_quote_basis: 'Rs per barrel',       official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'ELECDMBL',     units_per_contract: 50,   official_contract_size: '50 MWh',      official_contract_unit: 'MWh',     official_quote_basis: 'Rs per MWh',          official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'GOLD',         units_per_contract: 100,  official_contract_size: '1000 grams',  official_contract_unit: 'grams',   official_quote_basis: 'Rs per 10 grams',     official_quote_unit_size: 10, official_tick_size: 1 },
  { root: 'GOLDGUINEA',   units_per_contract: 1,    official_contract_size: '8 grams',     official_contract_unit: 'grams',   official_quote_basis: 'Rs per 8 grams',      official_quote_unit_size: 8,  official_tick_size: 1 },
  { root: 'GOLDM',        units_per_contract: 10,   official_contract_size: '100 grams',   official_contract_unit: 'grams',   official_quote_basis: 'Rs per 10 grams',     official_quote_unit_size: 10, official_tick_size: 1 },
  { root: 'GOLDPETAL',    units_per_contract: 1,    official_contract_size: '1 gram',      official_contract_unit: 'grams',   official_quote_basis: 'Rs per gram',         official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'GOLDTEN',      units_per_contract: 1,    official_contract_size: '10 grams',    official_contract_unit: 'grams',   official_quote_basis: 'Rs per 10 grams',     official_quote_unit_size: 10, official_tick_size: 1 },
  { root: 'KAPAS',        units_per_contract: 200,  official_contract_size: '4 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per 20 kg',        official_quote_unit_size: 20, official_tick_size: 0.5 },
  { root: 'LEAD',         units_per_contract: 5000, official_contract_size: '5 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.05 },
  { root: 'LEADMINI',     units_per_contract: 1000, official_contract_size: '1 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.05 },
  { root: 'MCXBULLDEX',   units_per_contract: 30,   official_contract_size: '30 index units', official_contract_unit: 'index units', official_quote_basis: 'index points', official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'MCXMETLDEX',   units_per_contract: 40,   official_contract_size: '40 index units', official_contract_unit: 'index units', official_quote_basis: 'index points', official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'MENTHAOIL',    units_per_contract: 360,  official_contract_size: '360 kg',      official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.1 },
  { root: 'NATGASMINI',   units_per_contract: 250,  official_contract_size: '250 MMBTU',   official_contract_unit: 'MMBTU',   official_quote_basis: 'Rs per MMBTU',        official_quote_unit_size: 1,  official_tick_size: 0.1 },
  { root: 'NATURALGAS',   units_per_contract: 1250, official_contract_size: '1250 MMBTU',  official_contract_unit: 'MMBTU',   official_quote_basis: 'Rs per MMBTU',        official_quote_unit_size: 1,  official_tick_size: 0.1 },
  { root: 'NICKEL',       units_per_contract: 250,  official_contract_size: '250 kg',      official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.1 },
  { root: 'SILVER',       units_per_contract: 30,   official_contract_size: '30 kg',       official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'SILVERM',      units_per_contract: 5,    official_contract_size: '5 kg',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'SILVERMIC',    units_per_contract: 1,    official_contract_size: '1 kg',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 1 },
  { root: 'STEELREBAR',   units_per_contract: 5,    official_contract_size: '5 MT',        official_contract_unit: 'MT',      official_quote_basis: 'Rs per tonne',        official_quote_unit_size: 1,  official_tick_size: 10 },
  { root: 'ZINC',         units_per_contract: 5000, official_contract_size: '5 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.05 },
  { root: 'ZINCMINI',     units_per_contract: 1000, official_contract_size: '1 MT',        official_contract_unit: 'kg',      official_quote_basis: 'Rs per kg',           official_quote_unit_size: 1,  official_tick_size: 0.05 },
];

export const MCX_ROOT_SPECS = new Map(specs.map(s => [s.root, Object.freeze(s)]));
Object.freeze(MCX_ROOT_SPECS);
