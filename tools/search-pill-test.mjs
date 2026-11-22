#!/usr/bin/env node
/* Les champs de recherche « pilule » du tableau de bord (22 nov. 2026).
 * La peau Vexel peint TOUT input d'un fond gris (body.design-vexel
 * :is(input, …)), et ce sélecteur l'emportait sur le `.xx-search input
 * { background: transparent }` de chaque composant : un deuxième rectangle,
 * plus sombre, s'affichait dans la pilule (Dépenses). design-vexel.css garde
 * donc une liste des pilules dont l'input reste nu. Ce test la tient à jour :
 *  A. chaque `.…search… input { background: transparent|none }` d'assets/
 *     figure dans les trois règles de l'exception (input nu, anneau au focus) ;
 *  B. l'exception vient APRÈS la règle grise (même poids : l'ordre tranche) ;
 *  C. elle ne touche que des pilules, jamais un input isolé. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'icons') walk(p); }
    else if (/\.(css|js|mjs)$/.test(e.name) && !/\.min\./.test(e.name) && e.name !== 'design-vexel.css') files.push(p);
  }
})(path.join(root, 'assets'));

const pills = new Set();
const RULE = /\.([a-zA-Z0-9_-]*search[a-zA-Z0-9_-]*) input\s*\{([^}]*)\}/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(RULE)) if (/background\s*:\s*(transparent|none)\b/.test(m[2])) pills.add(m[1]);
}

const css = fs.readFileSync(path.join(root, 'assets/design-vexel.css'), 'utf8');
const grey = css.indexOf('body.design-vexel :is(\n  input, select, textarea');
const lists = [...css.matchAll(/body\.design-vexel :is\(([^)]*\.xp-search[^)]*)\)( input|:focus-within) \{/g)];

console.log('A. chaque pilule déclarée est dans l’exception');
ok(pills.size >= 20, `${pills.size} pilules trouvées dans assets/`);
ok(lists.length === 2, 'deux règles : input nu, anneau au focus');
for (const l of lists) {
  const listed = new Set(l[1].split(',').map((s) => s.trim().replace(/^\./, '')));
  const missing = [...pills].filter((p) => !listed.has(p));
  ok(!missing.length, `${l[2].trim() || 'input'} : ` + (missing.length ? 'manquent ' + missing.map((p) => '.' + p).join(', ') : 'toutes présentes'));
}

console.log('B. l’exception suit la règle grise');
ok(grey > 0, 'la règle grise des inputs est trouvée');
ok(lists.length && lists.every((l) => l.index > grey), 'l’exception est écrite après elle');

console.log('C. seulement des pilules');
for (const l of lists) ok(l[1].split(',').every((s) => /^\.[a-zA-Z0-9_-]*search[a-zA-Z0-9_-]*$/.test(s.trim())), 'chaque entrée est une classe « …search… »');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
