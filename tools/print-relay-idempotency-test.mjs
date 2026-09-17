#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Le ticket sort une fois, et il sort vraiment        (ticket #0066)
 *
 * Deux défauts qui se ressemblent et qui s'opposent.
 *
 * 4 · LE DOUBLON. Le dépôt sur /api/print/jobs fabriquait un travail neuf à
 *     chaque appel. Un verdict incertain, une reprise de file au rechargement,
 *     un réseau qui répond après coup : le même bon repartait, et deux papiers
 *     sortaient pour un seul plat. Le dépôt porte maintenant une clé
 *     d'idempotence — l'identifiant stable que la file possédait déjà — et le
 *     serveur rend le MÊME travail au lieu d'en créer un second.
 *
 * 5 · LA PERTE. À l'inverse, la file avalait ses échecs d'écriture : `put`
 *     rendait `false`, personne ne le lisait, la caisse annonçait « en file »
 *     et rien n'était écrit. Et la purge des trente minutes / cent vingt bons
 *     partait sans un mot. Ce qui disparaît ici est un plat qui ne sortira pas.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const BRIDGE = fs.readFileSync(path.join(ROOT, 'assets/printer-bridge.js'), 'utf8');
const JOBS = fs.readFileSync(path.join(ROOT, 'functions/api/print/jobs.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Impression · une clé d\'idempotence, et des écritures honnêtes');

/* ═══ Le vrai module de file, exécuté ══════════════════════════════════════ */
function makeStorage(limit) {
  const map = new Map();
  return {
    map,
    full: false,
    get length() { return map.size; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (this.full) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      if (!map.has(k) && map.size >= limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
  };
}

function load(options = {}) {
  const storage = makeStorage(options.limit || 10000);
  const events = [];
  const printed = [];
  const toasts = [];
  const sandbox = {
    localStorage: storage, JSON, Math, Date, String, Number, Object, Array, Error, RegExp,
    setTimeout: (fn) => 0, clearTimeout() {}, setInterval: () => 0, console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Promise,
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.dispatchEvent = (e) => { events.push(e); return true; };
  sandbox.window.KiwiCaisseToast = (title, ms, level, body) => { toasts.push({ title, level, body }); };
  sandbox.window.KiwiPrinter = {
    printKitchen(payload, opts) { printed.push({ payload, opts }); return Promise.resolve(options.result || { ok: true, via: 'relay' }); },
    isConfigured: () => true, isConnected: () => true,
  };
  storage.setItem('kiwiPaired', '1');
  storage.setItem('kiwiLiveMerchant', 'santos');
  vm.createContext(sandbox);
  vm.runInContext(QUEUE, sandbox, { filename: 'kitchen-print-queue.js' });
  const api = sandbox.window.KiwiKitchenPrint;
  api.setHub(true);
  return { storage, events, printed, toasts, api };
}

/* ═══ 4 · la clé voyage de la file jusqu'au dépôt ══════════════════════════ */
{
  const { api, printed } = load();
  api.enqueue([{ id: 'order:88:cuisine', payload: { station: 'cuisine', lines: [] } }]);
  ok(printed.length === 1, 'le bon part à l\'impression');
  const opts = printed[0] && printed[0].opts;
  ok(!!(opts && opts.clientRef), 'et il porte une clé d\'idempotence');
  ok(opts && opts.clientRef.indexOf('order:88:cuisine') > 0,
    'cette clé est l\'identifiant STABLE du travail, pas un tirage au sort');
  ok(opts && /^[A-Za-z0-9_:.-]{8,80}$/.test(opts.clientRef),
    'et elle respecte le format que le serveur exige, sinon le dépôt entier serait refusé');
}

/* La même clé pour la même reprise · une clé DIFFÉRENTE pour un autre papier. */
{
  const { api, printed } = load({ result: { ok: false, reason: 'relay-offline' } });
  api.enqueue([{ id: 'order:88:cuisine', payload: { station: 'cuisine' } }]);
  await api.flush();
  await api.retryNow();
  await api.flush();
  ok(printed.length >= 2, 'un échec fait repartir le bon');
  ok(printed[0].opts.clientRef === printed[1].opts.clientRef,
    'et la reprise porte la MÊME clé : le serveur reconnaît le travail au lieu d\'en créer un second');

  const ref = BRIDGE.slice(BRIDGE.indexOf('function printKitchen('), BRIDGE.indexOf('function printLabels'));
  ok(/ref \? ref \+ '\.fb' : ''/.test(ref),
    'le repli sur l\'imprimante caisse, lui, porte sa propre clé : c\'est un AUTRE papier');
}

/* ═══ Le pont envoie la clé, et seulement si elle est valide ═══════════════ */
{
  ok(/function relayEnqueue\(bytes, target, kind, ref\)/.test(BRIDGE), 'le dépôt accepte une clé');
  ok(/clientRef: relayClientRef\(ref\)/.test(BRIDGE), 'et la met dans le corps envoyé');
  const clean = BRIDGE.slice(BRIDGE.indexOf('function relayClientRef'), BRIDGE.indexOf('function relayTargetOf'));
  ok(/replace\(\/\[\^A-Za-z0-9_:\.-\]\/g, '-'\)/.test(clean), 'une clé est nettoyée avant de partir');
  ok(/slice\(0, 80\)/.test(clean) && /length >= 8/.test(clean), 'et bornée aux deux extrémités');
  ok(/return clean\.length >= 8 \? clean : '';/.test(clean),
    'une clé trop courte est abandonnée plutôt que de faire refuser tout le dépôt — mieux vaut un doublon possible qu\'aucun ticket');
  ok(/viaRelayOrFail\(bytes, target, ref\)/.test(BRIDGE), 'la clé traverse le repli vers le relais');
  ok(/bridgePrintBytes\(bytes, networkTarget, ref\)/.test(BRIDGE), 'et la chaîne des transports');
}

/* ═══ Le serveur rend le même travail ═════════════════════════════════════ */
{
  ok(/async function refDigest\(merchant, clientRef\)/.test(JOBS), 'le serveur dérive un identifiant de la clé');
  ok(/merchant \+ '\\u0000' \+ clientRef/.test(JOBS),
    'en y mêlant le commerce : deux marchands ne peuvent pas se voler un identifiant');
  ok(/\/\^\[A-Za-z0-9_:\.-\]\{8,80\}\$\//.test(JOBS) && /bad-client-ref/.test(JOBS),
    'une clé mal formée est refusée explicitement, pas silencieusement ignorée');
  ok(/INSERT OR IGNORE/.test(JOBS), 'l\'insertion ne peut pas écraser un travail déjà déposé');
  ok(/duplicate: true/.test(JOBS), 'et le second dépôt se dit pour ce qu\'il est');
  const dup = JOBS.slice(JOBS.indexOf('INSERT OR IGNORE'), JOBS.indexOf('duplicate: true') + 600);
  ok(/write-failed/.test(dup),
    '« INSERT OR IGNORE » ne veut pas dire « c\'est fait » : on relit la ligne, et son absence est un échec');
}

/* ═══ 5 · l'écriture qui échoue se dit ════════════════════════════════════ */
{
  const { api, storage, events, toasts } = load();
  storage.full = true;
  const r = api.enqueue([{ id: 'order:91:bar', payload: { station: 'bar' } }]);
  ok(r.accepted === 0, 'un stockage saturé n\'annonce plus une mise en file qui n\'a pas eu lieu');
  ok(r.skipped === 'storage-full', 'et il dit pourquoi');
  ok(events.some((e) => e.type === 'kiwi:kitchen-print-storage-full'),
    'la surface au-dessus reçoit un signal qu\'elle peut écouter');
  ok(toasts.some((t) => /saturée/.test(t.title)),
    'et le caissier est prévenu pendant qu\'il est encore devant le ticket');
  ok(/imprimez-le depuis l’aperçu/.test((toasts[0] || {}).body || ''),
    'avec ce qu\'il doit faire, pas seulement ce qui ne va pas');
}

/* Avant d'abandonner, on fait de la place là où c'est sans risque. */
{
  const { api, storage } = load({ limit: 4 });
  // Une clé de file, une de registre, et le stockage est plein.
  api.enqueue([{ id: 'order:1:cuisine', payload: { station: 'cuisine' } }]);
  const src = QUEUE.slice(QUEUE.indexOf('function writeQueue('), QUEUE.indexOf('function readDone('));
  ok(/trimDone\(50\)/.test(src), 'une écriture saturée taille d\'abord le registre anti-doublon');
  ok(src.indexOf('trimDone') < src.indexOf('storageFull'), 'et ne renonce qu\'après avoir réessayé');
  ok(/return written;/.test(src), 'writeQueue dit maintenant si l\'écriture a eu lieu');
  const trim = QUEUE.slice(QUEUE.indexOf('function trimDone('), QUEUE.indexOf('function storageFull('));
  ok(/slice\(-keep\)/.test(trim), 'la taille garde les entrées RÉCENTES : ce sont elles qui protègent d\'un doublon');
  ok(storage.length > 0, 'et la file continue de fonctionner');
}

/* Le registre `done` qui ne s'écrit pas est un risque de DOUBLON, pas une perte. */
{
  const done = QUEUE.slice(QUEUE.indexOf('function markDone('), QUEUE.indexOf('function alreadyDone('));
  ok(/storageFull\('done-ledger'\)/.test(done), 'ne pas pouvoir écrire le registre est signalé à part');
  ok(/DOUBLON/.test(done), 'et le code nomme le risque réel, pour qui le relira');
}

/* ═══ La purge ne part plus en silence ════════════════════════════════════ */
{
  const { api, storage, toasts } = load();
  const old = Date.now() - 31 * 60 * 1000;
  storage.setItem('kiwiKitchenPrintQueueV1:santos', JSON.stringify([
    { id: 'order:vieux', payload: { station: 'cuisine' }, createdAt: old },
    { id: 'order:frais', payload: { station: 'cuisine' }, createdAt: Date.now() },
  ]));
  const q = api._readQueue();
  ok(q.length === 1 && q[0].id === 'order:frais', 'un bon de plus de trente minutes quitte bien la file');
  const diag = JSON.parse(api.exportDiagnostics());
  ok(diag.transitions.some((t) => t.state === 'dropped-expired'),
    'mais son départ est journalisé : il ne disparaît plus sans trace');
  ok(diag.transitions.some((t) => t.state === 'dropped-expired' && t.id === 'order:vieux'),
    'et le journal nomme le bon perdu');
  ok(toasts.some((t) => /attente/.test(t.title)), 'le comptoir est prévenu');
}

{
  const { api, storage } = load();
  const rows = [];
  for (let i = 0; i < 130; i++) rows.push({ id: 'order:' + i, payload: { station: 'cuisine' }, createdAt: Date.now() });
  storage.setItem('kiwiKitchenPrintQueueV1:santos', JSON.stringify(rows));
  const q = api._readQueue();
  ok(q.length === 120, 'au-delà de cent vingt bons, la file reste bornée — un stockage n\'est pas infini');
  ok(q[0].id === 'order:10', 'et ce sont les PLUS ANCIENS qui partent, pas les plus récents');
  const diag = JSON.parse(api.exportDiagnostics());
  ok(diag.transitions.filter((t) => t.state === 'dropped-overflow').length === 10,
    'les dix bons évincés sont tous journalisés');
  ok(!diag.transitions.some((t) => t.state === 'dropped-expired'),
    'et ils ne sont pas confondus avec une péremption : ce n\'est pas la même panne');
}

/* Ce qui ne doit PAS changer. */
{
  const { api, printed } = load();
  api.enqueue([{ id: 'order:77:cuisine', payload: { station: 'cuisine' } }]);
  api.enqueue([{ id: 'order:77:cuisine', payload: { station: 'cuisine' } }]);
  ok(printed.length === 1, 'le même bon ne sort toujours qu\'une fois');
  const r = api.enqueue([{ id: 'order:77:cuisine', payload: { station: 'cuisine' } }], { force: true });
  ok(r.accepted === 1, 'et une réimpression demandée à la main sort toujours');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
