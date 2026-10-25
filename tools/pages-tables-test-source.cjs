/* Read the actual moved bodies and rebuild the table closure for historical VM/source suites. */
'use strict';
const fs = require('fs');
const path = require('path');
function tableOwnerSource(root = path.resolve(__dirname, '..')) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const map = JSON.parse(read('tools/fixtures/pages/tables-operations.json'));
  const part = read('assets/pages/tables-operations.js');
  if (!part.startsWith(map.prefix) || !part.endsWith(map.suffix)) throw new Error('Table operations wrapper changed');
  let core = read('assets/pages/tables.js');
  if (!core.includes(map.bind + '\n' + map.anchor)) throw new Error('Table operations binding changed');
  core = core.replace(map.bind + '\n' + map.anchor, map.anchor);
  for (const f of map.fragments) {
    const body = part.slice(f.offset, f.offset + f.length);
    if (!body.startsWith(f.bodyPrefix) || !body.endsWith(f.bodySuffix)) throw new Error('Table action wrapper changed');
    if (!core.includes(f.replacement)) throw new Error('Table operations forwarding changed');
    core = core.replace(f.replacement, body.slice(f.bodyPrefix.length, f.bodySuffix ? -f.bodySuffix.length : undefined));
  }
  return core;
}
module.exports = function tablesSource(root = path.resolve(__dirname, '..')) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const map = JSON.parse(read('tools/fixtures/pages/tables.json'));
  let table = tableOwnerSource(root);
  if (!table.startsWith(map.prefix + map.binding) || !table.endsWith(map.suffix)) throw new Error('Table owner wrapper changed');
  table = table.slice((map.prefix + map.binding).length, -map.suffix.length);
  for (const [file, prefix, suffix] of [
    ['assets/pages/tables-data.js', map.dataPrefix, map.dataSuffix],
    ['assets/pages/tables-drawing.js', map.drawingPrefix, map.drawingSuffix],
  ]) {
    const source = read(file);
    if (!source.startsWith(prefix) || !source.endsWith(suffix)) throw new Error('Table part wrapper changed: ' + file);
    let offset = prefix.length;
    for (const f of map.fragments.filter(f => f.file === file)) {
      const body = source.slice(offset, offset + f.length);
      if (!table.includes(f.replacement)) throw new Error('Table forwarding binding changed');
      table = table.replace(f.replacement, body);
      offset += f.length + 2;
    }
  }
  const core = read('assets/pages-pro.js');
  const start = core.indexOf(map.pre);
  if (start < 0) throw new Error('Table/menu common preamble changed');
  // Historical suites execute the table owner eagerly, so retain its handler rather than installing its lazy stub.
  return (core.slice(0, start) + map.pre + table + core.slice(start + map.pre.length))
    .replace(/^    \{ url: 'assets\/pages\/tables\.js\?v=\d+'[^\n]+\n/m, '');
};

module.exports.tableOwnerSource = tableOwnerSource;
