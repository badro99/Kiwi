#!/usr/bin/env node
/* Kiwi · strings-coverage-test · tout texte que §10 à §18 montre est une clé ou une donnée de fixture.
 *
 * « Every user-visible string in §10 to §18 is either a key below or fixture
 * data. strings-coverage-test greps the spec's quoted UI strings in §10 to §18
 * against this table and the fixture, and fails on a string that is neither »
 * (§9.6, Coverage rule).
 *
 * Le grep : chaque chaîne entre guillemets droits de § 10 à § 18. Elle passe si
 *   1. elle est une valeur d'un paquet, en EN, FR ou AR, ou un morceau d'une
 *      valeur (les {arguments} valent « n'importe quoi ») ;
 *   2. ou elle est dans tools/strings-data/coverage-exempt.json avec sa raison :
 *        tech       un jeton qui n'est pas du texte affiché (rôle ARIA, valeur CSS, code)
 *        format     une sortie de KiwiFormat (§6.3), tenue par format-vectors-test
 *        fixture    une donnée du Café Atlas (§18.0), tenue par la fixture
 *        shipped    le texte que livre le code d'aujourd'hui, cité comme point de départ
 *        withdrawn  un texte retiré par la spec, cité pour dire qu'il disparaît
 *        doc        un état ou une phrase que la prose décrit et qu'aucune clé ne porte encore
 * Une nouvelle chaîne citée qui n'est ni l'un ni l'autre échoue : il faut la
 * mettre dans la table (§9.6) ou la classer ici. Une exemption que la spec ne
 * cite plus, ou que la table couvre désormais, échoue aussi : la liste reste
 * la liste exacte de ce qui n'est pas clé.
 *
 * Deuxième grep : toute clé entre accents graves dans §10 à §18 dont le
 * premier segment est un espace de noms des paquets existe dans un paquet (ou
 * est une clé retirée que la spec cite pour l'écarter). */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, LANGS, readSpec, quotedStrings, makeMatcher, loadBundles, loadData, loadRuntime, flatten } from './strings-corpus.mjs';

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ✓ ' + m); };
const bad = (m) => { failures++; console.log('  ✗ ' + m); };
const note = (m) => console.log('  ○ ' + m);

const K = loadRuntime();
const bundles = loadBundles();
const spec = readSpec();
const texts = flatten(bundles, K).map((f) => f.text);
const guest = loadData('guest.json');
for (const e of Object.values(guest)) for (const l of LANGS) texts.push(e[l]);
const exempt = loadData('coverage-exempt.json');
const CLASSES = new Set(['tech', 'format', 'fixture', 'shipped', 'withdrawn', 'doc']);
const matches = makeMatcher(texts);

const FIXTURE = path.join(ROOT, 'tools', 'fixtures', 'worked-example.json');
const fixtureText = fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, 'utf8') : null;

console.log('■ Chaînes citées de § 10 à § 18');
const { quoted, from, to } = quotedStrings(spec);
{
  const uncovered = [];
  for (const [q, line] of quoted) if (!matches(q) && !exempt[q]) uncovered.push(`ligne ${line} : « ${q} »`);
  if (uncovered.length) { bad(`${uncovered.length} chaîne(s) citée(s) qui ne sont ni une clé ni une exemption classée :`); uncovered.slice(0, 20).forEach((l) => console.log('      ' + l)); }
  else ok(`${quoted.size} chaînes citées entre les lignes ${from} et ${to} : chacune est une clé, un morceau de clé ou une exemption classée`);

  const keyed = [...quoted.keys()].filter((q) => matches(q)).length;
  note(`${keyed} couvertes par la table, ${Object.keys(exempt).length} exemptées (${Object.entries(Object.values(exempt).reduce((a, c) => ({ ...a, [c]: (a[c] || 0) + 1 }), {})).map(([c, n]) => `${c} ${n}`).join(' · ')})`);

  const badClass = Object.entries(exempt).filter(([, c]) => !CLASSES.has(c));
  if (badClass.length) bad(`exemptions sans classe valide : ${badClass.map(([q]) => q).join(' ; ')}`);
  const stale = Object.keys(exempt).filter((q) => !quoted.has(q));
  if (stale.length) bad(`exemptions que la spec ne cite plus (à retirer) : ${stale.map((q) => `« ${q} »`).join(' ; ')}`);
  const covered = Object.keys(exempt).filter((q) => quoted.has(q) && matches(q));
  if (covered.length) bad(`exemptions que la table couvre désormais (à retirer) : ${covered.map((q) => `« ${q} »`).join(' ; ')}`);
  if (!badClass.length && !stale.length && !covered.length) ok('la liste des exemptions est exacte : ni périmée, ni redondante, toutes classées');

  /* Le contrôle négatif : un texte d'interface inventé n'est ni clé ni exempté. */
  const invented = 'Wire the thing up';
  if (!matches(invented) && !exempt[invented]) ok('contrôle négatif : un texte inventé serait refusé');
  else bad('contrôle négatif : un texte inventé passe');
  /* Et la règle voit bien une vraie clé citée entre guillemets. */
  if (matches('Charge 230.00 MAD') && matches('Try again')) ok('contrôle positif : « Charge 230.00 MAD » (bill.take_payment) et « Try again » sont couverts');
  else bad('contrôle positif : une clé citée n\'est pas reconnue');
}

console.log('\n■ Fixture');
{
  if (!fixtureText) note('tools/fixtures/worked-example.json n\'existe pas encore (autre tranche du stade 1) : les chaînes classées « fixture » ne sont pas vérifiées contre lui. Dès qu\'il existe, ce bloc compte celles qu\'il porte (à titre indicatif).');
  else {
    const fx = Object.entries(exempt).filter(([, c]) => c === 'fixture').map(([q]) => q);
    const norm = (s) => s.replace(/ /g, ' ');
    const missing = fx.filter((q) => !norm(fixtureText).includes(norm(q)));
    /* Une chaîne composée (« Orders · 137 · ↑ +4 ») n'est pas un morceau du JSON : on ne la
       reproche qu'en information. */
    note(`${fx.length - missing.length} des ${fx.length} chaînes « fixture » sont écrites telles quelles dans la fixture ; ${missing.length} sont des compositions de ses données`);
  }
}

console.log('\n■ Clés citées de § 10 à § 18');
{
  const keys = new Set();
  for (const langs of Object.values(bundles)) for (const k of Object.keys(langs.en)) keys.add(k);
  const namespaces = new Set([...keys].map((k) => k.split('.')[0]));
  /* Des clés que la spec cite pour dire qu'elles disparaissent ou qui ne sont pas des chaînes. */
  const NOT_KEYS = new Set(['lock.store.why', 'lock.store.why_body', 'lock.store.why_body_unpaired', 'lock.store.body_unpaired', 'lock.store.memory', 'lock.store.wrong_store', 'sync.pair_back', 'till.cashier']);
  const lines = spec.split('\n');
  const missing = new Map();
  for (let i = from - 1; i < to; i++) {
    for (const m of lines[i].matchAll(/`([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)`/g)) {
      const k = m[1];
      if (!namespaces.has(k.split('.')[0]) || keys.has(k) || NOT_KEYS.has(k)) continue;
      if (!missing.has(k)) missing.set(k, i + 1);
    }
  }
  if (missing.size) bad(`clés citées qui n'existent pas dans les paquets : ${[...missing].map(([k, l]) => `${k} (ligne ${l})`).join(', ')}`);
  else ok(`toute clé citée existe (${NOT_KEYS.size} clés retirées ou qui ne sont pas des chaînes sont nommées dans le test)`);
}

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ ${failures} échec(s)`); process.exit(1); }
console.log(`✓ strings-coverage-test : ${checks} contrôles`);
