// Reseal the current module seams; the original monolith proof remains historical.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const fixture = 'tools/fixtures/pos-maison/';
const map = JSON.parse(fs.readFileSync(fixture + 'split.json', 'utf8'));
let current = '';
const parts = map.chunks.map(({ file }) => {
  const source = fs.readFileSync(file, 'utf8');
  const header = source.match(/^(?:import .*;\n)+/)[0];
  const footer = source.match(/\nexport \{[^\n]+\};\n$/)[0];
  const start = current.length;
  current += source.slice(header.length, -footer.length);
  return { file, header, footer, start, end: current.length };
});
map.current = { sha256: createHash('sha256').update(current).digest('hex'), parts };
fs.writeFileSync(fixture + 'current.js.gz', gzipSync(current));
fs.writeFileSync(fixture + 'split.json', JSON.stringify(map, null, 2) + '\n');
console.log('Maison current module seams resealed; original reference unchanged');
