// Reseal the menu-catalog move proof after an edit inside one moved body.
// Compares each part with HEAD, finds the fragment that holds the edit, moves
// its length and every later offset, and rewrites original.js.gz + sha256.
// Run from the repo root: node tools/reseal-menu-catalog-split.mjs
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const dir = 'tools/fixtures/menu-catalog/';
const map = JSON.parse(fs.readFileSync(dir + 'split.json', 'utf8'));
let original = gunzipSync(fs.readFileSync(dir + 'original.js.gz')).toString();
const all = map.parts.flatMap(p => p.fragments);
let moved = 0;
for (const part of map.parts) {
  const live = fs.readFileSync(part.file, 'utf8');
  const old = execFileSync('git', ['show', 'HEAD:' + part.file], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (live === old) continue;
  let a = 0; while (a < old.length && a < live.length && old[a] === live[a]) a++;
  let b = 0; while (b < old.length - a && b < live.length - a && old[old.length - 1 - b] === live[live.length - 1 - b]) b++;
  const delta = live.length - old.length;
  const f = part.fragments.find(x => a >= x.offset && old.length - b <= x.offset + x.length);
  if (!f || f.adapter) throw Error(part.file + ': the edit is not inside one plain moved body; reseal by hand');
  const oldEnd = f.end;
  f.length += delta;
  for (const x of part.fragments) if (x.offset > f.offset) x.offset += delta;
  for (const x of all) if (x !== f && x.start >= oldEnd) { x.start += delta; x.end += delta; }
  f.end += delta;
  original = original.slice(0, f.start) + live.slice(f.offset, f.offset + f.length) + original.slice(oldEnd);
  moved++;
}
map.sha256 = createHash('sha256').update(original).digest('hex');
fs.writeFileSync(dir + 'original.js.gz', gzipSync(original));
fs.writeFileSync(dir + 'sha256', map.sha256 + '\n');
fs.writeFileSync(dir + 'split.json', JSON.stringify(map, null, 2) + '\n');
console.log('menu-catalog move proof resealed (' + moved + ' part(s) changed)');
