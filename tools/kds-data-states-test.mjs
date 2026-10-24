#!/usr/bin/env node
/* Le passe (kiwi-cuisine.html) et son transport (assets/kitchen-relay.js) :
 * ce que l'écran affirme doit être vrai, même quand le réseau ment.
 *
 *   1 · Plus de blocage muet : chaque appel du relais a un délai réel, le
 *       verrou du sondage se rend toujours, et un relevé pendu est déclaré
 *       mort (sa réponse tardive est ignorée).
 *   2 · Un geste (« Je prends », « Prête », « Remise ») n'est abandonné qu'à
 *       l'ÂGE (STALE_MS), jamais au nombre d'essais ; il reste marqué « pas
 *       encore synchronisé » et son abandon est annoncé à la brigade.
 *   3 · Pas de faux « rien de neuf » : chargement / injoignable avant le
 *       premier relevé, et le dernier tableau connu, daté, au démarrage à froid.
 *   4 · Pas de repeinture sous le doigt : signature identique = rien ne bouge,
 *       doigt posé = la peinture attend le relâché puis le clic.
 *   5 · Batterie : 5 s, puis 10, 20, 30 s quand rien ne répond ; rien quand
 *       l'écran est caché ; /api/config toutes les 60 s.
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
const cuisine = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
const relaySrc = fs.readFileSync(path.join(ROOT, 'assets/kitchen-relay.js'), 'utf8');

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };
const flush = () => new Promise((r) => setImmediate(r));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await flush(); };
const slice = (start, end) => {
  const a = cuisine.indexOf(start);
  assert.notEqual(a, -1, `repère absent : ${start}`);
  const b = cuisine.indexOf(end, a);
  assert.notEqual(b, -1, `repère absent : ${end}`);
  return cuisine.slice(a, b);
};
const constant = (name) => {
  const m = cuisine.match(new RegExp(`var ${name} = ([^;]+);`));
  assert.ok(m, `constante absente : ${name}`);
  return Function(`return (${m[1]})`)();
};
const STALE_MS = constant('STALE_MS');
const MERCHANT = 'test-kitchen';

function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/* Des minuteurs qu'on déclenche à la main : le délai réel de 8 s se vérifie
 * sans attendre 8 s. */
function fakeTimers() {
  const timers = new Map();
  let seq = 0;
  return {
    timers,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    fire(ms) {
      for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); }
    },
  };
}

/* ══ 1 · Le relais : un délai réel sur chaque appel ══════════════════════ */
function relay(fetchImpl, timers) {
  const window = { addEventListener() {} };
  const ctx = {
    window,
    localStorage: storage({ kiwiPaired: '1', kiwiLiveMerchant: MERCHANT }),
    fetch: fetchImpl,
    AbortController,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    setInterval() { return 0; }, clearInterval() {},
  };
  vm.runInNewContext(relaySrc, ctx);
  return window.KiwiKitchenRelay;
}
/* Une requête qui ne répond jamais, mais qui entend l'annulation. */
const hangingFetch = (seen) => (url, opts) => new Promise((resolve, reject) => {
  seen.push({ url, opts });
  if (opts && opts.signal) {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    });
  }
});

{
  const timers = fakeTimers();
  const seen = [];
  const R = relay(hangingFetch(seen), timers);
  ok('le relais expose son délai (8 s)', R.timeoutMs === 8000);
  let result = 'pending';
  R.pull(0, 'kitchen').then((j) => { result = j; });
  await settle();
  ok('le relevé part avec un signal d’annulation', seen.length === 1 && seen[0].opts.signal);
  ok('un délai de 8 s est armé sur le relevé', [...timers.timers.values()].some((t) => t.ms === 8000));
  assert.equal(result, 'pending');
  timers.fire(8000);
  await settle();
  ok('au-delà du délai, le relevé est coupé et compte comme un échec (null)', result === null);
  ok('le minuteur est rendu une fois la réponse tombée', timers.timers.size === 0);

  let bumped = 'pending';
  R.bump('ord-1', 'ready', 'chaud').then((r) => { bumped = r; });
  await settle();
  timers.fire(8000);
  await settle();
  ok('un geste sans réponse est coupé au même délai et reste à rejouer (null)', bumped === null);
}

/* Les réponses d'un geste : arrivé, refusé pour de bon, ou à rejouer. */
{
  const reply = (status, body, isJson = true) => () => Promise.resolve({
    ok: status >= 200 && status < 300, status,
    json: () => (isJson ? Promise.resolve(body) : Promise.reject(new SyntaxError('html'))),
  });
  const timers = fakeTimers();
  const cases = [
    [reply(200, { ok: true, order: { id: 'ord-1' } }), (r) => r && r.ok === true, 'un 200 rend la réponse du serveur'],
    [reply(409, { ok: false, error: 'bad-transition' }), (r) => r && r.final === true && r.ok === false && r.status === 409, 'un refus explicite (409 + error) est final'],
    [reply(409, { ok: false, error: 'busy', retry: true }), (r) => r === null, 'un refus marqué retry:true reste à rejouer'],
    [reply(404, null, false), (r) => r === null, 'une page HTML (portail captif, route absente) n’est pas un refus'],
    [reply(503, { error: 'down' }), (r) => r === null, 'un 5xx reste à rejouer'],
    [reply(403, { error: 'forbidden' }), (r) => r === null, 'un 401/403 reste à rejouer'],
    [reply(429, { error: 'slow-down' }), (r) => r === null, 'un 429 reste à rejouer'],
    [() => Promise.reject(new TypeError('Failed to fetch')), (r) => r === null, 'un réseau tombé reste à rejouer'],
  ];
  for (const [impl, check, label] of cases) {
    const R = relay(impl, timers);
    ok(label, check(await R.bump('ord-1', 'ready', '')));
  }
  ok('aucun minuteur ne survit aux réponses', timers.timers.size === 0);
}

/* ══ 2 · Les gestes : abandonnés à l'âge, jamais au compte ═══════════════ */
ok('BUMP_TRIES a disparu du passe', !/BUMP_TRIES/.test(cuisine));
ok('la file des gestes est bornée par STALE_MS', /Date\.now\(\) - \(Number\(job\.at\) \|\| 0\) >= STALE_MS/.test(cuisine));

const bumpsSrc = slice('  function bumpsKey() {', '  /* ── La file');
function bumpHarness({ seed = {}, bump, S: extra = {} } = {}) {
  const ls = storage(seed);
  const calls = [];
  const live = [];
  const S = { pendingBumps: {}, orders: {}, pulling: null, since: 42, ...extra };
  const ctx = vm.createContext({
    S, STALE_MS, localStorage: ls,
    KiwiKitchenRelay: {
      merchant: () => MERCHANT,
      bump: (...args) => { calls.push(args); return bump ? bump(...args) : Promise.resolve(null); },
    },
    setLive: (up) => live.push(up),
    Date, JSON, Object, Promise, Number, Math, String, Array,
  });
  ctx.window = ctx;
  vm.runInContext(bumpsSrc, ctx);
  return { ctx, S, ls, calls, live };
}
const KEY = 'kiwi:kitchen-bumps-v1:' + MERCHANT;

{
  /* 500 essais ratés en dix minutes : l'ancien plafond (40) l'aurait jeté. */
  const h = bumpHarness({ bump: () => Promise.resolve(null) });
  h.S.pendingBumps['ord-1|ready|'] = { id: 'ord-1', status: 'ready', station: '', tries: 500, at: Date.now() - 10 * 60000 };
  const res = await h.ctx.sendBump('ord-1', 'ready', '');
  ok('un geste raté reste en file quel que soit son nombre d’essais', res === false && !!h.S.pendingBumps['ord-1|ready|']);
  ok('il est marqué « pas encore synchronisé » (failed) et écrit dans le stockage',
    h.S.pendingBumps['ord-1|ready|'].failed === true && JSON.parse(h.ls.getItem(KEY))['ord-1|ready|']);
  ok('un échec de geste fait tomber la pastille', h.live.includes(false));
}
{
  const h = bumpHarness({ bump: () => Promise.resolve(null) });
  h.S.orders['ord-9'] = { id: 'ord-9', number: 17, channel: 'counter' };
  h.S.pendingBumps['ord-9|served|'] = { id: 'ord-9', status: 'served', station: '', tries: 3, at: Date.now() - STALE_MS - 1000 };
  await h.ctx.sendBump('ord-9', 'served', '');
  ok('passé STALE_MS, le geste est abandonné et retenu pour être annoncé',
    !h.S.pendingBumps['ord-9|served|'] && h.S.bumpsDropped.length === 1 && h.S.bumpsDropped[0].id === 'ord-9');
  ok('le geste abandonné garde de quoi nommer le bon', h.S.bumpsDropped[0].ref && h.S.bumpsDropped[0].ref.number === 17);
  ok('il quitte le stockage', h.ls.getItem(KEY) === null);
}
{
  const h = bumpHarness();
  h.S.pendingBumps['old|ready|'] = { id: 'old', status: 'ready', station: '', at: Date.now() - STALE_MS - 1 };
  h.S.pendingBumps['new|cooking|'] = { id: 'new', status: 'cooking', station: '', at: Date.now() - 1000 };
  h.S.bumpsRestored = true;
  await h.ctx.flushBumps();
  ok('avant le sondage, un geste trop vieux n’est pas rejoué mais annoncé',
    h.calls.length === 1 && h.calls[0][0] === 'new' && h.S.bumpsDropped.some((j) => j.id === 'old'));
}
{
  const fresh = { id: 'a', status: 'ready', station: '', at: Date.now() - 60000 };
  const stale = { id: 'b', status: 'served', station: '', at: Date.now() - STALE_MS - 1 };
  const h = bumpHarness({ seed: { [KEY]: JSON.stringify({ 'a|ready|': fresh, 'b|served|': stale }) } });
  h.ctx.restoreBumps();
  ok('au redémarrage, un geste relu du stockage est d’emblée « pas encore synchronisé »',
    h.S.pendingBumps['a|ready|'] && h.S.pendingBumps['a|ready|'].failed === true);
  ok('au redémarrage, un geste périmé est annoncé, pas rejoué',
    !h.S.pendingBumps['b|served|'] && h.S.bumpsDropped.some((j) => j.id === 'b'));
  ok('la file relue est par commerce', !h.ls.getItem(KEY).includes('"b"'));
}
{
  const refuse = () => Promise.resolve({ ok: false, final: true, status: 409, error: 'bad-transition' });
  const idle = bumpHarness({ bump: refuse });
  await idle.ctx.sendBump('ord-2', 'ready', '');
  ok('un refus final oublie le geste et relit toute la file', !idle.S.pendingBumps['ord-2|ready|'] && idle.S.since === 0);
  const busy = bumpHarness({ bump: refuse, S: { pulling: Promise.resolve() } });
  await busy.ctx.sendBump('ord-2', 'ready', '');
  ok('pendant un relevé, le refus lève refetchAll sans toucher au curseur demandé',
    busy.S.refetchAll === true && busy.S.since === 42);
}
{
  let release;
  const h = bumpHarness({ bump: () => new Promise((r) => { release = r; }) });
  const a = h.ctx.sendBump('ord-3', 'cooking', 'chaud');
  const b = h.ctx.sendBump('ord-3', 'cooking', 'chaud');
  ok('un même geste en vol ne part qu’une fois', a === b && h.calls.length === 1);
  release({ ok: true });
  ok('accusé, il quitte la file', (await a) === true && !h.S.pendingBumps['ord-3|cooking|chaud']);
  const r = bumpHarness({ bump: () => Promise.reject(new Error('aborted')) });
  ok('un relais qui rejette compte comme un échec réseau', (await r.ctx.sendBump('ord-4', 'ready', '')) === false
    && r.S.pendingBumps['ord-4|ready|'].failed === true);
}

/* ══ 3 · Le relevé : verrou rendu, relevé mort, lecture complète ═════════ */
const pullSrc = slice('  function pull() {', '  function setLive(up) {')
  + slice('  function setLive(up) {', '\n  /* Un bon qui arrive');
function pass({ S: extra = {}, pullAll, seed = {} } = {}) {
  const els = {};
  const $ = (id) => (els[id] || (els[id] = { className: '', textContent: '', hidden: true }));
  const ls = storage(seed);
  const asked = [];
  const sounds = [];
  const notices = [];
  const S = { since: 0, live: null, orders: {}, cooking: {}, seen: {}, seenVoids: {}, pendingBumps: {}, ...extra };
  const ctx = vm.createContext({
    S, STALE_MS, T: (k) => k, $, hm: () => '21:07', ticketNo: (o) => '#' + o.number,
    showNotice: (m) => notices.push(m),
    localStorage: ls,
    KiwiKitchenRelay: {
      merchant: () => MERCHANT,
      pullAll: (since, role) => { asked.push(since); return pullAll(since, role, asked.length); },
    },
    flushBumps: () => Promise.resolve([]),
    paint() {}, announce: (n) => sounds.push(n), announceVoid() {}, saveCooking() {},
    setTimeout, Date, Object, Array, Promise, JSON, Math, String, Number,
  });
  ctx.window = ctx;
  vm.runInContext(pullSrc, ctx);
  return { ctx, S, els, ls, asked, sounds, notices };
}
const order = (id, extra = {}) => ({ id, status: 'accepted', created_ts: Date.now() - 60000, number: 1, lines: [], ...extra });

{
  const h = pass({ pullAll: () => Promise.resolve(null) });
  const first = h.ctx.pull();
  ok('un seul relevé à la fois', h.ctx.pull() === undefined);
  await first;
  ok('un relevé raté rend le verrou', h.S.pulling === null);
  ok('un relevé raté fait tomber la pastille et compte l’échec', h.S.live === false && h.S.fails === 1
    && /down/.test(h.els.link.className));
  ok('avant toute réponse, le bandeau dit « jamais synchronisé »', h.els.stale.textContent === 'stale.never' && h.els.stale.hidden === false);
  const r = pass({ pullAll: () => Promise.reject(new Error('boom')) });
  await r.ctx.pull();
  ok('une exception rend le verrou elle aussi', r.S.pulling === null && r.S.fails === 1);
}
{
  /* Un relevé pendu, puis déclaré mort : sa réponse tardive ne s'applique pas. */
  let late;
  const h = pass({
    pullAll: (since, role, n) => (n === 1
      ? new Promise((r) => { late = r; })
      : Promise.resolve({ ok: true, orders: [order('ord-live')], now: 500 })),
  });
  h.ctx.pull();
  ok('le relevé pendu tient le verrou', !!h.S.pulling);
  h.S.pullAt = Date.now() - 46000;
  await h.ctx.pull();
  ok('au-delà de PULL_STALL_MS, un nouveau relevé part', h.asked.length === 2 && h.S.orders['ord-live']);
  late({ ok: true, orders: [order('ghost')], now: 1 });
  await settle();
  ok('la réponse tardive du relevé mort est ignorée', !h.S.orders.ghost && h.S.since === 500);
}
{
  const snapOnly = order('snap-1');
  const h = pass({ S: { since: 0, orders: { 'snap-1': snapOnly, 'ord-2': order('ord-2') } },
    pullAll: () => Promise.resolve({ ok: true, orders: [order('ord-2')], now: 900 }) });
  await h.ctx.pull();
  ok('une lecture complète (since=0) retire les bons absents du serveur', !h.S.orders['snap-1'] && h.S.orders['ord-2']);
  const inc = pass({ S: { since: 42, loaded: true, orders: { 'ord-7': order('ord-7') } },
    pullAll: () => Promise.resolve({ ok: true, orders: [], now: 950 }) });
  await inc.ctx.pull();
  ok('une lecture incrémentale ne retire rien', !!inc.S.orders['ord-7'] && inc.S.since === 950);
}
{
  /* Un geste refusé pendant le vol : le relevé en cours reste incrémental
     (pas d'élagage), le suivant relit tout. */
  let answer;
  const h = pass({ S: { since: 42, loaded: true, orders: { 'ord-8': order('ord-8') } },
    pullAll: (since, role, n) => (n === 1 ? new Promise((r) => { answer = r; }) : Promise.resolve({ ok: true, orders: [], now: 7 })) });
  const run = h.ctx.pull();
  await settle();
  h.S.refetchAll = true;
  answer({ ok: true, orders: [], now: 77 });
  await run;
  ok('un refus en vol remet le curseur à zéro sans élaguer sur une réponse partielle',
    h.S.since === 0 && !!h.S.orders['ord-8'] && h.asked[0] === 42);
  await h.ctx.pull();
  ok('le tour suivant relit toute la file', h.asked[1] === 0);
}
{
  let n = 0;
  const h = pass({ pullAll: () => Promise.resolve({ ok: true, orders: n++ ? [order('a'), order('b')] : [order('a')], now: 10 + n }) });
  await h.ctx.pull();
  ok('le premier relevé après un chargement ne sonne pas', h.sounds.length === 0 && h.S.loaded === true);
  await h.ctx.pull();
  ok('un bon arrivé ensuite sonne', h.sounds.length === 1 && h.sounds[0] === 1);
}
{
  /* Le dernier tableau connu, par commerce, daté de sa synchro. */
  const h = pass({ pullAll: () => Promise.resolve({ ok: true, orders: [order('ord-5', { number: 31 })], now: 10 }) });
  await h.ctx.pull();
  const raw = h.ls.getItem('kiwi:kitchen-board-v1:' + MERCHANT);
  const snap = raw && JSON.parse(raw);
  ok('un relevé réussi écrit le tableau sous la clé du commerce', snap && snap.orders.length === 1 && snap.at === h.S.lastOkAt);
  const cold = pass({ seed: { ['kiwi:kitchen-board-v1:' + MERCHANT]: raw, 'kiwi:kitchen-board-v1:other-place': raw },
    pullAll: () => Promise.resolve(null) });
  ok('au démarrage à froid, le dernier tableau revient', cold.ctx.loadBoard() === true && cold.S.orders['ord-5']);
  ok('il est daté de sa synchro', cold.S.snapshotAt === snap.at);
  cold.ctx.paintStatus();
  ok('le bandeau dit « bons de la dernière synchro, à HH:MM »', cold.els.stale.textContent === 'stale.snapshot' && cold.els.stale.hidden === false);
  await cold.ctx.pull();
  ok('hors ligne, la pastille donne l’heure de la dernière synchro', cold.els['link-txt'].textContent === 'link.down.since');
  ok('un relevé raté ne vide pas le tableau repris', !!cold.S.orders['ord-5']);
  ok('le cliché d’un autre commerce n’est pas touché', cold.ls.getItem('kiwi:kitchen-board-v1:other-place') === raw);
}
{
  const h = pass({ pullAll: () => Promise.resolve({ ok: true, orders: [], now: 3 }) });
  h.S.bumpsDropped = [{ id: 'gone', status: 'ready', ref: { number: 12 } }];
  await h.ctx.pull();
  ok('un geste abandonné est annoncé à la brigade, avec le numéro du bon',
    h.notices.length === 1 && h.notices[0] === 'sync.dropped' && h.S.bumpsDropped.length === 0);
}

/* ══ 4 · La peinture : rien sous le doigt, rien d'inutile ════════════════ */
const paintSrc = slice('  function boardSig() {', "  /* Les minuteurs seuls");
function painter() {
  const writes = {};
  const els = {};
  const $ = (id) => {
    if (els[id]) return els[id];
    const el = { textContent: '' };
    Object.defineProperty(el, 'innerHTML', { set(v) { writes[id] = (writes[id] || 0) + 1; this._h = v; }, get() { return this._h; } });
    return (els[id] = el);
  };
  const listeners = {};
  const timers = [];
  const S = { station: 'all', stations: [], loaded: true, live: true, cooking: {}, orders: { a: order('a') } };
  const ctx = vm.createContext({
    S, $, lang: () => 'fr', unsyncedIds: () => [], paintStatus() {},
    stationBar: () => '', group: (k) => (k === 'new' ? Object.values(S.orders) : []),
    card: (o) => '<i>' + o.id + '</i>', columnEmpty: (k) => k,
    document: { addEventListener: (t, fn) => { listeners[t] = fn; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    Date, JSON, Object, Array, Math, String, Number,
  });
  vm.runInContext(paintSrc, ctx);
  return { ctx, S, writes, listeners, timers };
}
{
  const p = painter();
  p.ctx.paint();
  p.ctx.paint();
  ok('une signature identique ne retouche pas le DOM', p.writes['s-new'] === 1);
  p.S.orders.b = order('b');
  p.ctx.paint();
  ok('un tableau qui change est repeint', p.writes['s-new'] === 2);

  p.listeners.pointerdown();
  p.S.orders.c = order('c');
  p.ctx.paint();
  ok('doigt posé : la peinture attend', p.writes['s-new'] === 2 && p.S.paintPending === true);
  p.listeners.pointerup();
  const t = p.timers.at(-1);
  ok('au relâché, elle passe juste après le clic (setTimeout 0..50 ms)', t && t.ms >= 0 && t.ms <= 50);
  t.fn();
  ok('et le tableau est bien repeint', p.writes['s-new'] === 3 && p.S.paintPending === false);

  p.listeners.pointerdown();
  p.S.pointerDownAt = Date.now() - 9000;
  p.S.orders.d = order('d');
  p.ctx.paint();
  ok('un relâché perdu ne gèle pas l’écran (8 s)', p.writes['s-new'] === 4);
}

/* ══ 5 · Le rythme : espacement, écran caché, configuration ══════════════ */
{
  const ctx = vm.createContext({ POLL_MS: constant('POLL_MS'), POLL_MAX_MS: constant('POLL_MAX_MS'), Math, Number });
  vm.runInContext(slice('  function nextPollDelay(fails) {', '  var timer = null;'), ctx);
  ok('5 s quand le serveur répond, puis 10, 20 et 30 s au plus',
    [0, 1, 2, 3, 4, 9].map(ctx.nextPollDelay).join() === '5000,10000,20000,30000,30000,30000');
}
const loop = slice('  function nextPollDelay(fails) {', '  /* ── Démarrage');
ok('la boucle est un setTimeout réarmé, sans setInterval de sondage',
  /timer = setTimeout\(tick, ms\)/.test(loop) && !/setInterval\(\s*(pull|tick)\s*[,)]/.test(cuisine));
ok('le prochain tour suit les échecs', /scheduleTick\(S\.fails \? nextPollDelay\(S\.fails\)/.test(loop));
ok('écran caché : aucun tour', /function tick\(\) \{\s*cancelTick\(\);\s*if \(document\.hidden \|\| !paired\(\)\) return;/.test(loop));
ok('retour à l’écran : file et interrupteur KDS tout de suite, et arrêt quand caché',
  /visibilityState === 'visible'\) \{[\s\S]{0,120}S\.cfgAt = 0;\s*tick\(\);\s*\} else \{\s*cancelTick\(\);/.test(cuisine));
ok('/api/config toutes les 60 s', constant('CONFIG_POLL_MS') === 60000
  && /now - \(S\.cfgAt \|\| 0\) >= CONFIG_POLL_MS\) checkKdsFeature\(\)/.test(loop));
ok('le réseau revenu relance sans attendre l’espacement', /addEventListener\('online', function \(\) \{[\s\S]{0,90}S\.fails = 0;\s*tick\(\);/.test(cuisine));
ok('les lectures secondaires ont un délai réel', /fetchTimed\('\/api\/config/.test(cuisine) && /fetchTimed\('\/api\/menu/.test(cuisine));

/* ══ 6 · Trois langues, et un pouls qui ne repeint pas ═══════════════════ */
{
  const dict = slice('  var DICT = {', '  function lang() {');
  const ctx = vm.createContext({ document: { documentElement: { classList: { contains: () => false } } } });
  vm.runInContext(dict.replace('var DICT', 'this.DICT'), ctx);
  const keys = ['link.down.since', 'stale.since', 'stale.snapshot', 'stale.never', 'board.wait', 'board.down',
    'sync.pending', 'sync.count', 'sync.ticket', 'sync.dropped', 'notice.ok'];
  ok('chaque nouvel état est écrit en français, anglais et arabe',
    keys.every((k) => ['fr', 'en', 'ar'].every((l) => typeof ctx.DICT[l][k] === 'string' && ctx.DICT[l][k])));
  ok('« pas encore synchronisé » dans les trois langues',
    ctx.DICT.fr['sync.pending'] === 'Pas encore synchronisé' && ctx.DICT.en['sync.pending'] === 'Not synced yet'
    && ctx.DICT.ar['sync.pending'] === 'لم تتم المزامنة بعد');
  ok('aucun tiret cadratin dans ces textes', keys.every((k) => ['fr', 'en', 'ar'].every((l) => !ctx.DICT[l][k].includes('—'))));
}
{
  const css = cuisine.slice(0, cuisine.indexOf('</style>'));
  const frames = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)];
  const infinite = [...css.matchAll(/animation:\s*([\w-]+)[^;]*infinite/g)].map((m) => m[1]);
  ok('aucun pouls infini n’anime box-shadow ou background',
    infinite.every((name) => {
      const f = frames.find((m) => m[1] === name);
      return f && !/box-shadow|background/.test(f[2]);
    }));
}

console.log(`\nkds-data-states · ${passed} checks · OK`);
