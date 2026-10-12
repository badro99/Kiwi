// GET /api/merchant-health?merchant=slug · Kiwi Health, how much of Kiwi this store uses.
//
// Read-only. The scoring lives in ./_merchant-health.js and is pure; this route only
// gathers facts. Every query is its own try: prod D1 lags schema.sql, and a
// table it does not have yet makes the checks that need it « non mesurable »,
// never zero and never a 500.
//
// Who may read: the owner's dashboard session for its own stores, a named
// operator, or the three public demo tenants — the same rule as every other
// dashboard read (entitledMerchant, no till, no employee). A paired counter
// device has no business here.
//
// Credentials. The team document carries each member's personal code. This
// route reads it ONLY to count members and the members holding a code; no field
// of it leaves this function. The roster is counted in staff_pins with COUNT(*).
//
// Cost. One computation per store per two minutes per isolate, and the
// dashboard asks once per load. No polling anywhere.
import { entitledMerchant, json } from '../auth/_lib.js';
import { businessDate, businessDayWindows, merchantZone, merchantCutoff } from './_business-day.js';
import { computeHealth, baseOf } from './_merchant-health.js';

const WINDOW_DAYS = 30;
const DAY = 86400000;
const CACHE_MS = 120000;
const cache = new Map();
/* Tests build a new database per scenario on the same store name. */
export function resetHealthCache() { cache.clear(); }

async function first(env, sql, ...args) {
  try { return await env.DB.prepare(sql).bind(...args).first(); } catch (_) { return undefined; }
}
async function all(env, sql, ...args) {
  try { const r = await env.DB.prepare(sql).bind(...args).all(); return (r && r.results) || []; } catch (_) { return undefined; }
}
async function count(env, sql, ...args) {
  const row = await first(env, sql, ...args);
  return row === undefined ? undefined : Number((row && row.n) || 0);
}
async function docOf(env, merchant, feature) {
  const row = await first(env, 'SELECT data FROM store_docs WHERE merchant = ? AND feature = ?', merchant, feature);
  if (row === undefined) return undefined;
  if (!row || !row.data) return null;
  try { return JSON.parse(row.data); } catch (_) { return null; }
}
const list = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const live = (x) => x && !x.archived && !x.deleted && !x.deletedAt;
const ts = (v) => { const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) ? n : 0; };

export async function gatherFacts(env, merchant, now = Date.now()) {
  const f = { windowDays: WINDOW_DAYS };
  const cfg = await first(env, 'SELECT features, type FROM merchant_config WHERE merchant = ?', merchant);
  try { f.features = cfg && cfg.features ? JSON.parse(cfg.features) : {}; } catch (_) { f.features = {}; }
  f.type = (cfg && cfg.type) || '';
  const zone = await merchantZone(env, merchant), cutoff = await merchantCutoff(env, merchant);
  const windows = businessDayWindows(now, WINDOW_DAYS, cutoff, zone);
  const from = windows[0].from;
  const firstDay = windows[0].d;

  // ── the till ──
  const sales = await all(env, 'SELECT ts FROM sales WHERE merchant = ? AND ts >= ? AND void_ts IS NULL LIMIT 50000', merchant, from);
  if (sales) {
    f.saleCount = sales.length;
    f.saleDays = new Set(sales.map((s) => businessDate(Number(s.ts), cutoff, zone))).size;
  }
  /* Open days: the week the shop declared, else six days in seven. */
  const hours = await docOf(env, merchant, 'hours');
  if (hours !== undefined) {
    const week = (hours && hours.week) || {};
    const isOpen = (d) => !!(d && d.open && list(d.periods).length);
    const openWeekdays = Object.values(week).filter(isOpen).length;
    f.hoursSet = openWeekdays > 0;
    f.openDays = openWeekdays > 0 ? Math.round(WINDOW_DAYS * openWeekdays / 7) : Math.round(WINDOW_DAYS * 6 / 7);
  } else f.openDays = Math.round(WINDOW_DAYS * 6 / 7);
  const zDays = await all(env, 'SELECT DISTINCT business_day AS d FROM z_reconciliations WHERE merchant = ? AND business_day >= ?', merchant, firstDay);
  const closes = await all(env, "SELECT occurred_ts FROM cash_session_events WHERE merchant = ? AND event_type = 'close' AND occurred_ts >= ?", merchant, from);
  if (zDays !== undefined || closes !== undefined) {
    const days = new Set((zDays || []).map((r) => r.d));
    (closes || []).forEach((r) => days.add(businessDate(Number(r.occurred_ts), cutoff, zone)));
    f.closedDays = days.size;
  }

  // ── the team (counted, never returned) ──
  const pins = await count(env, 'SELECT COUNT(*) AS n FROM staff_pins WHERE merchant = ?', merchant);
  const team = await docOf(env, merchant, 'team');
  if (team !== undefined) {
    const members = list(team && team.members).filter(live);
    f.teamSize = members.length;
    const withCode = members.filter((m) => String(m.pinCode || m.pin || '').trim() !== '').length;
    f.codeHolders = Math.max(withCode, pins || 0);
    f.shiftsPlanned = Object.values((team && team.shifts) || {}).filter((v) => (Array.isArray(v) ? v.length : v && Object.keys(v).length)).length;
  } else if (pins !== undefined) f.codeHolders = pins;
  const attendance = await docOf(env, merchant, 'attendance');
  if (attendance !== undefined) {
    f.clockedStaff = new Set(list(attendance && attendance.entries).filter((e) => e && ts(e.inTs) >= from).map((e) => String(e.staffId || e.memberId || ''))).size;
    if (f.teamSize === undefined) f.teamSize = 0;
  }

  // ── clients ──
  const linked = await count(env, 'SELECT COUNT(*) AS n FROM client_purchase_events WHERE merchant = ? AND created_ts >= ?', merchant, from);
  if (linked !== undefined) f.linkedSales = linked;
  const fidelity = await docOf(env, merchant, 'fidelity');
  if (fidelity !== undefined) f.loyaltySet = !!(fidelity && fidelity.model && !fidelity.auto);
  const rewards = await count(env, 'SELECT COUNT(*) AS n FROM client_reward_events WHERE merchant = ? AND created_ts >= ?', merchant, from);
  if (rewards !== undefined) f.rewardsGiven = rewards;

  // ── identity, reports, hardware, IQ ──
  const business = await docOf(env, merchant, 'business');
  if (business !== undefined) {
    const b = business || {};
    f.identity = { name: !!(b.name || b.tradeName), logo: !!b.logo, legal: !!(b.legal && Object.keys(b.legal).length) };
  }
  const monthreport = await docOf(env, merchant, 'monthreport');
  if (monthreport !== undefined) f.accountantSet = !!(monthreport && String(monthreport.accountantEmail || '').includes('@'));
  /* At least one fixed cost that still has an amount: a doc left with only
     removed lines (tombstones) is « not entered ». Amounts are never read. */
  const charges = await docOf(env, merchant, 'charges');
  if (charges !== undefined) f.chargesSet = !!(charges && list(charges.lines).some((l) => l && !l.deleted && list(l.versions).length > 0));
  const bridge = await count(env, 'SELECT COUNT(*) AS n FROM print_bridges WHERE merchant = ? AND revoked_ts IS NULL AND last_seen_ts >= ?', merchant, now - 7 * DAY);
  const printed = await count(env, "SELECT COUNT(*) AS n FROM print_jobs WHERE merchant = ? AND done_ts >= ?", merchant, from);
  if (bridge !== undefined || printed !== undefined) f.printerSeen = (bridge || 0) + (printed || 0) > 0;
  const ai = await count(env, 'SELECT COALESCE(SUM(calls), 0) AS n FROM ai_usage WHERE merchant = ? AND day >= ?', merchant, new Date(from).toISOString().slice(0, 10));
  const briefing = await docOf(env, merchant, 'briefing');
  if (ai !== undefined || briefing !== undefined) {
    const days = Object.keys((briefing && briefing.days) || {}).filter((d) => d >= firstDay).length;
    f.iqUsed = (ai || 0) > 0 || days > 0;
  }

  // ── optional tools ──
  f.invoices = await count(env, 'SELECT COUNT(*) AS n FROM sale_invoices WHERE merchant = ? AND created_ts >= ?', merchant, from);
  const promos = await docOf(env, merchant, 'promotions');
  if (promos !== undefined) f.promotions = ['list', 'rules', 'promos'].reduce((s, k) => s + list(promos && promos[k]).filter(live).length, 0);
  f.employeeDevices = await count(env, "SELECT COUNT(*) AS n FROM push_tokens WHERE merchant = ? AND COALESCE(employee_id, '') <> ''", merchant);

  const base = baseOf(f.type);
  if (base === 'restaurant') {
    const menu = await first(env, 'SELECT data FROM menus WHERE merchant = ?', merchant);
    const recipes = await docOf(env, merchant, 'recipes');
    if (menu !== undefined) {
      let items = [];
      try { items = list(JSON.parse((menu && menu.data) || '{}').items).filter(live); } catch (_) {}
      f.menuItems = items.length;
      f.menuWithPhoto = items.filter((i) => String(i.photo || i.img || '').trim() !== '').length;
      if (recipes !== undefined) {
        const byItem = (recipes && recipes.items) || {};
        f.menuWithRecipe = items.filter((i) => { const r = byItem[i.id]; return r && list(r.ingredients).length > 0; }).length;
      }
    }
    const floor = await docOf(env, merchant, 'floorplan');
    if (floor !== undefined) f.floorTables = list(floor && floor.tables).length;
    f.tableSessions = await count(env, 'SELECT COUNT(*) AS n FROM table_sessions WHERE merchant = ? AND opened_ts >= ?', merchant, from);
    f.kitchenSent = await count(env, 'SELECT COUNT(*) AS n FROM order_course WHERE merchant = ? AND sent_ts >= ?', merchant, from);
    const stock = await docOf(env, merchant, 'stock');
    if (stock !== undefined) f.stockItems = list(stock && stock.items).filter(live).length;
    f.waiterOrders = await count(env, "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND created_ts >= ? AND COALESCE(server_name, '') <> ''", merchant, from);
    const reservations = await docOf(env, merchant, 'reservations');
    if (reservations !== undefined) f.reservations = ['list', 'bookings'].reduce((s, k) => s + list(reservations && reservations[k]).filter((r) => live(r) && ts(r.createdAt || r.at || r.date) >= from).length, 0);
    const kds = await docOf(env, merchant, 'kds');
    if (kds !== undefined) f.kdsStations = list(kds && kds.stations).length;
    f.purchaseOrders = await count(env, 'SELECT COUNT(*) AS n FROM purchase_orders WHERE merchant = ? AND created_ts >= ?', merchant, now - 60 * DAY);
    f.remoteOrders = await count(env, "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND created_ts >= ? AND channel IN ('qr', 'orderpro', 'nfc')", merchant, from);
  }
  if (base === 'restaurant' || base === 'boutique') {
    f.stockMoves = await count(env, 'SELECT COUNT(*) AS n FROM inventory_movements WHERE merchant = ? AND occurred_ts >= ?', merchant, from);
    f.stockCounts = await count(env, "SELECT COUNT(*) AS n FROM inventory_counts WHERE merchant = ? AND submitted_at >= ?", merchant, now - 90 * DAY);
  }
  if (base === 'boutique') {
    const catalog = await first(env, 'SELECT data FROM catalogs WHERE merchant = ?', merchant);
    if (catalog !== undefined) {
      let data = {};
      try { data = JSON.parse((catalog && catalog.data) || '{}'); } catch (_) {}
      const products = list(data.products).filter(live);
      const barcoded = new Set(list(data.variants).filter((v) => v && list(v.barcodes).some((b) => b && String(b.code || '').trim())).map((v) => String(v.productId || v.pid || '')));
      f.products = products.length;
      f.productsWithBarcode = products.filter((p) => barcoded.has(String(p.id)) || String(p.ean || p.barcode || '').trim()).length;
      f.productsWithCost = products.filter((p) => Number(p.cost) > 0).length;
    }
    const returns = await docOf(env, merchant, 'returns');
    if (returns !== undefined) f.returns = list(returns && returns.list).filter((r) => ts(r.at || r.createdAt || r.date) >= from).length;
    f.shopify = await count(env, "SELECT COUNT(*) AS n FROM shopify_connections WHERE merchant = ? AND status = 'active'", merchant);
  }
  if (base === 'pressing') {
    const catalog = await docOf(env, merchant, 'pressing-catalog');
    if (catalog !== undefined) f.pressingServices = list(catalog && catalog.services).filter(live).length + list(catalog && catalog.items).filter(live).length;
    const orders = await docOf(env, merchant, 'pressing-orders');
    if (orders !== undefined) {
      const recent = list(orders && orders.orders).filter((o) => o && ts(o.droppedAt) >= from);
      const customers = new Map(list(orders && orders.customers).map((c) => [String(c && c.id), c]));
      f.pressingOrders = recent.length;
      f.pressingTracked = recent.filter((o) => {
        const phone = (o.custId && customers.get(String(o.custId)) && customers.get(String(o.custId)).phone) || (o.guest && o.guest.phone);
        return String(phone || '').trim() !== '' && ts(o.readyAt) > 0;
      }).length;
    }
  }
  if (base === 'spa') {
    const ws = await docOf(env, merchant, 'workspaces');
    if (ws !== undefined) {
      const records = (ws && ws.records) || {};
      f.services = list(records.services).filter(live).length;
      f.practitioners = list(records.practitioners).filter(live).length;
      f.appointments = list(records.appointments).filter((r) => live(r) && ts(r.createdAt || r.updatedAt) >= from).length;
    }
  }
  if (base === 'hotel') {
    const rooms = await docOf(env, merchant, 'rooms');
    if (rooms !== undefined) f.rooms = list(rooms && (rooms.rooms || rooms.list)).filter(live).length;
    /* Stays that began in the window and were not cancelled; « suivi » when the
     * desk moved them past « confirmed » (arrived, or left). */
    const stays = await all(env, "SELECT status FROM hotel_reservations WHERE merchant = ? AND start_at >= ? AND start_at < ? AND status <> 'cancelled'", merchant, from, now);
    if (stays) { f.stays = stays.length; f.staysCheckedIn = stays.filter((s) => s.status === 'checked_in' || s.status === 'completed').length; }
    f.roomCharges = await count(env, 'SELECT COUNT(*) AS n FROM hotel_room_charge_events WHERE merchant = ? AND occurred_ts >= ?', merchant, from);
    f.internalRequests = await count(env, 'SELECT COUNT(*) AS n FROM hotel_internal_requests WHERE merchant = ? AND created_ts >= ?', merchant, from);
    f.channels = await count(env, "SELECT COUNT(*) AS n FROM channel_links WHERE merchant = ? AND status = 'active'", merchant);
  }
  return f;
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(asked)) return json({ error: 'invalid-merchant' }, 400);
  const merchant = await entitledMerchant(request, env, asked);
  if (!merchant || merchant !== asked) return json({ error: 'forbidden' }, 403);
  const hit = cache.get(merchant);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_MS) return json({ ...hit.body, cached: true }, 200, { 'Cache-Control': 'private, no-store' });
  const body = { merchant, at: now, ...computeHealth(await gatherFacts(env, merchant, now)) };
  cache.set(merchant, { at: now, body });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return json(body, 200, { 'Cache-Control': 'private, no-store' });
}
