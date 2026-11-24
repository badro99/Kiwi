#!/usr/bin/env node
/* Kiwi · country-of-operations-test · le pays d'exploitation d'un commerce.
 *
 * Owner, 24 November 2026 (CHICTRATEC SL, the Startoner shop, in Spain): « this
 * company is mainly in spain, so please also change what needs to be changed for
 * that, and add a toggle in godmode so that we can choose the country of
 * operations ».
 *
 * Holds, against the real routes and an in-memory D1 built from schema.sql:
 *   catalog · Morocco is the default, Spain means EUR, IVA 21/10/4/0, NIF,
 *             Europe/Madrid; an unknown code reads as Morocco;
 *   console · GET /api/admin/country says the store's country (Morocco when
 *             unset); POST sets it for a named operator only (403 otherwise),
 *             refuses an unknown code (400) or store (404), moves the business-day
 *             zone with it unless the till already reported a zone of its own,
 *             and journals prev → next;
 *   config  · /api/config tells the screens the country and its profile.
 *   node tools/country-of-operations-test.mjs
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import Countries from '../assets/country-catalog.js';
import { merchantCountry } from '../functions/api/_country.js';
import { onRequestGet as getCountry, onRequestPost as setCountry } from '../functions/api/admin/country.js';
import { onRequestGet as getConfig } from '../functions/api/config.js';
import { operatorToken, operatorIdToken } from '../functions/auth/_lib.js';

let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? ' · ' + JSON.stringify(detail) : '')); } };

console.log('■ la table des pays');
ok(Countries.DEFAULT === 'MA' && Countries.normalize('') === 'MA' && Countries.normalize('xx') === 'MA', 'le Maroc par défaut, un code inconnu vaut le Maroc');
const es = Countries.profile('es');
ok(es.code === 'ES' && es.currency === 'EUR' && es.symbol === '€' && es.zone === 'Europe/Madrid', 'l’Espagne : euro, Europe/Madrid', es);
ok(es.vatLabel === 'IVA' && es.vat.join() === '21,10,4,0' && es.defaultVat === 21 && es.taxId === 'NIF', 'IVA 21/10/4/0 et NIF', es);
ok(Countries.profile('MA').currency === 'MAD' && Countries.currencyOf('ES') === 'EUR', 'le dirham au Maroc, l’euro en Espagne');
es.currency = 'XXX';
ok(Countries.profile('ES').currency === 'EUR', 'un lecteur qui modifie son profil ne change pas celui des autres');

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:'); db.exec(schema);
const DB = { prepare(sql) {
  const st = db.prepare(sql), bind = (args) => ({ first: async () => st.get(...args) || null, all: async () => ({ results: st.all(...args) }), run: async () => ({ meta: { changes: st.run(...args).changes } }) });
  return { ...bind([]), bind: (...args) => bind(args) };
}, async batch(stmts) { db.exec('BEGIN'); try { const out = []; for (const st of stmts) out.push(await st.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
const env = { DB, AUTH_SECRET: 'country-fixture-auth-secret' };
db.exec("INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op','Fixture','s','h',1)");
db.prepare("INSERT INTO merchant_config (merchant,features,updated_ts) VALUES ('startoner-fixture','{}',1)").run();
db.prepare("INSERT INTO merchant_config (merchant,features,timezone,updated_ts) VALUES ('reported-zone','{}','Atlantic/Canary',1)").run();
const named = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET) + '; kiwi_op_id=' + await operatorIdToken(env.AUTH_SECRET, 'op');
const plain = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET);
const req = (method, cookie, qs, body) => new Request('https://fixture.test/api/admin/country' + (qs || ''), {
  method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.9' }, body: body ? JSON.stringify(body) : undefined });
const row = (m) => db.prepare('SELECT country, timezone FROM merchant_config WHERE merchant = ?').get(m);

console.log('■ la console God Mode');
let res = await getCountry({ env, request: req('GET', named, '?merchant=startoner-fixture') });
let body = await res.json();
ok(res.status === 200 && body.country === 'MA' && body.set === false, 'un commerce sans pays se lit Maroc (valeur par défaut)', body);
ok(await merchantCountry(env, 'startoner-fixture') === 'MA', 'le serveur lit aussi le Maroc');
res = await setCountry({ env, request: req('POST', plain, '', { merchant: 'startoner-fixture', country: 'ES' }) });
ok(res.status === 403, 'sans opérateur nommé : 403', res.status);
res = await setCountry({ env, request: req('POST', named, '', { merchant: 'startoner-fixture', country: 'FR' }) });
ok(res.status === 400, 'un pays que Kiwi ne gère pas : 400', res.status);
res = await setCountry({ env, request: req('POST', named, '', { merchant: 'nobody', country: 'ES' }) });
ok(res.status === 404, 'un commerce inconnu : 404', res.status);
ok(row('startoner-fixture').country === null, 'aucun refus ne touche au pays');
res = await setCountry({ env, request: req('POST', named, '', { merchant: 'startoner-fixture', country: 'es' }) });
body = await res.json();
ok(res.status === 200 && body.country === 'ES' && body.profile.currency === 'EUR', 'un opérateur nommé passe le commerce en Espagne', body);
ok(row('startoner-fixture').country === 'ES' && row('startoner-fixture').timezone === 'Europe/Madrid', 'le pays et la journée commerciale (Europe/Madrid) suivent', row('startoner-fixture'));
ok(await merchantCountry(env, 'startoner-fixture') === 'ES', 'le serveur lit l’Espagne');
const audit = db.prepare("SELECT action, prev, next, actor FROM account_audit WHERE merchant = 'startoner-fixture'").all();
ok(audit.length === 1 && audit[0].action === 'store-country' && audit[0].prev === 'MA' && audit[0].next === 'ES' && audit[0].actor === 'Fixture', 'le journal dit qui, d’où et vers où', audit);
res = await setCountry({ env, request: req('POST', named, '', { merchant: 'reported-zone', country: 'ES' }) });
ok(res.status === 200 && row('reported-zone').timezone === 'Atlantic/Canary', 'un fuseau que la caisse a déjà déclaré reste le sien (les Canaries)', row('reported-zone'));
res = await setCountry({ env, request: req('POST', named, '', { merchant: 'startoner-fixture', country: 'MA' }) });
ok(res.status === 200 && row('startoner-fixture').country === 'MA' && row('startoner-fixture').timezone === 'Africa/Casablanca', 'retour au Maroc : le fuseau par défaut revient avec', row('startoner-fixture'));
res = await setCountry({ env, request: req('POST', named, '', { merchant: 'startoner-fixture', country: 'ES' }) });

console.log('■ /api/config');
res = await getConfig({ env, request: new Request('https://fixture.test/api/config?merchant=startoner-fixture'), data: {} });
body = await res.json();
ok(body.country === 'ES' && body.countryProfile && body.countryProfile.currency === 'EUR' && body.countryProfile.vatLabel === 'IVA', 'la configuration dit le pays et son profil aux écrans', { country: body.country, profile: body.countryProfile });
res = await getConfig({ env, request: new Request('https://fixture.test/api/config?merchant=reported-zone-none'), data: {} });
body = await res.json();
ok(body.country === 'MA' && body.countryProfile.currency === 'MAD', 'un commerce inconnu reçoit le Maroc, comme avant', body.country);

console.log(bad ? `✗ ${bad} échec(s), ${n} contrôles passés` : `✓ pays d'exploitation : ${n} contrôles`);
process.exitCode = bad ? 1 : 0;
