import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
function ok(value, message) {
  if (!value) throw new Error(`✗ ${message}`);
  checks += 1;
  console.log(`  ✓ ${message}`);
}

const merchant = 'amira-history-test';
const storage = new Map([['kiwiLive', '1'], ['kiwiLiveMerchant', merchant]]);
const localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const stores = {};
function define(name, options) {
  const store = stores[name] || { data: {}, listeners: [] };
  store.get = (key) => store.data[key] || (options.blank ? options.blank() : null);
  store.set = (value, key) => { store.data[key] = value; store.listeners.forEach((fn) => fn(key)); };
  store.subscribe = (fn) => { store.listeners.push(fn); return () => {}; };
  stores[name] = store;
  return store;
}

let purchaseAttempts = 0;
let profileWrites = 0;
const fetch = async (_url, options = {}) => {
  const payload = JSON.parse(options.body || '{}');
  if (payload.purchase) {
    purchaseAttempts += 1;
    return { ok: purchaseAttempts > 1, status: purchaseAttempts > 1 ? 200 : 404 };
  }
  if (payload.id) { profileWrites += 1; return { ok: true, status: 200 }; }
  return { ok: true, status: 200, json: async () => ({ clients: [], cursor: 0 }) };
};
const window = {
  localStorage,
  KiwiStore: { define, currentVenue: () => merchant },
  KiwiEnv: { isReal: () => true },
  addEventListener: () => {},
};
const context = { window, localStorage, KiwiStore: window.KiwiStore, KiwiEnv: window.KiwiEnv,
  fetch, console, JSON, Math, Date, Promise, setInterval: () => 1, clearInterval: () => {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/clients-store.js'), 'utf8'), context,
  { filename: 'assets/clients-store.js' });

const client = window.KiwiClients.upsert({ name: 'Amira Test', phone: '0611111111' }, merchant);
const sale = { amount: 245, saleRef: '2001', saleId: 'sale-stable-2001', eventRef: 'sale-stable-2001',
  method: 'carte', createdAt: 123456, items: [{ name: 'Vase', qty: 1, total: 245 }] };
window.KiwiClients.recordPurchase(client.id, sale, merchant);
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

ok(profileWrites >= 2, 'a purchase rejected before client creation writes the exact profile first');
ok(purchaseAttempts === 2, 'the same purchase is retried once after the client profile exists');
ok(JSON.parse(storage.get(`kiwi:clients-purchases:v1:${merchant}`) || '[]').length === 0,
  'the acknowledged purchase leaves no stuck local event');

const beforeReplay = window.KiwiClients.get(client.id, merchant);
window.KiwiClients.recordPurchase(client.id, sale, merchant);
await new Promise((resolve) => setTimeout(resolve, 0));
const afterReplay = window.KiwiClients.get(client.id, merchant);
ok(afterReplay.visits === beforeReplay.visits && afterReplay.spend === beforeReplay.spend,
  'replaying the same sale does not add a second visit or a second spend');
ok(afterReplay.history.length === 1 && afterReplay.history[0].ref === '2001',
  'the local client fiche keeps one detailed ticket row');

const caisse = fs.readFileSync(path.join(ROOT, 'assets/pos-maison.js'), 'utf8');
ok(caisse.includes('const syncedRefs = new Set') && caisse.includes('const spent = c.spent || 0'),
  'the caisse fiche deduplicates synced tickets and uses the canonical spend total');
ok(caisse.includes('eventRef: sale.syncId'), 'checkout binds client history to the sale UUID');

console.log(`\n✓ ${checks} Maison client-history checks passed`);
