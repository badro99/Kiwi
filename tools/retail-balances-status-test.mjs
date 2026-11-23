/* r21 boutiquetill#B0 : la liste des notes dit quand elle ne vient que de CET appareil (vrai retail-balances.js en vm). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';

const SRC = fs.readFileSync('assets/retail-balances.js', 'utf8');
const note = { id: 'n1', customerId: 'c1', ticketRef: 'T-1', totalCents: 5000, paidCents: 1000, pendingCents: 0, receipts: [] };
function boot({ online = true, fetch }) {
  const memory = new Map([['kiwi:retailBalances:shop', JSON.stringify([note])]]);
  const window = {};
  vm.runInNewContext(deadlineVmSource(SRC), deadlineVmContext({
    window, localStorage: { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) },
    navigator: { onLine: online }, Date, JSON, Math, Number, String, Array, Map, Set, Object, Promise,
    setTimeout, clearTimeout, fetch,
  }));
  return window.KiwiRetailBalances;
}
const remoteNote = { ...note, id: 'n2', ticketRef: 'T-2' };
let r = await boot({ fetch: async () => ({ ok: true, json: async () => ({ balances: [remoteNote] }) }) }).listWithStatus('shop', '');
assert.equal(r.status, 'ok'); assert.equal(r.rows.length, 2, 'serveur lu : notes locales + distantes');
r = await boot({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) }).listWithStatus('shop', '');
assert.equal(r.status, 'read-failed', 'refus serveur'); assert.equal(r.rows.length, 1, 'le journal local reste lisible');
r = await boot({ fetch: async () => { throw new Error('network'); } }).listWithStatus('shop', '');
assert.equal(r.status, 'read-failed', 'panne réseau');
r = await boot({ fetch: async () => ({ ok: true, json: async () => ({ oops: 1 }) }) }).listWithStatus('shop', '');
assert.equal(r.status, 'read-failed', '200 illisible n’est pas « aucune note distante »');
r = await boot({ online: false, fetch: async () => { throw new Error('must not be called'); } }).listWithStatus('shop', '');
assert.equal(r.status, 'offline');
/* Amira Boutique, 21 nov. 2026 : avance de 90 MAD, 50 versés. Le journal garde le reçu sous l'id de la caisse
   (« sale-<uuid> »), le serveur sous celui de la vente serveur (« sale-ref-<hash>-<32 derniers> »). Comparés tels
   quels, les 50 MAD comptaient deux fois et la note disparaissait d'Acomptes et de la fiche cliente. */
{
  const uuid = 'f7de8c6e-873f-40ff-900a-4ac1efa13449';
  const local = { id: 'rb-sale-' + uuid, customerId: 'c6', ticketRef: '32015', totalCents: 9000, paidCents: 5000, pendingCents: 0, kind: 'avance',
    receipts: [{ id: 'sale-' + uuid, amountCents: 5000, method: 'card', ts: 1 }] };
  const server = { ...local, receipts: undefined, paidCents: 5000, pendingCents: 0, receiptIds: ['sale-ref-a12a9292-' + uuid.slice(-32)] };
  assert.equal(server.receiptIds[0].slice(-32), ('sale-' + uuid).slice(-32), 'fixture : même fin de 32 caractères que le serveur');
  const memory = new Map([['kiwi:retailBalances:shop', JSON.stringify([local])]]);
  const window = {};
  vm.runInNewContext(deadlineVmSource(SRC), deadlineVmContext({
    window, localStorage: { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) },
    navigator: { onLine: true }, Date, JSON, Math, Number, String, Array, Map, Set, Object, Promise, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ balances: [server] }) }),
  }));
  const { rows } = await window.KiwiRetailBalances.listWithStatus('shop', '');
  assert.equal(rows.length, 1, 'l’avance reste dans la liste');
  assert.equal(window.KiwiRetailBalances.due(rows[0]), 4000, 'reste 40 MAD : le versement compte une seule fois');
  /* Un reçu vraiment pas encore arrivé au serveur compte toujours en attente. */
  memory.set('kiwi:retailBalances:shop', JSON.stringify([{ ...local, paidCents: 7000, receipts: [...local.receipts, { id: 'sale-0b1c2d3e-0000-4000-8000-123456789abc', amountCents: 2000, method: 'cash', ts: 2 }] }]));
  const again = await window.KiwiRetailBalances.listWithStatus('shop', '');
  assert.equal(window.KiwiRetailBalances.due(again.rows[0]), 2000, 'le second versement, inconnu du serveur, reste en attente');
}
/* Mabs Outfitters, 23 nov. 2026 : une note fermée côté serveur (avance expirée, nettoyage God mode, soldée
   sur une autre caisse) restait sur la caisse qui l'avait ouverte. Le serveur liste ces ids dans `settled`. */
r = await boot({ fetch: async () => ({ ok: true, json: async () => ({ balances: [], settled: ['n1'] }) }) }).listWithStatus('shop', '');
assert.equal(r.status, 'ok'); assert.equal(r.rows.length, 0, 'note réglée ailleurs : elle quitte Acomptes');
r = await boot({ fetch: async () => ({ ok: true, json: async () => ({ balances: [], settled: ['autre'] }) }) }).listWithStatus('shop', '');
assert.equal(r.rows.length, 1, 'une note locale que le serveur ne déclare pas réglée reste listée');
// list() garde sa forme pour les appelants existants.
const rows = await boot({ fetch: async () => { throw new Error('x'); } }).list('shop', '');
assert.ok(Array.isArray(rows) && rows.length === 1);
console.log('PASS retail balances: stale/read-failed/offline status, local journal still listed');
