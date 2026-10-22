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
  assert.equal((EP.match(/hist\.push\(histEntry\(/g) || []).length, 3, 'trois chemins de dette');
  assert.equal((EP.match(/histEntry\('pay'/g) || []).length, 1, 'un seul chemin de règlement : commitRepayment');
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

/* ── 5. au centime : l'ardoise ne note jamais plus que le panier ──
   Math.round inscrivait un panier de 12,50 MAD comme 13 sur le carnet du
   voisin, et « tout régler » sur 12,50 notait 13 payés. */
function balanceRuntime() {
  const line = EP.match(/const r2 = \(n\) => Math\.round\(n \* 100\) \/ 100;/);
  assert.ok(line, 'r2 found');
  const c = vm.createContext({});
  vm.runInContext(line[0] + '\n' + grab(EP, 'function balanceOf(') + '\nthis.bal = balanceOf; this.r2 = r2;', c);
  return c;
}
ok('aucune ligne d\'ardoise n\'est arrondie au dirham', () => {
  assert.ok(!/histEntry\([^;]*Math\.round/.test(EP), 'histEntry fed a Math.round amount');
  assert.ok(!/creditAdded \+= Math\.round/.test(EP), 'day total rounded to the dirham');
  assert.equal((EP.match(/histEntry\('debt', [^;]*r2\(/g) || []).length, 3, 'three debt paths keep the centimes');
  assert.ok(/const amt = payC \/ 100;\s*const entry = histEntry\('pay', [^;]*, amt\);/.test(EP), 'repayment keeps the centimes');
});
ok('un panier de 12,50 reste 12,50 sur l\'ardoise, et un règlement complet la solde à 0', () => {
  const c = balanceRuntime();
  assert.equal(c.bal({ hist: [{ type: 'debt', amt: 12.5 }] }), 12.5);
  assert.equal(c.bal({ hist: [{ type: 'debt', amt: 12.1 }, { type: 'debt', amt: 3.2 }] }), 15.3);
  const after = c.bal({ hist: [{ type: 'debt', amt: 12.1 }, { type: 'debt', amt: 3.2 }, { type: 'pay', amt: c.r2(15.3) }] });
  assert.ok(Object.is(after, 0) || after === 0, 'settled to exactly 0, got ' + after);
});
ok('« la moitié » ne dépasse jamais ce qui est dû', () => {
  assert.ok(/pay = v === 'half' \? Math\.min\(bal, Math\.round\(bal \/ 2 \/ 5\) \* 5\)/.test(EP));
});

/* ── 6. trop-perçu à la fusion : jamais un solde négatif sans le dire ──
   Deux caisses hors ligne encaissent chacune toute la dette : les deux
   règlements restent (l'argent est entré deux fois) et le solde passe sous
   zéro. Partout où la caisse affiche ce solde, c'est une « Avance ». */
console.log('\ncarnet · trop-perçu après fusion');
function labelRuntime() {
  const c = vm.createContext({ Intl, Math });
  vm.runInContext([
    grab(EP, 'const fmtMAD2 = (n) =>') + ';', 'const fmtMAD = (n) => fmtMAD2(n);',
    grab(EP, 'function balanceOf('), EP.match(/const advanceTxt = .*;/)[0], EP.match(/const balTxt = .*;/)[0],
    'this.balTxt = balTxt; this.bal = balanceOf;',
  ].join('\n'), c);
  return c;
}
ok('deux caisses qui encaissent toute la dette : le solde fusionné se lit « Avance », jamais « −50 »', () => {
  const debt = { id: 'd', type: 'debt', label: 'Courses', amt: 50, at: at(0) };
  const m = merge(clone(doc(t0 + 10, 'a', [rkia([debt, { id: 'pA', type: 'pay', label: 'R', amt: 50, at: at(1) }])])),
    clone(doc(t0 + 20, 'b', [rkia([debt, { id: 'pB', type: 'pay', label: 'R', amt: 50, at: at(2) }])]))).verticals.epicerie.data.carnet[0];
  const L = labelRuntime();
  assert.equal(L.bal(m), -50);
  assert.match(L.balTxt(L.bal(m)), /^Avance 50 MAD$/);
  assert.match(L.balTxt(12.5), /^12,50 MAD$/);
});
ok('aucun affichage de solde ne montre un négatif nu', () => {
  assert.doesNotMatch(EP, /solde \$\{fmtMAD\(balanceOf\(c\)\)\}/, 'les toasts passent par balTxt');
  assert.match(EP, /<span class="ep-cp-bal [^\n]*">\$\{bal > 0 \? fmtMAD\(bal\) : bal < 0 \? advanceTxt\(bal\) : 'à jour'\}/, 'le choix du voisin dit « Avance », pas « à jour »');
  assert.equal((EP.match(/bal < 0 \? advanceTxt\(bal\)/g) || []).length, 4, 'liste, fiche, choix du voisin et balTxt');
});
ok('le solde se compte en centimes entiers', () => {
  const L = labelRuntime();
  const c = { hist: [0.1, 0.2, 0.3, 0.4, 0.05, 0.07].map((amt) => ({ type: 'debt', amt })).concat([{ type: 'pay', amt: 1.12 }]) };
  assert.ok(Object.is(L.bal(c), 0) || L.bal(c) === 0, 'got ' + L.bal(c));
});

/* ── 7. règlement : la ligne du carnet et l'argent, ensemble ou pas du tout ──
   Le vrai code de pos-epicerie.js (commitRepayment, recoverRepayments) sur un
   stockage simulé qui peut refuser une écriture (plein) ou s'arrêter net après
   N écritures (onglet tué, batterie). Après rechargement et reprise, chaque
   règlement au journal du jour a sa ligne au carnet, et réciproquement. */
console.log('\ncarnet · règlement atomique');
const REPAY_SRC = [
  grab(EP, 'function balanceOf('), EP.match(/const uid = .*;/)[0], grab(EP, 'function histEntry('),
  EP.match(/const REPAY_PREFIX = .*;/)[0], grab(EP, 'function repayKey()'), grab(EP, 'function repayLog()'),
  grab(EP, 'function repayLogWrite('), grab(EP, 'function journalHas('), grab(EP, 'function postDay('),
  grab(EP, 'function commitRepayment('), grab(EP, 'function recoverRepayments()'),
  'this.api = { commitRepayment, recoverRepayments, balanceOf };',
].join('\n');
const JKEY = 'kiwi:posDay:epicerie', CKEY = 'carnet', MKEY = 'serveur', WKEY = 'kiwi:epicerieRepay:epicerie-test';
function till(disk, { failKey = '', crashAfter = Infinity, recordMode = 'ok', real = true } = {}) {
  let writes = 0;
  const ls = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => { if (failKey === '*' || failKey === k) throw new Error('QuotaExceededError'); if (writes++ < crashAfter) disk.set(k, String(v)); },
    removeItem: (k) => { if (writes++ < crashAfter) disk.delete(k); },
  };
  const today = () => JSON.parse(ls.getItem(JKEY) || '[]');
  const Pos = {
    stamp: (r) => (/-A7$/.test(r) ? r : r + '-A7'), today,
    record(v, sale) {
      if (recordMode === 'null' || !real) return null;      /* la démo ne journalise rien (pos-sale.js) */
      if (recordMode === 'throw') throw new Error('panne');
      const rows = today(); const e = { ref: sale.ref, total: sale.total, label: sale.label };
      /* comme pos-sale.js : journal local (écriture avalée si elle échoue), puis miroir serveur */
      rows.push(e); try { ls.setItem(JKEY, JSON.stringify(rows)); } catch (_) {}
      try { ls.setItem(MKEY, JSON.stringify(JSON.parse(ls.getItem(MKEY) || '[]').concat([e]))); } catch (_) {}
      if (recordMode === 'throwAfter') throw new Error('panne après écriture');
      return e;
    },
  };
  const CARNET = JSON.parse(disk.get(CKEY) || 'null') || [{ id: 'k1', name: 'TEST KIWI Rkia', phone: '', note: '', hist: [{ id: 'h0', type: 'debt', label: 'Courses', amt: 80.5, at: at(0) }] }];
  CARNET.forEach((c) => c.hist.forEach((h) => { h.at = new Date(h.at); }));
  const CRED = Object.fromEntries(CARNET.map((c) => [c.id, c]));
  const ops = { venue: () => 'epicerie-test', save: () => { try { ls.setItem(CKEY, JSON.stringify(CARNET)); } catch (_) {} return true; } };
  const ctx = vm.createContext({ Math, JSON, Date, Object, Array, String, CARNET, CRED, day: { especes: 0 }, pvReal: () => real, epicerieOps: ops, localStorage: ls, window: { KiwiPosSale: Pos } });
  vm.runInContext(REPAY_SRC, ctx);
  if (!disk.has(CKEY) && crashAfter === Infinity && !failKey) ops.save();
  return { ...ctx.api, CARNET, CRED, ctx, ops, journal: today };
}
const cents = (n) => Math.round(n * 100);
function consistent(disk) {
  /* l'argent enregistré = journal du jour ∪ miroir serveur, une fois par référence */
  const money = new Map(JSON.parse(disk.get(JKEY) || '[]').concat(JSON.parse(disk.get(MKEY) || '[]')).filter((s) => /^ARD-/.test(s.ref)).map((s) => [s.ref, s]));
  const journal = [...money.values()];
  const lines = JSON.parse(disk.get(CKEY) || '[]').flatMap((c) => c.hist).filter((h) => h.type === 'pay' && h.ref);
  assert.deepEqual(journal.map((s) => s.ref).sort(), lines.map((h) => h.ref).sort(), 'chaque règlement encaissé a sa ligne au carnet, et réciproquement');
  assert.equal(journal.reduce((n, s) => n + cents(s.total), 0), lines.reduce((n, h) => n + cents(h.amt), 0));
  return journal.length;
}
ok('règlement normal : une ligne au carnet, la même somme au journal, la même référence', () => {
  const disk = new Map(); const t = till(disk);
  const r = t.commitRepayment('k1', 30.25);
  assert.ok(!r.error, r.error);
  t.ops.save();
  assert.equal(consistent(disk), 1);
  assert.equal(t.balanceOf(t.CRED.k1), 50.25);
  assert.equal(t.ctx.day.especes, 30.25);
});
ok('fiche reçue d\'une autre caisse pendant la saisie : le règlement va au carnet lu, pas à la copie périmée', () => {
  const disk = new Map(); const t = till(disk);
  const stale = t.CRED.k1;
  const fresh = clone(stale); fresh.hist.forEach((h) => { h.at = new Date(h.at); });
  t.CARNET.splice(0, 1, fresh); t.CRED.k1 = fresh;
  assert.ok(!t.commitRepayment('k1', 10).error);
  assert.equal(stale.hist.length, 1, 'rien dans la copie périmée');
  assert.equal(fresh.hist.length, 2);
});
ok('un règlement au-delà du solde du moment (encaissé ailleurs entre-temps) est refusé, rien n\'est écrit', () => {
  const disk = new Map(); const t = till(disk);
  t.CRED.k1.hist.push({ id: 'hR', type: 'pay', label: 'Règlement', amt: 80.5, at: new Date() });
  const r = t.commitRepayment('k1', 80.5);
  assert.equal(r.error, 'changed');
  assert.equal(t.journal().length, 0);
  assert.equal(t.CRED.k1.hist.length, 2);
});
ok('stockage plein ou miroir en panne : ni ligne ni recette', () => {
  for (const [failKey, recordMode] of [['kiwi:epicerieRepay:epicerie-test', 'ok'], ['', 'null'], ['', 'throw']]) {
    const disk = new Map(); const t = till(disk); const f = till(disk, { failKey, recordMode });
    const r = f.commitRepayment('k1', 20);
    assert.equal(r.error, 'storage', failKey + recordMode);
    assert.equal(f.CRED.k1.hist.length, 1);
    assert.equal(consistent(disk), 0);
    void t;
  }
});
ok('démo : aucune écriture de journal, le comportement reste celui d\'avant', () => {
  const disk = new Map(); const t = till(disk, { real: false });
  const before = new Map(disk);
  assert.ok(!t.commitRepayment('k1', 5).error);
  assert.deepEqual([...disk.keys()].sort(), [...before.keys()].sort());
});
ok('arrêt brutal à chaque écriture, panne à chaque endroit : après reprise, les deux ou aucun', () => {
  let cases = 0, recovered = 0;
  for (const recordMode of ['ok', 'null', 'throw', 'throwAfter'])
    for (const failKey of ['', '*', WKEY, CKEY])
      for (let crashAfter = 0; crashAfter <= 7; crashAfter++) {
        const disk = new Map(); till(disk);                      /* le carnet enregistré avant la vente */
        const t = till(disk, { failKey, crashAfter, recordMode });
        const r = t.commitRepayment('k1', 12.5);
        if (!r.error) t.ops.save();                              /* queueIfOffline */
        const after = till(disk);                                /* rechargement : seul le disque survit */
        recovered += after.recoverRepayments();
        try { consistent(disk); } catch (e) { e.message = `[${recordMode} · ${failKey || 'aucune panne'} · arrêt après ${crashAfter}] ` + e.message; throw e; }
        const again = till(disk);
        assert.equal(again.recoverRepayments(), 0, 'la reprise ne rajoute rien une deuxième fois');
        consistent(disk);
        assert.ok(again.balanceOf(again.CRED.k1) >= 80.5 - 12.5 && again.balanceOf(again.CRED.k1) <= 80.5);
        cases++;
      }
  assert.equal(cases, 128);
  assert.ok(recovered > 0, 'au moins un cas repris par la relecture au chargement');
});
ok('journal local plein mais vente partie au serveur : la ligne entre quand même au carnet', () => {
  const disk = new Map(); till(disk);
  const t = till(disk, { failKey: JKEY });
  assert.ok(!t.commitRepayment('k1', 7.25).error);
  t.ops.save();
  assert.equal(consistent(disk), 1);
});

console.log(`\ncredit-book-test · ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
