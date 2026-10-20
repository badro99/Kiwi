#!/usr/bin/env node
/* Kiwi · a paired till opens the caisse without the owner's password.
 *
 * Since 2026-08-05 (a403201d) the site gate only opened the caisse page to an
 * owner session. A tablet whose owner session ended (a tap on « Sortir », a
 * changed password, thirty days without a reload, a database hiccup at launch)
 * fell back on the owner's sign-in screen, the landing page or the team portal,
 * and nobody at the counter could reopen it. functions/_middleware.js now lets
 * the till proof (`kiwi_till`, per store and per device, revocable) open the
 * caisse page and the caisse's own APIs, and nothing else.
 *
 * Held here:
 *   · a live till opens /kiwi-caisse and its APIs; not the dashboard, not /api/me;
 *   · another store's proof, a revoked device, a bumped epoch all stay out;
 *   · a fresh tablet pairs with the 6-digit code alone (redeem + ?pair=1 shell);
 *   · a cut owner session does not make a live till wipe itself (no
 *     account-revoked signal), and still clears the dead cookie;
 *   · a database that cannot answer shows a retry screen, not a sign-in screen;
 *   · « Sortir » returns to the caisse, and only to a fixed path;
 *   · every API the gate opens to tills is handled by code that checks the till.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  TILL_COOKIE, TILL_STORE_COOKIE, SESS_COOKIE, tillDeviceToken, makeSession, forgetTillEpoch,
} from '../functions/auth/_lib.js';
import { onRequest as middleware, TILL_PATHS } from '../functions/_middleware.js';
import { onRequest as logout } from '../functions/auth/logout.js';
import { onRequestGet as pairState } from '../functions/api/pair/state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const check = (ok, label, detail) => { assert.ok(ok, label + (detail ? ' · ' + detail : '')); n++; console.log('  ✓ ' + label); };

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
for (const m of ['till-shop', 'other-shop']) {
  sql.prepare("INSERT INTO merchant_config (merchant, features, status, updated_ts) VALUES (?, '{}', 'active', ?)").run(m, now);
}
sql.prepare("INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES ('acc-till', 'owner@till.invalid', 'Till Shop', 'x', 'y', ?, 'active')").run(now);
const makeD1 = ({ broken = false } = {}) => ({ prepare(q) { let a = []; return {
  bind(...v) { a = v.map((x) => (x === undefined ? null : x)); return this; },
  async first() { if (broken) throw new Error('D1 down'); return sql.prepare(q).get(...a) ?? null; },
  async all() { if (broken) throw new Error('D1 down'); return { results: sql.prepare(q).all(...a) }; },
  async run() { if (broken) throw new Error('D1 down'); const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; },
}; } });
const SECRET = 'till-gate-fixture-only';
const env = { AUTH_SECRET: SECRET, DB: makeD1() };
const DEVICE = 'term_tillgate0000000001';

const proof = (merchant, epoch = 0, device = DEVICE) => tillDeviceToken(SECRET, merchant, epoch, device);
const cookies = (pairs) => pairs.filter(Boolean).map(([k, v]) => `${k}=${v}`).join('; ');
function request(p, { cookie = '', method = 'GET', doc = false } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (doc) { headers['Sec-Fetch-Dest'] = 'document'; headers.Accept = 'text/html'; }
  else headers.Accept = 'application/json';
  return new Request('https://k.invalid' + p, { method, headers });
}
async function gate(p, opts = {}, e = env) {
  let passed = false;
  const res = await middleware({ request: request(p, opts), env: e, next: async () => { passed = true; return new Response('app'); } });
  return { passed, res, body: passed ? '' : await res.text() };
}
const live = cookies([[TILL_COOKIE, await proof('till-shop')], [TILL_STORE_COOKIE, 'till-shop']]);

console.log('Paired till · the caisse page and its APIs');
check((await gate('/kiwi-caisse', { cookie: live, doc: true })).passed, 'a live till opens /kiwi-caisse');
check((await gate('/kiwi-caisse.html', { cookie: live, doc: true })).passed, 'and /kiwi-caisse.html, before Pages folds it');
check((await gate('/api/config?merchant=till-shop', { cookie: live })).passed, 'and the caisse APIs');
const dash = await gate('/dashboard.html', { cookie: live, doc: true });
check(!dash.passed && dash.res.status === 401, 'a till never opens the dashboard', String(dash.res.status));
check(!(await gate('/api/me', { cookie: live })).passed, 'nor an owner-only API');
check(!(await gate('/api/stock/lookup?from=till-shop', { cookie: live })).passed, 'nor an account-wide lookup');

console.log('\nWhat stays out');
const noStore = cookies([[TILL_COOKIE, await proof('till-shop')]]);
check(!(await gate('/kiwi-caisse', { cookie: noStore, doc: true })).passed, 'a page load without the store cookie is not guessed');
check((await gate('/api/config?merchant=till-shop', { cookie: noStore })).passed, 'an older till still reaches its APIs by naming its store');
const forged = cookies([[TILL_COOKIE, await proof('till-shop')], [TILL_STORE_COOKIE, 'other-shop']]);
check(!(await gate('/kiwi-caisse', { cookie: forged, doc: true })).passed, 'a store cookie naming another shop fails the proof');
check(!(await gate('/api/config?merchant=other-shop', { cookie: noStore })).passed, 'another store\'s API is refused');
sql.prepare('INSERT INTO till_devices (merchant, device_id, paired_ts, last_seen_ts, revoked_ts) VALUES (?, ?, ?, ?, ?)').run('till-shop', 'term_revokeddevice00001', now, now, now);
const revoked = cookies([[TILL_COOKIE, await proof('till-shop', 0, 'term_revokeddevice00001')], [TILL_STORE_COOKIE, 'till-shop']]);
check(!(await gate('/kiwi-caisse', { cookie: revoked, doc: true })).passed, 'a device the owner removed stays out');
sql.prepare("UPDATE merchant_config SET till_epoch = 1 WHERE merchant = 'till-shop'").run();
forgetTillEpoch('till-shop');
check(!(await gate('/kiwi-caisse', { cookie: live, doc: true })).passed, 'unpairing every till (epoch bump) closes the old proof');
const relived = cookies([[TILL_COOKIE, await proof('till-shop', 1)], [TILL_STORE_COOKIE, 'till-shop']]);
check((await gate('/kiwi-caisse', { cookie: relived, doc: true })).passed, 'a proof issued at the new epoch opens again');
const fresh = relived;

console.log('\nPairing a fresh tablet needs only the code');
const bare = await gate('/kiwi-caisse', { doc: true });
check(!bare.passed && bare.res.status === 401, 'an unpaired, signed-out tablet meets the sign-in screen');
check(bare.body.includes('href="/kiwi-caisse?pair=1"'), 'which now offers to pair it with a code');
check((await gate('/kiwi-caisse?pair=1', { doc: true })).passed, 'the pairing pad opens with no session');
check((await gate('/api/pair/redeem', { method: 'POST' })).passed, 'and the code redeems with no session');
check(!(await gate('/api/pair/create', { method: 'POST' })).passed, 'minting a code still needs the owner');

console.log('\nA cut owner session does not unpair the till');
const deadSession = await makeSession('acc-till', SECRET, 0);
sql.prepare("UPDATE accounts SET session_epoch = 3 WHERE id = 'acc-till'").run();
const both = cookies([[SESS_COOKIE, deadSession], [TILL_COOKIE, await proof('till-shop', 1)], [TILL_STORE_COOKIE, 'till-shop']]);
const stillOpen = await gate('/kiwi-caisse', { cookie: both, doc: true });
check(stillOpen.passed, 'the caisse still opens on the till proof');
check(/kiwi_sess=;/.test(stillOpen.res.headers.get('Set-Cookie') || ''), 'and the dead owner cookie is cleared on the way');
const quiet = await gate('/api/me', { cookie: both });
check(!quiet.passed && !quiet.body.includes('account-revoked'), 'an owner-only API refuses without the wipe signal');
check(/kiwi_sess=;/.test(quiet.res.headers.get('Set-Cookie') || ''), 'and still clears the dead session cookie');
const ownerOnly = await gate('/api/me', { cookie: cookies([[SESS_COOKIE, deadSession]]) });
check(ownerOnly.body.includes('account-revoked'), 'a browser that is not a till still gets the revocation signal');

console.log('\nA database that cannot answer');
const down = { AUTH_SECRET: SECRET, DB: makeD1({ broken: true }) };
forgetTillEpoch('till-shop');
const retry = await gate('/kiwi-caisse', { cookie: fresh, doc: true }, down);
check(!retry.passed && retry.res.status === 503, 'a till is not let in on a guess', String(retry.res.status));
check(/http-equiv="refresh"/.test(retry.body) && !/form-login/.test(retry.body), 'it sees a retry screen, not a sign-in screen');
forgetTillEpoch('till-shop');
const retryApi = await gate('/api/config?merchant=till-shop', { cookie: fresh }, down);
check(retryApi.res.status === 503 && retryApi.body.includes('auth-verification-unavailable'), 'an API says unavailable, not unauthorized');
forgetTillEpoch('till-shop');

console.log('\n« Sortir »');
const out = await logout({ request: new Request('https://k.invalid/auth/logout?next=/kiwi-caisse') });
check(out.headers.get('Location') === '/kiwi-caisse', 'returns to the caisse');
const evil = await logout({ request: new Request('https://k.invalid/auth/logout?next=https://evil.invalid/') });
check(evil.headers.get('Location') === '/', 'any other destination falls back to the home page');
const caisse = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
check(caisse.includes('href="/auth/logout?next=/kiwi-caisse" title="Se déconnecter"'), 'the caisse button uses it');

console.log('\nThe store cookie reaches existing tills');
const st = await pairState({ request: request('/api/pair/state?merchant=till-shop', { cookie: fresh }), env });
check(/^kiwi_till_store=till-shop;.*HttpOnly/.test(st.headers.get('Set-Cookie') || ''), 'GET /api/pair/state hands it to a live till');
const redeemSrc = fs.readFileSync(path.join(ROOT, 'functions/api/pair/redeem.js'), 'utf8');
check(redeemSrc.indexOf('tillStoreCookie(row.merchant)') > 0
  && redeemSrc.indexOf('tillStoreCookie(row.merchant)') < redeemSrc.indexOf("res.headers.append('Set-Cookie', tillCookie("),
  'redeem sets it BEFORE the till proof, which stays last');

console.log('\nWhat a till reads of the team');
const { onRequestGet: getStore } = await import('../functions/api/store.js');
const member = { id: 'm1', name: 'Sara', role: 'Caissier', pinCode: '1234', password: 'p', baseSalary: 4200, hourlyRate: 25,
  cin: 'AB123', iban: 'MA64', address: 'Rue 1', emergencyName: 'Ali', emergencyPhone: '0600', contractHours: 44 };
const team = { members: [member] };
sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run('till-shop', 'team', JSON.stringify(team), now);
const teamRes = await getStore({ request: request('/api/store?merchant=till-shop&feature=team', { cookie: fresh }), env });
const teamText = await teamRes.text();
check(teamRes.status === 200 && teamText.includes('Sara') && teamText.includes('Caissier'), 'names and roles, which the caisse uses', String(teamRes.status) + ' ' + teamText.slice(0, 120));
check(!/4200|hourlyRate|baseSalary|AB123|MA64|Rue 1|0600|1234/.test(teamText), 'no codes, pay or personal details');

console.log('\nEvery API the gate opens to tills checks the till itself');
const TILL_AWARE = /isTillFor|tillVerification|tenantFor\(|allowTill|requireTill/;
for (const p of TILL_PATHS) {
  const base = path.join(ROOT, 'functions', p);
  const file = [base + '.js', path.join(base, 'index.js')].find((f) => fs.existsSync(f));
  check(file && TILL_AWARE.test(fs.readFileSync(file, 'utf8')), p, file ? 'handler does not check the till' : 'no handler file');
}

console.log(`\n${n} checks green.`);
