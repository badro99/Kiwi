#!/usr/bin/env node
/* Kiwi · strings-completeness-test · les paquets de chaînes tiennent la table de §9.6.
 *
 * Ce que cette suite refuse (§9.2, §9.3, §9.6) :
 *   · un paquet manquant : 7 surfaces × 3 langues, chacun un fichier
 *     assets/kit/strings/<surface>.<lang>.js qui s'enregistre sous son nom ;
 *   · une clé présente dans une langue et pas dans les deux autres, ou une clé
 *     absente de l'EN (qui « ne doit jamais atteindre un commerçant ») ;
 *   · une clé de la table de la spec absente des paquets, ou l'inverse (hors
 *     la seule clé que §9.2 nomme et que la table omet : customers.known) ;
 *   · une valeur qui s'écarte de la cellule de la spec d'un octet (U+00A0 et
 *     espaces compris) ; une valeur plurielle dont la branche « other » n'est
 *     pas la cellule ;
 *   · des arguments différents d'une langue à l'autre ;
 *   · une catégorie plurielle manquante : EN one, other ; FR one, many, other ;
 *     AR zero, one, two, few, many, other, sauf les chaînes à compte invariant ;
 *   · le test de pluriel de §9.2 : 0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103
 *     et 111 dans chaque chaîne arabe comptée, contre le tableau des noms ;
 *   · la chaîne de repli : langue courante, puis EN, jamais le FR ;
 *   · le budget gzip de chaque paquet (§19) ;
 *   · les décomptes que la spec énonce (550 lignes, 542 chaînes arabes). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import {
  ROOT, LANGS, BUNDLE_SURFACES, readSpec, parseTable, counts, statedCounts, loadBundles, loadData, loadRuntime,
} from './strings-corpus.mjs';

const K = loadRuntime();
const spec = readSpec();
const rows = parseTable(spec);
const bundles = loadBundles();
/* Le moteur lit le registre de la page : on y pose les paquets comme le feraient les balises. */
globalThis.__kiwiStrings = {};
for (const [s, langs] of Object.entries(bundles)) for (const l of LANGS) globalThis.__kiwiStrings[`${s}.${l}`] = langs[l];
let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ✓ ' + m); };
const bad = (m) => { failures++; console.log('  ✗ ' + m); };
const expect = (cond, okMsg, badMsg) => (cond ? ok(okMsg) : bad(badMsg));
const section = (t) => console.log('\n■ ' + t);

/* ── 1 · les fichiers ──────────────────────────────────────────────────── */
section('Paquets : sept surfaces, trois langues');
{
  const dir = path.join(ROOT, 'assets', 'kit', 'strings');
  const want = BUNDLE_SURFACES.flatMap((s) => LANGS.map((l) => `${s}.${l}.js`)).sort();
  const have = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  expect(want.join() === have.join(), `${want.length} fichiers, ni plus ni moins`, `fichiers attendus ${want.join(' ')} ; présents ${have.join(' ')}`);
  for (const f of want) {
    const [s, l] = f.split('.');
    const sandbox = {}; sandbox.self = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
    const names = Object.keys(sandbox.__kiwiStrings || {});
    if (names.length !== 1 || names[0] !== `${s}.${l}`) bad(`${f} doit s'enregistrer seul sous « ${s}.${l} » (trouvé : ${names.join(', ') || 'rien'})`);
  }
  ok('chaque fichier s\'enregistre sous <surface>.<lang>');
}

/* ── 2 · les clés ──────────────────────────────────────────────────────── */
section('Clés : EN, FR et AR portent les mêmes');
const entry = new Map();        // clé → { surface, en, fr, ar }
{
  let problems = 0;
  for (const s of BUNDLE_SURFACES) {
    const b = bundles[s];
    const en = Object.keys(b.en);
    for (const l of ['fr', 'ar']) {
      const miss = en.filter((k) => !(k in b[l]));
      const extra = Object.keys(b[l]).filter((k) => !(k in b.en));
      if (miss.length || extra.length) { problems++; bad(`${s}.${l} : manque ${miss.join(', ') || '–'} ; en trop (absent de l'EN) ${extra.join(', ') || '–'}`); }
    }
    for (const k of en) {
      const e = { surface: s, en: b.en[k], fr: b.fr[k], ar: b.ar[k] };
      if (entry.has(k)) {
        const o = entry.get(k);
        if (JSON.stringify([o.en, o.fr, o.ar]) !== JSON.stringify([e.en, e.fr, e.ar])) { problems++; bad(`${k} figure dans ${o.surface} et ${s} avec des valeurs différentes`); }
      } else entry.set(k, e);
    }
    for (const l of LANGS) for (const [k, v] of Object.entries(b[l])) {
      for (const x of Array.isArray(v) ? v : [v]) {
        if (typeof x !== 'string' || !x.length || x !== x.trim()) { problems++; bad(`${s}.${l} ${k} : valeur vide ou avec espace en bord`); }
      }
    }
  }
  if (!problems) ok(`${entry.size} clés distinctes, identiques dans les trois langues`);
}

/* ── 3 · la table de la spec ───────────────────────────────────────────── */
section('Table de §9.6 : clés, décomptes, cellules');
const SPEC_EXTRA = new Set(['customers.known']);    // §9.2 la nomme, la table l'omet
const specKeys = new Map();                          // clé → { row, index, n }
rows.forEach((r) => r.keys.forEach((k, i) => { if (r.surface !== 'guest' && !specKeys.has(k)) specKeys.set(k, { row: r, index: i }); }));
/* Un second lecteur de la colonne clé, écrit autrement que parseKeyCell (une
 * regex par jeton, pas de parenthèses équilibrées), pour que le parseur ne
 * soit pas son propre juge. Un suffixe « .cold » prend le parent du jeton qui
 * le précède immédiatement : `kds.station.hot` / `.cold` donne
 * `kds.station.cold`, pas `kds.cold`. */
function independentKeys(keyCell) {
  const out = [];
  let rest = keyCell.trim();
  let parent = null;
  const TOKEN = /^`([^`]+)`(?: \((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))*(?: \/ |$)/;
  for (;;) {
    const m = TOKEN.exec(rest);
    if (!m) break;
    const t = m[1];
    const key = t.startsWith('.') ? parent + t : t;
    out.push(key);
    parent = key.slice(0, key.lastIndexOf('.'));
    rest = rest.slice(m[0].length);
    if (!rest.startsWith('`')) break;
  }
  return out;
}
{
  /* Les deux lecteurs s'accordent, ligne par ligne ; puis les clés des paquets
     sont EXACTEMENT les clés lues, dans les deux sens. */
  const disagree = rows.filter((r) => r.surface !== 'guest' && independentKeys(r.keyCell).join() !== r.keys.join());
  expect(!disagree.length, 'le parseur et le second lecteur de la colonne clé donnent les mêmes clés pour chaque ligne', `lignes où les deux lecteurs divergent : ${disagree.map((r) => `${r.line}: ${r.keys.join(' ')} ≠ ${independentKeys(r.keyCell).join(' ')}`).join(' ; ')}`);
  const read = new Set(rows.filter((r) => r.surface !== 'guest').flatMap((r) => independentKeys(r.keyCell)));
  const inBundles = new Set(entry.keys());
  const onlySpec = [...read].filter((k) => !inBundles.has(k)).sort();
  const onlyBundles = [...inBundles].filter((k) => !read.has(k) && !SPEC_EXTRA.has(k)).sort();
  expect(!onlySpec.length && !onlyBundles.length, `l'ensemble des ${read.size} clés de la table (second lecteur) est exactement l'ensemble des clés des paquets, dans les deux sens`,
    `clés de la table absentes des paquets : ${onlySpec.join(', ') || '–'} ; clés des paquets absentes de la table : ${onlyBundles.join(', ') || '–'}`);
}
{
  const c = counts(rows);
  const st = statedCounts(spec);
  expect(st && c.rows === st.rows && c.arabic === st.arabic, `la table compte ${c.rows} lignes et ${c.arabic} chaînes arabes, comme la spec l'énonce`, `décomptes : table ${JSON.stringify(c)}, spec ${JSON.stringify(st)}`);
  const missing = [...specKeys.keys()].filter((k) => !entry.has(k));
  const extra = [...entry.keys()].filter((k) => !specKeys.has(k) && !SPEC_EXTRA.has(k));
  expect(!missing.length, 'chaque clé de la table est dans un paquet', `clés de la table absentes des paquets : ${missing.join(', ')}`);
  expect(!extra.length, 'aucune clé de paquet hors table (sauf customers.known, §9.2)', `clés de paquet hors table : ${extra.join(', ')}`);
  const wrongSurface = [...specKeys].filter(([k, v]) => entry.has(k) && !(bundles[v.row.surface] && k in bundles[v.row.surface].en)).map(([k]) => k);
  expect(!wrongSurface.length, 'chaque clé est dans le paquet de la surface où la table la met', `mauvaise surface : ${wrongSurface.join(', ')}`);
}
{
  /* Cellules exactes. Valeur simple : égalité à l'octet. Valeur plurielle : la
     cellule est l'une des phrases que le message produit. Deux lignes de la
     spec portent des notes dans leurs cellules ; leur forme est lue ici. */
  const noteCut = (s) => s.replace(/ \((?:one:|the noun after).*\)$/, '').replace(/^n one: .* · other: /, '');
  const frA11y = /^n one: (.*) · other: (.*)$/;
  let problems = 0;
  for (const [k, { row, index }] of specKeys) {
    const e = entry.get(k);
    if (!e) continue;
    for (const l of LANGS) {
      const cells = row.keys.length > 1 ? row.cells[l].split(' / ') : null;
      let cell = cells ? cells[index] : row.cells[l];
      const v = e[l];
      if (Array.isArray(v)) {
        if (cell.split(' / ').join('\u0000') !== v.join('\u0000')) { problems++; bad(`${k} (${l}) : la liste diffère de la cellule`); }
        continue;
      }
      const alts = K._expand(v);
      let wanted = [cell];
      if (k === 'home.returning_a11y' && l === 'fr') { const m = frA11y.exec(cell); wanted = [m[1], m[2]]; }
      else if (k === 'home.returning_value') { const m = / \(one: ([^·]*?)(?: · .*)?\)$/.exec(cell); wanted = [cell.replace(/ \(one:.*\)$/, '')].concat(l === 'ar' ? [] : [m[1].replace(/ 1 /, ' {total} ')]); }
      else if (k === 'home.returning_a11y' && l === 'ar') wanted = [cell.replace(/ \(the noun after.*$/, '')];
      else wanted = [noteCut(cell)];
      for (const w of wanted) {
        const hit = v === w || alts.includes(w);
        if (!hit) { problems++; bad(`${k} (${l}) : la cellule « ${w} » n'est ni la valeur ni une de ses branches`); }
      }
    }
  }
  if (!problems) ok('chaque valeur est la cellule de la spec, à l\'octet près (U+00A0 compris)');
}

/* ── 4 · arguments ─────────────────────────────────────────────────────── */
section('Arguments : les mêmes dans les trois langues');
{
  let problems = 0;
  for (const [k, e] of entry) {
    const sets = LANGS.map((l) => (Array.isArray(e[l]) ? e[l].map((x) => K._args(x).join()).join('|') : K._args(e[l]).join()));
    if (new Set(sets).size > 1) { problems++; bad(`${k} : arguments EN « ${sets[0]} », FR « ${sets[1]} », AR « ${sets[2]} »`); }
    if (Array.isArray(e.en) && !(e.fr.length === e.en.length && e.ar.length === e.en.length)) { problems++; bad(`${k} : listes de longueurs différentes`); }
  }
  if (!problems) ok(`${entry.size} clés, mêmes arguments partout`);
}

/* ── 5 · catégories plurielles ─────────────────────────────────────────── */
section('Pluriels : toutes les catégories de chaque langue');
const REQUIRED = { en: ['one', 'other'], fr: ['many', 'one', 'other'], ar: ['few', 'many', 'one', 'other', 'two', 'zero'] };
const invariant = (() => {
  /* Les trois clés de la première phrase du paragraphe, jusqu'à home.see_all_orders. */
  const m = /\*\*Invariant count strings\*\*[^\n]*?`home\.see_all_orders`/.exec(spec);
  return new Set([...(m ? m[0] : '').matchAll(/`([a-z_.]+)`/g)].map((x) => x[1]).filter((k) => entry.has(k)));
})();
const pluralKeys = new Set();
{
  expect(invariant.size === 3, `§9.2 nomme ${[...invariant].join(', ')} comme chaînes à compte invariant`, `liste des invariants illisible : ${[...invariant].join(', ')}`);
  const marked = new Set(rows.filter((r) => /plural/.test(r.keyCell) && r.surface !== 'guest').flatMap((r) => r.keys));
  let problems = 0;
  for (const [k, e] of entry) {
    const sel = {};
    for (const l of LANGS) {
      const v = Array.isArray(e[l]) ? e[l].join() : e[l];
      sel[l] = K._selectors(v);
    }
    const isPlural = Object.keys(sel.en).length > 0;
    if (isPlural) pluralKeys.add(k);
    if (isPlural !== marked.has(k) && !SPEC_EXTRA.has(k)) { problems++; bad(`${k} : ${isPlural ? 'pluriel' : 'simple'} dans le paquet EN, mais la table dit ${marked.has(k) ? 'plural' : 'pas plural'}`); }
    if (!isPlural) {
      for (const l of ['fr', 'ar']) if (Object.keys(sel[l]).length) { problems++; bad(`${k} : pluriel en ${l} seulement`); }
      continue;
    }
    for (const l of LANGS) {
      if (l === 'ar' && invariant.has(k)) { if (Object.keys(sel.ar).length) { problems++; bad(`${k} : invariant, l'AR ne doit pas compter`); } continue; }
      const names = Object.keys(sel[l]);
      if (!names.length) { problems++; bad(`${k} (${l}) : pas de pluriel alors que l'EN en a un`); continue; }
      for (const n of names) {
        const have = [...sel[l][n]].sort().join();
        if (have !== REQUIRED[l].join()) { problems++; bad(`${k} (${l}, sur ${n}) : catégories ${have}, attendu ${REQUIRED[l].join()}`); }
      }
    }
  }
  if (!problems) ok(`${pluralKeys.size} chaînes comptées, catégories complètes (EN 2, FR 3, AR 6, ${invariant.size} invariantes en AR)`);
  expect(K.categories('ar').join() === 'zero,one,two,few,many,other' && K.categories('fr').join() === 'one,many,other' && K.categories('en').join() === 'one,other',
    'Intl.PluralRules de cet environnement donne les catégories de §9.2', `catégories de l'environnement : en ${K.categories('en')} fr ${K.categories('fr')} ar ${K.categories('ar')}`);
}

/* ── 6 · test de pluriel arabe (§9.2) ──────────────────────────────────── */
section('Pluriel arabe : 0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103, 111');
{
  /* Le tableau des noms de §9.2, lu dans la spec. */
  const nouns = {};
  for (const line of spec.split('\n')) {
    const m = /^\| (order|item|sale|guest|customer|new \(adjective\)):/.exec(line);
    if (!m) continue;
    const c = line.split(' | ');
    if (c.length < 7) continue;
    const dual = c[3].split(' / ');
    nouns[m[1].split(' ')[0]] = { zero: c[1], one: c[2], two: dual[0], twoPrep: dual[1] || dual[0], few: c[4], many: c[5], other: c[6].replace(/ \|$/, '') };
  }
  expect(Object.keys(nouns).length === 6, 'le tableau des noms de §9.2 compte six lignes', `noms lus : ${Object.keys(nouns).join(', ')}`);
  /* Quelle ligne compte quelle clé, et à quel cas : les notes de §9.6. */
  const plan = new Map();
  for (const r of rows) {
    if (r.surface === 'guest') continue;
    const m = /AR six forms: §9\.2, (\w+)(?:, (nominative|after [^;)]+))?/.exec(r.keyCell);
    if (m) plan.set(r.keys[0], { noun: m[1], prep: !!m[2] && m[2].startsWith('after') });
  }
  plan.set('home.returning_value', { noun: 'customer', prep: true, bare: true });
  plan.set('home.returning_a11y', { noun: 'customer', prep: true });
  plan.set('customers.known', { noun: 'customer', prep: false });
  const cat = (n) => { const r = n % 100; return n === 0 ? 'zero' : n === 1 ? 'one' : n === 2 ? 'two' : r >= 3 && r <= 10 ? 'few' : r >= 11 ? 'many' : 'other'; };
  const NS = [0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103, 111];
  const ar = new Intl.PluralRules('ar');
  expect(NS.every((n) => ar.select(n) === cat(n)), 'la formule CLDR de §9.2 (n % 100) et Intl.PluralRules s\'accordent sur les douze nombres', 'Intl.PluralRules ne suit pas la formule de §9.2');
  let problems = 0;
  K.setLocale('ar');
  for (const k of pluralKeys) {
    if (invariant.has(k)) continue;
    const p = plan.get(k);
    if (!p) { problems++; bad(`${k} : aucune ligne de §9.2 ne dit quel nom il compte`); continue; }
    const e = entry.get(k);
    const sel = Object.keys(K._selectors(e.ar))[0];
    const noun = nouns[p.noun];
    for (const n of NS) {
      const c = cat(n);
      const args = {}; K._args(e.ar).forEach((a) => { args[a] = a === sel ? n : K.ltr('9'); });
      const text = K.raw(k, args);
      let form = c === 'two' && p.prep ? noun.twoPrep : noun[c];
      form = form.replace('{n}', String(n));
      let at = 0, okTokens = true;
      for (const tok of form.split(' ')) { const i = text.indexOf(tok, at); if (i < 0) { okTokens = false; break; } at = i + tok.length; }
      if (!okTokens) { problems++; bad(`${k} avec ${sel} = ${n} (${c}) : « ${text} » ne contient pas « ${form} »`); }
    }
  }
  if (!problems) ok(`${[...pluralKeys].filter((k) => !invariant.has(k)).length} chaînes arabes × 12 nombres : le bon nom à la bonne catégorie`);
  /* EN et FR : one pour 1 (et 0 en FR), sinon other. */
  let enfr = 0;
  for (const k of pluralKeys) {
    const e = entry.get(k);
    for (const [l, ones] of [['en', [1]], ['fr', [0, 1]]]) {
      const sel = Object.keys(K._selectors(e[l]))[0];
      const pr = new Intl.PluralRules(l);
      for (const n of [0, 1, 2, 5, 21]) if ((pr.select(n) === 'one') !== ones.includes(n)) { enfr++; bad(`${l} : ${n} ne tombe pas comme §9.2 le dit`); }
      void sel;
    }
  }
  if (!enfr) ok('EN : 1 est one ; FR : 0 et 1 sont one, 2 et plus other');
  K.setLocale('en');
}

/* ── 7 · la chaîne de repli ────────────────────────────────────────────── */
section('Repli : langue courante, puis EN, jamais le FR');
{
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'kit', 'strings.js'), 'utf8');
  const logs = [];
  const sandbox = { console: { warn: (m) => logs.push(String(m)) }, Intl };
  sandbox.self = sandbox;
  vm.runInNewContext(src, sandbox);
  sandbox.__kiwiStrings = { 'x.en': { a: 'EN a', c: 'EN c' }, 'x.fr': { a: 'FR a', b: 'FR b' }, 'x.ar': { c: 'AR c' } };
  const S = sandbox.KiwiStrings;
  S.setLocale('ar');
  expect(S.t('a') === 'EN a' && logs.some((m) => m.includes('"a"')), 'une clé absente de l\'AR affiche l\'EN et journalise la clé', `repli AR : « ${S.t('a')} », journal ${JSON.stringify(logs)}`);
  expect(S.t('b') === 'b' && logs.some((m) => m.includes('"b"')), 'une clé que seul le FR a n\'affiche jamais le FR', `le FR a servi de repli : « ${S.t('b')} »`);
  expect(S.t('c') === 'AR c', 'une clé présente dans la langue courante l\'emporte', 'AR courant ignoré');
  S.setLocale('fr');
  expect(S.t('c') === 'EN c', 'FR absent : EN, pas AR', `FR→ « ${S.t('c')} »`);
  /* Les paquets arrivent dans n'importe quel ordre. */
  sandbox.__kiwiStrings['y.fr'] = { d: 'FR d' };
  expect(S.t('d') === 'FR d', 'un paquet enregistré après coup est lu', 'paquet tardif ignoré');
  /* La capitale d'un jour en tête d'étiquette. */
  S.setLocale('fr');
  sandbox.__kiwiStrings['z.fr'] = { w: '{weekday} dernier à {time}', v: '{name} dernier' };
  expect(S.raw('w', { weekday: 'lundi', time: '17:39' }) === 'Lundi dernier à 17:39', 'un jour de la semaine en tête d\'étiquette est mis en capitale', `capitale : « ${S.raw('w', { weekday: 'lundi', time: 'x' })} »`);
  expect(S.raw('v', { name: 'café' }) === 'café dernier', 'un nom saisi n\'est jamais retouché', 'un nom a été modifié');
}

/* ── 8 · budgets gzip (§19) ────────────────────────────────────────────── */
section('Taille : budgets gzip par paquet (§19)');
{
  const line = spec.split('\n').find((l) => l.startsWith('| Strings, per surface bundle and locale')) || '';
  const budget = Object.fromEntries([...line.matchAll(/`(\w+)` ≤ (\d+) KB/g)].map((m) => [m[1], Number(m[2]) * 1024]));
  expect(Object.keys(budget).length === 7, 'les sept budgets de §19 sont lus', `budgets lus : ${JSON.stringify(budget)}`);
  for (const s of BUNDLE_SURFACES) {
    for (const l of LANGS) {
      const size = zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'assets', 'kit', 'strings', `${s}.${l}.js`)), { level: 9 }).length;
      if (size > budget[s]) bad(`${s}.${l}.js pèse ${size} o en gzip, budget ${budget[s]} o`);
    }
  }
  const worst = BUNDLE_SURFACES.map((s) => `${s} ${Math.max(...LANGS.map((l) => zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'assets', 'kit', 'strings', `${s}.${l}.js`)), { level: 9 }).length))}/${budget[s]}`);
  ok('plus gros paquet par surface (gzip -9, octets) : ' + worst.join(' · '));
}

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ ${failures} échec(s) sur ${checks + failures} contrôles`); process.exit(1); }
console.log(`✓ strings-completeness-test : ${checks} contrôles`);
