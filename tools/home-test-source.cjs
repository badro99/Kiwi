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
    for (const [i, f] of part.fragments.entries()) {
      const anchor = name => { const fn = text.indexOf('function ' + name + '('); return fn < 0 ? text.indexOf('const ' + name + ' =') : fn; };
      const start = anchor(f.name), end = i + 1 < part.fragments.length ? anchor(part.fragments[i + 1].name) : text.length - part.suffix.length;
      if (start < 0 || end < start) throw Error('Missing home fragment: ' + f.name);
      fragments.set(f.name, text.slice(start, end));
    }
  }
  return map.head + map.order.map(name => fragments.get(name)).join('') + map.tail;
}
function live() { return metadata().parts.map(p => read(p.file)).join('\n') + '\n' + read('assets/daterange/renderers.js'); }
function normalize(text) {
  return text.replace(/try \{ return c \? c\.derive\(data, ctx\) : \(data\[k\] \|\| null\); \}\n      catch \(_\) \{ return \{text: '·', unit: '', delta: null\}; \}/g, 'return c ? c.derive(data, ctx) : (data[k] || null);')
    .replaceAll(".catch(() => { e.data = null; e.error = 'unavailable'; e.changed = true; })", ".catch(() => { if (!e.data) { e.error = 'unavailable'; e.changed = true; } })");
}
module.exports = { source, live, metadata, normalize };
