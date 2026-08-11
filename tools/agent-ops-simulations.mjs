#!/usr/bin/env node
/* Kiwi AI · 40-scenario operational awareness release gate. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets', 'agent-truth.js'), 'utf8');
const mem = {
  'kiwiPlanDeSalle:venue-1': JSON.stringify({ tables: [
    { id: 'T1', status: 'free' }, { id: 'T2', status: 'occupied' },
    { id: 'T3', status: 'reserved', reservationName: 'Sara' }, { id: 'T4', status: 'bill' },
  ] }),
};
const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const window = {
  __kiwiRole: 'manager',
  KiwiFeatureGuide: { trade: () => 'pressing', features: () => [
    { key: 'inventory', nav: 'inventory', label: { fr: 'Inventaire' } },
    { key: 'pressing-orders', nav: 'pressing-orders', label: { fr: 'Commandes' } },
    { key: 'receipts', nav: 'terminaux', label: { fr: 'Reçus' } },
  ] },
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'venue-1', name: 'Pressing Audit', subtype: 'pressing' }), getPlan: () => 'ultra', getSubtypeProfile: () => ({ items: [{ nav: 'pressing-orders' }] }) },
  KiwiInventory: { snapshot: () => ({ 'shirt||principal': 12, 'coat||principal': 0, 'soap||principal': -1 }), pending: () => 2, add: (m) => m },
  KiwiPressingOps: { summary: () => ({ active: 8, ready: 3, late: 2, due: 269, pieces: 19, unnotified: 1 }) },
  KiwiOrderInbox: { orders: () => ({ a: { status: 'pending' }, b: { status: 'accepted' }, c: { status: 'ready' } }), setStatus: (id, status) => Promise.resolve({ ok: true, id, status }) },
  KiwiReceipt: { business: () => ({ name: 'Audit' }), missing: () => ['ice'], isComplete: () => false, isConfigured: () => true, syncRefused: () => '' },
  KiwiPrinter: { getConfig: () => ({ osPrinter: true }), isConfigured: () => true, isConnected: () => true, btConnected: () => false, usbConnected: () => false },
  Kiwi: { handlers: {} },
};
window.window = window;
const context = { window, localStorage: storage, console, Date, Math, JSON, Object, Array, String, Number, isFinite };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'agent-truth.js' });
const Ops = window.KiwiAgentOps, Truth = window.KiwiFeatureTruth;
let failed = 0;
function check(name, ok, detail = '') { if (!ok) { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } else console.log('  ✓ ' + name); }
function run(name, q, sourceName) { const r = Ops.reply(q, { lang: /[\u0600-\u06ff]/.test(q) ? 'ar' : /\b(?:how|is|status|today|ready|connected)\b/i.test(q) ? 'en' : 'fr' }); check(name, !!r && r.meta === 'Source · ' + sourceName && /Lecture seule|Read-only|قراءة فقط/.test(r.note || ''), r && JSON.stringify(r)); }

console.log('\n■ Inventory · 5');
run('FR inventory status', 'Quel est l’état du stock maintenant ?', 'inventory-ledger');
run('FR out-of-stock status', 'Combien de produits sont en rupture de stock ?', 'inventory-ledger');
run('EN inventory status', 'What is the inventory status now?', 'inventory-ledger');
run('EN pending inventory sync', 'How many inventory movements are pending now?', 'inventory-ledger');
run('AR inventory status', 'ما حالة المخزون الآن؟', 'inventory-ledger');

console.log('\n■ Pressing · 5');
run('FR ready pressing orders', 'Combien de commandes pressing sont prêtes maintenant ?', 'pressing-ops');
run('FR late pressing orders', 'Quelles commandes pressing sont en retard aujourd’hui ?', 'pressing-ops');
run('EN pressing workload', 'How many pressing orders are ready or late today?', 'pressing-ops');
run('FR workshop status', 'Quel est l’état de l’atelier pressing maintenant ?', 'pressing-ops');
run('AR pressing status', 'كم طلب مصبنة جاهز الآن؟', 'pressing-ops');

console.log('\n■ Tables · 5');
run('FR free tables', 'Combien de tables sont libres maintenant ?', 'floorplan');
run('FR occupied tables', 'Quel est l’état des tables occupées ?', 'floorplan');
run('EN floor status', 'How many tables are occupied now?', 'floorplan');
run('EN terrace status', 'What is the terrace table status now?', 'floorplan');
run('AR table status', 'كم طاولة حرة الآن؟', 'floorplan');

console.log('\n■ KDS · 5');
run('FR KDS pending', 'Combien de commandes KDS sont en attente ?', 'order-inbox');
run('FR kitchen status', 'Quel est l’état de la cuisine maintenant ?', 'order-inbox');
run('EN KDS ready', 'How many KDS orders are ready now?', 'order-inbox');
run('EN kitchen queue', 'What is the kitchen production status today?', 'order-inbox');
run('FR production queue', 'Combien de bons de production sont en cours au KDS ?', 'order-inbox');

console.log('\n■ Reservations · 5');
run('FR reservation count', 'Combien de réservations aujourd’hui ?', 'floorplan-reservations');
run('FR reservation status', 'Quel est l’état des réservations maintenant ?', 'floorplan-reservations');
run('EN bookings today', 'How many bookings are there today?', 'floorplan-reservations');
run('EN reservation availability', 'Are reservations available now?', 'floorplan-reservations');
run('AR reservation count', 'كم حجز اليوم؟', 'floorplan-reservations');

console.log('\n■ Receipts · 5');
run('FR receipt config', 'Le reçu est-il configuré maintenant ?', 'receipt');
run('FR legal receipt status', 'Quel est le statut des mentions du ticket ?', 'receipt');
run('EN receipt config', 'Is the receipt configured now?', 'receipt');
run('EN receipt sync', 'What is the receipt sync status?', 'receipt');
run('AR receipt config', 'هل الوصل جاهز الآن؟', 'receipt');

console.log('\n■ Printer · 5');
run('FR printer connected', 'L’imprimante est-elle connectée maintenant ?', 'printer');
run('FR printer status', 'Quel est l’état de l’imprimante ?', 'printer');
run('EN printer connected', 'Is the printer connected now?', 'printer');
run('EN printer config', 'Is the printer configured and available?', 'printer');
run('AR printer connected', 'هل الطابعة متصلة الآن؟', 'printer');

console.log('\n■ Context, permissions and guarded actions · 5');
const c = Truth.context();
check('context carries active merchant type and plan', c.venue.trade === 'pressing' && c.plan === 'ultra');
check('context carries role and read-only mode', c.role === 'manager' && c.assistantAccess === 'read-only');
const availability = window.KiwiAgentActions.availability();
check('only real action transports are enabled', availability.stockAdjust.available && availability.orderStatus.available && !availability.reprint.available && !availability.customerMessage.available);
const request = window.KiwiAgentActions.request('stock-adjust', { itemId: 'shirt', qty: 2, commandId: 'sim-40', reason: 'count' });
check('write requires explicit confirmation', request.ok && request.confirmationRequired && !!request.token);
const first = window.KiwiAgentActions.confirm(request.token), second = window.KiwiAgentActions.confirm(request.token);
const orderRequest = window.KiwiAgentActions.request('order-status', { orderId: 'ord-abc12345', status: 'ready', commandId: 'order-40' });
const orderFirst = await window.KiwiAgentActions.confirm(orderRequest.token), orderSecond = await window.KiwiAgentActions.confirm(orderRequest.token);
check('confirmed stock and order actions are idempotent', first.ok && second.ok && first.id === second.id && /sim-40$/.test(first.id) && orderFirst.ok && orderSecond.ok && orderFirst.status === orderSecond.status);

console.log(`\n${40 - failed}/40 simulations passed`);
process.exitCode = failed ? 1 : 0;
