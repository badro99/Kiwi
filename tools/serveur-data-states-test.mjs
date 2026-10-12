#!/usr/bin/env node
/* L'app serveur (kiwi-serveur.html) : ce qu'elle affirme doit être vrai, même
 * quand le réseau ment.
 *
 *   · Une donnée en retard le dit : « Hors ligne · dernière mise à jour HH:MM »
 *     (FR/EN/AR), et seulement quand elle est en retard.
 *   · La carte n'est lue qu'une fois à la fois, pas deux fois en dix secondes,
 *     et jamais écran éteint ; avant sa première lecture, la carte et le plan
 *     de salle disent « chargement » ou « injoignable », pas « vide ».
 *   · « Lancer » a un délai réel et un message clair ; la commande reste.
 *   · Un encaissement ou une demande d'addition tentés hors ligne échouent
 *     tout de suite, avec un message clair, et la table revient en arrière.
 *   · Les pulsations n'animent plus box-shadow ni background-color.
 *
 * Node ESM, sans dépendance : les vraies fonctions sont extraites de la page
 * et exécutées dans un contexte vm.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };
const flush = () => new Promise((r) => setImmediate(r));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await flush(); };
const slice = (start, end) => {
  const a = html.indexOf(start);
  assert.notEqual(a, -1, `repère absent : ${start}`);
  const b = html.indexOf(end, a);
  assert.notEqual(b, -1, `repère absent : ${end}`);
  return html.slice(a, b);
};
const fn = (start) => {
  const a = html.indexOf(start);
  assert.notEqual(a, -1, `repère absent : ${start}`);
  return html.slice(a, html.indexOf('\n    }\n', a) + 7);
};
const OFFLINE_PAY = "Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.";
const OFFLINE_BILL = "Pas de réseau. L'addition n'est pas transmise, réessayez au retour du réseau.";

function fakeTimers() {
  const timers = new Map();
  let seq = 0;
  return {
    timers,
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { f, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    fire(ms) { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.f(); } },
  };
}
const hanging = (log) => (url, opts) => new Promise((resolve, reject) => {
  log.push({ url, opts });
  if (opts && opts.signal) opts.signal.addEventListener('abort', () => {
    const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
  });
});
const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
}));

/* ══ 1 · svFetchJson : le délai réel commun ══════════════════════════════ */
{
  const timers = fakeTimers();
  const log = [];
  const ctx = vm.createContext({
    SV_NET_TIMEOUT_MS: 12000, AbortController, Promise, Object, Error,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    fetch: hanging(log),
  });
  vm.runInContext(fn('    function svFetchJson('), ctx);
  let err = null;
  ctx.svFetchJson('/api/x', { method: 'POST' }, 9000).catch((e) => { err = e; });
  await settle();
  ok('la requête porte un signal et un délai réel', log[0].opts.signal && [...timers.timers.values()].some((t) => t.ms === 9000));
  timers.fire(9000);
  await settle();
  ok('au-delà du délai : AbortError marqué timeout', err && err.name === 'AbortError' && err.timeout === true);
  ok('le minuteur ne survit pas à la réponse', timers.timers.size === 0);

  ctx.fetch = () => Promise.resolve(new Response('<html>', { status: 502 }));
  const r = await ctx.svFetchJson('/api/x', {});
  ok('un corps non JSON donne data:null avec le statut', r.ok === false && r.status === 502 && r.data === null);
  ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  let net = null;
  await ctx.svFetchJson('/api/x', {}).catch((e) => { net = e; });
  ok('un réseau tombé reste une erreur réseau (pas un délai)', net instanceof Error && !net.timeout);
}

/* ══ 2 · La carte : une lecture à la fois, pas deux en dix secondes ══════ */
const carteSrc = slice('    function svFetchCarte() {', '\n\n    /* ── Envoyer la commande');
function carte({ fetch, hidden = false } = {}) {
  const timers = fakeTimers();
  const paints = [];
  const store = new Map();
  const ctx = vm.createContext({
    SV_DEMO: false, svSlug: () => ctx.slug, slug: 'test-resto',
    SV_CARTE_MIRROR: 'kiwi:carte:', menuItems: [],
    localStorage: { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) || null },
    svApplyCarte: (m) => { ctx.menuItems = m.items; return m.items.length > 0; },
    renderMenu: () => paints.push(ctx.svCarteState),
    document: { hidden },
    AbortController, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    Date, JSON, Promise, Array, encodeURIComponent,
    fetch,
  });
  vm.runInContext(carteSrc + '\n;this.state = () => svCarteState; this.setAt = (v) => { svCarteAt = v; };', ctx);
  Object.defineProperty(ctx, 'svCarteState', { get: () => ctx.state() });
  return { ctx, timers, paints };
}
{
  let calls = 0;
  const menu = { menu: { items: [{ id: 'a', name: 'Tajine' }] } };
  const c = carte({ fetch: () => { calls++; return json(200, menu); } });
  const a = c.ctx.svFetchCarte();
  const b = c.ctx.svFetchCarte();
  ok('deux lectures simultanées partagent la même requête', a === b && calls === 1);
  ok('la lecture aboutit', (await a) === true && c.ctx.state() === 'ok');
  await c.ctx.svFetchCarte();
  ok('une carte lue il y a moins de 10 s n’est pas relue', calls === 1);
  await c.ctx.svFetchCarteNow();
  ok('le retour à l’écran force une relecture', calls === 2);
  c.ctx.slug = 'other-resto';
  await c.ctx.svFetchCarte();
  ok('un autre commerce relit tout de suite', calls === 3);
  c.ctx.setAt(1);
  c.ctx.document.hidden = true;
  c.ctx.slug = 'test-resto';
  await c.ctx.svFetchCarte();
  ok('écran éteint : pas de lecture', calls === 3);
}
{
  const log = [];
  const c = carte({ fetch: hanging(log) });
  const p = c.ctx.svFetchCarte();
  ok('avant la première réponse, la carte est « en chargement »', c.ctx.state() === 'loading');
  await settle();
  c.timers.fire(10000);
  ok('une carte qui ne répond pas est coupée au délai', (await p) === false && c.ctx.state() === 'error');
  ok('l’écran passe alors à « injoignable », pas à une promesse', c.paints.at(-1) === 'error');
  const empty = carte({ fetch: () => json(200, { menu: { items: [] } }) });
  await empty.ctx.svFetchCarte();
  ok('une carte réellement vide est dite vide', empty.ctx.state() === 'empty');
  const down = carte({ fetch: () => json(200, { unreachable: true, menu: null }) });
  await down.ctx.svFetchCarte();
  ok('une base injoignable n’est pas une carte vide', down.ctx.state() === 'error');
}
{
  const ctx = vm.createContext({
    SV_DEMO: false, svCarteState: 'loading', svKnownOffline: () => false,
    SV_ICON_OFFLINE: '<svg class="ms"></svg>', SV_ICON_SYNC: '<svg class="ms"></svg>',
    esc: (s) => String(s), employeeTranslation: (s) => s,
  });
  vm.runInContext(fn('    function svMenuEmptyHTML() {'), ctx);
  const say = (state) => { ctx.svCarteState = state; return ctx.svMenuEmptyHTML(); };
  ok('carte : trois états distincts',
    say('loading').includes('Chargement de la carte…')
    && say('error').includes('Impossible de charger la carte')
    && say('empty').includes('Carte pas encore composée'));
}

/* ══ 3 · L'en-tête : « Hors ligne » seulement quand c'est vrai ═══════════ */
const syncSrc = slice('    const SV_POLL_TIMEOUT_MS = 10000;', '    /* Matériel Symbols');
function header() {
  const el = { hidden: true, textContent: '', dataset: {} };
  const classes = new Set();
  const repaints = [];
  const ctx = vm.createContext({
    SV_DEMO: false, shiftStart: new Date(), liveEmployeeState: { merchant: 'test-resto' },
    currentTab: 'tables', offline: false,
    SERVICE_SYNC_FAST: 6000, SERVICE_SYNC_LIVE: 20000,
    svWhenIdle: (k, f) => { repaints.push(k); f(); }, renderTables() {}, pollServiceSync() {},
    window: { addEventListener() {} },
    document: {
      hidden: false, addEventListener() {},
      getElementById: (id) => (id === 'tb-sync' ? el : null),
      body: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    },
    Date, String, Math,
  });
  ctx.svKnownOffline = () => ctx.offline;
  vm.runInContext(syncSrc + '\n;this.sync = svSync;', ctx);
  return { ctx, el, classes, repaints };
}
{
  const h = header();
  h.ctx.svRenderSyncStatus();
  ok('avant toute synchro, en ligne : rien dans l’en-tête', h.el.hidden === true);
  h.ctx.svSyncMark(true);
  ok('données fraîches : rien dans l’en-tête', h.el.hidden === true && !h.classes.has('sv-stale'));
  const at = h.ctx.sync.lastOkAt;
  h.ctx.svSyncMark(false);
  ok('une synchro ratée : « Hors ligne · dernière mise à jour HH:MM »',
    h.el.hidden === false && h.el.textContent === `Hors ligne · dernière mise à jour ${h.ctx.svClock(at)}`
    && /^\d{2}:\d{2}$/.test(h.ctx.svClock(at)) && h.classes.has('sv-stale'));
  ok('le plan de salle est redessiné quand l’état change', h.repaints.includes('tables'));
  h.ctx.svSyncMark(true);
  ok('la synchro revenue efface l’alerte', h.el.hidden === true && !h.classes.has('sv-stale'));
  h.ctx.offline = true;
  h.ctx.svRenderSyncStatus();
  ok('le système hors ligne suffit à le dire', h.el.hidden === false);
  h.ctx.offline = false;
  h.ctx.sync.lastOkAt = Date.now() - 3 * 6000 - 10000 - 1000;
  h.ctx.svRenderSyncStatus();
  ok('trois tours sans synchro réussie : en retard', h.el.hidden === false);
  h.ctx.sync.resumedAt = Date.now();
  h.ctx.svRenderSyncStatus();
  ok('un téléphone qui revient de veille n’est pas déclaré hors ligne', h.el.hidden === true);

  const never = header();
  never.ctx.svSyncMark(false);
  ok('jamais synchronisé et en échec : « Hors ligne · pas encore synchronisé »',
    never.el.textContent === 'Hors ligne · pas encore synchronisé');
  never.ctx.svSyncReset();
  ok('fin de service : l’état de synchro repart de zéro', never.el.hidden === true && never.ctx.sync.lastOkAt === 0);
}
ok('chaque tour de synchro le marque, réussi ou non',
  /svSyncMark\(!!\(res\.events && res\.events\.ok && res\.orders && res\.orders\.ok\)\);\s*\}\)\.catch\(\(\) => \{ svSyncMark\(false\); \}\);/.test(html));
ok('les lectures de synchro ont un délai réel',
  /svFetchJson\('\/api\/service\/events[\s\S]{0,260}SV_POLL_TIMEOUT_MS\)/.test(html)
  && /await svFetchJson\(url, \{[\s\S]{0,120}SV_POLL_TIMEOUT_MS\)/.test(html));
ok('l’en-tête porte la zone de statut', /<span class="tb-sync" id="tb-sync" role="status" aria-live="polite" hidden><\/span>/.test(html));

/* ══ 4 · Le plan de salle avant sa première synchro ══════════════════════ */
{
  const ctx = vm.createContext({
    SV_DEMO: false, shiftStart: new Date(), liveEmployeeState: { floor: null }, serviceCanonicalReady: false,
    activeRole: {}, tables: {}, svSync: { failing: false }, offline: false,
    esc: (s) => String(s), employeeTranslation: (s) => s,
    SV_ICON_OFFLINE: '<svg class="ms off"></svg>', SV_ICON_SYNC: '<svg class="ms sync"></svg>', Object,
  });
  ctx.svKnownOffline = () => ctx.offline;
  vm.runInContext(fn('    function svFloorNoteHTML() {') + fn('    function svFloorEmptyHTML() {'), ctx);
  ok('plan inconnu, synchro en cours : « Chargement des tables… »', ctx.svFloorEmptyHTML().includes('Chargement des tables…'));
  ctx.svSync.failing = true;
  ok('plan inconnu, synchro en échec : « Serveur injoignable »', ctx.svFloorEmptyHTML().includes('Serveur injoignable'));
  ctx.liveEmployeeState.floor = { tables: [] };
  ok('plan connu et vide : « Aucune table dans le plan de salle »', ctx.svFloorEmptyHTML().includes('Aucune table dans le plan de salle'));
  ctx.tables['1'] = { status: 'khawya' };
  ctx.svSync.failing = false;
  ok('tables connues, état pas encore lu : la ligne le dit', ctx.svFloorNoteHTML().includes('Synchronisation des tables…'));
  ctx.svSync.failing = true;
  ok('état illisible : la ligne dit que le serveur est injoignable', ctx.svFloorNoteHTML().includes('Serveur injoignable'));
  ctx.serviceCanonicalReady = true;
  ok('après la première synchro, plus de ligne', ctx.svFloorNoteHTML() === '');
}
ok('un plan vide n’affiche plus « modifiez le filtre »',
  /wrap\.innerHTML = !Object\.keys\(tables\)\.length\s*\? svFloorEmptyHTML\(\)\s*: svFloorNoteHTML\(\) \+/.test(html));

/* ══ 5 · « Lancer » : délai réel, échec annoncé, commande gardée ═════════ */
function sender({ fetch, online = true }) {
  const memory = new Map();
  const timers = fakeTimers();
  const tableOrders = { T1: [{ uid: 'line-a', id: 'dish', name: 'Dish', qty: 1, sentQty: 0, price: 50, opts: [], note: '', station: 'kitchen' }] };
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, Boolean, Promise, Map, Error,
    AbortController, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    navigator: { onLine: online },
    localStorage: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k),
    },
    liveEmployeeState: { merchant: 'test-resto', staffId: 'waiter-1' }, currentUser: 'waiter-1',
    svSlug: () => 'test-resto', tableOrders, activeRole: { fullName: 'Test Waiter' },
    serviceTableSessions: new Map([['T1', 'visit-1']]), serviceTableSessionRevisions: new Map(),
    serviceStateVersion: new Map(), serviceBillAwaiting: new Map(), tables: { T1: {} },
    serviceCanonicalOrders: new Map(), fetch, svBrowseMode: () => false,
  };
  ctx.window = ctx;
  vm.runInNewContext(slice('    const svPendingRef = new Map();', '    /* ---------- Generated orders for occupied tables ---------- */'), ctx);
  return { ctx, timers, tableOrders };
}
{
  const log = [];
  const s = sender({ fetch: hanging(log) });
  const run = s.ctx.svSendOrder('T1');
  await settle();
  ok('l’envoi part avec un signal et un délai de 12 s',
    log.length === 1 && log[0].opts.signal && [...s.timers.timers.values()].some((t) => t.ms === 12000));
  s.timers.fire(12000);
  const res = await run;
  ok('sans réponse : « timeout », pas « envoyé »', res.ok === false && res.error === 'timeout');
  ok('la commande reste à envoyer', s.tableOrders.T1[0].sentQty === 0);
  const off = sender({ fetch: () => { throw new Error('must not fetch'); }, online: false });
  const r2 = await off.ctx.svSendOrder('T1');
  ok('hors ligne connu : échec immédiat, sans requête', r2.ok === false && r2.error === 'offline');
}
ok('« Lancer » montre qu’il travaille', /btn\.classList\.add\('is-busy'\);\s*btn\.setAttribute\('aria-busy', 'true'\);/.test(html)
  && html.includes("employeeTranslation('Envoi en cours…')"));
ok('un délai d’envoi a son message', /'timeout':\s*'pas de réponse du serveur · commande NON confirmée, réessayez'/.test(html));

/* ══ 6 · Encaisser ou demander l'addition hors ligne ═════════════════════ */
function payer({ fetch, offline = false }) {
  const timers = fakeTimers();
  const toasts = [];
  const t = { status: 'ka-tkhdam', covers: 2 };
  const ctx = vm.createContext({
    tables: { 3: t }, employeePaymentsInFlight: new Set(), tableOrders: { 3: [{ id: 'd', name: 'Dish', qty: 1, sentQty: 1, price: 90 }] },
    dirtyOrders: new Set(), getTableTotal: () => 90, tableClients: new Map(), menuItems: [], catLabels: {},
    employeePaymentId: (k) => k + '-emp', serviceTableOrderRef: () => 'T-3',
    liveEmployeeState: { merchant: 'test-resto' }, svSlug: () => 'test-resto',
    serviceCanonicalOrders: new Map(), serviceTableSessions: new Map([['3', 'visit-3']]),
    currentTab: 'tables', renderTables() {}, activeTableId: null, renderTableDetail() {},
    svBrowseMode: () => false, svBrowseGuard: () => false, toast: (m) => toasts.push(m), svKnownOffline: () => offline,
    SV_PAY_OFFLINE_MSG: OFFLINE_PAY, SV_PAY_TIMEOUT_MS: 15000, SV_DEMO: false,
    AbortController, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    fetch, JSON, Math, Number, Date, String, Array, Object, Error, Promise,
  });
  vm.runInContext(fn('    async function markTablePaid('), ctx);
  return { ctx, t, toasts, timers };
}
{
  let fetched = 0;
  const p = payer({ fetch: () => { fetched++; return json(200, { ok: true }); }, offline: true });
  ok('paiement hors ligne : échec immédiat', (await p.ctx.markTablePaid('3', 'cash')) === false && fetched === 0);
  ok('le message dit qu’il n’est pas enregistré', p.toasts[0] === OFFLINE_PAY);
  ok('la table revient à « addition demandée »', p.t.status === 'bgha-ykhlass' && p.ctx.employeePaymentsInFlight.size === 0);

  const net = payer({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
  await net.ctx.markTablePaid('3', 'card');
  ok('réseau tombé pendant l’envoi : même message, même retour arrière', net.toasts[0] === OFFLINE_PAY && net.t.status === 'bgha-ykhlass');

  const log = [];
  const slow = payer({ fetch: hanging(log) });
  const run = slow.ctx.markTablePaid('3', 'card');
  await settle();
  ok('l’encaissement a un délai réel (15 s)', [...slow.timers.timers.values()].some((t) => t.ms === 15000) && log[0].opts.signal);
  slow.timers.fire(15000);
  ok('sans réponse : « paiement non confirmé », la table revient', (await run) === false
    && slow.toasts[0] === 'Table 3 · paiement non confirmé, ne repassez pas la carte, réessayez' && slow.t.status === 'bgha-ykhlass');
  ok('le minuteur est rendu', slow.timers.timers.size === 0);

  const refused = payer({ fetch: () => json(409, { ok: false, error: 'session-closed' }) });
  await refused.ctx.markTablePaid('3', 'cash');
  ok('un refus du serveur garde son propre message', refused.toasts[0] === 'Table 3 · paiement non enregistré, réessayez');
}
{
  /* Une part d'addition partagée, hors ligne. */
  const src = slice('    async function markSplitPartPaid(', "    $('#split-modal').addEventListener");
  const toasts = [];
  let fetched = 0;
  const ctx = vm.createContext({
    splitState: { tableId: '3', flow: { parts: [{ amount: 35, paid: false }, { amount: 55, paid: false }], paidCount: 0 } },
    tables: { 3: { status: 'ka-tkhdam' } }, employeePaymentsInFlight: new Set(),
    liveEmployeeState: { merchant: 'test-resto' }, svSlug: () => '', serviceCanonicalOrders: new Map(),
    serviceTableSessions: new Map([['3', 'visit-3']]), serviceTableOrderRef: () => 'T-3',
    employeePaymentId: (k) => k + '-emp', SV_DEMO: false, toast: (m) => toasts.push(m), svBrowseGuard: () => false,
    navigator: { onLine: false }, fetch: () => { fetched++; return json(200, { ok: true }); },
  });
  vm.runInContext(src, ctx);
  ok('une part payée hors ligne échoue tout de suite, sans requête',
    (await ctx.markSplitPartPaid(0, 'cash')) === false && fetched === 0 && toasts[0] === OFFLINE_PAY
    && ctx.splitState.flow.parts[0].paid === false && ctx.employeePaymentsInFlight.size === 0);
}
ok('une addition demandée hors ligne échoue tout de suite, sans basculer la table',
  /action === 'ask-bill'\) \{[\s\S]{0,400}if \(!SV_DEMO && svKnownOffline\(\)\) \{\s*toast\("Pas de réseau\. L'addition n'est pas transmise, réessayez au retour du réseau\.", 5200\);\s*return;/.test(html));

/* ══ 7 · Trois langues ═══════════════════════════════════════════════════ */
{
  const fr = [
    OFFLINE_PAY, OFFLINE_BILL, 'Hors ligne · pas encore synchronisé', 'Chargement de la carte…',
    "Impossible de charger la carte. Elle s'affichera au retour du réseau.", 'Synchronisation des tables…',
    "Serveur injoignable · l'état des tables n'est peut-être pas à jour", 'Chargement des tables…',
    'Le plan de salle arrive du serveur.', 'Serveur injoignable', "Les tables s'afficheront au retour du réseau.",
    'Aucune table dans le plan de salle', 'Le responsable compose le plan de salle depuis le tableau de bord.',
    'Envoi en cours…',
  ];
  const keyed = (s) => {
    const q = s.includes("'") ? `"${s}"` : `'${s}'`;
    return html.split(q + ':').length - 1;
  };
  const missing = fr.filter((s) => keyed(s) < 2);
  ok('chaque nouveau texte a sa traduction anglaise et arabe', missing.length === 0 || assert.fail('sans traduction : ' + missing.join(' | ')));
  const pats = vm.runInNewContext('(' + slice('    const EMPLOYEE_PATTERNS = [', '\n    ];').replace('    const EMPLOYEE_PATTERNS = ', '') + '\n    ])');
  const tr = (s, l) => { for (const [re, en, ar] of pats) if (re.test(s)) return s.replace(re, l === 'en' ? en : ar); return null; };
  ok('« Hors ligne · dernière mise à jour HH:MM » en anglais et en arabe',
    tr('Hors ligne · dernière mise à jour 21:07', 'en') === 'Offline · last updated 21:07'
    && tr('Hors ligne · dernière mise à jour 21:07', 'ar') === 'غير متصل · آخر تحديث 21:07');
  ok('les messages par table ont leur patron',
    tr('Table 3 · paiement non confirmé, réessayez', 'en') === 'Table 3 · payment not confirmed, try again'
    && tr('Table 3 · paiement non confirmé, ne repassez pas la carte, réessayez', 'en') === 'Table 3 · payment not confirmed, do not run the card again, just retry'
    && !!tr('Table 3 · pas de réponse du serveur · commande NON confirmée, réessayez', 'ar')
    && !!tr('Table 3 · part 2 non confirmée, réessayez', 'en')
    && tr('Table 3 · part 2 non confirmée, ne repassez pas la carte, réessayez', 'en') === 'Table 3 · share 2 not confirmed, do not run the card again, just retry');
  ok('aucun tiret cadratin dans les nouveaux textes', fr.every((s) => !s.includes('—')));
}

/* ══ 8 · Les pulsations ne repeignent plus ═══════════════════════════════ */
{
  const css = html.slice(0, html.indexOf('</style>'));
  const frames = new Map([...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)].map((m) => [m[1], m[2]]));
  const infinite = [...css.matchAll(/animation:\s*([\w-]+)[^;]*infinite/g)].map((m) => m[1]);
  ok('aucun pouls infini n’anime box-shadow ou background-color',
    infinite.every((name) => frames.has(name) && !/box-shadow|background/.test(frames.get(name))));
  ok('urgence, point et « Lancer » battent sur un pseudo-élément',
    /\.table-card\[data-status="bgha-ykhlass"\]::before \{[\s\S]{0,300}animation: urgent-pulse/.test(css)
    && /\.tc-pulse-dot::after \{[\s\S]{0,300}animation: pulse-dot/.test(css)
    && /\.td-btn\.lancer-btn::after \{[\s\S]{0,400}animation: lancer-pulse/.test(css));
  ok('mouvement réduit : l’animation est coupée et l’anneau fixe reste',
    /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{\s*animation-duration/.test(css)
    && /@media \(prefers-reduced-motion: reduce\) \{\s*\.tc-pulse-dot\.is-pending \{ box-shadow/.test(css));
}

console.log(`\nserveur-data-states · ${passed} checks · OK`);
