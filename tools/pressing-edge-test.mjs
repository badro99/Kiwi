import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const phoneSource = fs.readFileSync(new URL('../assets/phone.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../assets/pressing-caisse.js', import.meta.url), 'utf8');
let registered = null;
const local = new Map();
const fixtureServices = ['sec', 'lavage', 'repassage', 'detache', 'retouche'].map((id) => ({ id, code: id.toUpperCase(), short: id, label: id }));
const fixtureIds = ['chemise', 'tshirt', 'pull', 'veste', 'costume', 'manteau', 'pantalon', 'jean', 'jupe', 'short', 'robe', 'robe_soiree', 'caftan', 'drap', 'housse', 'couverture', 'nappe', 'rideaux', 'tapis', 'veste_cuir', 'daim', 'doudoune', 'chaussures', 'baskets', 'babouches'];
const fixtureItems = fixtureIds.map((id) => ({
  id, label: id, cat: 'test', prices: { sec: 25, lavage: 18, repassage: 10, detache: 30, retouche: 35 },
  ...(id === 'costume' ? { variants: [{ id: '2p', prices: { sec: 25, repassage: 10 }, pieces: ['veste', 'pantalon'] }, { id: '3p', prices: { sec: 35, repassage: 15 }, pieces: ['veste', 'pantalon', 'gilet'] }] } : {}),
}));
const context = {
  console,
  setTimeout: () => 1,
  clearTimeout: () => {},
  requestAnimationFrame: () => 1,
  localStorage: {
    getItem: (key) => local.get(key) || null,
    setItem: (key, value) => local.set(key, String(value)),
    removeItem: (key) => local.delete(key),
  },
  navigator: { onLine: true },
  Event: class { constructor(type) { this.type = type; } },
  document: { addEventListener: () => {} },
  window: {
    addEventListener: () => {},
    KiwiPosDispatch: {
      register: (spec) => { registered = spec; },
      unlockById: () => {},
      lock: () => {},
    },
    KiwiPressingCatalog: {
      read: () => ({ services: fixtureServices, categories: [{ id: 'test', label: 'Test' }], items: fixtureItems }),
    },
    /* Les créneaux suivent le fuseau du magasin. Ici le magasin est déclaré
       dans le fuseau de la machine, pour que les dates construites en heure
       locale ci-dessous soient des heures du magasin. */
    KiwiConfig: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  },
};
context.window.window = context.window;
context.window.localStorage = context.localStorage;
context.window.navigator = context.navigator;
context.window.document = context.document;
vm.createContext(context);
vm.runInContext(phoneSource, context, { filename: 'phone.js' });
vm.runInContext(source, context, { filename: 'pressing-caisse.js' });

assert.equal(registered?.id, 'pressing', 'pressing module still registers');
const rules = context.window.KiwiPressing.rules;
assert.ok(rules, 'operational rules are exposed for focused regression tests');

const validPhones = new Map([
  ['0612345678', '06 12 34 56 78'],
  ['06 12 34 56 78', '06 12 34 56 78'],
  ['+212 6 12 34 56 78', '06 12 34 56 78'],
  ['00212-7-12-34-56-78', '07 12 34 56 78'],
  ['212539334455', '05 39 33 44 55'],
  ['612345678', '06 12 34 56 78'],
]);
for (const [input, expected] of validPhones) {
  assert.equal(rules.normalizePhone(input), expected, `normalizes ${input}`);
}
const internationalPhones = new Map([
  ['+49 179 5241112', '+491795241112'],
  ['0044 7700 900123', '+447700900123'],
  ['+33 (0) 6 12 34 56 78', '+33612345678'],
  ['+1-202-555-0123', '+12025550123'],
]);
for (const [input, expected] of internationalPhones) {
  assert.equal(rules.normalizePhone(input), expected, `accepts tourist number ${input}`);
}
for (const input of ['', '1234', '33 6 12 34 56 78', '0812345678', '06ABC345678', '061234567890', '+012345678', '+49+1795241112', '+1234567890123456']) {
  assert.equal(rules.normalizePhone(input), '', `rejects ${input || 'empty phone'}`);
}
assert.equal(rules.whatsappPhone('+212 6 12 34 56 78'), '212612345678');
assert.equal(rules.whatsappPhone('+49 179 5241112'), '491795241112', 'foreign WhatsApp target keeps country code');
assert.equal(rules.normalizeMoroccanPhone('+49 179 5241112'), '+491795241112', 'legacy normalizer remains compatible');

assert.equal(rules.validDeposit(10, 10), true, '10 MAD minimum is accepted');
assert.equal(rules.validDeposit(10, 100), true);
assert.equal(rules.validDeposit(100, 100), true, 'deposit may equal total');
assert.equal(rules.validDeposit(9, 100), false, 'deposit below 10 is rejected');
assert.equal(rules.validDeposit(101, 100), false, 'deposit above total is rejected');
assert.equal(rules.validDeposit(Number.NaN, 100), false);

assert.equal(rules.maxQty, 99);
assert.equal(rules.clampQty(1000000), 99, 'extreme quantity is capped');
assert.equal(rules.clampQty(-4), 1, 'negative quantity is repaired');
assert.equal(rules.clampQty(7.9), 7, 'quantity is integral');

const now = Date.now();
assert.equal(rules.validReady(new Date(now + 60000), now), true);
assert.equal(rules.validReady(new Date(now - 1), now), false, 'past promise is rejected');
assert.equal(rules.validReady(new Date('invalid'), now), false);

const morning = new Date(2026, 7, 10, 12, 59, 59);
const morningSlots = rules.readyOptions(morning);
assert.deepEqual(Array.from(morningSlots, (slot) => slot.key), ['today-evening', 'next-noon', 'next-evening'], 'morning offers same-day express and both next-day choices');
assert.equal(morningSlots[0].label, "Aujourd'hui · 18:00");
assert.equal(morningSlots[1].label, 'Demain · 12:00');
assert.equal(morningSlots[2].label, 'Demain · 18:00');
assert.equal(rules.suggestReady(morning).getTime(), morningSlots[2].d.getTime(), 'standard next-day evening is the safe default');

const cutoff = new Date(2026, 7, 10, 13, 0, 0);
const afternoonSlots = rules.readyOptions(cutoff);
assert.deepEqual(Array.from(afternoonSlots, (slot) => slot.key), ['next-noon', 'next-evening', 'following-noon'], 'at 13:00 same-day disappears and following noon replaces it');
assert.equal(afternoonSlots[0].label, 'Demain · 12:00');
assert.equal(afternoonSlots[1].label, 'Demain · 18:00');
assert.equal(afternoonSlots[2].label, 'Après-demain · 12:00');

const saturdayAfternoon = new Date(2026, 7, 15, 14, 0, 0);
const weekendSlots = rules.readyOptions(saturdayAfternoon);
assert.equal(weekendSlots[0].d.getDay(), 1, 'Sunday is skipped for the first service day');
assert.equal(weekendSlots[0].label, 'Après-demain · 12:00', 'weekend label reflects the real Monday date');
assert.equal(weekendSlots[2].d.getDay(), 2, 'following service day continues to Tuesday');

assert.equal(rules.normalizeOrderNo('P-1053'), '1053', 'normalizes alphanumeric code to 4 digits');
assert.equal(rules.normalizeOrderNo('45'), '0045', 'pads short numbers to 4 digits');
assert.equal(rules.normalizeOrderNo(''), '', 'handles empty input');
assert.equal(rules.publicOrderNo({ id: 'P-1053-A9', displayNo: '1053' }), '1053');
assert.equal(rules.publicPieceNo({ id: 'P-1053', displayNo: '1053' }, { n: 2 }), '1053-2');

assert.equal(rules.findScannedOrder('P-1037')?.id, '1037', 'order barcode resolves exact order');
assert.equal(rules.findScannedOrder('*p-1037-1*')?.id, '1037', 'garment barcode resolves its order');
assert.equal(rules.findScannedOrder('1037')?.id, '1037', '4-digit public order code resolves order');
assert.equal(rules.findScannedOrder('1037-1')?.id, '1037', '4-digit public piece code resolves order');
assert.equal(rules.findScannedOrder('unknown'), null, 'unknown scan never selects a fallback order');
const code39 = rules.barcode('1037-1', 22);
assert.match(code39, /^<svg /);
assert.ok((code39.match(/<rect /g) || []).length > 20, 'label contains real Code 39 bars');

assert.match(source, /const paymentCommits = new Set\(\)/, 'payment commits have a shared idempotency guard');
assert.match(source, /if \(committed \|\| paymentCommits\.has\(commitKey\)\) return false/, 'rapid duplicate commits are refused atomically');
assert.match(source, /try \{\s*authorization = hw\.authorizeCard/, 'synchronous reader failures are handled without leaving payment pending');
assert.match(source, /navigator\.mediaDevices\?\.getUserMedia/, 'scanner uses real camera capability detection');
assert.match(source, /new window\.BarcodeDetector/, 'scanner uses BarcodeDetector when supported');
assert.doesNotMatch(source, /state\.offline\s*=\s*!state\.offline/, 'network status cannot be manually faked');
assert.doesNotMatch(source, /action.*synchronis[ée]/i, 'UI does not claim unconfirmed synchronization success');

/* Numérotation d'une vraie caisse : en ligne le serveur confirme un numéro à
   quatre chiffres (un 409 fait fusionner puis prendre le suivant) ; sans
   confirmation, le bon prend la lettre de la caisse. */
const tillStore = new Map();
const pushes = [];
let replies = [];
const tillWindow = {
  addEventListener: () => {},
  KiwiPosDispatch: { register: () => {}, unlockById: () => {}, lock: () => {} },
  KiwiPressingCatalog: context.window.KiwiPressingCatalog,
  KiwiConfig: context.window.KiwiConfig,
  KiwiEnv: { isReal: () => true },
  KiwiPlatform: { isPaired: () => true, pairedVenue: () => ({ merchant: 'press-a', name: 'Pressing A' }) },
  KiwiCaissePairing: { terminalId: () => 'term_0123456789abcdef' },
  KiwiCloudDoc: { attach: () => ({ bind: () => Promise.resolve(false), push: () => {}, pull: () => Promise.resolve(false),
    pushNow: (o) => { pushes.push(JSON.parse(JSON.stringify(o.data))); return Promise.resolve(replies.shift() || { ok: false, status: 0, offline: true }); } }) },
};
const tillContext = {
  ...context, window: tillWindow, navigator: { onLine: true },
  localStorage: { getItem: (k) => (tillStore.has(k) ? tillStore.get(k) : null), setItem: (k, v) => tillStore.set(k, String(v)), removeItem: (k) => tillStore.delete(k) },
};
tillContext.KiwiCloudDoc = tillWindow.KiwiCloudDoc;   /* dans un navigateur, window est l'objet global */
tillWindow.window = tillWindow; tillWindow.localStorage = tillContext.localStorage; tillWindow.navigator = tillContext.navigator; tillWindow.document = context.document;
vm.createContext(tillContext);
vm.runInContext(phoneSource, tillContext, { filename: 'phone.js' });
vm.runInContext(source, tillContext, { filename: 'pressing-caisse.js' });
const till = tillWindow.KiwiPressing.rules;
replies = [{ ok: true, status: 200, rev: 2 }];
const first = await till.allocateTicketNo();
assert.equal(first, '0001', 'online confirmed number keeps the plain four digits');
assert.equal(pushes[0].seq, 2, 'the confirming push reserves the number by moving the shared counter past it');
const myKey = Object.keys(pushes[0].tills)[0];
assert.equal(pushes[0].tills[myKey].letter, 'A', 'the till claims the first free letter with its confirming push');
assert.ok(!JSON.stringify(pushes[0].tills).includes('0123456789abcdef'), 'the shared registry never carries the raw device id');
const server = { customers: [], orders: [{ id: '0002', displayNo: '0002', lines: [{ itemId: 'chemise', services: ['sec'], qty: 1, unitPrice: 25 }], pieces: [{ pid: '0002-1', status: 'recu' }], droppedAt: '2026-10-22T09:00:00.000Z', readyAt: '2026-10-23T18:00:00.000Z', pay: { mode: 'pickup', paid: 0 }, updatedAt: 5 }], cancellations: [], seq: 3, tills: { ...pushes[0].tills, dother0000001: { letter: 'B', at: 9 } } };
replies = [{ ok: false, status: 409, error: 'stale', rev: 3, data: server }, { ok: true, status: 200, rev: 4 }];
const second = await till.allocateTicketNo();
assert.equal(second, '0003', 'a till that lost the race merges the server copy and takes the next free number');
assert.equal(pushes.at(-1).seq, 4);
replies = [{ ok: false, status: 0, offline: true }];
assert.equal(await till.allocateTicketNo(), '0004-A', 'without a server answer the ticket carries the confirmed letter of this till');
tillContext.navigator.onLine = false;
const before = pushes.length;
assert.equal(await till.allocateTicketNo(), '0004-A', 'offline the till does not wait for the network');
assert.equal(pushes.length, before, 'offline numbering sends nothing');

console.log(`✓ pressing edges (${validPhones.size + internationalPhones.size + 52} controls)`);
