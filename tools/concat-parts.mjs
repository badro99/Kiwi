/* The part files of every concatenation split (a tools/fixtures/<area>/split.json
 * with "bundles"): each part is a slice of one closure, not a script the pages
 * load, so scanners that read assets/ look at its bundle instead. */
import fs from 'node:fs';
import path from 'node:path';

export function concatParts(root) {
  const dir = path.join(root, 'tools/fixtures'), parts = new Set();
  for (const area of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const file = path.join(dir, area, 'split.json');
    if (!fs.existsSync(file)) continue;
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const b of Array.isArray(map.bundles) ? map.bundles : []) for (const p of b.parts || []) parts.add(p.file);
  }
  return parts;
}
