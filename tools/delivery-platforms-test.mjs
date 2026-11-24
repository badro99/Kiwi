#!/usr/bin/env node
/* Plateformes de livraison (Glovo, Kooul, Yassir, livraison maison).
 *
 * What this guards:
 *  1. The public /api/menu never carries a platform price: OrderPro reads the
 *     restaurant's own carte and dine-in prices, nothing else.
 *  2. KiwiDelivery: off by default (existing stores unchanged), bulkFill fills
 *     empty prices only, merge keeps the newest entry per item.
 *  3. Commissions: a per-order fee is added on top of the % for that channel.
 *  4. cleanDelivery: the server keeps letters-only ids and a clean ref.
 *  5. The Z: a sale paid by the platform is neither cash nor card.
 *  6. The till lazy-loads assets/delivery.js on the same stamp the dashboard
 *     ships (bump-stamp does not see the string inside caisse/delivery.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { fails++; console.log('  ✗ ' + msg); } };

console.log('delivery-platforms-test');

/* 1 ── public menu */
const { sanitizeMenu } = await import(path.join(ROOT, 'functions/api/menu.js'));
const raw = {
  categories: [{ id: 'c1', name: 'Plats' }],
  items: [{ id: 'i1', cat: 'c1', name: 'Tajine', price: 80, prices: { glovo: 99 }, delivery: { glovo: 99 }, platformPrices: { yassir: 95 } }],
};
const pub = JSON.stringify(sanitizeMenu(raw));
ok(!/glovo|yassir|kooul|platformPrices/.test(pub), 'sanitizeMenu drops every platform price');
ok(/80/.test(pub), 'sanitizeMenu keeps the dine-in price');

/* 2 ── KiwiDelivery */
const ctx = { window: {}, console, Date, Math, JSON, Object, Array, String, Number, Set, Map };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/delivery.js'), 'utf8'), ctx);
const D = ctx.window.KiwiDelivery;
ok(!!D, 'KiwiDelivery loads');
ok(D.enabled() === false && D.options().length === 0, 'off by default: an existing store sees nothing');
const items = [{ id: 'a', price: 100 }, { id: 'b', price: 50 }, { id: 'c', price: null }, { id: 'd', price: 20, archived: true }];
ok(D.bulkFill('glovo', 20, items, false) === 2, 'bulkFill prices only sellable items');
ok(D.priceOf('a', 'glovo') === 120 && D.priceOf('b', 'glovo') === 60, 'bulkFill applies the percentage');
D.setItemPrices('a', { glovo: 111 });
ok(D.bulkFill('glovo', 50, items, false) === 0 && D.priceOf('a', 'glovo') === 111, 'bulkFill never overwrites a hand-set price');
ok(D.priceOf('a', 'yassir') == null, 'an empty platform price means not sold there');
const older = D.blank(); older.prices = { a: { by: { glovo: 1 }, at: 1 } };
const newer = D.blank(); newer.prices = { a: { by: { glovo: 2 }, at: 2 } };
ok(D.merge(older, newer).prices.a.by.glovo === 2 && D.merge(newer, older).prices.a.by.glovo === 2, 'merge keeps the newest price per item');
ok(D.isChannel('glovo') && D.isChannel('livraison') && !D.isChannel('takeaway'), 'isChannel knows the delivery channels');

/* 3 ── commissions */
const E = require(path.join(ROOT, 'assets/charges-engine.js'));
const cdoc = E.normalize({ commissions: { channels: { glovo: 25 }, fees: { glovo: 5 } } });
const com = E.commissionOf(cdoc, { amount: 100, method: 'platform', channel: 'glovo' });
ok(Math.abs(com.channel - 30) < 1e-9, 'commission = 25 % + 5 MAD per order');
ok(com.method === 0, 'the platform method itself carries no card fee');
ok(E.commissionOf(cdoc, { amount: 100, method: 'cash', channel: 'takeaway' }).channel === 0, 'a counter sale pays no platform commission');

/* 4 ── server delivery tag */
const { cleanDelivery } = await import(path.join(ROOT, 'functions/api/order/_queue-create.js'));
ok(JSON.stringify(cleanDelivery({ id: 'Glovo', ref: 'a3f9<x>!', name: 'Glovo<script>' })) === JSON.stringify({ id: 'glovo', ref: 'A3F9X', name: 'Glovoscript' }), 'cleanDelivery normalises id, ref and name');
ok(cleanDelivery({ id: 'gl0vo' }) === null && cleanDelivery(null) === null, 'cleanDelivery refuses a non-letter id');

/* 5 ── the Z */
const { ledgerFigures } = await import(path.join(ROOT, 'functions/api/_rules-day-report.js'));
const t = new Date();
const f = ledgerFigures([
  { amount: 100, method: 'cash', time: t },
  { amount: 50, method: 'card', time: t },
  { amount: 131, method: 'platform', channel: 'glovo', time: t },
], [], undefined);
const flat = JSON.stringify(f);
ok(/"revenue":281/.test(flat), 'a platform sale counts in revenue');
ok(/"card":50\b/.test(flat) && /"cash":100\b/.test(flat), 'a platform sale is neither cash nor card');

/* 6 ── lazy-load stamp */
const dash = fs.readFileSync(path.join(ROOT, 'assets/pages/dashboard-startup.js'), 'utf8').match(/assets\/delivery\.js\?v=(\d+)/);
const till = fs.readFileSync(path.join(ROOT, 'assets/caisse/delivery.js'), 'utf8').match(/assets\/delivery\.js\?v=(\d+)/);
ok(dash && till && dash[1] === till[1], 'caisse/delivery.js lazy-loads assets/delivery.js on the dashboard stamp (move both together)');

if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nall green');
