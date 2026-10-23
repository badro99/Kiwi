/* Source des tests historiques : reconstruction depuis les parties LIVRÉES,
 * jamais depuis la référence figée. Les corps restent dans leur ordre initial. */
'use strict';
const fs = require('fs');
const path = require('path');
const map = require('./fixtures/stock/split.json');
const root = path.resolve(__dirname, '..');
function functions(base = root) {
  const parts = Object.fromEntries(map.groups.map(g => [g, fs.readFileSync(path.join(base, `assets/stock/${g}.js`), 'utf8')]));
  return map.moved.map(m => {
    // Les limites nommées survivent aux modifications ultérieures du corps.
    const source = parts[m.group];
    const siblings = map.moved.filter(x => x.group === m.group);
    const next = siblings[siblings.indexOf(m) + 1];
    const declaration = new RegExp(`(?:async )?function ${m.name}\\(`).exec(source);
    if (!declaration) throw new Error('Fonction stock absente : ' + m.name);
    const end = next ? source.lastIndexOf('\n\n  ', source.indexOf(`function ${next.name}(`)) : source.lastIndexOf('\n\n  return {');
    let body = source.slice(declaration.index, end);
    // Seules les références aux let du noyau ont été qualifiées.
    const mutable = new Set(m.edits.map(e => e.before));
    for (const name of mutable) {
      body = body.replaceAll(`${name}: S.${name}`, name).replaceAll(`S.${name}`, name);
    }
    return { ...m, body };
  });
}
function stockSource(base = root) {
  let core = fs.readFileSync(path.join(base, 'assets/stock.js'), 'utf8');
  core = core.replace(map.glue + '\n', '').replace(map.handlerGlue, '');
  for (const m of functions(base)) {
    const stub = `function ${m.name}(...args) { return stockParts.${m.group}.${m.name}.apply(this, args); }`;
    if (!core.includes(stub)) throw new Error('Relais stock absent : ' + m.name);
    core = core.replace(stub, m.body);
  }
  return core;
}
module.exports = stockSource;
module.exports.functions = functions;
