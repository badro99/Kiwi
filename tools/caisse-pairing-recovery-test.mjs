#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * LA CAISSE QUI N'ARRIVE PLUS À REMONTER SES VENTES
 *
 * Photographie du comptoir : « Appairage à vérifier · 31 en attente · Accès
 * refusé (403) ». Trente et une ventes réelles, encaissées, retenues sur une
 * tablette — et un libellé qui invite à « toucher pour réactiver », geste qui
 * ne pouvait aboutir dans AUCUN des cas ci-dessous. Ce fichier tient les trois
 * causes et les trois réparations.
 *
 *   1. Une base qui ne sait pas révoquer (colonne absente : la production est
 *      régulièrement en retard sur schema.sql) était traitée comme une base qui
 *      RÉVOQUE. Chaque caisse du parc, 403 sur chaque vente — et impossible à
 *      réappairer, /api/pair/redeem lisant le même millésime.
 *   2. Une boutique jamais inscrite au registre obtenait un jeton que plus rien
 *      ne pouvait vérifier ensuite.
 *   3. Une tablette ayant perdu son cookie `kiwi_till` (purge iPadOS,
 *      réinstallation de la PWA) n'avait plus AUCUN moyen de se réappairer
 *      depuis l'appareil : le pavé à six chiffres était du code mort.
 *
 * Les contrôles exécutent les vraies routes sur SQLite, et lisent la source du
 * client là où le comportement est du DOM.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { onRequestGet as pairState } from '../functions/api/pair/state.js';
import { onRequestPost as pairRedeem } from '../functions/api/pair/redeem.js';
import { onRequestPost as postSale } from '../functions/api/sale.js';
import {
  TILL_COOKIE, forgetTillEpoch, isTillFor, tillEpoch, tillToken,
} from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'caisse-pairing-recovery-secret-32-chars';
const failures = [];
let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (condition) console.log('  ✓ ' + label);
  else { failures.push(label); console.log('  ✗ ' + label + (detail ? ` — ${detail}` : '')); }
}
function request(url, { method = 'GET', cookie = '', body } = {}) {
  const h = {};
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h['content-type'] = 'application/json';
  return new Request('https://kiwi.test' + url, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
/* Un D1 de façade au-dessus de node:sqlite. `throws` simule les deux pannes
 * qu'il ne faut surtout pas confondre : le schéma qui n'a pas la colonne, et la
 * base qui ne répond pas. */
function d1(sqliteDb, throws = null) {
  return { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() {
        if (throws) throw new Error(throws);
        return sqliteDb.prepare(sql).get(...args) ?? null;
      },
      async run() {
        if (throws) throw new Error(throws);
        return sqliteDb.prepare(sql).run(...args);
      },
      async all() {
        if (throws) throw new Error(throws);
        return { results: sqliteDb.prepare(sql).all(...args) };
      },
    };
  } };
}

/* ── 1 · Le millésime de révocation ────────────────────────────────────────
 * « Ne sait pas révoquer » ≠ « ne peut pas répondre ». La colonne n'est posée
 * que par /api/pair/revoke, qui l'ajoute lui-même avant d'incrémenter : là où
 * elle manque, aucun dépairage n'a jamais pu être écrit. */
console.log('\n1 · un millésime illisible n’est pas un dépairage');
{
  const bare = new DatabaseSync(':memory:');
  bare.exec('CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT NOT NULL, updated_ts INTEGER NOT NULL)');
  bare.prepare('INSERT INTO merchant_config VALUES (?,?,?)').run('pre-migration', '{}', 1);
  const envBare = { AUTH_SECRET: SECRET, DB: d1(bare) };
  forgetTillEpoch('pre-migration', envBare.DB);
  check('a schema without the revocation column reads as epoch zero',
    await tillEpoch(envBare, 'pre-migration') === 0);

  const noTable = { AUTH_SECRET: SECRET, DB: d1(null, 'no such table: merchant_config') };
  check('a schema without the registry table reads as epoch zero',
    await tillEpoch(noTable, 'absent-table') === 0);

  /* La seule fermeture qui protège quelque chose : la base EXISTE et refuse de
   * répondre — elle peut détenir un dépairage qu'on n'arrive pas à lire. */
  const broken = { AUTH_SECRET: SECRET, DB: d1(null, 'D1_ERROR: network') };
  check('a genuine read failure stays unavailable, never epoch zero',
    await tillEpoch(broken, 'outage-shop') === null);

  const registered = new DatabaseSync(':memory:');
  registered.exec('CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT NOT NULL, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER NOT NULL)');
  const envReg = { AUTH_SECRET: SECRET, DB: d1(registered) };
  check('an unregistered store stays unavailable rather than becoming epoch zero',
    await tillEpoch(envReg, 'never-registered') === null);

  /* La révocation, elle, doit continuer de mordre. */
  registered.prepare('INSERT INTO merchant_config VALUES (?,?,?,?)').run('revoked-shop', '{}', 3, 1);
  forgetTillEpoch('revoked-shop', envReg.DB);
  const oldProof = request('/api/sale', { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'revoked-shop', 0)}` });
  check('a revoked pairing is still refused after the change',
    !(await isTillFor(oldProof, envReg, 'revoked-shop')));
  const freshProof = request('/api/sale', { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'revoked-shop', 3)}` });
  check('the current vintage is still accepted', await isTillFor(freshProof, envReg, 'revoked-shop'));

  /* Et l'ancienne forme sans millésime survit tant que rien n'a été révoqué —
   * c'est la promesse écrite dans schema.sql. */
  const legacyProof = request('/api/sale', { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'pre-migration', 0)}` });
  check('a pre-migration counter keeps serving instead of losing every sale',
    await isTillFor(legacyProof, envBare, 'pre-migration'));
}

/* ── 2 · Appairer inscrit la boutique ──────────────────────────────────────
 * Sans ligne au registre, tillEpoch() répond « indisponible » : le jeton émis
 * était invérifiable, donc la caisse naissait déjà en 403. */
console.log('\n2 · appairer rend le millésime lisible');
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT NOT NULL, plan TEXT, type TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER NOT NULL)');
  db.exec('CREATE TABLE pairings (code TEXT PRIMARY KEY, merchant TEXT, type TEXT, subtype TEXT, name TEXT, used_ts INTEGER, expires_ts INTEGER)');
  db.exec('CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER)');
  db.prepare('INSERT INTO pairings VALUES (?,?,?,?,?,NULL,?)')
    .run('424242', 'brand-new-shop', 'restaurant', '', 'Chez Neuf', Date.now() + 600000);
  const env = { AUTH_SECRET: SECRET, DB: d1(db) };

  const res = await pairRedeem({ request: request('/api/pair/redeem', { method: 'POST', body: { code: '424242' } }), env });
  check('a never-configured store can still pair', res.status === 200, String(res.status));
  const registry = db.prepare('SELECT * FROM merchant_config WHERE merchant = ?').get('brand-new-shop');
  check('pairing registers the store so its vintage becomes readable', !!registry && registry.till_epoch === 0);

  const cookie = (res.headers.get('set-cookie') || '').match(new RegExp(`${TILL_COOKIE}=([^;,]+)`));
  forgetTillEpoch('brand-new-shop', env.DB);
  check('the token minted at pairing verifies immediately afterwards',
    !!cookie && await isTillFor(request('/api/sale', { cookie: `${TILL_COOKIE}=${cookie[1]}` }), env, 'brand-new-shop'));

  /* Une boutique DÉJÀ configurée ne doit rien perdre en se réappairant. */
  db.prepare('INSERT INTO merchant_config (merchant, features, plan, till_epoch, updated_ts) VALUES (?,?,?,?,?)')
    .run('configured-shop', '{"menu":true}', 'pro', 2, 111);
  db.prepare('INSERT INTO pairings VALUES (?,?,?,?,?,NULL,?)')
    .run('515151', 'configured-shop', 'restaurant', '', 'Chez Config', Date.now() + 600000);
  await pairRedeem({ request: request('/api/pair/redeem', { method: 'POST', body: { code: '515151' } }), env });
  const kept = db.prepare('SELECT * FROM merchant_config WHERE merchant = ?').get('configured-shop');
  check('re-pairing an existing store overwrites neither its settings nor its vintage',
    kept.features === '{"menu":true}' && kept.plan === 'pro' && kept.till_epoch === 2);
}

/* ── 3 · Le comptoir peut enfin savoir POURQUOI ────────────────────────────
 * Un 403 opaque disait la même chose pour « cookie disparu », « dépairée » et
 * « la base ne répond pas ». Seul le premier se répare depuis la tablette. */
console.log('\n3 · /api/pair/state distingue les trois refus');
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT NOT NULL, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER NOT NULL)');
  db.prepare('INSERT INTO merchant_config VALUES (?,?,?,?)').run('state-shop', '{}', 0, 1);
  const env = { AUTH_SECRET: SECRET, DB: d1(db) };
  forgetTillEpoch('state-shop', env.DB);

  const none = await pairState({ request: request('/api/pair/state?merchant=state-shop'), env });
  const noneBody = await none.json();
  check('no till cookie reports an unpaired device the counter can repair',
    none.status === 200 && noneBody.paired === false && noneBody.reason === 'no-cookie');

  const good = await pairState({ request: request('/api/pair/state?merchant=state-shop', { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'state-shop', 0)}` }), env });
  check('a valid pairing reports itself paired', good.status === 200 && (await good.json()).paired === true);

  const foreign = await pairState({ request: request('/api/pair/state?merchant=state-shop', { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'another-shop', 0)}` }), env });
  const foreignBody = await foreign.json();
  check('a cookie that does not verify here reports stale, never paired',
    foreign.status === 200 && foreignBody.paired === false && foreignBody.reason === 'stale');

  /* Une panne ne doit JAMAIS envoyer un commerçant taper un code en plein
   * service : elle n'est pas un dépairage, et elle se répare toute seule. */
  const outage = { AUTH_SECRET: SECRET, DB: d1(null, 'D1_ERROR: network') };
  forgetTillEpoch('state-shop', outage.DB);
  const down = await pairState({ request: request('/api/pair/state?merchant=state-shop', { cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'state-shop', 0)}` }), env: outage });
  check('a revocation-read outage answers 503, never "unpaired"', down.status === 503);

  const noSlug = await pairState({ request: request('/api/pair/state'), env });
  check('the probe refuses to answer without a store', noSlug.status === 400);
}

/* ── 4 · Une panne de lecture n'est pas un refus ───────────────────────────
 * La caisse lit 403 comme « cet appareil n'est plus la caisse » et cesse
 * d'espérer ; elle lit 5xx comme « réessai automatique ». La différence décide
 * si trente et une ventes repartent seules ou attendent un humain. */
console.log('\n4 · /api/sale répond 503 quand seule la vérification est tombée');
{
  const env = { AUTH_SECRET: SECRET, DB: d1(null, 'D1_ERROR: network') };
  forgetTillEpoch('outage-shop', env.DB);
  const withTill = await postSale({
    request: request('/api/sale', {
      method: 'POST',
      cookie: `${TILL_COOKIE}=${await tillToken(SECRET, 'outage-shop', 0)}`,
      body: { merchant: 'outage-shop', amountCents: 4500, method: 'cash', id: 'sale-outage-1' },
    }),
    env,
  });
  check('a paired till hitting a verification outage is told to retry (503)',
    withTill.status === 503, String(withTill.status));

  /* Sans cookie, rien ne prouve quoi que ce soit : le refus reste un refus. */
  const withoutTill = await postSale({
    request: request('/api/sale', {
      method: 'POST',
      body: { merchant: 'outage-shop', amountCents: 4500, method: 'cash', id: 'sale-outage-2' },
    }),
    env,
  });
  check('a caller with no till proof is still refused outright (403)',
    withoutTill.status === 403, String(withoutTill.status));
}

/* ── 5 · Le pavé d'appairage existe de nouveau ─────────────────────────────
 * `feed`, `submit`, `dotsHtml` et les gestionnaires délégués attendaient tous
 * un `#cp-screen` que plus AUCUNE fonction ne construisait. Une tablette ayant
 * perdu son cookie n'avait donc littéralement pas d'écran où taper un code. */
console.log('\n5 · la tablette peut se réappairer sans se vider');
{
  const src = fs.readFileSync(path.join(ROOT, 'assets/caisse-pairing.js'), 'utf8');
  check('a function actually builds the six-digit pad',
    /function renderPairPad\(/.test(src) && /scr\.id = 'cp-screen'/.test(src));
  check('the pad it builds is the one the delegated handlers listen to',
    /id="cp-pad"/.test(src) && /#cp-pad \[data-cp\]/.test(src));
  check('an unpaired hosted till is shown the pad instead of being let through',
    /if \(!pv && hosted\(\)\) \{ renderPairPad\(\{\}\); return; \}/.test(src));
  /* En local, dépairer doit continuer de rendre la main : un pavé d'appairage
   * n'y est satisfaisable par personne. */
  check('a local demo is never trapped behind a code it cannot obtain',
    /function hosted\(\) \{ return env\(\)\.demosAllowed === false; \}/.test(src));

  const repairBody = src.slice(src.indexOf('function repairWithCode()'), src.indexOf('function repairWithCode()') + 700);
  check('both repair paths are exported for the status line to choose from',
    /repair: repair, repairFromAccount: pairFromAccount, repairWithCode: repairWithCode,/.test(src));
  /* L'ordre compte, et il est celui du coût pour le commerçant : la réparation
   * silencieuse d'abord (ce navigateur porte peut-être encore la session du
   * tableau de bord, auquel cas personne n'a rien à faire), le pavé ensuite —
   * et SEULEMENT si le geste a été demandé. Un pavé qui s'ouvrirait tout seul
   * par-dessus la caisse en plein service serait pire que la panne. */
  const combined = src.slice(src.indexOf('function repair(opts)'), src.indexOf('function showPad('));
  check('the silent account repair is attempted before any keypad appears',
    /pairFromAccount\(\)/.test(combined)
    && combined.indexOf('pairFromAccount()') < combined.indexOf('repairWithCode()'));
  check('the keypad only opens on an explicit gesture',
    /if \(!opts \|\| !opts\.interactive\) throw err;/.test(combined));
  /* Le point qui compte : réappairer n'est PAS dépairer. unpair() purge le
   * locataire — service en cours, additions, journal — pour réparer un cookie. */
  check('repairing never purges the tenant the way unpair() does',
    !/purgeTenantData|unpair\(/.test(repairBody));
  check('a successful pair releases the sales the 403 was holding',
    /KiwiLive\.flush\(true\)/.test(src.slice(src.indexOf('function submit()'), src.indexOf('function submit()') + 900)));
}

/* ── 6 · La ligne d'état cesse d'être un cul-de-sac ────────────────────────── */
console.log('\n6 · « toucher pour réessayer » devient un geste qui aboutit');
{
  const src = fs.readFileSync(path.join(ROOT, 'assets/caisse-pwa.js'), 'utf8');
  check('the counter asks the server what it cannot know alone',
    /\/api\/pair\/state\?merchant=/.test(src));
  /* Une coupure réseau ou un 503 ne doivent jamais afficher « à réappairer » :
   * seule une réponse explicite du serveur le dit. */
  check('only an explicit answer marks the till as unpaired',
    /if \(d && typeof d\.paired === 'boolean'\) pairingLost = !d\.paired;/.test(src));
  check('a tap is an explicit gesture, so it may open the keypad',
    /repairPairing\(true, true\)/.test(src));
  /* « Ouvrez cette caisse depuis le tableau de bord » envoyait chercher un
   * ordinateur pendant le service. Le terminal peut le faire sur place. */
  check('a refused repair hands over the keypad instead of naming a dead end',
    /KiwiCaissePairing\.repairWithCode\(\)/.test(src)
    && /err\.status === 401 \|\| err\.status === 403/.test(src));
  check('the queued sales are still named, so nobody thinks they are gone',
    /Caisse à réappairer · ' \+ q\.pending \+ ' en attente/.test(src));
  check('a successful flush clears the unpaired state again',
    /pairingLost = false;/.test(src));
}

console.log(`\n${failures.length ? '✗' : '✓'} ${checks - failures.length}/${checks} caisse pairing recovery checks`);
if (failures.length) { failures.forEach((f) => console.error('  ✗ ' + f)); process.exit(1); }
