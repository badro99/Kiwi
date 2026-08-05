/* Kiwi · canonical restaurant stock units shared by recipes and procurement. */
(function () {
  'use strict';
  if (window.KiwiRestaurantUnits) return;

  const UNITS = [
    { id: 'mg', label: 'Milligramme (mg)', family: 'mass', factor: 0.001 },
    { id: 'g', label: 'Gramme (g)', family: 'mass', factor: 1 },
    { id: 'kg', label: 'Kilogramme (kg)', family: 'mass', factor: 1000 },
    { id: 'ml', label: 'Millilitre (ml)', family: 'volume', factor: 1 },
    { id: 'cl', label: 'Centilitre (cl)', family: 'volume', factor: 10 },
    { id: 'L', label: 'Litre (L)', family: 'volume', factor: 1000 },
    { id: 'unité', label: 'Unité', family: 'count', factor: 1 },
    { id: 'douzaine', label: 'Douzaine', family: 'package', factor: 1 },
    { id: 'lot', label: 'Lot', family: 'package', factor: 1 },
    { id: 'paquet', label: 'Paquet', family: 'package', factor: 1 },
    { id: 'sachet', label: 'Sachet', family: 'package', factor: 1 },
    { id: 'sac', label: 'Sac', family: 'package', factor: 1 },
    { id: 'boîte', label: 'Boîte', family: 'package', factor: 1 },
    { id: 'carton', label: 'Carton', family: 'package', factor: 1 },
    { id: 'barquette', label: 'Barquette', family: 'package', factor: 1 },
    { id: 'bouteille', label: 'Bouteille', family: 'package', factor: 1 },
    { id: 'canette', label: 'Canette', family: 'package', factor: 1 },
    { id: 'bocal', label: 'Bocal', family: 'package', factor: 1 },
    { id: 'pot', label: 'Pot', family: 'package', factor: 1 },
    { id: 'bidon', label: 'Bidon', family: 'package', factor: 1 },
    { id: 'seau', label: 'Seau', family: 'package', factor: 1 },
    { id: 'fût', label: 'Fût', family: 'package', factor: 1 },
    { id: 'bac', label: 'Bac', family: 'package', factor: 1 },
    { id: 'botte', label: 'Botte', family: 'package', factor: 1 },
    { id: 'caisse', label: 'Caisse', family: 'package', factor: 1 },
    { id: 'plateau', label: 'Plateau', family: 'package', factor: 1 },
    { id: 'rouleau', label: 'Rouleau', family: 'package', factor: 1 },
  ];
  const key = (value) => String(value == null ? '' : value).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  const aliases = {
    mg: 'mg', milligramme: 'mg', milligrammes: 'mg',
    g: 'g', gr: 'g', gramme: 'g', grammes: 'g',
    kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', kilogrammes: 'kg',
    ml: 'ml', millilitre: 'ml', millilitres: 'ml',
    cl: 'cl', centilitre: 'cl', centilitres: 'cl',
    l: 'L', litre: 'L', litres: 'L',
    unite: 'unité', unites: 'unité', unit: 'unité', units: 'unité', piece: 'unité', pieces: 'unité',
    douzaine: 'douzaine', douzaines: 'douzaine', dozen: 'douzaine',
    lot: 'lot', lots: 'lot', paquet: 'paquet', paquets: 'paquet', pack: 'paquet', packs: 'paquet',
    sachet: 'sachet', sachets: 'sachet', sac: 'sac', sacs: 'sac',
    boite: 'boîte', boites: 'boîte', box: 'boîte', boxes: 'boîte', carton: 'carton', cartons: 'carton',
    barquette: 'barquette', barquettes: 'barquette', bouteille: 'bouteille', bouteilles: 'bouteille',
    canette: 'canette', canettes: 'canette', bocal: 'bocal', bocaux: 'bocal', pot: 'pot', pots: 'pot',
    bidon: 'bidon', bidons: 'bidon', seau: 'seau', seaux: 'seau', fut: 'fût', futs: 'fût',
    bac: 'bac', bacs: 'bac', botte: 'botte', bottes: 'botte', caisse: 'caisse', caisses: 'caisse',
    plateau: 'plateau', plateaux: 'plateau', rouleau: 'rouleau', rouleaux: 'rouleau',
  };
  const byId = new Map(UNITS.map((unit) => [unit.id, unit]));
  function normalize(value, fallback = 'unité') { return aliases[key(value)] || (fallback === '' ? '' : (aliases[key(fallback)] || 'unité')); }
  function info(value) { return byId.get(normalize(value, '')) || null; }
  function convert(qty, from, to) {
    const a = info(from), b = info(to), n = Number(qty);
    if (!Number.isFinite(n) || n < 0 || !a || !b) return null;
    if (a.id === b.id) return n;
    if (!['mass', 'volume'].includes(a.family) || a.family !== b.family) return null;
    return n * a.factor / b.factor;
  }
  function unitCost(cost, pricedBy, wantedUnit) {
    const one = convert(1, wantedUnit, pricedBy), n = Number(cost);
    return one == null || !Number.isFinite(n) ? null : n * one;
  }

  window.KiwiRestaurantUnits = { list: () => UNITS.map((unit) => ({ ...unit })), normalize, info, convert, unitCost };
}());
