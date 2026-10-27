/* Reassemble only live fragments before the older core offset proof runs. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function metadata() { return JSON.parse(read('tools/fixtures/home-split/split.json')); }
function source() {
  const map = metadata(), fragments = new Map();
  for (const part of map.parts) {
    const text = read(part.file);
    if (!text.startsWith(part.prefix) || !text.endsWith(part.suffix)) throw new Error('Home wrapper changed: ' + part.name);
    for (const f of part.fragments) fragments.set(f.name, text.slice(f.offset, f.offset + f.length));
  }
  return map.head + map.order.map(name => fragments.get(name)).join('') + map.tail;
}
function live() { return metadata().parts.map(p => read(p.file)).join('\n') + '\n' + read('assets/daterange/renderers.js'); }
module.exports = { source, live, metadata };
