#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Maison — trois vérités du comptoir  (tickets #0023, #0025, #0027)
 *
 * #0023  Une session réelle non appairée se rabattait sur le littéral
 *        'boutique-live' — la MÊME clé que pos-boutique.js. Deux verticales
 *        écrivaient leur stock et leurs prix au même endroit.
 * #0025  Le répartiteur activait le journal partagé KiwiPosSale pour maison,
 *        qui n'y écrit jamais : une deuxième journée, vide pour toujours, à
 *        côté de la vraie. Et aucun événement de session n'était émis, donc le
 *        rapprochement de caisse ne voyait jamais ce comptoir.
 * #0027  Une impression thermique ratée retombait sur le navigateur et
 *        renvoyait ok:true : la caisse annonçait « Reçu imprimé » alors que
 *        rien n'était sorti de l'imprimante, sans remise en file.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MAISON = read('assets/pos-maison.js');
const BOUTIQUE = read('assets/pos-boutique.js');
const DISPATCH = read('assets/pos-dispatch.js');
const RECEIPT = read('assets/receipt.js');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Maison · catalogue, journal et impression');

/* ═══ #0023 · deux magasins, deux catalogues ══════════════════════════════ */
{
  const boutiqueFallback = (BOUTIQUE.match(/pvReal\(\) \? '([^']+)'/) || [])[1];
  const maisonFallbackExpr = (MAISON.match(/\|\| \(pvReal\(\) \? (.+) : 'vogueHome'\)/) || [])[1] || '';
  ok(boutiqueFallback === 'boutique-live', 'pos-boutique.js garde sa clé de repli historique');
  ok(!/'boutique-live'/.test(maisonFallbackExpr),
    'pos-maison.js ne se rabat plus sur la clé partagée de la boutique');
  ok(/realFallbackKey\(\)/.test(maisonFallbackExpr),
    'le repli maison passe par une clé dérivée de l\'identité du compte');

  // La fonction réelle, exécutée.
  const slice = (name) => {
    const head = MAISON.indexOf(`\n  function ${name}(`);
    const end = MAISON.indexOf('\n  }\n', head);
    return head < 0 || end < 0 ? null : MAISON.slice(head, end + 4);
  };
  ok(!!slice('realFallbackKey') && !!slice('adoptLegacySharedCatalogue'),
    'realFallbackKey et adoptLegacySharedCatalogue existent dans le code expédié');

  function run(accountKey, storage) {
    const store = Object.assign({}, storage || {});
    if (accountKey) store.kiwiAccountKey = accountKey;
    const sandbox = {
      JSON, String, Object, RegExp, Error, Math,
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
      },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(`(function(){
${slice('realFallbackKey')}
${slice('adoptLegacySharedCatalogue')}
      globalThis.key = realFallbackKey();
      globalThis.adopt = adoptLegacySharedCatalogue;
    })()`, sandbox);
    return { key: sandbox.key, adopt: sandbox.adopt, store };
  }

  const a = run('Boutique.A@example.com');
  const b = run('boutique.b@example.com');
  ok(a.key !== b.key, `deux comptes réels obtiennent deux clés distinctes (${a.key} ≠ ${b.key})`);
  ok(a.key !== 'boutique-live' && b.key !== 'boutique-live',
    'aucune de ces clés n\'est celle de la boutique');
  ok(/^maison-/.test(a.key), `la clé porte sa verticale (${a.key})`);
  ok(run('Boutique.A@example.com').key === a.key, 'la clé est stable pour un même compte');
  ok(/^[a-z0-9-]+$/.test(a.key), `la clé reste un identifiant de stockage sûr (${a.key})`);

  const anon = run('');
  ok(anon.key === 'maison-live', 'sans identité de compte, la clé reste propre à la verticale');

  // Reprise de l'ancien catalogue partagé : une seule fois, jamais par-dessus.
  const legacyDoc = JSON.stringify({ variants: [{ id: 'v1', stock: 7 }] });
  const migrated = run('a@b.c', { 'kiwiBoutiqueCatalog:v1:boutique-live': legacyDoc });
  migrated.adopt(migrated.key);
  ok(migrated.store['kiwiBoutiqueCatalog:v1:' + migrated.key] === legacyDoc,
    'le catalogue laissé sous l\'ancienne clé est repris, pas perdu');
  ok(migrated.store['kiwiBoutiqueCatalog:v1:boutique-live'] === legacyDoc,
    'l\'ancienne copie est laissée intacte (retour arrière possible)');

  const ownDoc = JSON.stringify({ variants: [{ id: 'v9', stock: 99 }] });
  const existing = run('a@b.c', {
    'kiwiBoutiqueCatalog:v1:boutique-live': legacyDoc,
    'kiwiBoutiqueCatalog:v1:maison-a-b-c': ownDoc,
  });
  existing.adopt(existing.key);
  ok(existing.store['kiwiBoutiqueCatalog:v1:' + existing.key] === ownDoc,
    'un catalogue déjà présent n\'est JAMAIS recouvert par la reprise');
}

/* ═══ #0025 · un seul journal, et un comptoir visible ═════════════════════ */
{
  const line = (DISPATCH.match(/.*KiwiPosSale\.activate\).*/) || [''])[0];
  ok(/id !== 'boutique'/.test(line) && /id !== 'maison'/.test(line),
    'le répartiteur n\'ouvre plus de journal partagé vide pour maison');
  ok(/KiwiPosSale\.activate\(id\)/.test(line),
    'les autres verticales gardent le réconciliateur partagé');

  ok(/KiwiCashSessions/.test(MAISON), 'pos-maison.js parle enfin au rapprochement de caisse');
  ok(/bqCashEvent\('open'/.test(MAISON), 'l\'ouverture du poste est annoncée');
  ok(/bqCashEvent\('close'/.test(MAISON), 'la clôture du poste est annoncée');

  // L'événement de clôture doit partir AVANT que le poste ne soit effacé,
  // sinon il n'a ni sessionId ni openedAt.
  const closeBody = MAISON.slice(MAISON.indexOf('function bqCloseRegister()'),
    MAISON.indexOf('function bqFinishClose()'));
  ok(closeBody.indexOf("bqCashEvent('close'") < closeBody.indexOf('bqShift = null'),
    'la clôture est émise avant l\'effacement du poste (sinon: sans session ni ouverture)');
  ok(/gapCents: bqCents\(countedCash\) - bqCents\(bqCloExpected\)/.test(closeBody),
    'l\'écart annoncé est exactement compté − attendu (le serveur refuse toute autre valeur)');

  // Le contrat du serveur, vérifié champ par champ sur l'événement construit.
  const slice = (name) => {
    const head = MAISON.indexOf(`\n  function ${name}(`);
    const end = MAISON.indexOf('\n  }\n', head);
    return MAISON.slice(head, end + 4);
  };
  const sandbox = {
    JSON, Object, String, Number, Math, Date,
    emitted: [],
  };
  sandbox.window = {
    KiwiCashSessions: { emit: (e) => { sandbox.emitted.push(e); return true; } },
  };
  vm.createContext(sandbox);
  vm.runInContext(`(function(){
    const IS_DEMO = false;
    const STAFF = { caissiere: { id: 'emp-7', name: 'Nadia' } };
    let bqShift = { openedAt: 1700000000000, openedBy: 'Nadia', float: 300 };
${slice('bqSessionId')}
${slice('bqActorId')}
${slice('bqCashEvent')}
    const bqCents = (v) => Math.round((+v || 0) * 100);
    bqCashEvent('open', { countedCents: bqCents(300) });
    bqCashEvent('close', { expectedCents: bqCents(1250.5), countedCents: bqCents(1245.5), gapCents: bqCents(1245.5) - bqCents(1250.5) });
  })()`, sandbox);

  const [open, close] = sandbox.emitted;
  ok(sandbox.emitted.length === 2, 'deux événements de poste sont émis');
  ok(open && open.eventType === 'open' && open.countedCents === 30000,
    'ouverture : le fond de caisse part en centimes entiers');
  ok(open && open.sessionId === close.sessionId && /^bq-\d+$/.test(open.sessionId),
    'les deux bornes portent la MÊME session');
  ok(open && open.openedAt === 1700000000000 && Number.isInteger(open.occurredAt),
    'les horodatages exigés par le serveur sont présents et entiers');
  ok(open && open.actorId === 'emp-7', 'l\'événement nomme la caissière');
  ok(close && close.expectedCents === 125050 && close.countedCents === 124550,
    'clôture : attendu et compté partent en centimes entiers');
  ok(close && close.gapCents === close.countedCents - close.expectedCents,
    'l\'écart émis satisfait le contrôle serveur (gap === counted − expected)');
  ok(close && close.gapCents === -500, 'un manque de 5 MAD est annoncé comme −500 centimes');
}

/* ═══ #0027 · une impression ratée se dit ratée ═══════════════════════════ */
{
  ok(/thermalFailed/.test(RECEIPT), 'receipt.js distingue un repli d\'une vraie impression');
  ok(!/if \(r && r\.ok\) return r;\n\s*return browser\(doc, o\);/.test(RECEIPT),
    'le repli silencieux qui renvoyait ok:true a disparu');

  // La fonction degraded(), exécutée.
  const head = RECEIPT.indexOf('\n  function degraded(');
  const end = RECEIPT.indexOf('\n  }\n', head);
  const sandbox = { Promise, Object };
  vm.createContext(sandbox);
  vm.runInContext(`(function(){${RECEIPT.slice(head, end + 4)}\n globalThis.degraded = degraded;})()`, sandbox);
  const out = await sandbox.degraded({ ok: true, via: 'browser' }, 'imprimante injoignable');
  ok(out.thermalFailed === true, 'le résultat porte l\'échec thermique');
  ok(out.reason === 'imprimante injoignable', 'et sa raison, pour l\'afficher');
  ok(out.via === 'browser', 'le repli reste annoncé : un reçu est tout de même sorti');

  ok(/r\.thermalFailed/.test(MAISON), 'la caisse maison lit ce signal');
  ok(/Imprimante thermique injoignable/.test(MAISON),
    'et ne prétend plus « Reçu imprimé · imprimante système »');
  ok(/function requeueReceipt/.test(MAISON) && /enqueueReceipt\('maison:' \+ opts\.sale\.id \+ ':retry'/.test(MAISON),
    'le reçu manqué est remis dans la file d\'impression durable');
  ok(/toast\(r && r\.ok === false[\s\S]{0,120}Échec impression ticket cadeau/.test(MAISON),
    'le ticket cadeau lit lui aussi son résultat au lieu de supposer la réussite');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
