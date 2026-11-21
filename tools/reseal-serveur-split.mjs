#!/usr/bin/env node
/* Rescelle la preuve de découpe de l'app serveur après un correctif.
 *
 *   node tools/reseal-serveur-split.mjs
 *
 * tools/serveur-split-test.mjs prouve que serveur-app.js + les trois parties
 * de assets/serveur/ reconstruisent une archive (tools/fixtures/serveur/
 * original.js.gz) et que chaque fragment déplacé est à sa place. Un correctif
 * de comportement dans l'un de ces fichiers déplace les coordonnées : cet
 * outil les recalcule depuis HEAD (la carte scellée y est cohérente) vers
 * l'arbre de travail, refait l'archive et vérifie la reconstruction.
 *
 * Il refuse quand un point d'insertion tombe dans une zone modifiée : un
 * fragment ne change pas de place sans qu'on le relise. Refaire ensuite le
 * paquet : cat <parties> > assets/serveur/service.js (le test le redit). */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MAP = 'tools/fixtures/serveur/split.json';
const ARCHIVE = 'tools/fixtures/serveur/original.js.gz';
const CORE = 'assets/serveur-app.js';
const hash = (t) => createHash('sha256').update(t).digest('hex');
const read = (f) => fs.readFileSync(f, 'utf8');
const atHead = (f) => execFileSync('git', ['show', 'HEAD:' + f], { encoding: 'utf8', maxBuffer: 64 << 20 });

/* Old char offset → new char offset, through the line hunks of git diff. */
function mapper(file) {
  const before = atHead(file), after = read(file);
  if (before === after) return (pos) => pos;
  let diff = '';
  try { diff = execFileSync('git', ['diff', '--no-color', '-U0', 'HEAD', '--', file], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
  catch (e) { diff = e.stdout || ''; }
  const hunks = [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map((m) => ({
    a: +m[1], b: m[2] == null ? 1 : +m[2], c: +m[3], d: m[4] == null ? 1 : +m[4],
  }));
  const starts = (text) => { const out = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1); return out; };
  const oldStarts = starts(before), newStarts = starts(after);
  return (pos) => {
    let line = 0; while (line + 1 < oldStarts.length && oldStarts[line + 1] <= pos) line++;
    const col = pos - oldStarts[line];
    const L = line + 1;   // 1-based
    let shift = 0;
    for (const h of hunks) {
      const firstOld = h.b === 0 ? h.a + 1 : h.a;          // first old line after/inside the hunk
      if (L < firstOld) break;
      if (h.b > 0 && L <= h.a + h.b - 1) {
        /* Début de ligne d'une ligne remplacée : on ne sait pas où le fragment va. */
        throw new Error(`${file}: un point de découpe (ligne ${L}) est dans une zone modifiée`);
      }
      shift += h.d - h.b;
    }
    return newStarts[L - 1 + shift] + col;
  };
}

/* Toujours depuis la carte et l'archive de HEAD : l'outil se relance sans risque (une
   seconde passe sur une carte déjà recalculée décalait tout une seconde fois). */
const map = JSON.parse(atHead(MAP));
const oldOriginal = gunzipSync(execFileSync('git', ['show', 'HEAD:' + ARCHIVE], { maxBuffer: 64 << 20 })).toString();
if (hash(oldOriginal) !== map.sha256) throw new Error('archive et carte ne concordent pas déjà dans HEAD');

/* 1. Les fragments découpés à l'octet suivent leur fichier. */
const partMaps = new Map();
for (const m of map.moved) {
  if (m.file === 'assets/serveur/payments.js') continue;
  if (!partMaps.has(m.file)) partMaps.set(m.file, mapper(m.file));
  const to = partMaps.get(m.file);
  const start = to(m.offset), end = to(m.offset + m.length);
  m.offset = start; m.length = end - start;
}
fs.writeFileSync(MAP, JSON.stringify(map, null, 2) + '\n');
delete require.cache[require.resolve('./fixtures/serveur/split.json')];
delete require.cache[require.resolve('./serveur-source.cjs')];
const { fragments } = require('./serveur-source.cjs');
const live = fragments();

/* 2. Les points d'insertion suivent le noyau. */
const toCore = mapper(CORE);
let removed = 0;
const corePos = map.moved.map((m) => {
  const p = m.start - removed;
  removed += (m.end - m.start) - (m.replacement || '').length;
  return toCore(p);
});
const core = read(CORE);
let original = '', cursor = 0;
map.moved.forEach((m, i) => {
  const body = live[i].body;
  original += core.slice(cursor, corePos[i]);
  m.start = original.length;
  original += body;
  m.end = original.length;
  m.length = body.length;
  m.sha256 = hash(body);
  cursor = corePos[i] + (m.replacement || '').length;
  if (m.replacement && core.slice(corePos[i], cursor) !== m.replacement) throw new Error('remplacement introuvable : ' + m.name);
});
original += core.slice(cursor);
map.sha256 = hash(original);
fs.writeFileSync(ARCHIVE, gzipSync(original));
fs.writeFileSync(MAP, JSON.stringify(map, null, 2) + '\n');

delete require.cache[require.resolve('./fixtures/serveur/split.json')];
delete require.cache[require.resolve('./serveur-source.cjs')];
const source = require('./serveur-source.cjs');
if (source() !== original) throw new Error('la reconstruction ne redonne pas l\'archive');
console.log(`✓ preuve serveur rescellée : ${map.moved.length} fragments, archive ${map.sha256.slice(0, 12)}`);
