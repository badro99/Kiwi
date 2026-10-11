#!/usr/bin/env node
/* tools/serveur-kitchen-truth-test.mjs · l'app serveur, le passe et la cuisine
 * de la caisse disent ce qui est vrai.
 *
 * Mesuré sur la pile locale (restaurant seed, un serveur, une caisse, un passe) :
 *   - « En cours · N mn » repartait de zéro à chaque rechargement ;
 *   - « Prête » / « Je prends » pressé hors ligne était perdu si le passe
 *     rechargeait avant le retour du réseau ;
 *   - la feuille d'encaissement espèces montrait « Espèces confirmées » AVANT
 *     la confirmation (display:flex bat [hidden]) ;
 *   - la feuille carte « approuvait » seule au bout de 2 s, avec un faux numéro
 *     de transaction, et un toucher sur le fond soldait la table ;
 *   - « Ticket en impression… » et « Envoyé · SMS / WhatsApp » n'imprimaient
 *     ni n'envoyaient rien ;
 *   - le décompte « Tables réglées / Défi du soir » retombait à 0 au
 *     rechargement ; « Flous reçu » en plein français ; « Servies aujourd'hui »
 *     au-dessus de tickets seulement prêts.
 *
 * Exécute les vraies fonctions extraites des fichiers livrés, dans un vm.
 *
 *   node tools/serveur-kitchen-truth-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const serveur = read('kiwi-serveur.html');
const cuisine = read('kiwi-cuisine.html');
const caisse = read('kiwi-caisse.html');
let checks = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail ? ' · ' + JSON.stringify(detail) : '')); checks++; };

/* Prend le texte d'une fonction (ou d'un bloc) par ses accolades. */
function grab(src, startRe, label) {
  const m = startRe.exec(src);
  assert.ok(m, 'introuvable : ' + label);
  let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('accolade non fermée : ' + label);
}

/* ── 1. Le passe : un geste hors ligne survit au rechargement ─────────────── */
{
  const bumpCode = [
    'var STALE_MS = 6 * 60 * 60 * 1000; var BUMP_TRIES = 40; var S = {};',
    'function setLive() {}',
    'S.pendingBumps = {};',
    grab(cuisine, /function bumpsKey\(\)/, 'bumpsKey'),
    grab(cuisine, /function saveBumps\(\)/, 'saveBumps'),
    grab(cuisine, /function restoreBumps\(\)/, 'restoreBumps'),
    grab(cuisine, /function sendBump\(id, status, station\)/, 'sendBump'),
    grab(cuisine, /function flushBumps\(\)/, 'flushBumps'),
  ].join('\n');
  const device = (store, online) => {
    const sent = [];
    const ctx = {
      JSON, Date, Object, Promise, Number,
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
      KiwiKitchenRelay: {
        merchant: () => 'cafe-test',
        bump: (id, status) => { sent.push(id + ':' + status); return Promise.resolve(online.up ? { ok: true } : { ok: false }); },
      },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(bumpCode, ctx);
    return { ctx, sent };
  };
  const store = new Map();
  const online = { up: false };
  let d = device(store, online);
  const first = await vm.runInContext("sendBump('ord-1', 'cooking', '')", d.ctx);
  ok(first === false, 'hors ligne : le geste est reporté comme non livré');
  ok([...store.keys()].some((k) => k === 'kiwi:kitchen-bumps-v1:cafe-test'), 'hors ligne : le geste est écrit dans le stockage');
  // la tablette recharge : contexte neuf, même stockage, réseau revenu
  online.up = true;
  d = device(store, online);
  await vm.runInContext('flushBumps()', d.ctx);
  ok(d.sent.includes('ord-1:cooking'), 'après rechargement : « Je prends » est rejoué au retour du réseau', d.sent);
  ok(!store.has('kiwi:kitchen-bumps-v1:cafe-test'), 'une fois livré, rien ne reste en file');
  // un geste plus vieux que le service n'est pas rejoué
  store.set('kiwi:kitchen-bumps-v1:cafe-test', JSON.stringify({
    'ord-old|ready|': { id: 'ord-old', status: 'ready', station: '', tries: 1, at: Date.now() - 7 * 3600 * 1000 },
  }));
  d = device(store, online);
  await vm.runInContext('flushBumps()', d.ctx);
  ok(!d.sent.includes('ord-old:ready'), 'un geste d\'un service terminé n\'est pas rejoué', d.sent);
}

/* ── 2. Le serveur : la durée d'une table vient de l'heure serveur ─────────── */
{
  ok(/tables\[id\]\.openedTs = Number\(session\.opened_ts\)/.test(serveur), 'la fiche lit `opened_ts` de la session de table');
  ok(/t\.elapsed = t\.openedTs\s*\?\s*Math\.max\(0, Math\.floor\(\(Date\.now\(\) - t\.openedTs\) \/ 60000\)\)/.test(serveur),
    'le tic d\'une minute recalcule depuis l\'heure d\'ouverture au lieu d\'ajouter 1');
  ok(/Object\.keys\(tables\)\.forEach\(\(k\) => \{ delete tables\[k\]\.openedTs; \}\);/.test(serveur),
    'une table sans session vivante n\'hérite pas d\'une heure périmée');
}

/* ── 3. Le décompte du service survit au rechargement ─────────────────────── */
{
  const tallyCode = [
    'let tablesPaid = 0, kgShiftRevenue = 0, kgShiftTurnMin = 0, kgTallyFor = 0, kgTallyLast = "";',
    grab(serveur, /function kgTallyKey\(\)/, 'kgTallyKey'),
    grab(serveur, /function kgTallySync\(\)/, 'kgTallySync'),
  ].join('\n');
  const mk = (store, start) => {
    const ctx = {
      JSON, Date, Number, Math,
      svSlug: () => 'cafe-test', currentUser: 'emp-1', kgInitials: 'ST', SV_DEMO: false,
      shiftStart: new Date(start),
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    };
    vm.createContext(ctx);
    vm.runInContext(tallyCode, ctx);
    return ctx;
  };
  const store = new Map();
  let c = mk(store, 1000);
  vm.runInContext('tablesPaid = 3; kgShiftRevenue = 460; kgShiftTurnMin = 95; kgTallySync();', c);
  c = mk(store, 1000); // rechargement du MÊME service
  vm.runInContext('kgTallySync();', c);
  ok(vm.runInContext('tablesPaid', c) === 3 && vm.runInContext('kgShiftRevenue', c) === 460, 'même service : 3 tables et 460 MAD retrouvés');
  c = mk(store, 2000); // nouveau pointage
  vm.runInContext('kgTallySync();', c);
  ok(vm.runInContext('tablesPaid', c) === 0 && vm.runInContext('kgShiftRevenue', c) === 0, 'nouveau service : le décompte repart de zéro');
}

/* ── 4. Les feuilles d'encaissement disent ce qui est vrai ────────────────── */
{
  ok(/\.cash-grid\[hidden\]\s*\{\s*display:\s*none/.test(serveur), 'l\'étape « confirmée » reste cachée tant que rien n\'est confirmé');
  ok(!/Flous reçu/.test(serveur), 'plus de « Flous reçu » dans l\'interface française');
  ok(/Montant reçu/.test(serveur) && /'Montant reçu': 'Amount received'/.test(serveur), '« Montant reçu » existe en FR et EN');
  ok(!/toast\('Ticket en impression…'\)/.test(serveur), 'aucun bouton serveur n\'annonce une impression sans imprimer');
  ok(!/toast\('Envoyé · SMS \/ WhatsApp'\)/.test(serveur), 'aucun bouton serveur n\'annonce un envoi sans envoyer');
  ok(!/<span>SMS \/ WA<\/span>/.test(serveur), 'les boutons Ticket / SMS ont disparu de la feuille');
  const arm = grab(serveur, /function cardReaderArm\(tableId\)/, 'cardReaderArm');
  ok(/if \(SV_DEMO\) \{ cardSuccessTimer = setTimeout/.test(arm), 'seule la démo approuve la carte toute seule');
  ok(/closeCardModal\(\{ paid: cardApproved, tableId \}\)/.test(serveur), 'toucher le fond pendant l\'attente ne solde plus la table');
  const success = grab(serveur, /function triggerCardSuccess\(tableId\)/, 'triggerCardSuccess');
  ok(/if \(SV_DEMO\) \{[^}]*TXN #KW-/.test(success.replace(/\n/g, ' ')), 'le faux numéro de transaction n\'existe qu\'en démo');
}

/* ── 4b. Espèces : « Confirmer » enregistre, « Fermer » ne fait que fermer ── */
{
  const i = serveur.indexOf('let cashSettled = false;');
  const j = serveur.indexOf('cashModal.addEventListener(', i);
  ok(i > 0 && j > i, 'le bloc de confirmation espèces existe');
  const block = serveur.slice(i, j);
  const run = async (payResult) => {
    const handlers = {};
    const el = () => ({ hidden: false, disabled: false, dataset: {}, textContent: '', value: '',
      addEventListener(t, fn) { handlers[t] = fn; } });
    const c = vm.createContext({
      cashConfirm: el(), cashInput: Object.assign(el(), { value: '200' }),
      cashStepInput: el(), cashStepSuccess: Object.assign(el(), { hidden: true }), cashSuccessRendu: el(),
      payTableId: 'T4', calls: [], renduCalls: 0,
      currentPayAmount: () => 150, fmtMADcents: (n) => String(n), lucide: { createIcons() {} },
    });
    vm.runInContext(`
      async function markTablePaid(id, m) { calls.push([id, m]); return ${payResult}; }
      function updateRendu() { renduCalls++; }
      ${block}
      globalThis.__state = () => ({ cashSettled });`, c);
    await c.cashConfirm && handlers.click();
    return { c, h: handlers };
  };
  const good = await run('true');
  ok(good.c.calls.length === 1 && good.c.calls[0][1] === 'cash', '« Confirmer » enregistre la vente une fois', good.c.calls);
  ok(good.c.cashStepSuccess.hidden === false && vm.runInContext('__state().cashSettled', good.c) === true,
    'le succès ne s\'affiche qu\'après l\'accord du serveur');
  await good.h.click();
  ok(good.c.calls.length === 1, 'un second « Confirmer » ne crée pas de seconde vente');
  const bad = await run('false');
  ok(bad.c.cashStepSuccess.hidden === true && vm.runInContext('__state().cashSettled', bad.c) === false,
    'un refus du serveur laisse la feuille à l\'étape montant, rien n\'est dit encaissé');
  ok(bad.c.cashConfirm.dataset.busy === '' && bad.c.renduCalls === 1, 'après un refus, le bouton redevient utilisable');
  const close = grab(serveur, /function closeCashModal\([^)]*\)\s*\{/, 'closeCashModal');
  ok(!/markTablePaid\(/.test(close), '« Fermer » n\'enregistre plus de vente (elle l\'est déjà)');
  ok(/closeCashModal\(\{ paid: cashSettled, tableId \}\)/.test(serveur), 'la fermeture lit l\'état réel du paiement');
  ok(/cashPay = \(\) => markSplitPartPaid\(partIdx, 'cash'\)/.test(serveur), 'une part en espèces est enregistrée au « Confirmer »');
}

/* ── 5. Intitulés ───────────────────────────────────────────────────────── */
{
  ok(!/<span>Servies aujourd'hui<\/span>/.test(caisse),
    'le volet de la caisse ne dit plus « servies » pour des bons prêts');
  ok(/Prêtes aujourd'hui/.test(caisse), 'le volet s\'intitule « Prêtes aujourd\'hui »');
  ok(!/Comptoir lié|Counter linked/.test(cuisine), 'le passe ne prétend plus être lié au comptoir (il lit le serveur)');
  ok(!/God Mode/.test(cuisine.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'plus de « God Mode » devant la brigade');
  ok(!/Écran cuisine désactivé dans la console God Mode/.test(caisse), 'plus de « God Mode » devant le caissier pour l\'écran cuisine');
}

console.log(`serveur-kitchen-truth-test · ${checks} checks · OK`);
