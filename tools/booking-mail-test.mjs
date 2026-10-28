#!/usr/bin/env node
/* booking-mail-test · le courriel de confirmation d'une réservation publique
 * donne la date à l'heure du commerce et dans la langue de la cliente.
 *
 * Il imprimait « 2026-11-20 19:00 UTC » (l'instant ISO, pas l'heure du lieu) et
 * restait en français quelle que soit la langue choisie sur la page. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestGet, onRequestPost } from '../functions/api/booking.js';
import { bookingMail, mailLang, slotLabel } from '../functions/api/_booking-mail.js';

// 1. Le choix de la langue : le corps d'abord, puis le navigateur, puis le français.
assert.equal(mailLang('en', 'ar'), 'en');
assert.equal(mailLang('AR-MA', ''), 'ar');
assert.equal(mailLang(undefined, 'ar-MA,fr;q=0.8'), 'ar');
assert.equal(mailLang('de', 'es, en;q=0.5'), 'en', 'une langue inconnue laisse la main au navigateur');
assert.equal(mailLang('xx', 'zh'), 'fr');
assert.equal(mailLang(), 'fr');

// 2. L'heure du lieu, fixée par la loi de zone et non par la machine qui exécute.
// 2026-11-20 19:00 UTC : Casablanca vit en UTC (loi marocaine de septembre 2026),
// Paris à +01:00, New York à -05:00, Auckland à +13:00.
const at = Date.UTC(2026, 10, 20, 19, 0);
const hour = (zone, lang = 'fr') => slotLabel(at, zone, lang).match(/(\d{2}:\d{2})$/)[1];
assert.equal(hour('Africa/Casablanca'), '19:00', 'Casablanca : 19:00');
assert.equal(hour('Europe/Paris'), '20:00', 'Paris : 20:00');
assert.equal(hour('America/New_York'), '14:00', 'New York : 14:00');
assert.equal(hour('Pacific/Auckland'), '08:00', 'Auckland : 08:00, le lendemain');
assert.match(slotLabel(at, 'Pacific/Auckland', 'en'), /Saturday,? 21 November 2026 at 08:00/, 'le jour change avec la zone');
assert.match(slotLabel(at, 'Africa/Casablanca', 'fr'), /vendredi 20 novembre 2026 à 19:00/);
assert.match(slotLabel(at, 'Africa/Casablanca', 'ar'), /^\S+،? 20 \S+ 2026 على الساعة 19:00$/u, 'arabe : chiffres latins');
assert.equal(slotLabel(at, 'Not/AZone', 'fr'), slotLabel(at, 'Africa/Casablanca', 'fr'), 'une zone inconnue retombe sur Casablanca');

// 3. Le texte complet, dans chaque langue.
const rec = { code: 'R-AB12CD34', status: 'confirmed', startAt: at, partySize: 4 };
const base = { venue: 'Café Atlas', rec, zone: 'Africa/Casablanca', manageUrl: 'https://kiwi-os.com/booking.html?m=x#t' };
for (const [lang, confirmed, party, manage] of [
  ['fr', 'Votre réservation est confirmée.', 'Personnes : 4', 'Consulter ou annuler votre réservation :'],
  ['en', 'Your booking is confirmed.', 'Guests : 4', 'View or cancel your booking:'],
  ['ar', 'تم تأكيد حجزك.', 'عدد الأشخاص : 4', 'لعرض حجزك أو إلغائه:'],
]) {
  const m = bookingMail({ lang, ...base });
  assert.ok(m.text.includes(confirmed), lang + ' : confirmé');
  assert.ok(m.text.includes(party), lang + ' : personnes');
  assert.ok(m.text.includes(manage) && m.text.includes(base.manageUrl), lang + ' : lien de gestion');
  assert.ok(m.subject.startsWith('Café Atlas · ') && m.subject.endsWith(' · R-AB12CD34'), lang + ' : objet');
  assert.ok(!/UTC|T\d\d:\d\d|\d{4}-\d\d-\d\d/.test(m.text), lang + ' : ni UTC ni date ISO dans le texte');
  assert.ok(!m.text.includes('—'), lang + ' : pas de tiret cadratin');
}
assert.ok(bookingMail({ lang: 'en', ...base, rec: { ...rec, status: 'requested' } }).text.includes('The venue will confirm it with you.'));
assert.match(bookingMail({ lang: 'fr', ...base, venue: '' }).text, /^Votre établissement\n/, 'nom absent : libellé par langue');
assert.match(bookingMail({ lang: 'ar', ...base, venue: '' }).text, /^مؤسستك\n/);
// Un séjour d'hôtel : des jours civils, jamais décalés par un fuseau, pluriel des nuits.
const stay = { ...rec, hotel: { roomTypeName: 'Suite', checkIn: '2026-11-20', checkOut: '2026-11-23', nights: 3 } };
assert.match(bookingMail({ lang: 'fr', ...base, rec: stay }).text, /Date : 20 novembre 2026 → 23 novembre 2026 \(3 nuits\)/);
assert.match(bookingMail({ lang: 'en', ...base, rec: stay }).text, /Date : 20 November 2026 → 23 November 2026 \(3 nights\)/);
assert.match(bookingMail({ lang: 'ar', ...base, rec: stay }).text, /\(3 ليال\)/);
assert.match(bookingMail({ lang: 'fr', ...base, rec: { ...stay, hotel: { ...stay.hotel, nights: 1 } } }).text, /\(1 nuit\)/);
assert.match(bookingMail({ lang: 'ar', ...base, rec: { ...stay, hotel: { ...stay.hotel, nights: 2 } } }).text, /\(ليلتان\)/);
assert.match(bookingMail({ lang: 'ar', ...base, rec: { ...stay, hotel: { ...stay.hotel, nights: 12 } } }).text, /\(12 ليلة\)/);

// 3 bis. La page envoie sa langue avec la demande, pour le service comme pour l'hôtel.
const submission = fs.readFileSync(new URL('../assets/booking-submission.js', import.meta.url), 'utf8');
assert.equal((submission.match(/ref: ref,lang: state\.lang,/g) || []).length, 2, 'les deux envois (service, hôtel) portent la langue de la page');

// 4. Par la vraie route : la page envoie sa langue, le lieu a son fuseau, la file part au webhook.
class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.includes('timezone')) return { timezone: this.db.zone };
    return null;
  }
  async run() {
    if (this.sql.startsWith('UPDATE store_docs')) {
      const [data, rev, updated, merchant, expected] = this.args;
      if (merchant !== this.db.merchant || expected !== this.db.rev) return { meta: { changes: 0 } };
      this.db.doc = JSON.parse(data); this.db.rev = rev; return { meta: { changes: 1 } };
    }
    return { meta: { changes: 1 } };
  }
}
class MockDB {
  constructor(doc, zone) { this.merchant = 'test-shop'; this.doc = doc; this.rev = 1; this.zone = zone; }
  prepare(sql) { return new Statement(this, sql); }
  async batch() {
    return [
      { results: [{ data: JSON.stringify(this.doc), rev: this.rev }] },
      { results: [{ data: JSON.stringify({ week: {}, exceptions: [] }) }] },
      { results: [{ name: 'Café Atlas', type: 'boutique' }] },
      { results: [{ data: JSON.stringify({ members: [], shifts: {} }) }] },
      { results: [] },
    ];
  }
}
const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const week = Object.fromEntries(days.map((d) => [d, { open: true, periods: [{ from: '09:00', to: '18:00' }] }]));
const freshDoc = () => ({
  v: 1,
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365, cancellationHours: 12, slotStep: 15, updatedAt: 1 },
  services: [{ id: 'svc-cut', name: 'Coupe', duration: 30, price: 80, deposit: 0, capacity: 1, resourceIds: ['res-a'], active: true, updatedAt: 1 }],
  resources: [{ id: 'res-a', name: 'Amal', kind: 'person', capacity: 1, active: true, week, updatedAt: 1 }],
  blocked: [], bookings: [],
});
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };
let ip = 1;
async function book(zone, lang, acceptLanguage) {
  const db = new MockDB(freshDoc(), zone), env = { DB: db, MAIL_WEBHOOK: 'https://mail.test/hook' };
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const slots = (await (await onRequestGet({ request: new Request(`https://kiwi-os.com/api/booking?merchant=test-shop&service=svc-cut&date=${day}`), env })).json()).slots;
  assert.ok(slots.length, 'des créneaux existent');
  const slot = slots[0];
  const headers = { 'CF-Connecting-IP': `203.0.113.${ip++}`, 'Content-Type': 'application/json', ...(acceptLanguage ? { 'Accept-Language': acceptLanguage } : {}) };
  const body = { merchant: 'test-shop', ref: 'mail-ref-' + ip, serviceId: 'svc-cut', startAt: slot.startAt, partySize: 1, customer: { name: 'Nora', phone: '', email: 'nora@example.com' }, ...(lang ? { lang } : {}) };
  sent.length = 0;
  const res = await onRequestPost({ request: new Request('https://kiwi-os.com/api/booking', { method: 'POST', headers, body: JSON.stringify(body) }), env });
  const out = await res.json();
  assert.equal(res.status, 200, JSON.stringify(out));
  assert.equal(out.confirmationSent, true);
  assert.equal(sent.length, 1);
  return { mail: sent[0], slot };
}
try {
  const ar = await book('Europe/Paris', 'ar');
  assert.ok(ar.mail.text.includes('تم تأكيد حجزك.'), 'la langue de la page (AR) est celle du courriel');
  assert.ok(ar.mail.subject.includes('تم تأكيد الحجز'));
  const paris = slotLabel(ar.slot.startAt, 'Europe/Paris', 'ar');
  assert.ok(ar.mail.text.includes(paris), 'et l\'heure est celle de Paris : ' + paris);
  assert.ok(!/UTC/.test(ar.mail.text));
  const en = await book('America/New_York', 'en');
  assert.ok(en.mail.text.includes('Your booking is confirmed.'));
  assert.ok(en.mail.text.includes(slotLabel(en.slot.startAt, 'America/New_York', 'en')), 'heure de New York');
  const fr = await book('Africa/Casablanca', 'fr');
  assert.ok(fr.mail.text.includes('Votre réservation est confirmée.'));
  assert.ok(fr.mail.text.includes(slotLabel(fr.slot.startAt, 'Africa/Casablanca', 'fr')));
  const old = await book('Africa/Casablanca', undefined, 'en-GB,en;q=0.9');
  assert.ok(old.mail.text.includes('Your booking is confirmed.'), 'une page qui n\'envoie pas sa langue : le navigateur décide');
  const none = await book('Africa/Casablanca', undefined, undefined);
  assert.ok(none.mail.text.includes('Votre réservation est confirmée.'), 'sans rien : le français');
} finally { globalThis.fetch = realFetch; }

console.log('✓ courriel de réservation : heure du commerce, langue de la cliente (FR, EN, AR), séjours d\'hôtel, route complète');
