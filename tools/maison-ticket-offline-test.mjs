#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Maison — numérotation des tickets hors ligne  (ticket #0013)
 *
 * Le problème corrigé : sur une caisse maison réelle, hors ligne, sans plage de
 * numéros valide, `takeTicketNumber` renvoyait '' — le bouton « Encaisser »
 * restait désactivé sur « Attribution du numéro… » et AUCUNE vente ne pouvait
 * être créée, alors que la bannière hors-ligne promet exactement l'inverse.
 *
 * Ce que ce suite vérifie, en exécutant le vrai code de pos-maison.js :
 *   1. la plage est réservée à l'ouverture de la caisse, pas à la première vente ;
 *   2. une plage suivante est mise en réserve AVANT l'épuisement de la courante ;
 *   3. hors ligne, on bascule sur la plage en réserve sans toucher au réseau ;
 *   4. sans aucune plage et sans réseau, une référence provisoire est émise —
 *      la vente passe — et cette référence ne peut pas entrer en collision
 *      avec un numéro serveur (elle n'est pas numérique) ;
 *   5. deux tickets ne partagent jamais un numéro, y compris après rechargement ;
 *   6. un stockage en échec ne consomme jamais un numéro.
 *
 * Les fonctions de numérotation vivent dans l'IIFE de pos-maison.js. On les
 * découpe de la source réelle et on les exécute dans un bac à sable : le test
 * porte donc sur le code expédié, pas sur une copie qui dériverait.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/pos-maison.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Maison · numérotation des tickets hors ligne');

/* ── Découpe des fonctions réelles ─────────────────────────────────────────── */
function slice(name) {
  const head = SRC.indexOf(`\n  function ${name}(`);
  if (head < 0) return null;
  const end = SRC.indexOf('\n  }\n', head);
  if (end < 0) return null;
  return SRC.slice(head, end + 4);
}

const WANTED = [
  'cleanLeaseQueue', 'leaseRemaining', 'readTicketLease', 'saveTicketLease',
  'takeTicketNumber', 'topUpTicketLease', 'requestTicketRange', 'ensureTicketLease',
  'withTicketLock', 'claimTicketNumber', 'offlineDeviceTag', 'takeOfflineRef',
  'isOfflineRef', 'syncTicketPeriod', 'ticketPeriod',
];
const missing = WANTED.filter((n) => !slice(n));
ok(missing.length === 0, `toutes les fonctions de numérotation sont présentes dans pos-maison.js (manquantes : ${missing.join(', ') || 'aucune'})`);

const KEYS = ['TICKET_LEASE_KEY', 'TICKET_LEASE_SIZE', 'TICKET_LEASE_LOW', 'OFFLINE_REF_KEY'];
const consts = KEYS.map((k) => {
  const m = SRC.match(new RegExp(`\\n  const ${k} = ([^;]+);`));
  return m ? `  const ${k} = ${m[1]};` : null;
});
ok(consts.every(Boolean), 'les constantes de plage (taille, seuil de réserve, clés) sont déclarées');

if (missing.length || !consts.every(Boolean)) {
  console.error(`\n✗ ${failures.length} échec(s) — découpe impossible, suite interrompue.`);
  process.exit(1);
}

/* ── Bac à sable ───────────────────────────────────────────────────────────── */
function makeTill(opts) {
  const o = opts || {};
  const store = Object.assign({}, o.storage || {});
  const fetchLog = [];
  let nextStart = o.firstStart || 1000;
  let online = o.online !== false;
  let storageBroken = !!o.storageBroken;

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (storageBroken) throw new Error('QuotaExceeded');
      store[k] = String(v);
    },
    removeItem: (k) => { delete store[k]; },
  };

  const sandbox = {
    console,
    JSON, Math, Number, Date, String, Array, Object, RegExp, Error, Promise,
    localStorage,
    navigator: { get onLine() { return online; }, locks: null },
    setTimeout,
    fetch: (url, init) => {
      fetchLog.push({ url, body: JSON.parse(init.body) });
      if (!online) return Promise.reject(new Error('offline'));
      const start = nextStart;
      const end = start + 499;
      nextStart = end + 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ start, end, period: new Date().getFullYear() }),
      });
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const body = `
  const IS_DEMO = false;
  let saleSeq = ${o.saleSeq || 1000};
  let saleSeqPeriod = new Date().getFullYear();
  const state = { ticketStorageError: false };
  function merchantSlug() { return ${JSON.stringify(o.merchant || 'vogue-home')}; }
  let ticketLease = null;
  let ticketLeaseRequest = null;
  let ticketTopUpRequest = null;
${consts.join('\n')}
${WANTED.map(slice).join('\n')}
  globalThis.api = {
    take: takeTicketNumber,
    claim: claimTicketNumber,
    ensure: ensureTicketLease,
    topUp: topUpTicketLease,
    read: readTicketLease,
    remaining: () => leaseRemaining(readTicketLease()),
    isOffline: isOfflineRef,
    state,
    get seq() { return saleSeq; },
    pending: () => ticketTopUpRequest || ticketLeaseRequest || Promise.resolve(),
  };
  `;
  vm.createContext(sandbox);
  vm.runInContext(`(function(){${body}})()`, sandbox, { filename: 'pos-maison-slice.js' });
  return {
    api: sandbox.api,
    store,
    fetchLog,
    setOnline: (v) => { online = v; },
    breakStorage: (v) => { storageBroken = v; },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/* ── 1 · la plage arrive à l'ouverture, pas à la première cliente ──────────── */
{
  const till = makeTill({});
  till.api.topUp();
  await till.api.pending();
  await settle();
  ok(till.fetchLog.length === 1, 'ouverture en ligne : une plage est réservée sans attendre de vente');
  ok(till.api.remaining() >= 500, `la caisse a une provision de numéros dès l'ouverture (${till.api.remaining()})`);
  ok(till.fetchLog[0].url === '/api/ticket-sequence', 'la réservation passe bien par /api/ticket-sequence');
}

/* ── 2 · réserve constituée AVANT l'épuisement ─────────────────────────────── */
{
  const till = makeTill({});
  till.api.topUp();
  await till.api.pending();
  await settle();
  // Consomme jusqu'à passer sous le seuil de réserve.
  let last = '';
  for (let i = 0; i < 400; i++) { last = till.api.take(); await settle(); }
  ok(last === '1399', `400 numéros consommés en ligne, le dernier est séquentiel (${last})`);
  await till.api.pending();
  await settle();
  const lease = till.api.read();
  ok((lease.queue || []).length >= 1, 'une plage suivante est déjà en réserve sur la tablette');
  ok(till.fetchLog.length >= 2, 'la réserve a bien été demandée au serveur pendant que le réseau était là');
}

/* ── 3 · hors ligne, on bascule sur la réserve sans réseau ─────────────────── */
{
  const till = makeTill({});
  till.api.topUp();
  await till.api.pending();
  await settle();
  for (let i = 0; i < 400; i++) { till.api.take(); await settle(); }
  await till.api.pending();
  await settle();
  const callsBefore = till.fetchLog.length;
  till.setOnline(false);
  const got = [];
  for (let i = 0; i < 150; i++) { const n = till.api.take(); if (n) got.push(n); }
  ok(got.length === 150, `hors ligne, 150 ventes de plus obtiennent un numéro (${got.length})`);
  ok(new Set(got).size === 150, 'aucun numéro hors ligne n\'est distribué deux fois');
  ok(got.every((n) => /^\d+$/.test(n)), 'les numéros issus de la réserve restent de vrais numéros serveur');
  ok(till.fetchLog.length === callsBefore, 'la vente hors ligne n\'a contacté le serveur à aucun moment');
}

/* ── 4 · aucune plage + aucun réseau : la vente passe quand même ───────────── */
{
  const till = makeTill({ online: false });
  ok(till.api.take() === '', 'sans plage, aucune numérotation serveur n\'est possible (état de départ du bug)');
  const ref = await till.api.claim();
  ok(!!ref, 'le panier n\'est plus otage : une référence est délivrée hors ligne');
  ok(till.api.isOffline(ref), `la référence est marquée hors-ligne (${ref})`);
  ok(!/^\d+$/.test(ref), 'la référence provisoire n\'est PAS numérique : collision impossible avec une plage serveur');
  const second = await till.api.claim();
  ok(second !== ref, 'deux ventes hors ligne reçoivent deux références distinctes');
}

/* ── 5 · pas de réutilisation après rechargement de la tablette ────────────── */
{
  const first = makeTill({});
  first.api.topUp();
  await first.api.pending();
  await settle();
  const a = [];
  for (let i = 0; i < 5; i++) { a.push(first.api.take()); await settle(); }
  // Même localStorage, nouvelle session (rechargement de la page).
  const reloaded = makeTill({ storage: first.store, firstStart: 5000 });
  const b = [];
  for (let i = 0; i < 5; i++) { b.push(reloaded.api.take()); await settle(); }
  ok(a.every((n) => n && !b.includes(n)), 'après rechargement, aucun numéro déjà imprimé n\'est réémis');
  ok(+b[0] === +a[a.length - 1] + 1, 'la numérotation reprend exactement là où elle s\'était arrêtée');

  // Hors ligne aussi : la référence provisoire ne repart pas de 1.
  const offA = makeTill({ online: false });
  const r1 = await offA.api.claim();
  const offB = makeTill({ online: false, storage: offA.store });
  const r2 = await offB.api.claim();
  ok(r1 !== r2, 'après rechargement hors ligne, la référence provisoire ne se répète pas');
}

/* ── 6 · un stockage en échec ne consomme jamais un numéro ─────────────────── */
{
  const till = makeTill({});
  till.api.topUp();
  await till.api.pending();
  await settle();
  const before = till.api.read().next;
  till.breakStorage(true);
  const n = till.api.take();
  ok(n === '', 'stockage indisponible : aucun numéro n\'est délivré');
  ok(till.api.read().next === before, 'et la plage n\'a pas avancé — le numéro reste disponible');
  ok(till.api.state.ticketStorageError === true, 'la caisse signale explicitement la panne de stockage');
}

/* ── 7 · le code expédié branche bien tout cela ────────────────────────────── */
ok(/topUpTicketLease\(\);/.test(SRC.slice(SRC.indexOf('function mount('), SRC.indexOf('function mount(') + 800)),
  'mount() constitue la réserve de numéros à l\'ouverture de la caisse');
ok(/addEventListener\('online'/.test(SRC), 'le retour du réseau reconstitue la réserve');
ok(/offlineRef: isOfflineRef\(t\.num\)/.test(SRC), 'la vente encaissée hors ligne porte sa marque dans le journal');
ok(/isOfflineRef\(t\.num\) \? ' · hors-ligne' : ''/.test(SRC), 'la tête du ticket affiche « hors-ligne » sur une référence provisoire');

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
