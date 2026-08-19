#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · « Le serveur autorise une commande OrderPro » — garde de comportement
 *
 * Les contrôles EXÉCUTENT le code livré, extrait de ses fichiers : si la
 * fonctionnalité disparaît, la suite tombe. Un contrôle qui se contente de
 * chercher une chaîne ne prouve rien — il survit à la suppression du geste.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else { failures.push(msg); console.error(`  ✗ ${msg}`); } };

console.log('■ Autorisation OrderPro depuis la salle');

/* ── 1 · La décision serveur, extraite de queue.js et exécutée ───────────── */
const queueSrc = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
const decisionMatch = queueSrc.match(/function floorMayAcceptOrder\([\s\S]*?\n\}/);
const orderIdMatch = queueSrc.match(/const ORDER_ID = [^\n]+/);
const orderLibSrc = fs.readFileSync(path.join(ROOT, 'functions/api/order/_lib.js'), 'utf8');
const normTableMatch = orderLibSrc.match(/function normTable\([\s\S]*?\n\}/);

let floorMayAcceptOrder = null;
if (!decisionMatch) ok(false, 'floorMayAcceptOrder introuvable dans queue.js');
else if (!orderIdMatch) ok(false, 'ORDER_ID introuvable dans queue.js');
else if (!normTableMatch) ok(false, 'normTable introuvable dans order/_lib.js');
else {
  try {
    floorMayAcceptOrder = new Function(`
      ${orderIdMatch[0]}
      ${normTableMatch[0]}
      ${decisionMatch[0]}
      return floorMayAcceptOrder;
    `)();
    ok(typeof floorMayAcceptOrder === 'function', 'décision serveur construite depuis la source livrée');
  } catch (e) { ok(false, 'construction de floorMayAcceptOrder impossible : ' + e.message); }
}

if (!floorMayAcceptOrder) ok(false, 'section 1 interrompue — décision non constructible');
else {
  const ID = 'ord-abc123def';
  const mine = { allTables: new Set(['4']) };
  const tableOrder = { mode: 'table', table_no: '4' };

  ok(floorMayAcceptOrder({ id: ID, status: 'accepted' }, tableOrder, mine) === true,
    'un serveur accepte une commande sur une table de sa coupure');
  ok(floorMayAcceptOrder({ id: ID, status: 'accepted' }, { mode: 'table', table_no: '9' }, mine) === false,
    'une table hors coupure est refusée');
  ok(floorMayAcceptOrder({ id: ID, status: 'rejected' }, tableOrder, mine) === false,
    'REFUSER reste au comptoir : rejected ne passe pas par la salle');
  ok(floorMayAcceptOrder({ id: ID, status: 'ready' }, tableOrder, mine) === false,
    'aucun autre état ne se faufile (ready)');
  ok(floorMayAcceptOrder({ id: ID, status: 'served' }, tableOrder, mine) === false,
    'aucun autre état ne se faufile (served)');
  ok(floorMayAcceptOrder({ id: ID, status: 'accepted' }, { mode: 'takeout', table_no: '' }, mine) === false,
    'un à emporter n’a pas de table : il reste à la caisse');
  ok(floorMayAcceptOrder({ id: ID, status: 'accepted' }, null, mine) === false,
    'une commande inexistante est refusée');
  ok(floorMayAcceptOrder({ id: 'pas-un-id', status: 'accepted' }, tableOrder, mine) === false,
    'un identifiant malformé est refusé avant toute lecture');
  ok(floorMayAcceptOrder({ id: ID, status: 'accepted' }, tableOrder, null) === false,
    'sans coupure active, rien ne passe');
  ok(floorMayAcceptOrder({ id: ID, status: 'accepted', create: true }, tableOrder, mine) === false,
    'le chemin de création n’emprunte pas cette porte');
}

/* ── 2 · La garde d’autorisation cite bien la décision ───────────────────── */
const guard = queueSrc.match(/if \(!validCreate[^)]*\) \{/);
ok(!!guard && /!validStatus/.test(guard[0]),
  'la garde 403 « floor-table-required » tient compte de validStatus');

/* ── 3 · Le repérage de la commande en attente, extrait du serveur ───────── */
const serveurSrc = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
const pendingMatch = serveurSrc.match(/function svPendingOrderFor\([\s\S]*?\n    \}/);
let svPendingOrderFor = null;
if (!pendingMatch) ok(false, 'svPendingOrderFor introuvable dans kiwi-serveur.html');
else {
  try {
    svPendingOrderFor = new Function('serviceCanonicalOrders', `
      ${pendingMatch[0]}
      return svPendingOrderFor;
    `);
    ok(typeof svPendingOrderFor === 'function', 'repérage de la commande en attente construit depuis la source livrée');
  } catch (e) { ok(false, 'construction de svPendingOrderFor impossible : ' + e.message); }
}

if (!svPendingOrderFor) ok(false, 'section 3 interrompue — repérage non constructible');
else {
  const orders = new Map([
    ['ord-1', { id: 'ord-1', table: '4', status: 'accepted' }],
    ['ord-2', { id: 'ord-2', table: '4', status: 'pending' }],
    ['ord-3', { id: 'ord-3', table: '7', status: 'pending' }],
  ]);
  const find = svPendingOrderFor(orders);
  ok(find('4') && find('4').id === 'ord-2', 'la commande en attente de la table 4 est trouvée');
  ok(find('7') && find('7').id === 'ord-3', 'chaque table voit la sienne');
  ok(find('12') === null, 'une table sans commande en attente n’affiche rien');
  const noneLeft = new Map([['ord-1', { id: 'ord-1', table: '4', status: 'accepted' }]]);
  ok(svPendingOrderFor(noneLeft)('4') === null, 'une commande déjà acceptée ne réclame plus de décision');
}

/* ── 4 · Le geste existe dans l’écran, et il est atteignable ─────────────── */
ok(/data-accept-order="/.test(serveurSrc), 'le bouton d’acceptation est rendu dans le tiroir de table');
ok(/\[data-accept-order\]/.test(serveurSrc), 'un écouteur délégué capte le bouton (survit au re-rendu du tiroir)');
ok(/pendingBannerHtml \+ `\n          <div class="td-order-list">/.test(serveurSrc),
  'la bannière est peinte sur une table QUI A des lignes — le cas réel');

const EXPECTED = 20;
ok(passed === EXPECTED, `compte de contrôles épinglé (${passed}/${EXPECTED})`);

console.log(`\n✓ ${passed} contrôles verts (${failures.length} échec(s))`);
if (failures.length) process.exit(1);
