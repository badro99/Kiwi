#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Ce qui est saisi survit, ce qui est imprimé dit vrai
 *                                                (ticket #0066, parties 1 et 2)
 *
 * 1 · LE PANIER QUI N'EXISTAIT QUE DANS LA MÉMOIRE DU TÉLÉPHONE. Les lignes
 *     saisies mais pas encore envoyées ne vivaient nulle part ailleurs que
 *     dans `tableOrders`. Un rechargement, un onglet que l'iOS recycle, une
 *     tablette qui s'éteint : la commande en cours disparaissait, et le
 *     serveur la resaisissait de mémoire devant le client. Pire, le LOT déjà
 *     enregistré — une commande validée devant le client mais pas encore
 *     accusée par la cuisine — était bien écrit sur le disque et plus jamais
 *     relu tout seul.
 *
 * 2 · LE NUMÉRO QUI N'ÉTAIT PAS UN NUMÉRO. Hors ligne, le bon sortait sur le
 *     papier avec le compteur LOCAL du comptoir, indiscernable d'un numéro de
 *     serveur. Au retour du réseau la commande recevait son vrai numéro, et
 *     papier, cuisine et caisse désignaient trois choses différentes.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SERVEUR = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const RELAY = fs.readFileSync(path.join(ROOT, 'assets/kitchen-relay.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Service · le brouillon survit, le numéro ne ment pas');

/* ═══ 1 · le vrai code de brouillon, exécuté ══════════════════════════════ */
function draftSandbox(storageBehaviour = {}) {
  const map = new Map();
  const localStorage = {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (storageBehaviour.full) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
  const sandbox = {
    localStorage, JSON, Date, Object, Array, Number, String, Math, console,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {},
    liveEmployeeState: { merchant: 'santos', staffId: 'emp-7' },
    currentUser: 'yasmine',
    svSlug: () => 'santos',
    tableOrders: {},
    newLineUid: (() => { let n = 0; return () => 'ln' + (++n); })(),
  };
  vm.createContext(sandbox);
  // Les vraies fonctions, découpées du fichier expédié.
  const start = SERVEUR.indexOf('    const SV_DRAFT_TTL =');
  const end = SERVEUR.indexOf('    function svForgetPending(id) {');
  vm.runInContext(SERVEUR.slice(start, end), sandbox, { filename: 'serveur-drafts.js' });
  return sandbox;
}

{
  const s = draftSandbox();
  s.tableOrders['5'] = [
    { uid: 'a', name: 'Tajine', qty: 2, sentQty: 0, sourceLocal: true },
    { uid: 'b', name: 'Thé', qty: 1, sentQty: 1, sourceLocal: true },
    { uid: 'c', name: 'Salade', qty: 1, sentQty: 0, sourceCanonical: true },
  ];
  s.svSaveDrafts();
  const raw = JSON.parse(s.localStorage.getItem('kiwi:service-drafts-v1:santos:emp-7'));
  ok(!!raw, 'le brouillon est écrit sur le disque, pas seulement en mémoire');
  ok(raw.tables['5'].length === 1 && raw.tables['5'][0].uid === 'a',
    'et seules les lignes RÉELLEMENT en attente y sont : le reste viendra de la synchro');
  ok(!raw.tables['5'].some((l) => l.uid === 'b'), 'une ligne déjà partie en cuisine n\'est pas un brouillon');
  ok(!raw.tables['5'].some((l) => l.uid === 'c'),
    'une ligne venue du serveur non plus — la réécrire fabriquerait une commande fantôme');

  // Le rechargement.
  s.tableOrders = {};
  const restored = s.svRestoreDrafts();
  ok(restored === 1, 'après un rechargement, la saisie est reprise');
  ok(s.tableOrders['5'] && s.tableOrders['5'][0].name === 'Tajine', 'avec le plat que le client a commandé');
  ok(s.tableOrders['5'][0].sourceLocal === true,
    'et toujours marquée comme brouillon local, pour que la fusion canonique la reconnaisse');
}

{
  const s = draftSandbox();
  s.tableOrders['5'] = [{ uid: 'a', name: 'Tajine', qty: 1, sentQty: 0, sourceLocal: true }];
  s.svSaveDrafts();
  // Une ligne déjà en mémoire ne doit pas être doublée par la restauration.
  s.svRestoreDrafts();
  ok(s.tableOrders['5'].length === 1,
    'une restauration sur un panier déjà chargé ne double pas les plats — ce serait une commande fausse dans l\'autre sens');
}

{
  const s = draftSandbox();
  s.localStorage.setItem('kiwi:service-drafts-v1:santos:emp-7', JSON.stringify({
    at: Date.now() - 13 * 60 * 60 * 1000,
    tables: { 5: [{ uid: 'a', name: 'Tajine', qty: 1, sentQty: 0, sourceLocal: true }] },
  }));
  ok(s.svRestoreDrafts() === 0,
    'un brouillon d\'hier n\'est pas repris : il ferait surgir des plats que personne n\'attend');
  ok(s.localStorage.getItem('kiwi:service-drafts-v1:santos:emp-7') === null, 'et il est effacé');
}

{
  const s = draftSandbox();
  s.tableOrders['5'] = [{ uid: 'a', name: 'Tajine', qty: 1, sentQty: 0, sourceLocal: true }];
  s.svSaveDrafts();
  // La tablette est partagée : le brouillon appartient à celui qui l'a saisi.
  s.liveEmployeeState = { merchant: 'santos', staffId: 'emp-9' };
  s.tableOrders = {};
  ok(s.svRestoreDrafts() === 0, 'le brouillon de Yasmine ne s\'ouvre pas dans la session de Karim');
  ok(s.svDraftsKey().indexOf('emp-9') > 0, 'chaque opérateur a sa propre clé');
}

{
  const s = draftSandbox({ full: true });
  s.tableOrders['5'] = [{ uid: 'a', name: 'Tajine', qty: 1, sentQty: 0, sourceLocal: true }];
  let threw = false;
  try { s.svSaveDrafts(); } catch (_) { threw = true; }
  ok(!threw, 'un stockage saturé n\'interrompt pas la saisie : on ne casse pas un service pour un quota');
  ok(s.tableOrders['5'].length === 1, 'et le panier reste utilisable en mémoire');
}

{
  const s = draftSandbox();
  s.tableOrders['5'] = [{ uid: 'a', name: 'Tajine', qty: 1, sentQty: 1, sourceLocal: true }];
  s.svSaveDrafts();
  ok(s.localStorage.getItem('kiwi:service-drafts-v1:santos:emp-7') === null,
    'quand tout est parti en cuisine, la clé est retirée au lieu de traîner');
}

/* ═══ Le lot enregistré est enfin vidé tout seul ══════════════════════════ */
{
  const drain = SERVEUR.slice(SERVEUR.indexOf('function svDrainPendingBatches()'), SERVEUR.indexOf('function startServiceSync()'));
  ok(/kiwi:service-pending-v1:/.test(drain), 'le balayage cherche les lots réellement enregistrés');
  ok(/prefix \+ merchant \+ ':' \+ operator \+ ':'/.test(drain),
    'et seulement ceux de CE commerce et de CET opérateur');
  ok(/svSendOrderBatch\(id\)/.test(drain),
    'chaque lot repart par le même chemin, avec sa référence d\'origine : c\'est la même commande, pas une seconde');
  ok(/pending\.createdAt \|\| 0\) > SV_DRAFT_TTL/.test(drain),
    'un lot d\'un service terminé n\'est pas rejoué — il enverrait en cuisine des plats d\'hier');
  ok(/svDrainAt < 4000/.test(drain), 'et le balayage ne se répète pas en boucle');

  const boot = SERVEUR.slice(SERVEUR.indexOf('function startServiceSync()'), SERVEUR.indexOf('function stopServiceSync()'));
  ok(/svRestoreDrafts\(\)/.test(boot), 'le démarrage reprend les brouillons');
  ok(/svDrainPendingBatches\(\)/.test(boot), 'et vide les lots en attente — c\'est ce qui manquait');
  ok(/addEventListener\('online', \(\) => \{ try \{ svDrainPendingBatches/.test(SERVEUR),
    'le retour du réseau aussi, sans attendre le prochain tour d\'horloge');
  ok(/addEventListener\('pagehide'/.test(SERVEUR) && /visibilityState === 'hidden'/.test(SERVEUR),
    'et l\'onglet qui disparaît écrit une dernière fois : l\'iOS ne prévient pas plus tard');
  ok(/svTouchDrafts\(\);\n      const id = activeTableId;/.test(SERVEUR),
    'chaque modification de la commande déclenche l\'enregistrement');
}

/* ═══ 2 · le numéro provisoire, exécuté ═══════════════════════════════════ */
function ticketNoFn() {
  const sandbox = { String, console };
  vm.createContext(sandbox);
  const src = CAISSE.slice(CAISSE.indexOf('    function ticketNo(o) {'), CAISSE.indexOf('\n    }\n', CAISSE.indexOf('    function ticketNo(o) {')) + 6);
  vm.runInContext(src + '\nglobalThis.ticketNo = ticketNo;\nfunction orderServerInitials(){return "";}', sandbox, { filename: 'ticketno.js' });
  return sandbox.ticketNo;
}

{
  const ticketNo = ticketNoFn();
  ok(ticketNo({ num: 64, opNum: 3 }) === '3', 'en ligne, le numéro affiché est celui du serveur — inchangé');
  ok(ticketNo({ num: 64, provisionalNumber: true }) === 'L64',
    'hors ligne, le numéro porte sa marque : il ne peut plus être pris pour un numéro de serveur');
  ok(ticketNo({ num: 64, opNum: 3, provisionalNumber: true }) === '3',
    'et dès que le vrai numéro arrive, c\'est lui qui parle');
  ok(ticketNo({ num: 64 }) === '64',
    'un bon qui n\'a pas encore tenté le relais garde son compteur : on ne marque que ce qu\'on SAIT provisoire');
  ok(ticketNo({ num: 7, opNum: 12, opChannel: 'kiwi', type: 'takeaway' }) === 'OPD-12',
    'les préfixes OrderPro continuent de fonctionner');
}

{
  const relay = CAISSE.slice(CAISSE.indexOf('function relayToKitchen(order)'), CAISSE.indexOf("/* ═══════ REVENIR À LA SALLE"));
  ok(/order\.provisionalNumber = true;/.test(relay), 'un relais sans numéro marque le bon comme provisoire');
  ok(/order\.provisionalNumber = false;/.test(relay), 'et l\'arrivée du vrai numéro lève la marque');
  ok(/=== 'L' \+ String\(order\.num\)/.test(relay),
    'la table reconnaît son ancien libellé provisoire, sinon elle garderait « L64 » pour toujours');
  ok(/reconcileReceiptOrderNumber\(order\)/.test(relay), 'et le ticket client déjà figé est réparé');
}

/* La reprise de file annonce enfin ce qu'elle a appris. */
{
  const post = RELAY.slice(RELAY.indexOf('function post(body, isRetry)'), RELAY.indexOf('/* Poser un bon.'));
  ok(/isRetry && j && j\.ok && j\.number != null/.test(post),
    'une reprise qui obtient le numéro canonique ne le jette plus');
  ok(/kiwi:kitchen-relay-number/.test(post), 'elle l\'annonce sous un nom que la caisse peut écouter');
  ok(/id: body\.create\.id/.test(post), 'avec l\'identité du bon concerné');

  const listener = CAISSE.slice(CAISSE.indexOf("window.addEventListener('kiwi:kitchen-relay-number'"), CAISSE.indexOf("/* ═══════ REVENIR À LA SALLE"));
  ok(/opTickets\.get\(String\(detail\.id\)\)/.test(listener), 'la caisse retrouve le bon par son identité, pas par son numéro');
  ok(/order\.opNum != null\) return;/.test(listener), 'et ne réécrit jamais un numéro déjà canonique');
  ok(/reconcileReceiptOrderNumber\(order\)/.test(listener), 'le ticket client est repris');
  ok(/numéro définitif/.test(listener),
    'et le comptoir l\'apprend : le papier « L64 » est déjà sur la planche, il faut pouvoir le rapprocher');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
