#!/usr/bin/env node
/* A refused first write must not create a usable local venue. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
let count = 0;
function ok(value, label) { if (!value) throw new Error(label); count++; }
const cache = new Map();
const storage = {
  getItem: (key) => cache.get(key) ?? null,
  setItem: (key, value) => cache.set(key, String(value)),
  removeItem: (key) => cache.delete(key),
};
const node = () => ({ classList: { add() {}, remove() {}, contains: () => false }, style: {},
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const document = { readyState: 'complete', body: node(), documentElement: node(),
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], createElement: node };
const window = { document, localStorage: storage,
  location: { pathname: '/offline', search: '', hostname: 'localhost' },
  addEventListener() {}, dispatchEvent() {} };
window.window = window;
vm.runInNewContext(read('assets/venues.js'), {
  window, document, localStorage: storage, location: window.location,
  console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
  setTimeout: () => 0, setInterval: () => 0, clearTimeout() {},
});
window.KiwiMe = { business: 'Test Hotel' };
const cfg = { name: 'Test Hotel', type: 'hotel', subtype: 'hotel', location: 'Tanger',
  pins: [{ role: 'owner', code: '2468', name: 'Fixture' }] };
const saved = () => JSON.parse(storage.getItem('kiwiCustomVenues') || '[]');

let resolve;
let sent;
window.KiwiConfig = { newStore(opts) { sent = opts; return new Promise((r) => { resolve = r; }); } };
const refused = window.KiwiVenue.createVenue(cfg);
ok(saved().length === 0, 'no local venue before registration response');
resolve(false);
ok(await refused === null && saved().length === 0, '403/network refusal leaves no ghost');

const accepted = window.KiwiVenue.createVenue(cfg);
ok(saved().length === 0, 'second attempt still waits for ACK');
ok(sent.name === cfg.name && sent.type === cfg.subtype && sent.city === cfg.location
  && sent.pins === cfg.pins, 'first request carries correct store identity, city, type and PINs');
resolve(true);
const id = await accepted;
ok(!!id && saved().length === 1 && saved()[0].id === id && saved()[0].location === 'Tanger',
  'one real venue persisted after ACK');

const merchantConfig = read('assets/merchant-config.js');
const onboarding = read('assets/onboarding.js');
const server = read('functions/api/config.js');
const me = read('functions/api/me.js');
const dates = read('assets/dateRange.js');
const identity = read('assets/identity.js');
ok(!/payload\.name = name; freshAdd\(slug\)/.test(merchantConfig),
  'refused creation does not queue a fresh ghost for later sync');
ok(/await KiwiVenue\.createVenue\(/.test(onboarding)
  && !/KiwiConfig\.syncPins\(validPins\)/.test(onboarding),
  'onboarding awaits creation and does not race an old-store PIN write');
ok(/account_id = \? AND \(city IS NULL OR TRIM\(city\) = ''\)/.test(server)
  && /city: String\(r\.city \|\| ''\)/.test(me),
  'city write stays on claimed row and is present in fresh-device response');
ok(/TYPE_BASES\.indexOf\(ownType\) >= 0 \? ownType : ''/.test(read('assets/venues.js'))
  && /activeVenue\?\.id === 'own' && !activeVenue\.type/.test(dates),
  'fresh device holds a neutral workspace until its true business type arrives');
ok(/me\.onboarded === true && Array\.isArray\(me\.stores\)/.test(identity),
  'a prepared or partial registry row cannot be adopted before onboarding finishes');
console.log(`✓ ${count} store-creation ACK checks`);
