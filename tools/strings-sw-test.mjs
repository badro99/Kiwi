#!/usr/bin/env node
/* Kiwi · strings-sw-test · le kit et ses chaînes avancent d'un seul pas (§9.3, §21.3).
 *
 * « Le shell précache les paquets des trois langues dans SHELL du SW, bumpés
 * dans le même passage de bump-stamp que le kit. Le stale-while-revalidate ne
 * peut donc jamais apparier un kit neuf et des chaînes anciennes. »
 *
 * Ce que la suite refuse, sur les sites d'estampille que tools/stamps.js voit
 * (balises de shell, liste SHELL de kiwi-sw.js) :
 *   · un fichier de assets/kit/ (dont strings.js et les 21 paquets) dont les
 *     sites portent des numéros différents, ou dont le contenu a bougé sans que
 *     son numéro bouge (le manifeste de tools/asset-stamps.json le dit) ;
 *   · un paquet dans le SW sans que TOUS les paquets des trois langues, et
 *     strings.js, y soient ; un paquet de shell absent du SW, ou l'inverse ;
 *   · un shell qui charge une surface sans ses trois langues, ou sans
 *     kit.<lang> et strings.js ;
 *   · une URL de chaîne construite à l'exécution (§21.3 : « Runtime URLs are banned »).
 * Puis, sur un arbre jetable, bump-stamp lui-même : un paquet bumpé doit se
 * retrouver au même numéro dans le shell et dans le SW, et la règle doit voir
 * l'écart quand on n'en bouge qu'un seul. Au stade 1 aucun shell n'adopte
 * encore les paquets : les règles de présence sont alors sans objet, et la
 * suite le dit au lieu de passer pour acquis. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, LANGS, BUNDLE_SURFACES } from './strings-corpus.mjs';

let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ✓ ' + m); };
const bad = (m) => { failures++; console.log('  ✗ ' + m); };
const note = (m) => console.log('  ○ ' + m);
const section = (t) => console.log('\n■ ' + t);

const KIT = 'assets/kit/';
const STRINGS_JS = 'assets/kit/strings.js';
const BUNDLES = BUNDLE_SURFACES.flatMap((s) => LANGS.map((l) => `assets/kit/strings/${s}.${l}.js`));
/* Pages that load the kit but are no shell of the PWA: the stage-2 gallery
 * (noindex, adopted by no product surface). Nothing of theirs is precached
 * and every URL they load carries its stamp, so the SW can never pair a new
 * kit with old strings for them; precaching 21 bundles for every merchant to
 * satisfy the rule would change shipped install behaviour (§21.1, stage 2). */
export const NOT_SHELLS = new Set(['kit.html']);

/* La règle, sur des données : sites = Map(asset → [{file, kind, stamp}]), exists = Set. */
export function audit(sites, exists, manifest, shaOf) {
  const out = [];
  const kitAssets = [...sites.keys()].filter((a) => a.startsWith(KIT));
  for (const a of kitAssets) {
    const stamps = new Set(sites.get(a).map((s) => s.stamp));
    if (stamps.size > 1) out.push(`${a} : estampilles différentes selon le site (${[...stamps].join(', ')})`);
    if (!exists.has(a)) out.push(`${a} est référencé mais n'existe pas`);
    else if (manifest && manifest[a] && shaOf && manifest[a].sha !== shaOf(a)) out.push(`${a} a changé de contenu sans changer d'estampille (kit neuf, chaînes anciennes)`);
  }
  const inSw = new Set(kitAssets.filter((a) => sites.get(a).some((s) => s.kind === 'sw')));
  const swBundles = [...inSw].filter((a) => BUNDLES.includes(a) || a === STRINGS_JS);
  if (swBundles.length) {
    for (const a of [...BUNDLES, STRINGS_JS]) if (!inSw.has(a)) out.push(`le SW précache des chaînes mais pas ${a} (les trois langues partent ensemble)`);
  }
  const shells = new Map();
  for (const a of kitAssets) for (const s of sites.get(a)) if (s.kind === 'shell' && !NOT_SHELLS.has(s.file)) {
    if (!shells.has(s.file)) shells.set(s.file, new Set());
    shells.get(s.file).add(a);
  }
  for (const [file, set] of shells) {
    const usesStrings = [...set].some((a) => BUNDLES.includes(a));
    if (!usesStrings) continue;
    if (!set.has(STRINGS_JS)) out.push(`${file} charge des chaînes sans ${STRINGS_JS}`);
    for (const a of BUNDLES.filter((b) => set.has(b))) {
      const surface = path.basename(a).split('.')[0];
      for (const l of LANGS) if (!set.has(`assets/kit/strings/${surface}.${l}.js`)) out.push(`${file} charge ${a} sans la langue ${l} de ${surface}`);
    }
    for (const l of LANGS) if (!set.has(`assets/kit/strings/kit.${l}.js`)) out.push(`${file} ne charge pas kit.${l}.js`);
    for (const a of set) if (BUNDLES.includes(a) && !inSw.has(a)) out.push(`${file} charge ${a}, absent de SHELL dans kiwi-sw.js`);
  }
  for (const a of inSw) {
    if (!BUNDLES.includes(a) && a !== STRINGS_JS) continue;
    if (shells.size && ![...shells.values()].some((set) => set.has(a))) out.push(`${a} est précaché mais aucun shell ne le charge`);
  }
  return out;
}

const S = (await import('node:module')).createRequire(import.meta.url)('./stamps.js');

section('Fichiers : strings.js et 21 paquets');
{
  const missing = [STRINGS_JS, ...BUNDLES].filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) bad(`fichiers absents : ${missing.join(', ')}`); else ok('strings.js et les 21 paquets (7 surfaces × 3 langues) existent');
}

section('Estampilles : une génération, shell et SW d\'accord');
{
  const scanned = S.scan();
  const sites = new Map([...scanned].map(([a, e]) => [a, e.sites]));
  const exists = new Set([...sites.keys()].filter((a) => S.exists(a)));
  const manifest = S.readManifest();
  const found = audit(sites, exists, manifest, S.sha);
  found.forEach(bad);
  for (const f of NOT_SHELLS) if (fs.existsSync(path.join(ROOT, f))) note(`${f} charge le kit sans être un shell de la PWA : règles de présence SW non appliquées (galerie, rien n'y est précaché)`);
  const kitSeen = [...sites.keys()].filter((a) => a.startsWith(KIT));
  if (!found.length) ok(`${kitSeen.length} fichier(s) du kit référencé(s), aucun écart`);
  if (!kitSeen.length) note('stade 1 : aucun shell ni le SW n\'adopte encore le kit ni les paquets ; les règles de présence sont sans objet jusqu\'au stade 2');
  /* Les contrôles négatifs, sur des données fabriquées. */
  const site = (file, kind, stamp) => ({ file, kind, stamp });
  const all = [STRINGS_JS, ...BUNDLES];
  const full = (extra = {}) => new Map(all.map((a) => [a, [site('x.html', 'shell', '3'), site('kiwi-sw.js', 'sw', '3')]]).concat(Object.entries(extra)));
  const present = new Set(all);
  const cases = [
    ['une estampille de SW en retard', (() => { const m = full(); m.get('assets/kit/strings/till.fr.js')[1] = site('kiwi-sw.js', 'sw', '2'); return m; })()],
    ['une langue absente du SW', (() => { const m = full(); m.get('assets/kit/strings/till.ar.js').splice(1, 1); return m; })()],
    ['un shell sans la langue arabe', (() => { const m = full(); m.get('assets/kit/strings/till.ar.js').splice(0, 1); return m; })()],
    ['un paquet qui n\'existe pas', full({ 'assets/kit/strings/ghost.fr.js': [site('x.html', 'shell', '1')] })],
  ];
  for (const [name, m] of cases) {
    const r = audit(m, present, null, null);
    if (r.length) ok(`contrôle négatif « ${name} » : la règle s'allume`); else bad(`contrôle négatif « ${name} » : la règle ne voit rien`);
  }
  if (audit(full(), present, null, null).length === 0) ok('contrôle positif : un kit complet et accordé passe');
  else bad('contrôle positif : un kit complet et accordé est refusé : ' + audit(full(), present, null, null).join(' ; '));
}

section('Aucune URL de chaîne construite à l\'exécution (§21.3)');
{
  const files = [STRINGS_JS, ...BUNDLES];
  const RUNTIME_URL = /strings\/['"`]\s*\+|strings\/\$\{|['"`]\s*\+\s*[a-z]+\s*\+\s*['"`]\.js|\$\{[^}]*\}\.js/;
  const hit = files.filter((f) => RUNTIME_URL.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  if (hit.length) bad(`URL construite dans ${hit.join(', ')}`); else ok('strings.js et les paquets ne construisent aucune URL');
  const probe = "var u = 'assets/kit/strings/' + lang + '.js';";
  if (RUNTIME_URL.test(probe)) ok('contrôle négatif : une URL construite est vue'); else bad('contrôle négatif : une URL construite passe');
}

section('bump-stamp sur un arbre jetable : le même numéro dans le shell et dans le SW');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-strings-sw-'));
  try {
    for (const f of [STRINGS_JS, ...BUNDLES]) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.writeFileSync(path.join(tmp, f), `/* ${f} */\n`);
    }
    fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
    const all = [STRINGS_JS, ...BUNDLES];
    fs.writeFileSync(path.join(tmp, 'shell.html'), '<!doctype html><html><body>\n' + all.map((f) => `<script src="${f}?v=1"></script>`).join('\n') + '\n</body></html>\n');
    fs.writeFileSync(path.join(tmp, 'kiwi-sw.js'), "const CACHE = 'kiwi-app-v1';\nconst SHELL = [\n" + all.map((f) => `  '/${f}?v=1',`).join('\n') + '\n];\n');
    const env = { ...process.env, KIWI_STAMPS_ROOT: tmp };
    const run = (args) => spawnSync(process.execPath, args, { env, encoding: 'utf8', cwd: ROOT });
    const sync = run([path.join(ROOT, 'tools', 'bump-stamp.js'), '--sync']);
    const bump = run([path.join(ROOT, 'tools', 'bump-stamp.js'), 'assets/kit/strings/till.fr.js', 'assets/kit/strings.js']);
    if (sync.status !== 0 || bump.status !== 0) bad(`bump-stamp a échoué : ${(sync.stderr || bump.stderr || '').trim().split('\n')[0]}`);
    const scan = run(['-e', `const S=require(${JSON.stringify(path.join(ROOT, 'tools', 'stamps.js'))});console.log(JSON.stringify([...S.scan()].map(([a,e])=>[a,e.sites])))`]);
    const sites = new Map(JSON.parse(scan.stdout || '[]'));
    const till = sites.get('assets/kit/strings/till.fr.js') || [];
    const moved = till.length === 2 && till.every((s) => s.stamp === '2');
    if (moved) ok('bump-stamp déplace un paquet du kit en une passe : shell et SW à ?v=2'); else bad(`bump-stamp n'a pas déplacé les deux sites de till.fr.js : ${JSON.stringify(till)}`);
    const rest = sites.get('assets/kit/strings/kit.en.js') || [];
    if (rest.length === 2 && rest.every((s) => s.stamp === '1')) ok('un paquet qu\'on n\'a pas bumpé reste à ?v=1 (aucune estampille voisine ne bouge)'); else bad('un paquet non demandé a bougé');
    const exists = new Set([...sites.keys()]);
    const after = audit(sites, exists, null, null);
    if (!after.length) ok('après le bump, la règle ne voit aucun écart (chaque paquet est accordé site par site)'); else after.forEach(bad);
    /* On défait à la main un seul site, comme un oubli. */
    const swPath = path.join(tmp, 'kiwi-sw.js');
    fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('till.fr.js?v=2', 'till.fr.js?v=1'));
    const scan2 = run(['-e', `const S=require(${JSON.stringify(path.join(ROOT, 'tools', 'stamps.js'))});console.log(JSON.stringify([...S.scan()].map(([a,e])=>[a,e.sites])))`]);
    const drift = audit(new Map(JSON.parse(scan2.stdout)), exists, null, null);
    if (drift.some((l) => l.includes('till.fr.js'))) ok('un SW laissé à ?v=1 pendant que le shell passe à ?v=2 est refusé'); else bad('le SW en retard n\'est pas vu');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ ${failures} échec(s) sur ${checks + failures} contrôles`); process.exit(1); }
console.log(`✓ strings-sw-test : ${checks} contrôles`);
