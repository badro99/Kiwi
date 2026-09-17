#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Un seul comptoir imprime                    (ticket #0066, partie 3)
 *
 * Le « hub d'impression exclusif » n'était exclusif que dans la tête de chaque
 * navigateur : le bail vivait dans le localStorage de l'appareil, et le
 * localStorage d'un iPad ne sait rien de celui de la caisse d'à côté. Deux
 * tills pouvaient chacune se croire LE hub, tirer la même commande de la file
 * partagée, et sortir deux fois le même bon en cuisine.
 *
 * Un bail ne se fusionne pas, il s'arbitre : il passe donc par l'écriture
 * conditionnelle de store_docs, et cette suite vérifie les deux moitiés — la
 * règle d'arbitrage elle-même, et le fait que la caisse SE RETIRE quand elle
 * perd, sans jamais cesser d'imprimer là où il n'y a rien à arbitrer.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { validateHubClaim, publicHub, HUB_LEASE_MS } from '../functions/api/print/_hub-lease.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORE = fs.readFileSync(path.join(ROOT, 'functions/api/store.js'), 'utf8');
const QUEUE = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Impression · le hub exclusif l\'est enfin entre les appareils');

/* ═══ La règle d'arbitrage, exécutée ══════════════════════════════════════ */
const T = 1800000000000;
const held = (deviceId, expiresAt, claimedAt) => ({ hub: { deviceId, name: 'Comptoir', claimedAt: claimedAt || T, expiresAt } });

{
  const first = validateHubClaim(null, { hub: { deviceId: 'ipad-salle' } }, T);
  ok(first.ok, 'la première caisse qui demande obtient le bail');
  ok(first.value.hub.expiresAt === T + HUB_LEASE_MS,
    'l\'expiration est posée par le SERVEUR : une tablette qui retarde ne s\'attribue pas un bail éternel');
  ok(first.value.hub.claimedAt === T, 'et la prise d\'origine est datée');

  const second = validateHubClaim(held('ipad-salle', T + 50000), { hub: { deviceId: 'caisse-bar' } }, T);
  ok(!second.ok, 'une seconde caisse ne peut PAS prendre un bail vivant — c\'est tout le ticket');
  ok(second.error === 'print-hub-taken', 'le refus porte un nom que la caisse peut lire');
  ok(second.status === 409, 'et le code d\'un conflit, pas d\'une panne');
  ok(second.holder && second.holder.deviceId === 'ipad-salle',
    'il NOMME l\'appareil en place : sans ça l\'opérateur ne sait pas où aller le désactiver');
  ok(second.holder && second.holder.name === 'Comptoir', 'avec son nom visible');
  ok(!Object.prototype.hasOwnProperty.call(second.holder, 'token'),
    'et rien d\'autre : ce que le serveur rend à un perdant reste un identifiant d\'appareil');
}

{
  const renew = validateHubClaim(held('ipad-salle', T + 50000, T - 600000), { hub: { deviceId: 'ipad-salle' } }, T);
  ok(renew.ok, 'le porteur renouvelle son propre bail sans se bloquer lui-même');
  ok(renew.value.hub.claimedAt === T - 600000,
    'et la date de prise d\'origine traverse les renouvellements : « cette caisse imprime depuis 14 h 10 »');
  ok(renew.value.hub.expiresAt === T + HUB_LEASE_MS, 'seule l\'échéance avance');
}

{
  const expired = validateHubClaim(held('ipad-oublie', T - 1), { hub: { deviceId: 'caisse-bar' } }, T);
  ok(expired.ok,
    'un bail expiré est libre sans geste administratif : un iPad oublié dans un tiroir ne prive pas le comptoir de son imprimante');
  ok(expired.value.hub.deviceId === 'caisse-bar', 'et le nouveau porteur est bien celui qui a demandé');
  ok(validateHubClaim(held('ipad-salle', T), { hub: { deviceId: 'caisse-bar' } }, T).ok,
    'la borne est stricte : un bail qui expire À cet instant est déjà libre');
}

{
  const release = validateHubClaim(held('ipad-salle', T + 50000), { hub: null }, T);
  ok(!release.ok && release.error === 'print-hub-held',
    'une autre caisse ne peut pas DÉLOGER le comptoir en poussant un document vide');
  const own = validateHubClaim(held('ipad-salle', T + 50000), { hub: { deviceId: 'ipad-salle' } }, T);
  ok(own.ok, 'mais le porteur, lui, garde la main sur son bail');
  ok(validateHubClaim(null, { hub: null }, T).ok, 'et rendre un bail que personne ne tient ne casse rien');
}

{
  ok(!validateHubClaim(null, { hub: { deviceId: 'ab' } }, T).ok, 'un identifiant d\'appareil trop court est refusé');
  ok(!validateHubClaim(null, { hub: { deviceId: 'x'.repeat(200) } }, T).ok, 'un identifiant démesuré aussi');
  ok(!validateHubClaim(null, { hub: { deviceId: 'a b/c\'d' } }, T).ok, 'et un identifiant qui sort du jeu de caractères attendu');
  ok(!validateHubClaim(null, null, T).ok, 'un corps qui n\'est pas un document est refusé');
  ok(!validateHubClaim(null, [], T).ok, 'un tableau non plus');
  ok(validateHubClaim({ hub: { deviceId: 'ipad', expiresAt: 'demain' } }, { hub: { deviceId: 'autre' } }, T).ok,
    'un bail stocké illisible ne verrouille pas le commerce à jamais');
  ok(publicHub(null) === null, 'et il n\'y a rien à publier quand il n\'y a pas de bail');
}

/* Le nom donné par la caisse ne peut pas devenir une charge utile. */
{
  const long = validateHubClaim(null, { hub: { deviceId: 'ipad-salle', name: 'n'.repeat(400) } }, T);
  ok(long.value.hub.name.length === 60, 'le nom d\'appareil est borné avant d\'être stocké');
}

/* ═══ store.js arbitre vraiment, au lieu d'écraser ════════════════════════ */
{
  ok(/import \{ validateHubClaim \} from '\.\/print\/_hub-lease\.js'/.test(STORE), 'store.js utilise cet arbitrage');
  ok(/const PRINT_HUB_FEATURE = 'printhub'/.test(STORE), 'le bail a sa propre fonctionnalité');
  ok(/CAS_FEATURES = new Set\(\['reservations', PRINT_HUB_FEATURE\]\)/.test(STORE),
    'et rejoint les documents à écriture CONDITIONNELLE : c\'est la primitive qui arbitre');
  const write = STORE.slice(STORE.indexOf('const writeDoc = CAS_FEATURES.has(feature)'), STORE.indexOf('if (feature === \'team\')'));
  ok(/WHERE merchant=\? AND feature=\? AND rev=\?/.test(write),
    'deux caisses qui réclament depuis la même révision : une seule écriture passe');
  ok(/ON CONFLICT\(merchant,feature\) DO NOTHING/.test(write),
    'et la toute première prise ne peut pas écraser celle qui l\'a précédée d\'un cheveu');
  ok(/CAS_FEATURES\.has\(feature\) && Number\(written\.meta\?\.changes\) !== 1/.test(STORE),
    'une écriture qui n\'a touché aucune ligne est un conflit, pas un succès');

  const block = STORE.slice(STORE.indexOf('if (feature === PRINT_HUB_FEATURE)'), STORE.indexOf('// Un premier envoi VIDE'));
  ok(/validateHubClaim\(mine, clean\.value, now\)/.test(block), 'la demande est confrontée au bail réellement stocké');
  ok(/clean\.value = claim\.value;/.test(block) && /text = JSON\.stringify\(clean\.value\)/.test(block),
    'et c\'est la version RÉÉCRITE par le serveur qui est enregistrée, pas celle qu\'a envoyée la caisse');
  ok(/holder: claim\.holder \|\| null/.test(block), 'le perdant apprend qui tient l\'imprimante');
  ok(/feature !== PRINT_HUB_FEATURE/.test(STORE.slice(STORE.indexOf('// Un premier envoi VIDE'), STORE.indexOf('const rev = serverRev + 1'))),
    'rendre le bail est un document vide légitime : la garde anti-effacement ne s\'y applique pas');
}

/* ═══ La caisse : elle se retire quand elle perd, et imprime quand il n'y a rien à arbitrer ══ */
function load(responder) {
  const map = new Map();
  const storage = {
    get length() { return map.size; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
  const toasts = [];
  const posted = [];
  const sandbox = {
    localStorage: storage, JSON, Math, Date, String, Number, Object, Array, Error, RegExp, Promise, console,
    setTimeout: (fn) => 0, clearTimeout() {}, setInterval: () => 0, encodeURIComponent,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    document: { readyState: 'complete', title: 'Caisse bar', addEventListener() {}, getElementById: () => null },
    fetch(url, opts) {
      if (opts && opts.method === 'POST') posted.push(JSON.parse(opts.body));
      const out = responder(url, opts);
      if (out === null) return Promise.reject(new Error('offline'));
      return Promise.resolve({ status: out.status || 200, json: () => Promise.resolve(out.body) });
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.dispatchEvent = () => true;
  sandbox.window.KiwiCaisseToast = (title, ms, level, body) => { toasts.push({ title, level, body }); };
  sandbox.window.KiwiPrinter = { printKitchen: () => Promise.resolve({ ok: true }), isConfigured: () => true, isConnected: () => true };
  storage.setItem('kiwiPaired', '1');
  storage.setItem('kiwiLiveMerchant', 'santos');
  vm.createContext(sandbox);
  vm.runInContext(QUEUE, sandbox, { filename: 'kitchen-print-queue.js' });
  return { api: sandbox.window.KiwiKitchenPrint, toasts, posted, storage };
}

/* Le serveur accorde. */
{
  const { api, posted } = load((url, opts) => (opts && opts.method === 'POST')
    ? { body: { ok: true, rev: 4 } }
    : { body: { feature: 'printhub', rev: 3, data: null } });
  api.setHub(true);
  await api._claimRemote(true);
  ok(posted.length >= 1, 'activer le hub demande l\'arbitrage au serveur');
  ok(posted[0].feature === 'printhub' && posted[0].baseRev === 3,
    'en réclamant DEPUIS la révision qu\'on vient de lire : c\'est ça, l\'arbitrage');
  ok(posted[0].data.hub && posted[0].data.hub.deviceId, 'et en se nommant');
  ok(api.isHub(), 'accordé, cette caisse imprime');
}

/* Le serveur refuse : la caisse se retire, et le dit. */
{
  const { api, toasts } = load((url, opts) => (opts && opts.method === 'POST')
    ? { status: 409, body: { error: 'print-hub-taken', holder: { deviceId: 'ipad-salle', name: 'Comptoir', expiresAt: Date.now() + 60000 } } }
    : { body: { rev: 7, data: null } });
  api.setHub(true);
  await api._claimRemote(true);
  ok(!api.isHub(), 'refusée, cette caisse n\'imprime PAS — sinon le bon sortirait deux fois');
  ok(toasts.some((t) => /Une autre caisse imprime déjà/.test(t.title)),
    'et l\'opérateur l\'apprend pendant qu\'il est devant l\'écran');
  ok(toasts.some((t) => /Comptoir/.test(t.body || '')),
    'avec le nom de l\'appareil où aller la désactiver, pas un code d\'erreur');
  const r = api.enqueue([{ id: 'order:5:cuisine', payload: {} }], { remote: true });
  ok(r.skipped === 'not-print-hub', 'et elle refuse net les bons distants tant qu\'elle n\'est pas le hub');
}

/* Hors ligne, ou migration pas passée : on n'arbitre pas, et surtout on ne bloque pas. */
{
  const { api } = load(() => null);
  api.setHub(true);
  await api._claimRemote(true);
  ok(api.isHub(),
    'serveur injoignable : la caisse continue d\'imprimer — un commerce à une seule caisse ne doit pas dépendre du réseau pour ses tickets');
}
{
  const { api } = load((url, opts) => (opts && opts.method === 'POST')
    ? { status: 503, body: { error: 'unmigrated' } }
    : { body: { rev: 0, data: null, unmigrated: true } });
  api.setHub(true);
  await api._claimRemote(true);
  ok(api.isHub(), 'migration pas encore passée en production : même règle, on n\'invente pas un refus');
}

/* La course exacte du ticket : deux caisses, une seule révision. */
{
  const { api } = load((url, opts) => (opts && opts.method === 'POST')
    ? { status: 409, body: { error: 'stale' } }
    : { body: { rev: 2, data: null } });
  api.setHub(true);
  await api._claimRemote(true);
  ok(!api._remote.holder, 'une écriture périmée ne désigne personne');
  ok(/n'arbitre pas/.test(QUEUE) || /arbitrated: false/.test(QUEUE), 'et ne fabrique pas un faux verdict');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
