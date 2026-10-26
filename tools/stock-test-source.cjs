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
  /* Second stage: the FR/EN/AR string pack lives in assets/stock/strings.js. */
  const stage2 = require('./fixtures/stock-strings/split.json');
  for (const seg of stage2.segments) {
    const part = fs.readFileSync(path.join(base, seg.file), 'utf8');
    const a = '  /* stock-part:' + seg.name + ' */\n', b = '  /* /stock-part:' + seg.name + ' */';
    if (!core.includes(seg.relay)) throw new Error('Relais stock absent : ' + seg.name);
    core = core.replace(seg.relay, () => part.slice(part.indexOf(a) + a.length, part.indexOf(b)));
  }
  /* The loader block names each part with its ?v= stamp; a stamp bump must not
     break the reconstruction, so match the block with any stamp numbers. */
  const loose = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\?v=\d+/g, '\\?v=\\d+'));
  core = core.replace(loose(map.glue + '\n'), '').replace(loose(map.handlerGlue), '');
  for (const m of functions(base)) {
    const stub = `function ${m.name}(...args) { return stockParts.${m.group}.${m.name}.apply(this, args); }`;
    if (!core.includes(stub)) throw new Error('Relais stock absent : ' + m.name);
    core = core.replace(stub, m.body);
  }
  return core;
}
module.exports = stockSource;
module.exports.functions = functions;
