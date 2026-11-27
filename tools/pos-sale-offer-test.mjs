#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · « Offert » dans les quinze métiers (assets/pos-sale.js, 27 nov. 2026)
 *
 * Le client voulait donner un cookie, un café, un ticket entier, et que le
 * stock et le journal le comptent quand même. Les métiers qui encaissent par
 * KiwiPosSale.record() refusaient tout total nul. Maintenant :
 *   · une vente « offert » n'est enregistrée qu'avec l'accord d'un responsable
 *     (KiwiPosSale.offer.ask → take, à usage unique) ;
 *   · elle vaut 0 MAD, chaque ligne garde ce qu'elle valait (offered) ;
 *   · le serveur reçoit exactement ce que /api/sale exige d'une vente offerte
 *     (settlementKind complimentary, brut = remise > 0, motif, actorId sans
 *     code à quatre chiffres) ;
 *   · chaque métier propose « Offert » sur son écran de paiement.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import vm from 'node:vm';

let failures = 0;
const ok = (label, cond, detail) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++; console.log('  ✗ ' + label + (detail ? ' · ' + detail : ''));
};
console.log('■ métiers · « Offert » encaisse 0 MAD et garde la vente (tools/pos-sale-offer-test.mjs)');

const source = fs.readFileSync(new URL('../assets/pos-sale.js', import.meta.url), 'utf8');

function boot({ real = true } = {}) {
  const rows = new Map([['kiwi:posDevice', 'A7']]);
  if (real) rows.set('kiwiPairedVenue', JSON.stringify({ merchant: 'amira-snack' }));
  const localStorage = {
    getItem: (k) => rows.has(k) ? rows.get(k) : null, setItem: (k, v) => { rows.set(k, String(v)); },
    removeItem: (k) => rows.delete(k), key: (i) => [...rows.keys()][i] || null, get length() { return rows.size; },
  };
  const posted = [];
  const window = {
    localStorage, document: { hidden: false, addEventListener() {}, dispatchEvent() { return true; }, querySelectorAll: () => [] },
    KiwiEnv: { isReal: () => real },
    KiwiLive: { isOn: () => true, merchant: () => 'amira-snack', postSale: (p) => { posted.push(p); return { ok: true, queued: true, id: 's' }; } },
    addEventListener() {}, dispatchEvent() { return true; },
  };
  window.window = window;
  const context = {
    console, window, document: window.document, localStorage,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Date, Map, Set, Uint8Array, crypto: { getRandomValues(a) { a[0] = 1; return a; } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ sales: [] }) }),
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'pos-sale.js' });
  const journal = () => [...rows.entries()].filter(([k]) => k.startsWith('kiwi:posDay:')).flatMap(([, v]) => JSON.parse(v));
  return { api: window.KiwiPosSale, window, posted, journal };
}

/* The offer API is registered on KiwiPosSale; the tills read nothing else. */
{
  const { api } = boot();
  ok('KiwiPosSale.offer carries ask / take / available / tr / sub', ['ask', 'take', 'available', 'tr', 'sub'].every((k) => typeof api.offer?.[k] === 'function'));
  ok('take() without an approval gives nothing', api.offer.take() === null);
  ok('a real till without the 2027 PIN pad shows no « Offert »', api.offer.available() === false);
  ok('the demo shows « Offert »', boot({ real: false }).api.offer.available() === true);
}

/* No approval: refused, nothing written, nothing sent. */
{
  const { api, posted, journal } = boot();
  const r = api.record('epicerie', { total: 25, method: 'offert', ref: 'T1', lines: [{ name: 'Cookie', qty: 2, total: 25 }] });
  ok('an « offert » sale without a manager approval is refused', r === null && posted.length === 0 && journal().length === 0);
}

/* Approved through the offer API (take, once). */
{
  const { api, posted, journal } = boot();
  let approvals = [{ id: 'mgr_sara', name: 'Sara' }];
  api.useOffer({ ...api.offer, take: () => approvals.shift() || null });
  const entry = api.record('epicerie', { total: 25, method: 'offert', ref: 'T2', lines: [{ name: 'Cookie', qty: 2, total: 25 }] });
  ok('an approved « offert » sale is recorded at 0 MAD', entry && entry.total === 0 && entry.method === 'complimentary', JSON.stringify(entry));
  ok('… each line keeps what it was worth, at 0 MAD', entry?.lines?.[0]?.offered === 12.5 && entry.lines[0].total === 0 && entry.lines[0].qty === 2, JSON.stringify(entry?.lines));
  ok('… and the ticket says what it was worth and who gave it', entry?.offered?.gross === 25 && entry.offered.by === 'mgr_sara' && entry.offered.name === 'Sara');
  ok('… it lands in the day journal (stock and Z count it)', journal().length === 1);
  const p = posted[0] || {};
  ok('the server gets a complimentary sale at 0 MAD', p.amount === 0 && p.method === 'complimentary' && p.settlementKind === 'complimentary', JSON.stringify(p));
  ok('… gross equal to the discount, above zero (the /api/sale rule)', p.grossAmountCents === 2500 && p.discountAmountCents === 2500);
  ok('… with an accepted reason and the approving manager', p.discountReason === 'commercial' && p.actorId === 'mgr_sara');
  ok('… and its lines', Array.isArray(p.lines) && p.lines.length === 1);
  const again = api.record('epicerie', { total: 25, method: 'offert', ref: 'T3' });
  ok('one approval gives one ticket, not two', again === null && posted.length === 1);
}

/* Approval handed in by the till; no lines; a bare four-digit id. */
{
  const { api, posted } = boot();
  const e = api.record('fastfood', { total: 18, method: 'offert', ref: 'T4', label: 'Menu', approvedBy: { id: '1234', name: 'Karim' } });
  ok('a ticket without lines gets one line for its value', e?.lines?.length === 1 && e.lines[0].offered === 18 && e.lines[0].total === 0, JSON.stringify(e?.lines));
  ok('a bare four-digit id is never sent as the actor', posted[0]?.actorId === 'staff:1234');
  const zero = api.record('fastfood', { total: 0, method: 'offert', ref: 'T5', approvedBy: { id: 'mgr' } });
  ok('nothing to give (0 MAD) is refused', zero === null);
  const plain = api.record('fastfood', { total: 0, method: 'cash', ref: 'T6' });
  ok('an ordinary 0 MAD cash sale is still not a taking', plain === null);
}

/* Every till that records through KiwiPosSale offers it on its payment screen. */
{
  const tills = ['autre', 'boulangerie', 'coiffure', 'epicerie', 'fastfood', 'fleuriste', 'foodtruck', 'gym', 'hotel', 'librairie', 'pharmacie', 'pizzeria', 'spa', 'traiteur'];
  const files = tills.map((t) => `assets/pos-${t}.js`).concat(['assets/pressing/custody.js']);
  const missing = files.filter((f) => {
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    return !(/KiwiPosSale\??\.offer\??\.available\(\)/.test(s) && /offer\.ask\(/.test(s) && /'offert'/.test(s));
  });
  ok('all 15 tills show « Offert » and ask a manager before recording it', missing.length === 0, missing.join(', '));
}

console.log(failures ? `\n✗ ${failures} échec(s)` : '\n✓ « Offert » tient dans les quinze métiers');
process.exit(failures ? 1 : 0);
