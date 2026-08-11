#!/usr/bin/env node
/* Kiwi AI · 10/10 release scorecard.
 *
 * A score is earned only when its product-level gate is green. This is not a
 * subjective claim that an assistant can never improve; it is a reproducible
 * release contract covering the ten capabilities Kiwi promises today. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets', 'agent-truth.js'), 'utf8');
const outcomes = [];
const score = (name, checks) => {
  const failed = checks.filter((x) => !x[1]);
  outcomes.push({ name, value: failed.length ? 0 : 10, failed });
};
const suite = (name) => spawnSync(process.execPath, [path.join(ROOT, 'tools', name)], { encoding: 'utf8' });

const featureSuite = suite('agent-features-test.mjs');
const opsSuite = suite('agent-ops-simulations.mjs');
const financeSuite = suite('agent-test.js');

const memory = {
  'kiwiPlanDeSalle:venue-score': JSON.stringify({ tables: [
    { id: 'A1', status: 'free' },
    { id: 'A2', status: 'occupied' },
    { id: 'A3', status: 'reserved', reservationName: 'Client', reservationDate: '2099-01-01', reservationTime: '19:00' },
  ] }),
};
const localStorage = {
  getItem: (k) => memory[k] ?? null,
  setItem: (k, v) => { memory[k] = String(v); },
};
const features = [
  { key: 'inventory', nav: 'inventory', label: { fr: 'Inventaire', en: 'Inventory', ar: 'المخزون' } },
  { key: 'payments', nav: 'reglements', label: { fr: 'Paiements', en: 'Payments', ar: 'الدفع' } },
  { key: 'receipts', nav: 'terminaux', label: { fr: 'Reçus', en: 'Receipts', ar: 'الوصولات' } },
  { key: 'team', nav: 'team', label: { fr: 'Équipe', en: 'Team', ar: 'الفريق' } },
  { key: 'pressing-orders', nav: 'pressing-orders', label: { fr: 'Commandes', en: 'Orders', ar: 'الطلبات' } },
];
let printed = 0;
const window = {
  __kiwiRole: 'manager', isSecureContext: true,
  KiwiFeatureGuide: { trade: () => 'pressing', features: () => features },
  KiwiVenue: {
    getCurrentVenueData: () => ({ id: 'venue-score', name: 'Pressing Score', subtype: 'pressing' }),
    getPlan: () => 'ultra',
    getSubtypeProfile: () => ({ items: features.map((x) => ({ nav: x.nav })) }),
  },
  Kiwi: { handlers: Object.fromEntries(features.map((x) => ['nav-' + x.nav, () => true])) },
  KiwiInventory: {
    snapshot: () => ({ 'shirt||main': 2, 'coat||main': 0 }), pending: () => 1,
    add: (m) => m,
  },
  KiwiBoutiqueCatalog: {
    listProducts: () => [{ id: 'shirt', name: 'Chemise', lowStock: 5 }, { id: 'coat', name: 'Manteau', lowStock: 2 }],
    productStock: (id) => id === 'shirt' ? 2 : 0,
  },
  KiwiPressingOps: { summary: () => ({ active: 4, received: 1, treating: 2, ready: 1, late: 1, due: 120 }) },
  KiwiOrderInbox: {
    orders: () => ({ a: { status: 'pending' }, b: { status: 'ready' } }),
    setStatus: (id, status) => Promise.resolve({ ok: true, id, status }),
  },
  KiwiReceipt: { business: () => ({ name: 'Pressing Score' }), missing: () => [], isComplete: () => true, isConfigured: () => true, syncRefused: () => '' },
  KiwiPrinter: { getConfig: () => ({ osPrinter: true }), isConfigured: () => true, isConnected: () => true, btConnected: () => false, usbConnected: () => false },
  KiwiPosReprint: {
    rows: () => [{ ref: 'R-100', ts: Date.now(), total: 50, lines: [{ name: 'Chemise', qty: 1, total: 50 }] }],
    reprint: () => { printed++; return Promise.resolve({ ok: true }); },
  },
  KiwiRetailScan: {},
  open: () => ({ closed: false }),
};
window.window = window;
const context = { window, localStorage, location: { protocol: 'https:' }, console, Date, Math, JSON, Object, Array, String, Number, isFinite, encodeURIComponent };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'agent-truth.js' });
const Truth = window.KiwiFeatureTruth, Ops = window.KiwiAgentOps, Actions = window.KiwiAgentActions;

score('Feature knowledge', [
  ['all 18 merchant profiles are covered', featureSuite.status === 0],
  ['feature truth has no failing control', !/✗/.test((featureSuite.stdout || '') + (featureSuite.stderr || ''))],
]);
score('Merchant-specific explanations', [
  ['deterministic explanations pass', featureSuite.status === 0],
  ['pressing, boutique and restaurant isolation is tested', /pressing exposes deposits/.test(featureSuite.stdout || '') && /restaurant exposes floor plan/.test(featureSuite.stdout || '')],
]);

const invReady = Truth.readiness('inventory', 'inventory');
const receiptReady = Truth.readiness('receipts', 'terminaux');
score('Guided onboarding', [
  ['question-led setup passes', featureSuite.status === 0 && /Question-led setup/.test(featureSuite.stdout || '')],
  ['readiness reads the real inventory', invReady.source === 'retail-catalog' && invReady.status === 'ready'],
  ['readiness validates receipt configuration', receiptReady.ready === true],
]);

const liveReads = ['inventory', 'pressing', 'tables', 'reservations', 'kds', 'receipt', 'printer'].map((x) => Truth.read(x));
score('Live operational awareness', [
  ['40 real-life simulations pass', opsSuite.status === 0],
  ['every promised adapter is live', liveReads.every((x) => x.available)],
  ['inventory names items needing attention', Truth.read('inventory').data.lowNames.includes('Chemise') && Truth.read('inventory').data.outNames.includes('Manteau')],
]);

score('Financial reasoning', [
  ['full arithmetic and routing suite passes', financeSuite.status === 0],
  ['all three languages pass 1106 routes', ((financeSuite.stdout || '').match(/1106\/1106 routes correct/g) || []).length === 3],
  ['invented-figure redaction passes', /Invented figures are removed/.test(financeSuite.stdout || '') && !/assistant gate: [1-9]/.test(financeSuite.stdout || '')],
]);

window.__kiwiRole = 'owner'; const owner = Truth.context();
window.__kiwiRole = 'manager'; const manager = Truth.context();
window.__kiwiRole = 'staff'; const staff = Truth.context();
const staffMessage = Actions.request('customer-message-draft', { phone: '+212600000000', text: 'Test', commandId: 'staff-denied' });
const perm = (ctx, key) => ctx.features.find((x) => x.key === key);
score('Permissions and tenant safety', [
  ['owner may configure active features', owner.features.every((x) => x.configurable)],
  ['manager cannot configure team, payments or legal receipts', ['team', 'payments', 'receipts'].every((k) => !perm(manager, k).configurable)],
  ['staff cannot configure merchant state', staff.features.every((x) => !x.configurable)],
  ['staff finance and team permissions are restricted', ['team', 'payments'].every((k) => perm(staff, k).permission === 'restricted')],
  ['staff cannot launch customer messages', staffMessage.ok === false && staffMessage.reason === 'read-only'],
  ['context remains bound to one venue', owner.venue.id === 'venue-score' && owner.venue.trade === 'pressing'],
]);
window.__kiwiRole = 'manager';

const en = Ops.reply('How many tables are occupied now?', { lang: 'en' });
const ar = Ops.reply('كم طاولة حرة الآن؟', { lang: 'ar' });
const fr = Ops.reply('Combien de tables sont libres maintenant ?', { lang: 'fr' });
score('French, English and Arabic', [
  ['French answer is fully French', fr.meta.startsWith('Source ·') && fr.stats.some((x) => x.l === 'Libres')],
  ['English answer contains no French labels', en.meta.startsWith('Source ·') && !en.stats.some((x) => /Libres|Occupées|Réservées/.test(x.l))],
  ['Arabic answer localises labels and source', ar.meta.startsWith('المصدر ·') && ar.stats.some((x) => x.l === 'حرة')],
]);

const stockRequest = Actions.request('stock-adjust', { itemId: 'shirt', qty: 1, reason: 'count', commandId: 'score-stock' });
const stockFirst = Actions.confirm(stockRequest.token); const stockReplay = Actions.confirm(stockRequest.token);
const orderRequest = Actions.request('order-status', { orderId: 'ord-score100', status: 'ready', commandId: 'score-order' });
const orderFirst = await Actions.confirm(orderRequest.token); const orderReplay = await Actions.confirm(orderRequest.token);
const printRequest = Actions.request('reprint', { vertical: 'pressing', ref: 'R-100', commandId: 'score-print' });
const printFirst = await Actions.confirm(printRequest.token); const printReplay = await Actions.confirm(printRequest.token);
const draftRequest = Actions.request('customer-message-draft', { phone: '+212600000000', text: 'Votre commande est prête.', commandId: 'score-draft' });
const draftFirst = Actions.confirm(draftRequest.token); const draftReplay = Actions.confirm(draftRequest.token);
score('Permission-safe actions', [
  ['stock writes require confirmation and deduplicate', stockRequest.confirmationRequired && stockFirst.ok && stockReplay.id === stockFirst.id],
  ['order status requires confirmation and deduplicates', orderRequest.confirmationRequired && orderFirst.ok && orderReplay.status === orderFirst.status],
  ['reprint verifies a real receipt and physical result', printFirst.ok && printFirst.physicalVerified && printReplay.ok && printed === 1],
  ['customer messaging opens a draft, never claims delivery', draftFirst.ok && draftFirst.sent === false && draftFirst.deliveryVerified === false && draftReplay.outcome === 'draft-opened'],
]);

const unavailableWindow = { ...window, KiwiPrinter: null };
unavailableWindow.window = unavailableWindow;
const unavailableContext = { ...context, window: unavailableWindow };
vm.createContext(unavailableContext);
vm.runInContext(source, unavailableContext, { filename: 'agent-truth-unavailable.js' });
score('Honesty and safe failure', [
  ['assistant responses are read-only by default', Truth.context().assistantAccess === 'read-only'],
  ['floor-plan reservations declare limited coverage', Truth.read('reservations').limited === true && Truth.read('reservations').coverage === 'floorplan-only'],
  ['missing hardware stays unavailable', unavailableWindow.KiwiFeatureTruth.read('printer').available === false],
  ['unknown actions are refused', Actions.request('invent-a-sale', { commandId: 'score-bad' }).reason === 'read-only'],
  ['reprint cannot cross merchant verticals', Actions.request('reprint', { vertical: 'boutique', ref: 'R-100', commandId: 'score-cross' }).reason === 'tenant-mismatch'],
  ['draft opening never marks a message sent', draftFirst.sent === false],
]);

const firstNine = outcomes.every((x) => x.value === 10);
score('Overall release gate', [
  ['all nine capability gates are perfect', firstNine],
  ['feature, operations and finance suites are green', featureSuite.status === 0 && opsSuite.status === 0 && financeSuite.status === 0],
]);

console.log('\nKiwi AI · release scorecard');
outcomes.forEach((x) => {
  console.log(`  ${x.value === 10 ? '✓' : '✗'} ${x.name}: ${x.value}/10`);
  x.failed.forEach((f) => console.log('      · ' + f[0]));
});
const failed = outcomes.filter((x) => x.value !== 10);
console.log(`\n${outcomes.length - failed.length}/${outcomes.length} categories at 10/10`);
process.exitCode = failed.length ? 1 : 0;
