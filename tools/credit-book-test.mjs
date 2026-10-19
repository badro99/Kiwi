/* Carnet de crédit de l'épicerie : ce que la caisse note doit survivre à deux
 * caisses qui écrivent en même temps, et le tableau de bord doit le voir.
 *
 *   1. fusion serveur (KiwiStore `verticalops`, assets/vertical-state.js) :
 *      les lignes d'ardoise de deux appareils s'additionnent, chaque ligne une
 *      fois ; les autres métiers gardent « le plus récent gagne ».
 *   2. mise à jour reçue pendant qu'on saisit : une ligne notée ici et pas encore
 *      envoyée reste à l'écran et repart au prochain enregistrement.
 *   3. caisse (assets/pos-epicerie.js) : chaque ligne naît avec un identifiant.
 *   4. tableau de bord (assets/trade-workspaces.js) : la page « Carnet de crédit »
 *      lit les ardoises ouvertes de la caisse, en lecture seule. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const VENUE_STORE = read('assets/venue-store.js');
const VS = read('assets/vertical-state.js');
const EP = read('assets/pos-epicerie.js');
const TW = read('assets/trade-workspaces.js');
const EPCSS = read('assets/pos-epicerie.css');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`); }
}
function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ── un runtime caisse : le vrai venue-store, le vrai vertical-state ── */
function storage(initial = []) {
  const rows = new Map(initial);
  return { rows, api: {
    getItem: (k) => rows.has(k) ? rows.get(k) : null, setItem: (k, v) => rows.set(k, String(v)),
    removeItem: (k) => rows.delete(k), key: (i) => Array.from(rows.keys())[i] || null, get length() { return rows.size; },
  } };
}
function runtime() {
  const local = storage([['kiwiPairedVenue', JSON.stringify({ merchant: 'epicerie-test', venueId: 'dev' })]]);
  const noop = () => {};
  const document = { readyState: 'complete', visibilityState: 'visible', addEventListener: noop };
  const window = { addEventListener: noop };
  const context = { console, Map, Set, setTimeout: () => 1, setInterval: () => 1, clearInterval: noop, localStorage: local.api, document, window };
  Object.assign(window, { window, localStorage: local.api, document });
  vm.createContext(context);
  vm.runInContext(VENUE_STORE, context, { filename: 'venue-store.js' });
  const defs = {};
  const define = context.window.KiwiStore.define;
  context.window.KiwiStore.define = (feature, opts) => { defs[feature] = opts; return define(feature, opts); };
  vm.runInContext(VS, context, { filename: 'vertical-state.js' });
  return { context, defs, local };
}

const t0 = Date.parse('2026-10-19T10:00:00Z');
const at = (min) => new Date(t0 + min * 60000).toISOString();
const rkia = (hist, extra = {}) => ({ id: 'k1', name: 'TEST KIWI Rkia', phone: '0600000000', note: '', hist, ...extra });
const doc = (updatedAt, device, carnet, extra = {}) => ({ verticals: { epicerie: { schema: 1, updatedAt, device, data: { v: 2, carnet, day: { especes: 0 }, ...extra } } }, commands: [], seq: 1 });
const balance = (c) => c.hist.reduce((n, h) => n + (h.type === 'debt' ? h.amt : -h.amt), 0);

console.log('\ncarnet · fusion de deux caisses');
const rt = runtime();
const merge = rt.defs.verticalops.merge;
const base = [{ id: 'h0', type: 'debt', label: 'Courses', amt: 50, at: at(0) }];
const counter = doc(t0 + 2000, 'comptoir', [rkia([...base, { id: 'hA', type: 'debt', label: 'Huile', amt: 30, at: at(5) }])]);
const phone = doc(t0 + 2500, 'telephone', [rkia([...base, { id: 'hB', type: 'pay', label: 'Règlement partiel', amt: 20, at: at(6) }])]);

ok('la dette du comptoir et le règlement du téléphone restent tous les deux', () => {
  const m = merge(clone(counter), clone(phone)).verticals.epicerie.data.carnet;
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].hist.map((h) => h.id), ['h0', 'hA', 'hB']);
  assert.equal(balance(m[0]), 60);
});
ok('même résultat dans l\'autre sens (serveur et poste échangés)', () => {
  const a = merge(clone(counter), clone(phone)).verticals.epicerie.data.carnet;
  const b = merge(clone(phone), clone(counter)).verticals.epicerie.data.carnet;
  assert.deepEqual(clone(a[0].hist), clone(b[0].hist));
});
ok('fusionner deux fois ne double aucune ligne', () => {
  const once = merge(clone(counter), clone(phone));
  const twice = merge(clone(once), clone(once));
  assert.equal(twice.verticals.epicerie.data.carnet[0].hist.length, 3);
});
ok('une ardoise ouverte sur un seul appareil survit', () => {
  const extra = doc(t0 + 1000, 'comptoir', [rkia(base), { id: 'kx1', name: 'TEST KIWI Driss', phone: '', note: '', hist: [{ id: 'hD', type: 'debt', label: 'Pain', amt: 12, at: at(2) }] }]);
  const m = merge(clone(extra), clone(phone)).verticals.epicerie.data.carnet;
  assert.deepEqual(clone(m.map((c) => c.id).sort()), ['k1', 'kx1']);
  assert.equal(balance(m.find((c) => c.id === 'kx1')), 12);
});
ok('lignes anciennes sans identifiant : reconnues par leur contenu, jamais doublées', () => {
  const legacy = { type: 'debt', label: 'Ancienne', amt: 40, at: at(1) };
  const a = doc(t0 + 10, 'a', [rkia([legacy])]);
  const b = doc(t0 + 20, 'b', [rkia([{ ...legacy, at: new Date(legacy.at) }])]);
  assert.equal(merge(clone(a), b).verticals.epicerie.data.carnet[0].hist.length, 1);
});
ok('nom et téléphone viennent de la fiche la plus récente', () => {
  const a = doc(t0 + 10, 'a', [rkia(base, { phone: '0611111111' })]);
  const b = doc(t0 + 20, 'b', [rkia(base, { phone: '0622222222' })]);
  assert.equal(merge(clone(a), clone(b)).verticals.epicerie.data.carnet[0].phone, '0622222222');
  assert.equal(merge(clone(b), clone(a)).verticals.epicerie.data.carnet[0].phone, '0622222222');
});
ok('le reste de la fiche suit toujours la plus récente', () => {
  const a = doc(t0 + 10, 'a', [rkia(base)], { day: { especes: 100 } });
  const b = doc(t0 + 20, 'b', [rkia(base)], { day: { especes: 250 } });
  const row = merge(clone(a), clone(b)).verticals.epicerie;
  assert.equal(row.data.day.especes, 250);
  assert.equal(row.device, 'b');
});
ok('les autres métiers gardent « le plus récent gagne »', () => {
  const a = { verticals: { pressing: { updatedAt: 10, data: { orders: [{ id: 'A' }] } } } };
  const b = { verticals: { pressing: { updatedAt: 20, data: { orders: [{ id: 'B' }] } } } };
  assert.deepEqual(clone(merge(a, b).verticals.pressing.data.orders), [{ id: 'B' }]);
});
ok('la fusion vit dans vertical-state.js, pas dans le module chargé plus tard', () => {
  assert.match(VS, /var MERGERS = \{\s*epicerie:/);
  assert.doesNotMatch(EP, /merge\(newer, older\)/);
});

console.log('\ncarnet · mise à jour reçue pendant la saisie');
ok('une ligne notée ici et pas encore envoyée reste, et repart au prochain enregistrement', () => {
  const r = runtime();
  const st = { value: { v: 2, carnet: [rkia(clone(base))], day: {}, ticket: { lines: ['ici'] } } };
  const h = r.context.window.KiwiVerticalState.register({ vertical: 'epicerie', snapshot: () => st.value, restore: (s) => { st.value = s; } });
  h.hydrate();
  assert.equal(h.save('rien de neuf'), false, 'rien à envoyer juste après la lecture');
  st.value.carnet[0].hist.push({ id: 'hLocal', type: 'debt', label: 'Sucre', amt: 15, at: at(7) });
  h.store.update((d) => {
    d.verticals.epicerie = { schema: 1, updatedAt: Date.now() + 5000, device: 'autre-caisse',
      data: { v: 2, carnet: [rkia([...base, { id: 'hRemote', type: 'pay', label: 'Règlement', amt: 10, at: at(8) }])], day: {}, ticket: { lines: ['là-bas'] } } };
    return d;
  }, h.venue());
  assert.deepEqual(clone(st.value.carnet[0].hist.map((x) => x.id)), ['h0', 'hLocal', 'hRemote']);
  assert.deepEqual(clone(st.value.ticket.lines), ['ici'], 'le ticket en cours reste celui de cet écran');
  assert.equal(h.save('autosave'), true, 'la ligne locale repart');
  const saved = JSON.parse(r.local.rows.get('kiwi:verticalops:v1:epicerie-test')).verticals.epicerie.data.carnet[0].hist;
  assert.deepEqual(saved.map((x) => x.id), ['h0', 'hLocal', 'hRemote']);
});
ok('une mise à jour reçue qui contient déjà tout n\'entraîne aucun renvoi', () => {
  const r = runtime();
  const st = { value: { v: 2, carnet: [rkia(clone(base))], day: {} } };
  const h = r.context.window.KiwiVerticalState.register({ vertical: 'epicerie', snapshot: () => st.value, restore: (s) => { st.value = s; } });
  h.hydrate(); h.save('base');
  h.store.update((d) => {
    d.verticals.epicerie = { schema: 1, updatedAt: Date.now() + 5000, device: 'autre', data: { v: 2, carnet: [rkia([...base, { id: 'hR', type: 'pay', label: 'R', amt: 5, at: at(9) }])], day: {} } };
    return d;
  }, h.venue());
  assert.equal(st.value.carnet[0].hist.length, 2);
  assert.equal(h.save('autosave'), false);
});

console.log('\ncarnet · la caisse');
ok('chaque ligne d\'ardoise naît avec un identifiant', () => {
  assert.match(EP, /function histEntry\(type, label, amt\) \{ return \{ id: uid\('h'\), type, label, amt, at: new Date\(\) \}; \}/);
  assert.doesNotMatch(EP, /hist\.push\(\{/, 'aucune ligne poussée à la main sans identifiant');
  assert.equal((EP.match(/hist\.push\(histEntry\(/g) || []).length, 4);
});
ok('une nouvelle ardoise ne partage jamais son identifiant avec celle d\'une autre caisse', () => {
  assert.match(EP, /const c = \{ id: uid\('kx'\), name, phone: tel/);
  assert.match(EP, /const uid = \(p\) => p \+ Date\.now\(\)\.toString\(36\) \+ Math\.random\(\)\.toString\(36\)\.slice\(2, 7\);/);
});
ok('attacher un panier depuis l\'écran du carnet enregistre tout de suite', () => {
  const i = EP.indexOf("c.hist.push(histEntry('debt', state.attachFrom.label");
  assert.ok(i > 0);
  assert.match(EP.slice(i, i + 300), /epicerieOps\.save\('Ardoise'\)/);
});

ok('les feuilles d\'encaissement n\'héritent plus du bouton vert « Encaisser »', () => {
  assert.doesNotMatch(EP, /class="modal ep-pay /, 'une feuille qui porte .ep-pay se peint en vert, texte encre illisible');
  assert.equal((EP.match(/class="modal ep-paysheet ep-rel"/g) || []).length, 2);
  assert.match(EPCSS, /\.modal\.ep-paysheet \{ width: 520px;/);
});
ok('un nom long s\'arrête en points de suspension au lieu de chevaucher le solde', () => {
  assert.match(EPCSS, /\.ep-ard-name \{ display: block;[^}]*text-overflow: ellipsis; \}/);
  assert.match(EPCSS, /\.ep-ard-meta \{ display: block;[^}]*text-overflow: ellipsis; \}/);
});

console.log('\ncarnet · tableau de bord');
const twCode = `
  const L = (fr, en, ar) => ({ fr, en, ar }); const pick = (o) => (o && o.fr) || '';
  const UI = { currency: L('MAD', 'MAD', 'د.م') }; const lang = () => 'fr';
  let DOCS = {}; const tillDoc = (v) => DOCS[v] || null;
  const money = (n) => String(Math.round((+n || 0) * 100) / 100);
  ${grab(TW, 'const TILL = {')};
  ${grab(TW, 'function when(v, withTime)')}
  const mad = (n) => money(n) + ' ' + pick(UI.currency);
  ${TW.match(/  const owedOf = .*;/)[0]}
  ${grab(TW, 'function oldestOpenDebt(c)')}
  const evTotal = () => 0, evPaid = () => 0;
  ${grab(TW, 'function tillCards(cfg)')}
  globalThis.T = { tillCards, setDocs: (d) => { DOCS = d; } };
`;
const ctx = vm.createContext({ window: {}, Math, JSON, Date, Object, Array, Number, String, Map, Set, console });
vm.runInContext(twCode, ctx);
const tw = ctx.T;
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
tw.setDocs({ epicerie: { carnet: [
  { id: 'k1', name: 'TEST KIWI Rkia', phone: '0600000000', hist: [
    { type: 'debt', amt: 55, at: daysAgo(40) }, { type: 'debt', amt: 21, at: daysAgo(20) },
    { type: 'pay', amt: 40, at: daysAgo(10) }, { type: 'debt', amt: 30, at: daysAgo(1) } ] },
  { id: 'k2', name: 'TEST KIWI Driss', phone: '', hist: [ { type: 'debt', amt: 120, at: daysAgo(3) } ] },
  { id: 'k3', name: 'TEST KIWI Larbi', phone: '', hist: [ { type: 'debt', amt: 45, at: daysAgo(14) }, { type: 'pay', amt: 45, at: daysAgo(9) } ] },
] } });
ok('ardoises ouvertes seulement, la plus grosse dette en premier', () => {
  const c = tw.tillCards({ trade: 'epicerie', nav: 'credit' });
  assert.deepEqual(clone(c.map((x) => x.title)), ['TEST KIWI Driss', 'TEST KIWI Rkia']);
  assert.deepEqual(clone(c.map((x) => x.owed)), [120, 66]);
});
ok('solde, plus ancienne dette encore ouverte, dernier règlement', () => {
  const r = tw.tillCards({ trade: 'epicerie', nav: 'credit' })[1];
  const meta = Object.fromEntries(r.meta.map((m) => [m[0].fr, m[1]]));
  assert.equal(meta.Solde, '66 MAD');
  assert.ok(meta['Plus ancienne dette'], 'date de la plus ancienne dette');
  assert.match(meta['Dernier règlement'], / · 40 MAD$/);
  assert.equal(r.alert, 'Plus de 30 jours', 'les 40 MAD remboursés couvrent la dette de 55 en partie : elle reste ouverte depuis 40 jours');
});
ok('une dette récente n\'est pas signalée', () => {
  assert.equal(tw.tillCards({ trade: 'epicerie', nav: 'credit' })[0].alert, '');
});
ok('démo ou caisse muette : aucune carte', () => {
  tw.setDocs({});
  assert.equal(tw.tillCards({ trade: 'epicerie', nav: 'credit' }).length, 0);
  assert.equal(tw.tillCards({ trade: 'epicerie', nav: 'returns' }).length, 0);
});
ok('le résumé de la page compte les ardoises de la caisse', () => {
  const body = grab(TW, 'function render(nav)');
  assert.match(body, /sum\.balance=\(\+sum\.balance\|\|0\)\+owedCards\.reduce/);
  assert.match(body, /const till=tillSection\(cfg,tc\)/);
});
ok('trois langues pour chaque libellé ajouté', () => {
  for (const k of ['owed', 'since', 'lastPay', 'phone', 'stale', 'owedTotal']) {
    const v = ctx.T && vm.runInContext(`(${grab(TW, 'const TILL = {').replace(/^const TILL = /, '')})`, vm.createContext({ L: (fr, en, ar) => ({ fr, en, ar }) }))[k];
    assert.ok(v && v.fr && v.en && v.ar, k);
  }
});

console.log(`\ncredit-book-test · ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
