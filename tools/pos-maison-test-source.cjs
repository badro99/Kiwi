/* Legacy function-extraction tests consume the actual split bodies in their
 * original closure order. The module VM and browser parity suites run ESM. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
module.exports = function maisonSource(source) {
  if (typeof source !== 'string' || !/^import .* from '\.\/pos-maison\//.test(source)) return source;
  const map = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/pos-maison/split.json'), 'utf8'));
  const parts = [];
  for (const chunk of map.chunks) {
    const text = chunk.file === 'assets/pos-maison.js' ? source : fs.readFileSync(path.join(root, chunk.file), 'utf8');
    const body = text.replace(/^(?:import .*;\n)+/, '').replace(/\nexport \{[^\n]+\};\n$/, '');
    let offset = 0;
    for (const f of chunk.fragments) { const length = f.end - f.start; parts.push({ start: f.start, text: body.slice(offset, offset + length) }); offset += length; }
    if (offset !== body.length) throw Error('Maison split fragment length changed; update the source map');
  }
  return map.prefix + parts.sort((a,b) => a.start - b.start).map(p => p.text).join('') + map.suffix;
};
