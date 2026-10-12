/* Kiwi Health · the score, computed from facts and nothing else.
 *
 * How much of what Kiwi offers THIS business actually uses (docs/specs/
 * kiwi-health.md). Never how the business performs: takings, margin and baskets
 * stay in the KPI band and never enter here.
 *
 * This file is pure. `functions/api/merchant-health.js` gathers the facts from D1 and
 * hands them over; the tests hand over fixtures. A fact that could not be read
 * (a table prod D1 does not have yet, a failed query) arrives as `undefined`,
 * and every check that needs it answers « non mesurable » — it leaves the
 * score, it never counts as zero.
 *
 * Every check answers one of five states:
 *   done        1
 *   partial     the real fraction, 0 < v < 1
 *   todo        0
 *   unmeasured  out of the score: Kiwi cannot see it
 *   na          out of the score and off the list: the module is switched off
 *               for this business, or does not exist for its trade
 * Optional checks (weight 0) are listed apart, as suggestions, and never move
 * the score. */

export const HEALTH_VERSION = 1;

/* The trades kiwi-admin sells (kiwi-admin.html › TYPES), folded onto the four
 * dashboards, plus the pressing, whose till is its own. */
const BASE = {
  restaurant: 'restaurant', cafe: 'restaurant', fastfood: 'restaurant', bakery: 'restaurant',
  pizzeria: 'restaurant', traiteur: 'restaurant', foodtruck: 'restaurant',
  boutique: 'boutique', epicerie: 'boutique', pharmacie: 'boutique', librairie: 'boutique',
  fleuriste: 'boutique', maison: 'boutique', autre: 'boutique',
  pressing: 'pressing',
  spa: 'spa', coiffure: 'spa', sport: 'spa',
  hotel: 'hotel',
};
export function baseOf(type) {
  const t = String(type || '').trim().toLowerCase();
  return BASE[t] || 'restaurant';
}

const known = (v) => v !== undefined && v !== null && !(typeof v === 'number' && !Number.isFinite(v));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const share = (n, of) => (of > 0 ? clamp01(n / of) : 0);
/* « fait » from 80 % on: a menu where four dishes in five carry a photo is a
 * menu with photos; asking for the last one is asking for perfection. */
const DONE_AT = 0.8;

function state(value) {
  if (value === null) return 'unmeasured';
  if (value >= 1) return 'done';
  if (value <= 0) return 'todo';
  return 'partial';
}

/* A module the operator switched off (merchant_config.features[key] === false).
 * Absent means on, except for the opt-in ones whose key must be true. */
function off(features, key) {
  return !!features && features[key] === false;
}
function on(features, key) {
  return !!features && features[key] === true;
}

/* ── the checks ──────────────────────────────────────────────────────────── */

function check(id, area, weight, value, extra) {
  const v = value === null ? null : clamp01(value);
  return { id, area, weight, state: state(v), value: v === null ? null : Math.round(v * 100) / 100, ...(extra || {}) };
}

function common(f, base) {
  const out = [];
  const feat = f.features || {};

  // C1 · the till takes sales, on the days the shop is open
  if (known(f.saleDays) && known(f.openDays)) {
    out.push(check('till', 'caisse', 3, share(f.saleDays, f.openDays),
      { n: f.saleDays, of: f.openDays, nav: { feature: 'transactions' } }));
  } else out.push(check('till', 'caisse', 3, null));

  // C2 · each day with sales is closed
  if (known(f.saleDays) && known(f.closedDays)) {
    out.push(f.saleDays > 0
      ? check('close', 'caisse', 2, share(Math.min(f.closedDays, f.saleDays), f.saleDays), { n: Math.min(f.closedDays, f.saleDays), of: f.saleDays })
      : check('close', 'caisse', 2, 0, { n: 0, of: 0 }));
  } else out.push(check('close', 'caisse', 2, null));

  // C3 · everyone has their own code (counted, never read)
  if (off(feat, 'equipe')) out.push(check('codes', 'equipe', 1, null, { state: 'na' }));
  else if (known(f.codeHolders)) {
    out.push(check('codes', 'equipe', 1, f.codeHolders >= 2 ? 1 : f.codeHolders === 1 ? 0.5 : 0,
      { n: f.codeHolders, nav: { feature: 'equipe' } }));
  } else out.push(check('codes', 'equipe', 1, null));

  // C4 · the time clock
  if (off(feat, 'equipe')) out.push(check('clock', 'equipe', 1, null, { state: 'na' }));
  else if (known(f.clockedStaff) && known(f.teamSize)) {
    out.push(f.teamSize > 0
      ? check('clock', 'equipe', 1, share(f.clockedStaff, f.teamSize), { n: f.clockedStaff, of: f.teamSize, nav: { feature: 'equipe' } })
      : check('clock', 'equipe', 1, 0, { n: 0, of: 0, nav: { feature: 'equipe' } }));
  } else out.push(check('clock', 'equipe', 1, null));

  // C5 · the planning
  if (off(feat, 'payroll')) out.push(check('planning', 'equipe', 1, null, { state: 'na' }));
  else if (known(f.shiftsPlanned)) {
    out.push(check('planning', 'equipe', 1, f.shiftsPlanned > 0 ? 1 : 0, { nav: { feature: 'payroll' } }));
  } else out.push(check('planning', 'equipe', 1, null));

  // C6 · client records: one sale in ten tied to a client is « done »
  const clientWeight = base === 'spa' ? 2 : 1;
  if (off(feat, 'crm')) out.push(check('clients', 'clients', clientWeight, null, { state: 'na' }));
  else if (known(f.linkedSales) && known(f.saleCount)) {
    const ratio = share(f.linkedSales, f.saleCount);
    out.push(check('clients', 'clients', clientWeight, f.saleCount > 0 ? clamp01(ratio / 0.1) : 0,
      { n: f.linkedSales, of: f.saleCount, nav: { action: 'clients-directory' } }));
  } else out.push(check('clients', 'clients', clientWeight, null));

  // C7 · loyalty: set up is half, rewards given is the rest
  if (off(feat, 'loyalty') || off(feat, 'crm')) out.push(check('loyalty', 'clients', 1, null, { state: 'na' }));
  else if (known(f.loyaltySet) && known(f.rewardsGiven)) {
    out.push(check('loyalty', 'clients', 1, !f.loyaltySet ? 0 : f.rewardsGiven > 0 ? 1 : 0.5,
      { n: f.rewardsGiven, nav: { action: 'clients-directory' } }));
  } else out.push(check('loyalty', 'clients', 1, null));

  // C8 · who the shop is, on every ticket: name, logo, legal mentions
  if (known(f.identity)) {
    const parts = (f.identity.name ? 1 : 0) + (f.identity.logo ? 1 : 0) + (f.identity.legal ? 1 : 0);
    out.push(check('identity', 'rapports', 1, parts / 3, { n: parts, of: 3, nav: { action: 'settings' } }));
  } else out.push(check('identity', 'rapports', 1, null));

  // C9 · opening hours
  if (known(f.hoursSet)) out.push(check('hours', 'rapports', 0.5, f.hoursSet ? 1 : 0, { nav: { action: 'settings' } }));
  else out.push(check('hours', 'rapports', 0.5, null));

  // C10 · printer: only a bridge leaves a trace. Bluetooth and USB print
  // straight from the browser and the server never hears of it.
  if (known(f.printerSeen)) out.push(f.printerSeen ? check('printer', 'materiel', 1, 1) : check('printer', 'materiel', 1, null, { why: 'browser-printing' }));
  else out.push(check('printer', 'materiel', 1, null));

  // C11 · the accountant gets the month
  if (known(f.accountantSet)) out.push(check('accountant', 'rapports', 0.5, f.accountantSet ? 1 : 0, { nav: { feature: 'rapport' } }));
  else out.push(check('accountant', 'rapports', 0.5, null));

  // C12 · Kiwi IQ
  if (known(f.iqUsed)) out.push(check('iq', 'rapports', 1, f.iqUsed ? 1 : 0, { nav: { action: 'open-assistant' } }));
  else out.push(check('iq', 'rapports', 1, null));

  return out;
}

function restaurant(f) {
  const feat = f.features || {};
  const salleOff = off(feat, 'salle') || off(feat, 'tables');
  const out = [];

  // R1 · the menu, and how much of it a customer can see
  if (off(feat, 'menu')) out.push(check('menu', 'carte', 2, null, { state: 'na' }));
  else if (known(f.menuItems) && known(f.menuWithPhoto)) {
    const s = share(f.menuWithPhoto, f.menuItems);
    out.push(check('menu', 'carte', 2, f.menuItems === 0 ? 0 : s >= DONE_AT ? 1 : 0.5 + 0.5 * s,
      { n: f.menuWithPhoto, of: f.menuItems, nav: { feature: 'menu' } }));
  } else out.push(check('menu', 'carte', 2, null));

  // R2 · the floor plan, and tables actually opened on it
  if (salleOff) out.push(check('floor', 'carte', 2, null, { state: 'na' }));
  else if (known(f.floorTables) && known(f.tableSessions)) {
    out.push(check('floor', 'carte', 2, f.floorTables === 0 ? 0 : f.tableSessions > 0 ? 1 : 0.5,
      { n: f.floorTables, nav: { feature: 'tables' } }));
  } else out.push(check('floor', 'carte', 2, null));

  // R3 · orders reach the kitchen through Kiwi. A kitchen printer alone leaves
  // no trace, so silence is « not measurable », never « not done ».
  if (known(f.kitchenSent)) out.push(f.kitchenSent > 0 ? check('kitchen', 'carte', 1, 1, { n: f.kitchenSent }) : check('kitchen', 'carte', 1, null, { why: 'kitchen-printer' }));
  else out.push(check('kitchen', 'carte', 1, null));

  // R4 · recipe sheets, as a share of the dishes on the menu
  if (off(feat, 'menu')) out.push(check('recipes', 'carte', 2, null, { state: 'na' }));
  else if (known(f.menuItems) && known(f.menuWithRecipe)) {
    const s = share(f.menuWithRecipe, f.menuItems);
    out.push(check('recipes', 'carte', 2, s >= DONE_AT ? 1 : s, { n: f.menuWithRecipe, of: f.menuItems, nav: { feature: 'finance' } }));
  } else out.push(check('recipes', 'carte', 2, null));

  // R5 · stock: items, movements, a count in the last 90 days
  if (off(feat, 'stock')) out.push(check('stock', 'stock', 2, null, { state: 'na' }));
  else if (known(f.stockItems) && known(f.stockMoves) && known(f.stockCounts)) {
    out.push(check('stock', 'stock', 2, f.stockItems === 0 ? 0 : 0.5 + (f.stockMoves > 0 ? 0.25 : 0) + (f.stockCounts > 0 ? 0.25 : 0),
      { n: f.stockItems, moves: f.stockMoves > 0, counted: f.stockCounts > 0, nav: { feature: 'stock' } }));
  } else out.push(check('stock', 'stock', 2, null));

  // R6 · the waiter app
  if (salleOff) out.push(check('waiter', 'carte', 1, null, { state: 'na' }));
  else if (known(f.waiterOrders)) out.push(check('waiter', 'carte', 1, f.waiterOrders > 0 ? 1 : 0, { n: f.waiterOrders }));
  else out.push(check('waiter', 'carte', 1, null));

  return out;
}

function boutique(f) {
  const feat = f.features || {};
  const out = [];
  if (off(feat, 'inventory')) {
    out.push(check('catalog', 'carte', 2, null, { state: 'na' }), check('costs', 'carte', 2, null, { state: 'na' }));
  } else if (known(f.products) && known(f.productsWithBarcode) && known(f.productsWithCost)) {
    const b = share(f.productsWithBarcode, f.products);
    out.push(check('catalog', 'carte', 2, f.products === 0 ? 0 : b >= DONE_AT ? 1 : 0.5 + 0.5 * b,
      { n: f.productsWithBarcode, of: f.products, nav: { feature: 'inventory' } }));
    const c = share(f.productsWithCost, f.products);
    out.push(check('costs', 'carte', 2, c >= DONE_AT ? 1 : c, { n: f.productsWithCost, of: f.products, nav: { feature: 'inventory' } }));
  } else out.push(check('catalog', 'carte', 2, null), check('costs', 'carte', 2, null));

  if (off(feat, 'inventory')) out.push(check('stock', 'stock', 2, null, { state: 'na' }));
  else if (known(f.stockMoves) && known(f.stockCounts)) {
    out.push(check('stock', 'stock', 2, (f.stockMoves > 0 ? 0.5 : 0) + (f.stockCounts > 0 ? 0.5 : 0), { moves: f.stockMoves > 0, counted: f.stockCounts > 0, nav: { feature: 'inventory' } }));
  } else out.push(check('stock', 'stock', 2, null));
  return out;
}

function pressing(f) {
  const out = [];
  if (known(f.pressingServices)) out.push(check('pressing-prices', 'carte', 2, f.pressingServices > 0 ? 1 : 0, { n: f.pressingServices }));
  else out.push(check('pressing-prices', 'carte', 2, null));
  if (known(f.pressingOrders) && known(f.pressingTracked)) {
    out.push(check('pressing-orders', 'caisse', 2, f.pressingOrders === 0 ? 0 : share(f.pressingTracked, f.pressingOrders),
      { n: f.pressingTracked, of: f.pressingOrders }));
  } else out.push(check('pressing-orders', 'caisse', 2, null));
  return out;
}

function spa(f) {
  const feat = f.features || {};
  const out = [];
  if (off(feat, 'services')) out.push(check('services', 'carte', 2, null, { state: 'na' }));
  else if (known(f.services)) out.push(check('services', 'carte', 2, f.services > 0 ? 1 : 0, { n: f.services, nav: { feature: 'services' } }));
  else out.push(check('services', 'carte', 2, null));
  if (off(feat, 'practitioners')) out.push(check('practitioners', 'equipe', 1, null, { state: 'na' }));
  else if (known(f.practitioners)) out.push(check('practitioners', 'equipe', 1, f.practitioners > 0 ? 1 : 0, { n: f.practitioners, nav: { feature: 'practitioners' } }));
  else out.push(check('practitioners', 'equipe', 1, null));
  if (off(feat, 'appointments')) out.push(check('appointments', 'caisse', 2, null, { state: 'na' }));
  else if (known(f.appointments)) out.push(check('appointments', 'caisse', 2, f.appointments > 0 ? 1 : 0, { n: f.appointments, nav: { feature: 'appointments' } }));
  else out.push(check('appointments', 'caisse', 2, null));
  return out;
}

function hotel(f) {
  const feat = f.features || {};
  const out = [];
  if (off(feat, 'chambres')) out.push(check('rooms', 'carte', 2, null, { state: 'na' }));
  else if (known(f.rooms)) out.push(check('rooms', 'carte', 2, f.rooms > 0 ? 1 : 0, { n: f.rooms, nav: { feature: 'chambres' } }));
  else out.push(check('rooms', 'carte', 2, null));
  if (off(feat, 'sejours')) out.push(check('stays', 'caisse', 3, null, { state: 'na' }));
  else if (known(f.stays) && known(f.staysCheckedIn)) {
    out.push(check('stays', 'caisse', 3, f.stays === 0 ? 0 : share(f.staysCheckedIn, f.stays) >= DONE_AT ? 1 : 0.5 + 0.5 * share(f.staysCheckedIn, f.stays),
      { n: f.staysCheckedIn, of: f.stays, nav: { feature: 'sejours' } }));
  } else out.push(check('stays', 'caisse', 3, null));
  if (off(feat, 'folios')) out.push(check('folios', 'caisse', 1, null, { state: 'na' }));
  else if (known(f.roomCharges)) out.push(check('folios', 'caisse', 1, f.roomCharges > 0 ? 1 : 0, { n: f.roomCharges, nav: { feature: 'folios' } }));
  else out.push(check('folios', 'caisse', 1, null));
  if (off(feat, 'economat')) out.push(check('economat', 'stock', 1, null, { state: 'na' }));
  else if (known(f.internalRequests)) out.push(check('economat', 'stock', 1, f.internalRequests > 0 ? 1 : 0, { n: f.internalRequests, nav: { feature: 'economat' } }));
  else out.push(check('economat', 'stock', 1, null));
  return out;
}

/* Optional tools: useful to some, never counted against anyone. */
function optional(f, base) {
  const feat = f.features || {};
  const out = [];
  const add = (id, area, used, nav, gate) => {
    if (gate === false || !known(used)) return;
    out.push({ id, area, weight: 0, state: used ? 'done' : 'todo', value: used ? 1 : 0, optional: true, ...(nav ? { nav } : {}) });
  };
  add('invoices', 'rapports', known(f.invoices) ? f.invoices > 0 : undefined, { feature: 'transactions' });
  add('promotions', 'clients', known(f.promotions) ? f.promotions > 0 : undefined, { feature: base === 'boutique' ? 'promos' : 'crm' }, !off(feat, 'promos'));
  add('employee-app', 'equipe', known(f.employeeDevices) ? f.employeeDevices > 0 : undefined, { feature: 'equipe' }, !off(feat, 'equipe'));
  if (base === 'restaurant') {
    add('reservations', 'clients', known(f.reservations) ? f.reservations > 0 : undefined, { feature: 'reservations' }, !off(feat, 'reservations'));
    add('kds', 'carte', known(f.kdsStations) ? f.kdsStations > 0 : undefined, { feature: 'kds' }, !off(feat, 'kds'));
    add('purchasing', 'stock', known(f.purchaseOrders) ? f.purchaseOrders > 0 : undefined, { feature: 'stock' }, !off(feat, 'stock'));
    add('orderpro', 'carte', known(f.remoteOrders) ? f.remoteOrders > 0 : undefined, null, on(feat, 'orderpro'));
  }
  if (base === 'boutique') {
    add('returns', 'caisse', known(f.returns) ? f.returns > 0 : undefined, { feature: 'returns' }, !off(feat, 'returns'));
    add('shopify', 'carte', known(f.shopify) ? f.shopify > 0 : undefined, null);
  }
  if (base === 'hotel') add('channels', 'carte', known(f.channels) ? f.channels > 0 : undefined, { feature: 'canaux' }, !off(feat, 'canaux'));
  return out;
}

export function computeHealth(facts) {
  const f = facts || {};
  const base = baseOf(f.type);
  const trade = base === 'restaurant' ? restaurant(f)
    : base === 'boutique' ? boutique(f)
      : base === 'pressing' ? pressing(f)
        : base === 'spa' ? spa(f)
          : hotel(f);
  const all = common(f, base).concat(trade);
  const listed = all.filter((c) => c.state !== 'na');
  const scored = listed.filter((c) => c.state !== 'unmeasured' && c.weight > 0);
  const weight = scored.reduce((s, c) => s + c.weight, 0);
  const earned = scored.reduce((s, c) => s + c.weight * c.value, 0);
  const score = weight > 0 ? Math.round((earned / weight) * 100) : null;
  /* The next three: the most weight left on the table, then the order above. */
  const next = scored
    .filter((c) => c.state !== 'done' && c.nav)
    .map((c, i) => ({ c, i, gain: c.weight * (1 - c.value) }))
    .sort((a, b) => b.gain - a.gain || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.c.id);
  return {
    v: HEALTH_VERSION,
    base,
    score,
    measured: scored.length,
    used: scored.filter((c) => c.state === 'done').length,
    checks: listed,
    optional: optional(f, base),
    next,
    windowDays: f.windowDays || 30,
  };
}
