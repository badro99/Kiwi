#!/usr/bin/env node
/* Kiwi · pressing truth — what a pressing merchant reads on the dashboard is
 * what the till wrote, in the merchant's own time and language.
 *
 * Audit 2026-10-11, measured on a local stack with a pressing signed up through
 * the product's own onboarding, a paired till and real tickets:
 *
 *   · Accueil « Dépôts » / « Bon moyen » counted PAYMENTS (2 / 57 MAD for three
 *     tickets of 226, 64 and 90 MAD): now it counts the tickets dropped.
 *   · A balance payment shared its sale ref with the deposit, so the server took
 *     it for a replay and never stored it (3 payments, 2 rows, revenue short).
 *   · The dashboard « Annuler » wrote the cancellation in the browser only; the
 *     server refuses any tombstone not issued by /api/pressing/cancel, so the
 *     copy stayed dirty forever and the till kept the order alive. The route now
 *     also accepts the signed-in owner (no PIN to type on a dashboard).
 *   · Every card header used classes the stylesheet does not define: giant black
 *     SVGs. A cancelled order stayed in the active list. "0 pièces actives".
 *   · The pages promised photos, rework, rounds and supplements that the
 *     product does not have.
 *   · Dates/«en retard» read the device clock; the whole dashboard was French
 *     only; the catalogue editor refused 12,50 (step=1) and read « 12.5 MAD ».
 *
 * Real functions are loaded into a `vm` (pressing-ops.js, pressing-dashboard.js)
 * and the real /api/pressing/cancel handler runs against schema.sql in an
 * in-memory SQLite. Till and dateRange.js are IIFEs bound to a whole page, so
 * for those the test pins the fixed source and runs the small pure pieces. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as cancelRoute } from '../functions/api/pressing/cancel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0; const fails = [];
const ok = (cond, label) => { if (cond) pass++; else fails.push(label); };

/* ═══════════════ 1 · /api/pressing/cancel — the owner, no PIN ═══════════════ */
const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async all() { return { results: db.prepare(sql).all(...args) }; },
  async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } };
const SECRET = 'pressing-truth-secret';
const env = { DB, AUTH_SECRET: SECRET };
const merchant = 'pressing-test';
const now = Date.now();
const put = (sql, ...a) => db.prepare(sql).run(...a);
put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)', 'acc-1', 'o@t.ma', 'Salma Owner', 'Pressing Test', 's', 'h', now);
put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)', 'acc-2', 'x@t.ma', 'Autre', 'Autre Pressing', 's', 'h', now);
put('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)', merchant, '{}', 'pressing', 'active', 'Pressing Test', 'acc-1', now);
const ordersDoc = () => JSON.stringify({
  orders: [
    { id: '1045', lines: [], droppedAt: new Date(now).toISOString(), pay: { mode: 'pickup', method: null, paid: 0 } },
    { id: '1046', lines: [], droppedAt: new Date(now).toISOString(), pay: { mode: 'acompte', method: 'cash', paid: 40 } },
  ],
  customers: [], cancellations: [], rackConflicts: [], seq: 1047, updatedAt: now,
});
put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', merchant, 'pressing-orders', ordersDoc(), 3, now);
const owner = sessionCookie(await makeSession('acc-1', SECRET)).split(';')[0];
const other = sessionCookie(await makeSession('acc-2', SECRET)).split(';')[0];
const call = async (body, cookie) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await cancelRoute({ request: new Request('https://kiwi.test/api/pressing/cancel', { method: 'POST', headers, body: JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json() };
};
const stored = () => JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).data);
const revNow = () => db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).rev;

{
  const anon = await call({ merchant, orderId: '1045' });
  ok(anon.status === 400 && revNow() === 3, 'no session and no PIN cancels nothing');
  const stranger = await call({ merchant, orderId: '1045' }, other);
  ok(stranger.status === 400 && revNow() === 3, "another merchant's owner cannot cancel this store's order");
  const demo = await call({ merchant: 'cafe-atlas', orderId: '1' });
  ok(demo.status === 400, 'a demo merchant slug is not an open door without a session');
  const badPin = await call({ merchant, orderId: '1045', pin: '12' }, owner);
  ok(badPin.status === 400, 'a malformed PIN is still refused (the PIN path is unchanged)');

  const mine = await call({ merchant, orderId: '1045' }, owner);
  ok(mine.status === 200 && mine.body.ok === true, 'the signed-in owner cancels without typing a PIN');
  ok(mine.body.actor && mine.body.actor.role === 'owner' && mine.body.actor.name === 'Salma Owner' && /^account:/.test(mine.body.actor.id), 'the tombstone records who cancelled (owner, by name)');
  const doc = stored();
  const row = doc.orders.find((o) => o.id === '1045');
  ok(row && row.cancelledAt && row.cancelledBy && row.cancelledBy.role === 'owner', 'the order row carries cancelledAt and cancelledBy');
  ok(doc.cancellations.some((c) => c.id === '1045' && c.cancelledBy.role === 'owner'), 'the server issued the tombstone (store.js only accepts those)');
  ok(!doc.orders.find((o) => o.id === '1046').cancelledAt, 'the other order is untouched');
  ok(revNow() === 4, 'one cancellation, one revision');
  const again = await call({ merchant, orderId: '1045' }, owner);
  ok(again.status === 200 && again.body.alreadyCancelled === true && revNow() === 4, 'cancelling twice is idempotent');
  const missing = await call({ merchant, orderId: '9999' }, owner);
  ok(missing.status === 404, 'an order the server has not received answers order-not-found');
}

/* ═══════════════ 2 · the dashboard, real functions in a vm ═══════════════ */
function world({ lang = 'fr', zone = 'Africa/Casablanca', nowMs = Date.parse('2026-10-11T15:00:00Z'), cancelResponse } = {}) {
  const ls = new Map();
  const listeners = [];
  const fetched = [];
  const pages = [];
  const toasts = [];
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(nowMs); }
    static now() { return nowMs; }
  }
  const sb = {
    console, Intl, JSON, Math, Set, Map, Promise, Object, Array, Number, String, Date: FakeDate, setTimeout, clearTimeout,
    setInterval() { return 1; }, clearInterval() {}, requestAnimationFrame: (fn) => fn(),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); } },
    sessionStorage: { setItem() {}, getItem() { return null; } },
    document: { readyState: 'complete', visibilityState: 'visible', documentElement: { lang }, body: { classList: { remove() {} } }, querySelector() { return null; }, addEventListener() {} },
    confirm: () => true,
    fetch: async (url, opts) => { fetched.push({ url, opts }); return { ok: true, json: async () => cancelResponse || { ok: true, actor: { id: 'account:acc-1', name: 'Salma Owner', role: 'owner' }, cancelledAt: new RealDate(nowMs).toISOString() } }; },
    KiwiVenue: { getCurrentVenueData: () => ({ slug: 'press-test', subtype: 'pressing', name: 'Press Test' }), getVenue: () => 'press-test', subscribe() {} },
    KiwiI18n: { getLang: () => lang },
    KiwiDayReport: { timezone: () => zone },
    KiwiSales: { totals: () => ({ revenue: 0 }) },
    KiwiDateRange: { bounds: () => [0, Infinity] },
    Kiwi: { appPage: (nav, page) => { pages.push({ nav, ...page }); }, toast: (m) => { toasts.push(m); } },
  };
  sb.window = sb;
  sb.addEventListener = (type, fn, cap) => { listeners.push({ type, fn, cap }); };
  vm.createContext(sb);
  vm.runInContext(read('assets/pressing-ops.js'), sb);
  vm.runInContext(read('assets/pressing-dashboard.js'), sb);
  return { sb, pages, fetched, toasts, listeners, ls };
}
const raw = (id, over = {}) => ({
  id, droppedAt: '2026-10-11T09:30:00Z', readyAt: '2026-10-12T16:00:00Z', total: 100,
  pay: { mode: 'pickup', method: null, paid: 0 },
  pieces: [{ pid: id + '-1', label: 'Chemise', itemId: 'chemise', status: 'recu', svcs: ['lavage'] }],
  customer: { name: 'Amal', phone: '0600000000' }, ...over,
});
const load = (w, orders) => w.sb.KiwiPressingOps.replace(orders, { customer: (o) => o.customer, total: (o) => o.total }, 'press-test');

{
  /* The Accueil tiles: tickets dropped, not payments. */
  const w = world();
  load(w, [
    raw('1045', { total: 226, pay: { mode: 'pickup', paid: 0 } }),
    raw('1046', { total: 64, pay: { mode: 'acompte', method: 'cash', paid: 20 } }),
    raw('1047', { total: 90, pay: { mode: 'full', method: 'card', paid: 90 } }),
    raw('1048', { total: 500, cancelledAt: '2026-10-11T10:00:00Z' }),
    raw('1049', { total: 70, droppedAt: '2026-10-09T09:00:00Z' }),
  ]);
  const ops = w.sb.KiwiPressingOps;
  const from = Date.parse('2026-10-11T04:00:00Z'), to = Date.parse('2026-10-11T23:00:00Z');
  const s = ops.dropoffStats(from, to, 'press-test');
  ok(s.count === 3, 'three tickets dropped today count as three, whatever their payment state');
  ok(Math.round(s.basket) === 127 && s.total === 380, 'the average ticket is the 3 dropped tickets, not 2 payments');
  ok(ops.dropoffStats(from, to, 'press-test').count === 3 && ops.dropoffStats(0, Infinity, 'press-test').count === 4, 'a cancelled ticket is never a drop-off; an old one stays out of today');
  let events = 0;
  const unsub = ops.subscribe(() => { events++; });
  load(w, [raw('1045', { total: 226 })]);
  const first = events;
  load(w, [raw('1045', { total: 226 })]);
  ok(events === first, 'an unchanged re-read (the 20 s refresh) does not rebuild the page');
  unsub();
}

{
  /* Pages: right classes, cancelled orders out of the active list, plurals. */
  const w = world();
  load(w, [
    raw('2001'),
    raw('2002', { cancelledAt: '2026-10-11T10:00:00Z', cancelledBy: { id: 'account:acc-1', name: 'Salma Owner', role: 'owner' }, pay: { mode: 'full', method: 'cash', paid: 100 } }),
  ]);
  const D = w.sb.KiwiPressingDashboard;
  // is the active venue pressing? the module activates on boot
  D.showPage('pressing-orders');
  const page = w.pages.find((p) => p.nav === 'pressing-orders');
  ok(!!page, 'the Dépôts & commandes page renders');
  const body = page ? page.body : '';
  ok(!/pxd-card-ic|pxd-link-btn/.test(body) && /pxd-card-title/.test(body) && /pxd-card-mark/.test(body), 'card headers use the classes the stylesheet defines (no giant unsized icon)');
  const activeSection = body.split('Commandes remises')[0];
  ok(/data-pxd-order="2001"/.test(activeSection) && !/data-pxd-order="2002"/.test(activeSection), 'a cancelled order is not listed as active');
  ok(/data-pxd-cancel="2001"/.test(body) && !/data-pxd-cancel="2002"/.test(body), 'a cancelled order has no Annuler button');
  ok(/Commandes annulées/.test(body) && /annulée par Salma Owner/.test(body) && /100 MAD encaissés/.test(body), 'cancellations stay visible, with who did it and what was collected');
  ok(/1 pièce/.test(body) && !/1 pièces/.test(body), 'one piece is "1 pièce"');
  ok(!/non enregistrée/.test(body) && !/Réessayer/.test(body), 'a server-issued cancellation is not flagged as unsaved');
  /* The old button wrote an author-less tombstone in this browser only. */
  load(w, [raw('2003', { cancelledAt: '2026-10-11T10:00:00Z', cancelledBy: null })]);
  D.showPage('pressing-orders');
  const legacy = w.pages[w.pages.length - 1].body;
  ok(/annulation non enregistrée/.test(legacy) && /data-pxd-cancel="2003"/.test(legacy) && /Réessayer/.test(legacy), 'a legacy local-only cancellation says so and offers to redo it for real');
  load(w, [
    raw('2001'),
    raw('2002', { cancelledAt: '2026-10-11T10:00:00Z', cancelledBy: { id: 'account:acc-1', name: 'Salma Owner', role: 'owner' }, pay: { mode: 'full', method: 'cash', paid: 100 } }),
  ]);

  D.showPage('pressing-services');
  const svc = w.pages.find((p) => p.nav === 'pressing-services').body;
  ok(/0 pièce active/.test(svc) && !/0 pièces/.test(svc), '"0 pièce active" in the singular (French counts 0 as singular)');
  ok(/1 pièce active/.test(svc), 'one active piece reads "1 pièce active"');

  D.showPage('pressing-pickup');
  const pick = w.pages.find((p) => p.nav === 'pressing-pickup').body;
  ok(!/rangée/.test(pick), 'racks are hangers (cintres), not "rangées"');

  D.showPage('pressing-quality');
  const q = w.pages.find((p) => p.nav === 'pressing-quality');
  ok(!/vérification de toutes ses pièces/.test(q.body) && !/Photos, taches, réserves et reprises/.test(q.subtitle), 'the quality page no longer claims a per-piece verification that does not exist');
  ok(/Kiwi ne contrôle pas la qualité/.test(q.body), 'the quality page says what ready means');
  D.showPage('pressing-delivery');
  const del = w.pages.find((p) => p.nav === 'pressing-delivery');
  ok(!/Organisez les tournées/.test(del.subtitle) && /Pas encore de tournées/.test(del.subtitle), 'delivery does not promise rounds the product lacks');
  D.showPage('pressing-services');
  ok(!/suppléments et délais/.test(w.pages.find((p) => p.nav === 'pressing-services').subtitle), 'services does not promise supplements and turnaround times');
  D.showPage('pressing-workshop');
  ok(!/contrôle qualité/.test(w.pages.find((p) => p.nav === 'pressing-workshop').subtitle), 'the workshop does not promise a quality-control stage');
}

{
  /* Times are the venue's, not the device's. 17:00Z = 18:00 in Casablanca (UTC+1). */
  const at = (zone) => {
    const w = world({ zone });
    load(w, [raw('3001', { readyAt: '2026-10-12T17:00:00Z' })]);
    w.sb.KiwiPressingDashboard.showPage('pressing-orders');
    return w.pages.find((p) => p.nav === 'pressing-orders').body;
  };
  ok(/18:00/.test(at('Africa/Casablanca')), 'the promised time reads in the merchant time zone (Casablanca)');
  ok(/02:00/.test(at('Asia/Tokyo')) && !/18:00/.test(at('Asia/Tokyo')), 'a different venue zone moves the time with it, the device clock does not');
}

{
  /* FR / EN / AR in step. */
  for (const [lang, title, cancel] of [['en', 'Drop-offs & orders', 'Cancel'], ['ar', 'الإيداعات والطلبات', 'إلغاء'], ['fr', 'Dépôts & commandes', 'Annuler']]) {
    const w = world({ lang });
    load(w, [raw('4001')]);
    w.sb.KiwiPressingDashboard.showPage('pressing-orders');
    const p = w.pages.find((x) => x.nav === 'pressing-orders');
    ok(p.title === title && p.body.includes('>' + cancel + '<'), `the pressing dashboard speaks ${lang}`);
  }
  const en = world({ lang: 'en' });
  load(en, [raw('4002')]);
  en.sb.KiwiPressingDashboard.showPage('pressing-services');
  ok(/0 pieces in progress/.test(en.pages[0].body) && !/pièce/.test(en.pages[0].body.replace(/data-[^"]*"[^"]*"/g, '')), 'English plurals follow English rules, with no French left');
}

{
  /* The dashboard cancel goes through the route, as the owner, then applies what the server recorded. */
  const w = world();
  load(w, [raw('5001')]);
  w.sb.localStorage.setItem('kiwi:pressing-store:v1:press-test', JSON.stringify({ orders: [{ id: '5001', pieces: [], pay: {} }], customers: [], cancellations: [] }));
  w.sb.KiwiPressingDashboard.showPage('pressing-orders');
  const click = w.listeners.find((l) => l.type === 'click');
  const btn = { dataset: { pxdCancel: '5001' }, disabled: false };
  const target = { closest: (sel) => (sel.includes('data-pxd-cancel') ? btn : null) };
  click.fn({ target, preventDefault() {}, stopImmediatePropagation() {} });
  await new Promise((r) => setTimeout(r, 20));
  const call1 = w.fetched[0];
  ok(call1 && call1.url === '/api/pressing/cancel', 'the dashboard cancel calls /api/pressing/cancel');
  const sent = call1 ? JSON.parse(call1.opts.body) : {};
  ok(sent.orderId === '5001' && sent.merchant === 'press-test' && !('pin' in sent), 'it sends the order and the merchant, never a PIN');
  ok(call1 && call1.opts.credentials === 'same-origin', 'it rides the signed-in session');
  const row = w.sb.KiwiPressingOps.read('press-test').find((o) => o.id === '5001');
  ok(row && row.cancelledAt && row.cancelledBy && row.cancelledBy.role === 'owner', 'the server-issued actor and time are applied locally');
  const full = JSON.parse(w.sb.localStorage.getItem('kiwi:pressing-store:v1:press-test'));
  ok(full.cancellations.some((c) => c.id === '5001' && c.cancelledBy && c.cancelledBy.name === 'Salma Owner'), 'the local document carries the server tombstone, so the next push is accepted');

  const refused = world({ cancelResponse: { ok: false, error: 'order-not-found' } });
  refused.sb.fetch = async (url, opts) => { refused.fetched.push({ url, opts }); return { ok: false, status: 404, json: async () => ({ error: 'order-not-found' }) }; };
  load(refused, [raw('5002')]);
  refused.sb.KiwiPressingDashboard.showPage('pressing-orders');
  const c2 = refused.listeners.find((l) => l.type === 'click');
  c2.fn({ target: { closest: (sel) => (sel.includes('data-pxd-cancel') ? { dataset: { pxdCancel: '5002' }, disabled: false } : null) }, preventDefault() {}, stopImmediatePropagation() {} });
  await new Promise((r) => setTimeout(r, 20));
  const still = refused.sb.KiwiPressingOps.read('press-test').find((o) => o.id === '5002');
  ok(still && !still.cancelledAt, 'a refused cancellation changes nothing locally (no phantom cancel)');
  ok(refused.toasts.length === 1, 'and the merchant is told');
}

/* ═══════════════ 3 · the till, the catalogue, the Accueil: source pins ═══════════════ */
{
  const till = read('assets/pressing-caisse.js');
  ok(/let ticketSeq = pvReal\(\) \? 1 : 1045;/.test(till), 'a real pressing starts at ticket 1, 1045 is the demo counter');
  ok(/`\$\{order\.id\}-S\$\{Math\.round\(order\.pay\.paid \* 100\)\}`/.test(till) && /postDay\(amount, method, `Solde [^`]*`, settleRef,/.test(till), 'the balance payment posts under its own sale ref');
  ok(!/postDay\(amount, method, `Solde \$\{order\.id\}[^`]*`, order\.id,/.test(till), 'the balance no longer reuses the deposit ref (the server deduplicates by ref)');
  ok(/filter\(\(s\) => SVC\[s\]\)/.test(till) && !/SERVICES\.some\(\(x\) => x\.id === s\)/.test(till), 'a reload keeps historical lines of a service removed from the till');
  ok(/mirrorClient\(c\);\s*\n\s*persistPressing\(\);/.test(till) && /recordClientPurchase\(order, amount, method, settleRef\)/.test(till), 'customers and payments reach the shared client book');
  const m = till.match(/const fmtMAD\s*=\s*\(n\) => \{[\s\S]*?\n  \};/);
  ok(!!m, 'fmtMAD is extractable');
  if (m) {
    const f = vm.runInNewContext(m[0].replace(/^const fmtMAD\s*=\s*/, '(') .replace(/;\s*$/, ')'), { Intl, Math, Number });
    ok(f(226) === '226 MAD', 'whole amounts stay whole');
    ok(/^12,50\sMAD$/.test(f(12.5)), '12.5 reads "12,50 MAD" (centimes are kept, with a comma)');
    ok(/^1\s?234,25\sMAD$/.test(f(1234.254)) || /^1.234,25\sMAD$/.test(f(1234.254)), 'thousands group, cents rounded to two places');
  }
  ok(!/\+\$\{n - l\.qty\} pièces`/.test(till) && /n - l\.qty < 2 \? 'pièce' : 'pièces'/.test(till), '"Robe +1 pièce", not "+1 pièces", in the label stored with the sale');
  ok(/c\.orders < 2 \? 'commande' : 'commandes'/.test(till), '"1 commande" in the welcome toast');

  const cat = read('assets/pressing-catalog.js');
  ok(!/step="1"/.test(cat) && (cat.match(/step="0\.01"/g) || []).length === 2, 'price inputs accept centimes (step=1 made 12,50 browser-invalid)');
  ok(/function fmtMoney/.test(cat) && /esc\(fmtMoney\(min\)\)/.test(cat), 'the "dès" price is formatted, not "12.5"');
  ok(/itemServiceCount\(item\) < 2 \? '' : 's'/.test(cat), '"0 traitement", singular');
  ok(/sellable = item\.active && itemServiceCount\(item\) > 0/.test(cat) && /Absent de la caisse/.test(cat), 'an item with no sellable treatment says it is absent from the till');

  const dr = read('assets/dateRange.js');
  ok(/KiwiPressingOps/.test(dr) && /dropoffStats/.test(dr) && /realDeltaPct\(rng, \(s\) => s\.count, undefined, pressingStats\)/.test(dr), 'Accueil Dépôts / Bon moyen read the tickets dropped, with their own delta');
  ok(/function realDeltaPct\(range, pick, backDays, stats = realWindowStats\)/.test(dr), 'the delta takes its window source');
  ok(/addEventListener\('kiwi:pressing-ops'/.test(dr), 'the tiles refresh when the tickets arrive');

  const ven = read('assets/venues.js');
  ok(!/Qualité & incidents/.test(ven) && /Qualité & vigilances/.test(ven), 'the sidebar no longer promises incident management');
  const agent = read('assets/agent-features.js');
  ok(!/photographier un cas test|Photos, état d’entrée, incident, reprise|Définir la zone → choisir les créneaux/.test(agent), 'the Kiwi AI summaries no longer describe photos, rework or routes that do not exist');

  const ops = read('assets/pressing-ops.js');
  ok(/dropoffStats: dropoffStats/.test(ops) && /LIVE_MS = 20000/.test(ops), 'ops exposes dropoffStats and refreshes while the page is open');
}

console.log(`pressing truth: ${pass} checks`);
if (fails.length) {
  console.error('\nFAILED:\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('✓ pressing truth gate green');
