/* Read live production bodies, never the reference archive. Legacy lexical
 * extraction suites use reconstruction; runtime suites use runtimeSource(). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const map = JSON.parse(read('tools/fixtures/menu-catalog/split.json'));
function catalogSource() {
  let source = read('assets/menu-catalog.js');
  source = source.replace(map.bind, '');
  for (const part of map.parts) {
    const live = read(part.file);
    if (!live.startsWith(part.prefix) || !live.endsWith(part.suffix)) throw Error('Menu wrapper changed: ' + part.file);
    for (const f of part.fragments) {
      let body = live.slice(f.offset, f.offset + f.length);
      if (f.adapter) body = body.replace('  const toggleAvailable =', '    toggleAvailable:').replace(/;$/, ',');
      if (!source.includes(f.replacement)) throw Error('Menu forwarding changed: ' + part.file);
      source = source.replace(f.replacement, () => body);
    }
  }
  return source;
}
function runtimeSource() {
  return map.parts.map(part => read(part.file)).join('\n') + '\n' + read('assets/menu-catalog.js');
}
module.exports = catalogSource;
module.exports.runtimeSource = runtimeSource;
