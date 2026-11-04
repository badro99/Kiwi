#!/usr/bin/env node
/* Identity-document numbers stay where they are needed (council rating 14,
 * clients C1). A paired till used to receive every customer's passport or
 * CNIE number with the client book, in every vertical. Now:
 *   · a boutique till reads the client without the number;
 *   · the owner session of that boutique still reads it;
 *   · a hotel's reception till still reads it (check-in pre-fill);
 *   · a till that only saw the blanked copy cannot erase the stored number
 *     by writing the profile back, and can still change other fields.
 *   node tools/client-identity-redaction-test.mjs
 */
import coreTestSource from './core-test-source.cjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie, tillToken } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => coreTestSource.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
const failed = [];
const ok = (label, value) => { if (value) { passed++; console.log('  ✓ ' + label); } else { failed.push(label); console.log('  ✗ ' + label); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(read('schema.sql'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  async first() { return sqlite.prepare(sql).get(...args) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
}; }, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const secret = 'client-identity-redaction-secret';
const env = { DB, AUTH_SECRET: secret };
const now = Date.now();

for (const [acc, slug, type] of [['acc-shop', 'shop-test', 'boutique'], ['acc-hotel', 'hotel-test', 'hotel']]) {
  sqlite.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run(acc, `${acc}@test.ma`, 'Owner', slug, 's', 'h', now);
  sqlite.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(slug, '{}', type, acc, slug, 'active', now);
}
const ownerCookie = async (acc) => sessionCookie(await makeSession(acc, secret)).split(';')[0];
const tillCookie = async (slug) => `kiwi_till=${await tillToken(secret, slug)}`;
const profile = { documentType: 'CNIE', documentNumber: 'BK778899', nationality: 'Marocaine', allergies: '' };

const post = (cookie, body) => onRequestPost({ env, request: new Request('https://kiwi.test/api/clients', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
const getOne = async (cookie, slug) => {
  const res = await onRequestGet({ env, request: new Request(`https://kiwi.test/api/clients?merchant=${slug}&since=0`, { headers: { Cookie: cookie } }) });
  const data = await res.json();
  const row = (data.clients || [])[0] || {};
  return { status: res.status, row, h: JSON.parse(row.hospitality || '{}') };
};

for (const slug of ['shop-test', 'hotel-test']) {
  const acc = slug === 'shop-test' ? 'acc-shop' : 'acc-hotel';
  const res = await post(await ownerCookie(acc), { merchant: slug, id: 'c-1', name: 'Salma B.', updated: now, hospitality: profile });
  ok(`${slug}: owner saves a profile with an ID number`, res.status === 200);
}

const shopTill = await getOne(await tillCookie('shop-test'), 'shop-test');
ok('boutique till reads the client', shopTill.status === 200 && shopTill.row.name === 'Salma B.');
ok('boutique till does NOT receive the ID number', shopTill.h.documentNumber === '' && !JSON.stringify(shopTill.row).includes('BK778899'));
ok('boutique till still receives the other hospitality fields', shopTill.h.nationality === 'Marocaine' && shopTill.h.documentType === 'CNIE');

const shopOwner = await getOne(await ownerCookie('acc-shop'), 'shop-test');
ok('boutique owner session still reads the ID number', shopOwner.h.documentNumber === 'BK778899');

const hotelTill = await getOne(await tillCookie('hotel-test'), 'hotel-test');
ok('hotel reception till still reads the ID number (check-in pre-fill)', hotelTill.h.documentNumber === 'BK778899');

// The till writes back what it saw (blank number) plus a real change.
const back = await post(await tillCookie('shop-test'), {
  merchant: 'shop-test', id: 'c-1', name: 'Salma B.', updated: now + 1000,
  hospitality: { ...shopTill.h, allergies: 'Arachides' },
  profileBase: { name: 'Salma B.', hospitality: shopTill.h },
});
ok('boutique till can still save the profile', back.status === 200);
const after = await getOne(await ownerCookie('acc-shop'), 'shop-test');
ok('the stored ID number survives the till write-back', after.h.documentNumber === 'BK778899' && after.h.documentType === 'CNIE');
ok('the till’s real change landed', after.h.allergies === 'Arachides');

// A legacy till (no profileBase) rewriting the whole row cannot erase it either.
await post(await tillCookie('shop-test'), { merchant: 'shop-test', id: 'c-1', name: 'Salma B.', updated: now + 2000, hospitality: { ...shopTill.h } });
const legacy = await getOne(await ownerCookie('acc-shop'), 'shop-test');
ok('a legacy full-row write from the till keeps the ID number', legacy.h.documentNumber === 'BK778899');

if (failed.length) { console.error(`\n✗ ${failed.length} identity redaction checks failed`); process.exit(1); }
console.log(`\n✓ ${passed} identity redaction checks green`);
