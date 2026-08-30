#!/usr/bin/env node
/* Hospitality+ consolidation: one shared guest profile, dashboard ↔ caisse. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
const failed = [];
function ok(label, value) {
  if (value) { passed++; console.log('  ✓ ' + label); }
  else failed.push(label);
}

const venues = read('assets/venues.js');
const dashboard = read('assets/clients-directory.js');
const caisse = read('assets/clients-book.js');
const hotelPos = read('assets/pos-hotel.js');
ok('hotel sidebar no longer exposes the duplicate hotes entry', !/nav:\s*'hotes'/.test(venues));
ok('shared dashboard client entry is renamed Hospitality+ for hotels', venues.includes("crmLabel.textContent = 'Hospitality+'"));
ok('dashboard Hospitality+ renders identity and preference data', /documentNumber/.test(dashboard) && /roomPreferences/.test(dashboard) && /allergies/.test(dashboard));
ok('caisse Hospitality+ captures passport, room, food and allergy fields', /kcb-f-doc-number/.test(caisse) && /kcb-f-room/.test(caisse) && /kcb-f-food/.test(caisse) && /kcb-f-allergies/.test(caisse));
ok('hotel check-in writes into the same KiwiClients profile', /KiwiClients\.upsert/.test(hotelPos) && /source:\s*'hotel-checkin'/.test(hotelPos));

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(read('schema.sql'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  async first() { return sqlite.prepare(sql).get(...args) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } };
const secret = 'hospitality-plus-test-secret';
const now = Date.now();
sqlite.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-hotel', 'hotel@test.ma', 'Hotel Owner', 'Hotel Test', 's', 'h', now);
sqlite.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run('hotel-test', '{}', 'hotel', 'acc-hotel', 'Hotel Test', 'active', now);
const cookie = sessionCookie(await makeSession('acc-hotel', secret)).split(';')[0];
const env = { DB, AUTH_SECRET: secret };
const profile = {
  documentType: 'Passeport', documentNumber: 'MA123456', nationality: 'Marocaine',
  preferredLanguage: 'Français', roomPreferences: 'Étage calme · lit king',
  foodPreferences: 'Petit-déjeuner salé', allergies: 'Arachides', accessibilityNeeds: 'Douche accessible',
};
let response = await onRequestPost({
  env,
  request: new Request('https://kiwi.test/api/clients', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: 'hotel-test', id: 'guest-1', name: 'Amina Guest', updated: now, hospitality: profile }),
  }),
});
ok('hospitality profile is accepted by the shared client API', response.status === 200);
response = await onRequestGet({
  env,
  request: new Request('https://kiwi.test/api/clients?merchant=hotel-test&since=0', { headers: { Cookie: cookie } }),
});
const payload = await response.json();
const roundTrip = payload.clients && payload.clients[0] && JSON.parse(payload.clients[0].hospitality || '{}');
ok('passport and nationality survive dashboard/caisse cloud round-trip', roundTrip.documentNumber === profile.documentNumber && roundTrip.nationality === profile.nationality);
ok('room, food, allergy and accessibility preferences survive cloud round-trip', roundTrip.roomPreferences === profile.roomPreferences && roundTrip.foodPreferences === profile.foodPreferences && roundTrip.allergies === profile.allergies && roundTrip.accessibilityNeeds === profile.accessibilityNeeds);

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`\n✓ ${passed} Hospitality+ checks green`);
