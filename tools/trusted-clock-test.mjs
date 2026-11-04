#!/usr/bin/env node
/* trusted-clock-test · l'heure de confiance de la caisse (décision du 4 novembre 2026, n° 7).
 *
 *  - une tablette en avance de 2 h range quand même la vente dans la bonne journée
 *    commerciale et affiche la bonne heure de ticket ;
 *  - un échantillon dont l'aller-retour dépasse 2 s est ignoré ; la médiane tient
 *    contre un échantillon aberrant ;
 *  - sans serveur joint : heure de l'appareil inchangée, aucun avis ;
 *  - au-delà de 5 minutes d'écart : l'avis « Heure de l'appareil décalée » ;
 *  - la vente part avec ts (corrigé) et deviceTs, et le serveur garde received_ts.
 * Le vrai module, la vraie file de ventes et la vraie route /api/sale sur D1 en mémoire. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fixture } from './server-money-fixture.mjs';
import { harness, ROOT } from './live-link-queue-harness.mjs';
import { businessDate } from '../functions/api/_business-day.js';

const source = fs.readFileSync(path.join(ROOT, 'assets/pairing-commit.js'), 'utf8');
/* The till's network guard (assets/till-tenant.js) is the one fetch wrapper that
 * announces each /api/ reply; the clock listens to it, as on kiwi-caisse.html. */
const tenantSource = fs.readFileSync(path.join(ROOT, 'assets/till-tenant.js'), 'utf8');
const HOUR = 3600000;

/* L'horloge vit dans assets/pairing-commit.js (KiwiTrustedClock). Un navigateur factice : l'heure de l'appareil se règle, le serveur répond avec son en-tête Date. */
function browser({ deviceAheadMs = 0, serverNow = Date.UTC(2026, 10, 4, 4, 0, 0), rtt = 40, reachable = true, stored } = {}) {
  const t = { server: serverNow };
  const body = { children: [], appendChild(el) { this.children.push(el); el.parent = this; } };
  const elements = new Map();
  const events = [];          // the clock's own announcements (kiwi:clock-skew)
  const listeners = new Map();
  const document = {
    body,
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
    dispatchEvent: e => { if (e.type === 'kiwi:clock-skew') events.push(e); (listeners.get(e.type) || []).forEach(fn => fn(e)); return true; },
    getElementById: id => elements.get(id) || null,
    createTextNode: text => ({ text }),
    createElement: () => ({ style: {}, firstChild: null, setAttribute() {}, remove() { elements.delete(this.id); },
      appendChild(n) { this.firstChild = n; }, get textContent() { return this.firstChild ? this.firstChild.text : ''; } }),
  };
  const origAppend = body.appendChild.bind(body);
  body.appendChild = el => { origAppend(el); elements.set(el.id, el); };
  const store = new Map(stored ? [['kiwi:caisse:clock:v1', stored]] : []);
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
    get length() { return store.size; }, key: i => [...store.keys()][i] ?? null };
  const ctx = { console, setInterval: () => 0, CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } } };
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [FakeDate.now()])); }
    static now() { return t.server + deviceAheadMs; }
  }
  const calls = [];
  const window = {
    document, localStorage, addEventListener() {}, location: { origin: 'https://kiwi.test' },
    KiwiCaisseLang: { tr: s => s },
    fetch: async url => {
      calls.push(String(url));
      if (!reachable) throw new TypeError('offline');
      t.server += rtt / 2;
      const res = { ok: true, headers: { get: h => (h === 'Date' ? new Date(t.server).toUTCString() : null) } };
      t.server += rtt / 2;
      return res;
    },
  };
  Object.assign(ctx, { window, document, localStorage, location: window.location, navigator: {}, Date: FakeDate, URL, Number, Math, JSON, Array, Object, String, isFinite, TypeError, Promise });
  window.window = window;
  window.location.href = window.location.origin + '/kiwi-caisse.html';
  vm.createContext(ctx);
  vm.runInContext(tenantSource, ctx, { filename: 'assets/till-tenant.js' });
  vm.runInContext(source, ctx, { filename: 'assets/pairing-commit.js' });
  return { clock: window.KiwiTrustedClock, window, t, store, events, notice: () => elements.get('kiwi-clock-skew') || null, calls };
}

// 1. Un appareil en avance de 2 h : la bonne journée, la bonne heure de ticket.
{
  const b = browser({ deviceAheadMs: 2 * HOUR });
  await b.window.fetch('/api/config');
  const device = Date.UTC(2026, 10, 4, 4, 0, 0) + 2 * HOUR;
  const corrected = b.clock.date().getTime();
  assert.equal(b.events.at(-1).type, 'kiwi:clock-skew', 'le décalage est annoncé à la file des ventes');
  assert.equal(b.events.at(-1).detail.skewMs, b.clock.skewMs());
  assert.ok(Math.abs(corrected - Date.UTC(2026, 10, 4, 4, 0, 0)) < 2000, 'heure corrigée = heure du serveur, à la seconde près');
  assert.equal(businessDate(device, 5, 'Africa/Casablanca'), '2026-11-04', 'sans correction la vente de 04:00 file dans le lendemain');
  assert.equal(businessDate(corrected, 5, 'Africa/Casablanca'), '2026-11-03', 'avec la correction la vente reste dans la journée du 3');
  assert.equal(b.clock.date().toISOString().slice(11, 16), '04:00', 'le ticket imprime 04:00, pas 06:00');
  assert.ok(Math.abs(b.clock.skewMs() + 2 * HOUR) < 2000, 'tablette en avance de 2 h : décalage -2 h');
  assert.ok(!b.clock.rolledBack(), 'apprendre l\'avance ne déclenche pas l\'alerte de retour en arrière');
  assert.ok(b.notice(), 'un écart de 2 h affiche l\'avis');
  assert.equal(b.notice().textContent, "Heure de l'appareil décalée");
  assert.ok(b.store.get('kiwi:caisse:clock:v1'), 'le décalage est gardé sur l\'appareil');
  // Un appareil rouvert hors ligne garde la correction apprise.
  const again = browser({ deviceAheadMs: 2 * HOUR, reachable: false, stored: b.store.get('kiwi:caisse:clock:v1') });
  assert.ok(Math.abs(again.clock.date().getTime() - Date.UTC(2026, 10, 4, 4, 0, 0)) < 2000, 'la correction apprise survit au rechargement');
}

// 2. Un aller-retour lent est ignoré.
{
  const b = browser({ deviceAheadMs: 2 * HOUR, rtt: 2600 });
  await b.window.fetch('/api/config');
  assert.equal(b.clock.skewMs(), 0, 'rtt > 2 s : échantillon écarté, heure de l\'appareil inchangée');
  assert.equal(b.notice(), null);
  assert.equal(b.events.length, 0, 'aucune annonce pour un échantillon écarté');
  const res = { headers: { get: () => new Date(Date.UTC(2026, 10, 4, 4, 0, 0)).toUTCString() } };
  b.clock.observe(res, b.t.server + 2 * HOUR - 2500);      // reçu 2,5 s après l'envoi : trop lent
  assert.equal(b.clock.skewMs(), 0);
  b.clock.observe(res, b.t.server + 2 * HOUR - 1900);      // 1,9 s : retenu
  assert.notEqual(b.clock.skewMs(), 0, 'sous 2 s : retenu');
}

// 3. Médiane : un échantillon aberrant ne déplace pas la correction.
{
  const b = browser();
  const at = Date.UTC(2026, 10, 4, 4, 0, 0);
  const reply = ms => ({ headers: { get: () => new Date(ms).toUTCString() } });
  // Le faux FakeDate fixe l'heure de l'appareil à t.server : on envoie « il y a 20 ms ».
  const sendAt = () => b.t.server - 20;
  for (let i = 0; i < 4; i++) b.clock.observe(reply(b.t.server), sendAt());
  b.clock.observe(reply(b.t.server + 3 * HOUR), sendAt());
  assert.ok(Math.abs(b.clock.skewMs()) < 1000, 'la médiane ignore la valeur aberrante');
  void at;
}

// 4. Aucun serveur joint : heure de l'appareil, aucun avis.
{
  const b = browser({ deviceAheadMs: 2 * HOUR, reachable: false });
  await assert.rejects(() => b.window.fetch('/api/config'));
  assert.equal(b.clock.skewMs(), 0);
  assert.equal(b.clock.date().getTime(), Date.UTC(2026, 10, 4, 4, 0, 0) + 2 * HOUR, 'heure de l\'appareil inchangée');
  assert.equal(b.notice(), null, 'pas d\'avis sans mesure');
}

// 5. Sous 5 minutes : pas d'avis. Et seul /api/ du même site compte.
{
  const b = browser({ deviceAheadMs: 3 * 60000 });
  await b.window.fetch('/api/config');
  assert.equal(b.notice(), null, '3 minutes d\'écart ne dérangent pas la caissière');
  const c = browser({ deviceAheadMs: 2 * HOUR });
  await c.window.fetch('/assets/x.js');
  await c.window.fetch('https://autre.example/api/x');
  assert.equal(c.clock.skewMs(), 0, 'ni un fichier statique ni un autre site ne règlent l\'horloge');
}

// 6. La vente part avec ts corrigé + deviceTs ; le serveur garde received_ts.
{
  const f = await fixture(ROOT), h = await harness(f);
  await h.reset(false);
  const deviceTs = h.s.now;                      // ce que dit la tablette (2 h d'avance)
  const document = h.b.window.document;
  assert.equal(h.b.api.now(), deviceTs, 'sans annonce : heure de l\'appareil');
  document.dispatchEvent({ type: 'kiwi:clock-skew', detail: { skewMs: -2 * HOUR } });
  const correctedTs = h.b.api.now();             // ce que dit l'horloge de confiance
  assert.equal(correctedTs, deviceTs - 2 * HOUR, 'KiwiLive.now() applique le décalage annoncé');
  const posted = h.b.api.postSale({ id: 'clock-1', ref: 'clock-1', amountCents: 5000, amount: 50, method: 'cash',
    time: new Date(correctedTs), deviceTs, lines: [{ name: 'Article', qty: 1, total: 50 }] });
  assert.equal(posted.queued, true);
  await h.recover();
  const sent = h.s.requests.find(r => r.body && r.body.id === posted.id);
  assert.equal(sent.body.ts, correctedTs, 'le corps porte l\'heure corrigée');
  assert.equal(sent.body.deviceTs, deviceTs, 'et celle de l\'appareil');
  const row = f.sql.prepare('SELECT ts, device_ts, received_ts FROM sales WHERE merchant=? AND id=?').get(f.merchant, posted.id);
  assert.equal(row.ts, correctedTs);
  assert.equal(row.device_ts, deviceTs);
  assert.ok(row.received_ts > 0, 'le serveur note l\'heure d\'arrivée');
  // Une vente d'un ancien client (sans deviceTs) est acceptée, device_ts reste NULL.
  const old = h.b.api.postSale({ id: 'clock-2', ref: 'clock-2', amountCents: 100, amount: 1, method: 'cash', time: new Date(h.s.now),
    lines: [{ name: 'Article', qty: 1, total: 1 }] });
  await h.recover();
  const oldRow = f.sql.prepare('SELECT device_ts, received_ts FROM sales WHERE merchant=? AND id=?').get(f.merchant, old.id);
  assert.equal(oldRow.device_ts, null);
  assert.ok(oldRow.received_ts > 0);
}
console.log('✓ trusted-clock · avance de 2 h corrigée, échantillons lents écartés, hors ligne inchangé, ts + deviceTs + received_ts');
process.exit(0);
