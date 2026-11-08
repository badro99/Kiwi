#!/usr/bin/env node
/* Kiwi · economat-send-feedback-test.mjs · what a department sees after « Envoyer ».
 *
 * The offline outbox (decision 2026-11-04) routes every new request through
 * assets/hotel-economat-outbox.js. Online, the hand-off must still finish on the
 * spot as before: « Demande envoyée » toast, the list reloaded and the request
 * sheet opened at its review stage. Offline, the request is kept, the toast says
 * so, nothing reaches the server and no sheet opens; back online, one replay
 * writes it once.
 *
 * Runs the REAL controller (vm, minimal DOM) over the REAL transport and outbox
 * and the real internal-requests route on SQLite.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';
import { onRequestGet } from '../functions/api/inventory/internal-requests.js';

const store = new Map();
globalThis.addEventListener = () => {};
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const nav = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
const transport = await import('../assets/hotel-economat-api.js');
const h = await createHotelRequestHarness();
const UNIT = 'rooftop';

const posts = [];
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url, 'https://kiwi.test');
  if (!nav.onLine) throw new TypeError('Failed to fetch');
  if (options.method === 'POST') { const data = JSON.parse(options.body); posts.push(data); return h.post(data); }
  if (u.pathname === '/api/inventory/internal-requests') return onRequestGet({ request: new Request('https://kiwi.test' + u.pathname + u.search, { headers: { cookie: h.ownerCookie } }), env: h.env });
  if (u.pathname === '/api/inventory/department-catalogue') return Response.json({ ok: true, data: { items: [{ itemId: 'cola', active: true }] } });
  if (u.pathname === '/api/store') {
    const row = h.one('SELECT data FROM store_docs WHERE merchant = ? AND feature = ?', MERCHANT, u.searchParams.get('feature'));
    return Response.json({ ok: true, data: row ? JSON.parse(row.data) : null });
  }
  return new Response('{}', { status: 404 });
};

function boot() {
  const toasts = [], modals = [];
  const host = { isConnected: true, innerHTML: '' };
  const document = { querySelector: (s) => (/data-eco-requests-host/.test(s) ? host : null) };
  const handlers = {};
  /* The create form: one pick row whose unit is the one the controller rendered. */
  function formEl() {
    const box = { isConnected: true, innerHTML: '' };
    const unit = () => (box.innerHTML.match(/<option value="([^"]+)" selected/) || [])[1] || '';
    const row = { getAttribute: () => '0', querySelector: (s) => (s === '[data-pick-qty]' ? { value: '2' } : { value: unit() }) };
    return {
      classList: { add() {} }, addEventListener() {}, box,
      querySelector: (s) => (s === '[data-req-items]' ? box : s === '[data-req-unit]' ? { value: UNIT } : s === '#hx-req-note' ? { value: '' }
        : s === '[data-action="eco-req-send"]' ? { isConnected: true, disabled: false, setAttribute() {}, removeAttribute() {} } : null),
      querySelectorAll: (s) => (s === '[data-pick]' && box.innerHTML.includes('data-pick="0"') ? [row] : []),
    };
  }
  const sheetEl = () => ({ classList: { add() {} }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const Kiwi = { handlers, toast: (m, o) => toasts.push({ m, type: o && o.type }),
    modal: (o) => { const el = modals.length ? sheetEl() : formEl(); const ref = { o, el, open: true, close() { ref.open = false; } }; modals.push(ref); return ref; } };
  const window = { Kiwi, KiwiInventory: { merchant: () => MERCHANT, sync: async () => {} }, KiwiI18n: { getLang: () => 'fr' } };
  window.window = window;
  let src = fs.readFileSync(new URL('../assets/hotel-economat-requests.js', import.meta.url), 'utf8');
  const tail = /\}\(function \(\) \{ return import\('\.\/hotel-economat-api\.js\?v=\d+'\); \}\)\);/;
  assert.ok(tail.test(src), 'transport import hook found');
  src = src.replace(tail, '}(function () { return Promise.resolve(__economatTransport); }));');
  vm.runInNewContext(src, { __economatTransport: transport, window, document, Kiwi, console, Intl, Promise, setTimeout, clearTimeout, Math, Date, Number, String, Object, Array, JSON, Error });
  return { api: window.KiwiEconomatRequests, handlers, toasts, modals };
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const picks = (c) => c.modals[0].el.querySelectorAll('[data-pick]').length;
async function openForm(c) {
  c.handlers['eco-req-new']();
  for (let i = 0; i < 50 && !picks(c); i++) await settle();
  assert.equal(picks(c), 1, 'the department catalogue is painted in the form');
}
const countRequests = () => Number(h.one('SELECT COUNT(*) n FROM hotel_internal_requests WHERE merchant = ?', MERCHANT).n);
const lastToast = (c) => c.toasts[c.toasts.length - 1];

/* online: sent on the spot, toast, sheet open at review */
{
  const c = boot(); await c.api.reload();
  const before = countRequests();
  await openForm(c);
  await c.handlers['eco-req-send']();
  await settle();
  assert.deepEqual(lastToast(c), { m: 'Demande envoyée à l’économat', type: 'success' }, 'en ligne : « Demande envoyée » s’affiche');
  assert.equal(countRequests(), before + 1, 'en ligne : la demande est écrite une fois sur le serveur');
  const id = posts.find((p) => p.action === 'create').id;
  assert.equal(h.one('SELECT state FROM hotel_internal_requests WHERE merchant = ? AND id = ?', MERCHANT, id).state, 'open', 'en ligne : la demande est soumise à l’économat');
  assert.deepEqual(c.modals.map((m) => m.open), [false, true], 'en ligne : le formulaire se ferme et la fiche de la demande s’ouvre');
}

/* offline: kept, said so, nothing written, no sheet; back online: written once */
{
  nav.onLine = false;
  const c = boot(); await c.api.reload().catch(() => {});
  const before = countRequests(), postsBefore = posts.length;
  nav.onLine = true; await openForm(c); nav.onLine = false;
  await c.handlers['eco-req-send']();
  await settle();
  assert.deepEqual(lastToast(c), { m: 'Hors connexion : la demande est gardée et partira au retour du réseau', type: 'warning' }, 'hors ligne : la demande est dite gardée');
  assert.deepEqual([posts.length, countRequests()], [postsBefore, before], 'hors ligne : rien n’atteint le serveur');
  assert.deepEqual(c.modals.map((m) => m.open), [false], 'hors ligne : le formulaire se ferme, aucune fiche ne s’ouvre');
  nav.onLine = true;
  await transport.replay(MERCHANT, true);
  assert.equal(countRequests(), before + 1, 'retour du réseau : la demande gardée est écrite une fois');
  await transport.replay(MERCHANT, true);
  assert.equal(countRequests(), before + 1, 'un second rejeu n’écrit rien de plus');
}
console.log(`  ✓ économat · envoi d’une demande : en ligne envoyée et ouverte, hors ligne gardée puis écrite une fois`);
process.exit(0);
