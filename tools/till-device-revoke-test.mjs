#!/usr/bin/env node
/* Retirer UNE caisse sans dépairer tout le magasin (feature-truth · item 19).
 *
 * Le jeton de caisse ne disait pas de quel appareil il venait : la seule
 * coupure possible était le millésime, qui oblige TOUTES les caisses du
 * commerçant à réappairer. Il nomme maintenant son appareil. Ce banc passe par
 * les vraies routes (devices, state, recover) et la vraie vérification
 * (tillVerification, isTerminalFor), sur une base SQLite au schéma réel. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = await import(path.join(ROOT, 'functions/auth/_lib.js'));
const devices = await import(path.join(ROOT, 'functions/api/pair/devices.js'));
const state = await import(path.join(ROOT, 'functions/api/pair/state.js'));
const recover = await import(path.join(ROOT, 'functions/api/pair/recover.js'));

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const SECRET = 'till-device-secret-0123456789';
const SHOP = 'device-shop';
const now = Date.now();
function database(withDevices = true) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  if (!withDevices) db.exec('DROP TABLE till_devices');
  db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-d','o@device.test','Device Shop','s','h',?,'active')`).run(now);
  db.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','boutique','acc-d','Device Shop','active',0,?)`).run(SHOP, now);
  return { db, env: { AUTH_SECRET: SECRET, DB: {
    prepare(q) {
      const st = db.prepare(q);
      const bound = (p) => ({
        async first() { const row = st.get(...p); return row === undefined ? null : row; },
        async all() { return { results: st.all(...p) }; },
        async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
      });
      return Object.assign(bound([]), { bind: (...p) => bound(p) });
    },
  } } };
}
const req = (url, cookie, init = {}) => new Request(url, { ...init, headers: { ...(init.headers || {}), Cookie: cookie, 'CF-Connecting-IP': '10.0.0.7' } });
const A = 'term_aaaaaaaaaaaaaaaa', B = 'term_bbbbbbbbbbbbbbbb', C = 'term_cccccccccccccccc';

console.log('■ Caisses · retirer un appareil, les autres continuent');
{
  const { db, env } = database();
  const owner = lib.sessionCookie(await lib.makeSession('acc-d', SECRET)).split(';')[0];
  const tokA = await lib.tillDeviceToken(SECRET, SHOP, 0, A);
  const tokB = await lib.tillDeviceToken(SECRET, SHOP, 0, B);
  ok('le jeton nomme son appareil', tokA.split('.').length === 3 && tokA.split('.')[1] === A);
  await lib.recordTillDevice(env, SHOP, A, { paired: true });
  await lib.recordTillDevice(env, SHOP, B, { paired: true });
  let vA = await lib.tillVerification(req('https://k/', `kiwi_till=${tokA}`), env, SHOP);
  ok('la caisse A est la caisse du magasin', vA.ok && vA.deviceId === A);
  const forged = tokA.replace(A, C);
  ok('changer l’appareil dans le jeton casse la signature', !(await lib.tillVerification(req('https://k/', `kiwi_till=${forged}`), env, SHOP)).ok);

  let res = await devices.onRequestGet({ request: req(`https://k/api/pair/devices?merchant=${SHOP}`, owner), env });
  let body = await res.json();
  ok('le propriétaire voit ses deux caisses', res.status === 200 && body.devices.length === 2, JSON.stringify(body));
  res = await devices.onRequestGet({ request: req(`https://k/api/pair/devices?merchant=${SHOP}`, `kiwi_till=${tokA}`), env });
  ok('une caisse ne liste pas les caisses (403)', res.status === 403);
  res = await devices.onRequestPost({ request: req('https://k/api/pair/devices', `kiwi_till=${tokA}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: SHOP, deviceId: B }) }), env });
  ok('une caisse ne retire pas sa voisine (403)', res.status === 403);

  res = await devices.onRequestPost({ request: req('https://k/api/pair/devices', owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: SHOP, deviceId: B }) }), env });
  ok('le propriétaire retire la caisse B', res.status === 200);
  const vB = await lib.tillVerification(req('https://k/', `kiwi_till=${tokB}`), env, SHOP);
  ok('B n’est plus la caisse du magasin', !vB.ok && vB.revoked === true);
  vA = await lib.tillVerification(req('https://k/', `kiwi_till=${tokA}`), env, SHOP);
  ok('A continue d’encaisser', vA.ok);
  ok('le millésime n’a pas bougé (pas de dépairage global)', db.prepare('SELECT till_epoch FROM merchant_config WHERE merchant = ?').get(SHOP).till_epoch === 0);

  res = await state.onRequestGet({ request: req(`https://k/api/pair/state?merchant=${SHOP}`, `kiwi_till=${tokB}`), env });
  body = await res.json();
  ok('B lit « appareil retiré » et propose de réappairer', body.paired === false && body.reason === 'device-revoked', JSON.stringify(body));
  const termB = await lib.terminalToken(SECRET, SHOP, B, 0);
  res = await recover.onRequestPost({ request: req('https://k/api/pair/recover', `kiwi_terminal=${termB}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: SHOP, terminalId: B }) }), env });
  ok('B ne se répare pas seul depuis son cookie terminal (403)', res.status === 403);

  await lib.recordTillDevice(env, SHOP, B, { paired: true });
  ok('un nouveau code rend B à la caisse', (await lib.tillVerification(req('https://k/', `kiwi_till=${tokB}`), env, SHOP)).ok);
}

console.log('■ Ancien jeton · renouvelé au nom de l’appareil');
{
  const { db, env } = database();
  const legacy = await lib.tillToken(SECRET, SHOP, 0);
  const termA = await lib.terminalToken(SECRET, SHOP, A, 0);
  const res = await state.onRequestGet({ request: req(`https://k/api/pair/state?merchant=${SHOP}&terminalId=${A}`, `kiwi_till=${legacy}; kiwi_terminal=${termA}`), env });
  const body = await res.json();
  const cookie = res.headers.get('Set-Cookie') || '';
  ok('un jeton sans appareil, prouvé par le terminal, est renouvelé', body.paired === true && body.renewed === true && cookie.includes(`kiwi_till=0.${A}.`), cookie);
  ok('l’appareil apparaît dans la liste du propriétaire', !!db.prepare('SELECT 1 FROM till_devices WHERE merchant = ? AND device_id = ?').get(SHOP, A));
  const noProof = await state.onRequestGet({ request: req(`https://k/api/pair/state?merchant=${SHOP}&terminalId=${B}`, `kiwi_till=${legacy}`), env });
  ok('sans preuve terminal, pas de renouvellement (on ne se fait pas passer pour un autre appareil)', !(noProof.headers.get('Set-Cookie') || '').includes('kiwi_till='));
}

console.log('■ Production en retard sur le schéma');
{
  const { env } = database(false);
  const tokA = await lib.tillDeviceToken(SECRET, SHOP, 0, A);
  const v = await lib.tillVerification(req('https://k/', `kiwi_till=${tokA}`), env, SHOP);
  ok('table absente : aucun retrait n’a pu être écrit, la caisse encaisse', v.ok);
  ok('l’appairage crée la table au premier usage', await lib.recordTillDevice(env, SHOP, A, { paired: true }));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
