// tools/booking-cap-test.mjs
//
// Le document des réservations hors hôtel est borné à 4000 lignes. Le bornage
// retirait « les plus anciennes dans le tableau » : une réservation prise tôt
// pour une date lointaine est la plus ancienne du tableau et disparaissait en
// silence. Désormais le passé le plus ancien part d'abord, l'avenir n'est jamais
// retiré, et un document plein d'avenir refuse l'écriture avec une erreur claire.
// Vraies fonctions : _booking-cap.js, la route publique, le normalize du tableau
// de bord (vm) et le push générique de store.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { capBookings, BOOKING_CAP } from '../functions/api/_booking-cap.js';
import { onRequestPost } from '../functions/api/booking.js';

let controls = 0;
const ok = (c, m) => { assert.ok(c, m); controls += 1; };
const DAY = 86400000;
const now = Date.now();
const row = (i, endAt, status = 'completed') => ({ id: 'bk-' + i, customer: { name: 'C' + i }, serviceId: 'svc-cut', startAt: endAt - 1800000, endAt, status });

/* 1. La règle. */
{
  ok(BOOKING_CAP === 4000, 'le plafond reste 4000');
  const fill = [row('far', now + 200 * DAY, 'confirmed')];                       // prise tôt, tout au début du tableau
  for (let i = 0; i < 4000; i += 1) fill.push(row(i, now - (4000 - i) * DAY));    // passé, du plus ancien au plus récent
  const r = capBookings(fill, now);
  ok(r.bookings.length === 4000 && r.dropped === 1 && !r.full, 'un de trop : un seul retiré');
  ok(r.bookings.some((x) => x.id === 'bk-far'), 'la réservation lointaine, première du tableau, est gardée');
  ok(!r.bookings.some((x) => x.id === 'bk-0'), 'c\'est le passé le plus ancien qui part');
  ok(r.bookings[0].id === 'bk-far', 'l\'ordre des lignes gardées est conservé');

  const future = Array.from({ length: 4001 }, (_, i) => row(i, now + (i + 1) * DAY, 'cancelled'));
  const f = capBookings(future, now);
  ok(f.full && f.dropped === 0 && f.bookings.length === 4001, 'rien que de l\'avenir : plein, rien de retiré');

  const open = [...Array.from({ length: 4000 }, (_, i) => row(i, now + (i + 1) * DAY, 'confirmed')), row('late', now - 2 * DAY, 'confirmed')];
  ok(capBookings(open, now).full, 'une ligne ouverte finie hier garde sa grâce de sept jours');
  open[open.length - 1].endAt = now - 8 * DAY;
  ok(!capBookings(open, now).full && capBookings(open, now).dropped === 1, 'au-delà de sept jours elle peut partir');

  ok(capBookings(fill.slice(0, 10), now).bookings.length === 10 && capBookings(null, now).bookings.length === 0, 'sous le plafond ou entrée absente : inchangé');
}

/* 2. La route publique : harnais minimal comme tools/booking-api-test.mjs. */
class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async first() { return null; }
  async run() {
    if (this.sql.startsWith('UPDATE store_docs')) {
      const [data, rev, , merchant, expected] = this.args;
      if (merchant !== this.db.merchant || expected !== this.db.rev) return { meta: { changes: 0 } };
      this.db.doc = JSON.parse(data); this.db.rev = rev; return { meta: { changes: 1 } };
    }
    return { meta: { changes: 1 } };
  }
}
class MockDB {
  constructor(doc) { this.merchant = 'test-shop'; this.doc = doc; this.rev = 1; }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    if (statements?.length && !statements[0].sql.startsWith('SELECT data')) { const out = []; for (const s of statements) out.push(await s.run()); return out; }
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const week = Object.fromEntries(days.map((d) => [d, { open: true, periods: [{ from: '09:00', to: '18:00' }] }]));
    return [
      { results: [{ data: JSON.stringify(this.doc), rev: this.rev }] },
      { results: [{ data: JSON.stringify({ week, exceptions: [] }) }] },
      { results: [{ name: 'Test Shop', type: 'boutique' }] },
      { results: [{ data: JSON.stringify({ members: [], shifts: {} }) }] },
      { results: [] },
    ];
  }
}
const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const week = Object.fromEntries(days.map((d) => [d, { open: true, periods: [{ from: '09:00', to: '18:00' }] }]));
const baseDoc = (bookings) => ({
  v: 1,
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365, cancellationHours: 12, slotStep: 15, updatedAt: 1 },
  services: [{ id: 'svc-cut', name: 'Coupe', duration: 30, price: 80, deposit: 20, capacity: 1, resourceIds: ['res-a'], active: true, updatedAt: 1 }],
  resources: [{ id: 'res-a', name: 'Amal', kind: 'person', capacity: 1, active: true, week, updatedAt: 1 }],
  blocked: [], bookings,
});
/* Le prochain créneau libre de res-a : demain, 10:00 heure de Casablanca (UTC+0 depuis le 20 sept 2026). */
function slotAt(i) {
  const d = new Date(Date.now() + (3 + i) * DAY); d.setUTCHours(10, 0, 0, 0); return d.getTime();
}
async function book(db, n) {
  const res = await onRequestPost({ request: new Request('https://kiwi-os.com/api/booking', { method: 'POST',
    headers: { 'CF-Connecting-IP': '203.0.113.' + (10 + n), 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: 'test-shop', ref: 'public-ref-cap-' + n, serviceId: 'svc-cut', startAt: slotAt(n), partySize: 1, customer: { name: 'Nora', phone: '+212612345678', email: '' } }) }), env: { DB: db } });
  return { status: res.status, body: await res.json() };
}
{
  // 4000 lignes passées ; la plus ancienne ne doit pas survivre, la nouvelle oui.
  const past = Array.from({ length: 4000 }, (_, i) => row(i, now - (4000 - i) * DAY));
  const early = row('early', now + 300 * DAY, 'confirmed'); early.resourceId = 'res-z';
  const db = new MockDB(baseDoc([early, ...past]));
  const r = await book(db, 1);
  ok(r.status === 200 && r.body.ok, 'document plein de passé : la réservation passe');
  ok(db.doc.bookings.length === 4000, 'le document reste à 4000 lignes');
  ok(db.doc.bookings.some((x) => x.id === 'bk-early'), 'la réservation lointaine du début du tableau survit');
  ok(!db.doc.bookings.some((x) => x.id === 'bk-0') && db.doc.bookings.some((x) => x.code === r.body.code), 'le passé le plus ancien est parti, la nouvelle est écrite');
}
{
  // 4000 lignes à venir (annulées, donc hors limite « actives ») : refus clair, rien écrit.
  const future = Array.from({ length: 4000 }, (_, i) => { const r = row(i, now + (400 + i) * DAY, 'cancelled'); r.resourceId = 'res-z'; return r; });
  const db = new MockDB(baseDoc(future));
  const r = await book(db, 2);
  ok(r.status === 409 && r.body.error === 'bookings-full' && r.body.cap === 4000, 'document plein d\'avenir : refus clair bookings-full');
  ok(db.doc.bookings.length === 4000 && db.rev === 1, 'rien n\'est retiré ni écrit');
}

/* 3. Le normalize du tableau de bord applique la même règle. */
{
  const ctx = { console, setTimeout: () => 0, clearTimeout: () => {}, Date, Math, JSON, location: { origin: 'https://kiwi-os.com' }, navigator: {},
    document: { addEventListener() {} }, addEventListener() {} };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8'), ctx, { filename: 'assets/reservations.js' });
  const past = Array.from({ length: 4000 }, (_, i) => row(i, now - (4000 - i) * DAY));
  const out = ctx.KiwiReservations.normalize({ bookings: [row('far', now + 200 * DAY, 'confirmed'), ...past] });
  ok(out.bookings.length === 4000 && out.bookings.some((x) => x.id === 'bk-far') && !out.bookings.some((x) => x.id === 'bk-0'), 'le tableau de bord garde l\'avenir lointain et retire le passé le plus ancien');
  const future = Array.from({ length: 4010 }, (_, i) => row(i, now + (i + 1) * DAY, 'confirmed'));
  ok(ctx.KiwiReservations.normalize({ bookings: future }).bookings.length === 4010, 'le tableau de bord ne coupe jamais l\'avenir (le serveur refuse)');
}

/* 4. Le push générique de store.js passe par la même règle. */
{
  const store = fs.readFileSync(new URL('../functions/api/store.js', import.meta.url), 'utf8');
  ok(/capBookings\(clean\.value\.bookings/.test(store) && /why: 'bookings-cap'/.test(store), 'store.js plafonne le document reservations avec _booking-cap.js et refuse en 413 sinon');
  ok(!/slice\(-4000\)/.test(fs.readFileSync(new URL('../functions/api/booking.js', import.meta.url), 'utf8')) && !/slice\(-4000\)/.test(fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8')), 'plus de coupe positionnelle à 4000');
}

console.log(`booking-cap-test: ${controls} controls passed`);
