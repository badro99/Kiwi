/* Rebuild only from live production code. The compressed original is never a test input here. */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const normalize = source => source.replace(/(assets\/orderpro\/[a-z]+\.js\?v=)\d+/g, (_, prefix) => prefix + '1');
function expandExtractions(source, file, root = ROOT) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const moves = JSON.parse(read('tools/fixtures/orderpro/extractions.json'));
  for (const move of moves.filter(move => move.file === file)) {
    const moduleFile = ['NET', 'NETcomment', 'retry'].includes(move.name) ? 'assets/orderpro/transport.js' : 'assets/orderpro/draft.js';
    const module = read(moduleFile);
    let body = module.split('// extract:' + move.name + ':start\n')[1].split('// extract:' + move.name + ':end')[0];
    if (move.name === 'NETcomment') body += move.replacement;
    if (move.name === 'retry') body = body.replace('capabilities.crypto.subtle', 'globalThis.crypto.subtle').replaceAll('capabilities.localStorage.', 'localStorage.');
    if (move.name === 'NET') body = body.replace('  function create({ location, fetch, demo: demoProvider }) {', '    const NET = (() => {').replace(/\n  }\n\n$/, '\n    })();\n\n').replace("(slug === 'demo' && demoProvider())", "(slug === 'demo' && globalThis.KiwiOrderDemo)");
    if (source.split(move.replacement).length !== 2) throw new Error('OrderPro extraction binding changed: ' + move.name);
    source = source.replace(move.replacement, () => body);
  }
  return source;
}
function orderProScriptSource(root = ROOT) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const map = JSON.parse(read('tools/fixtures/orderpro/split.json'));
  const entry = expandExtractions(read('assets/orderpro-page.js'), 'assets/orderpro-page.js', root);
  if (!entry.startsWith(map.prefix) || !normalize(entry).endsWith(normalize(map.suffix))) throw new Error('OrderPro entry adapter changed');
  // Stamp widths can change, so locate the suffix by its stable first line.
  let core = entry.slice(map.prefix.length, entry.lastIndexOf('\n  }\n  }\n  const scripts = '));
  for (const part of map.parts) {
    const source = expandExtractions(read(part.file), part.file, root);
    if (!source.startsWith(part.header) || !source.endsWith(part.footer)) throw new Error('OrderPro module interface changed: ' + part.file);
    for (const f of part.fragments) {
      const body = source.slice(f.offset, f.offset + f.length);
      if (core.split(f.marker).length !== 2) throw new Error('OrderPro binding changed: ' + f.name);
      core = core.replace(f.marker, () => body);
    }
  }
  for (const f of map.states) {
    if (core.split(f.replacement).length !== 2) throw new Error('OrderPro state initializer changed: ' + f.name);
    const live = core.slice(core.indexOf(f.replacement) + `    owner.initialize('${f.name}', `.length, core.indexOf(f.replacement) + f.replacement.length - 3);
    core = core.replace(f.replacement, () => f.before + live + f.after);
  }
  if (core.split(map.readyReplacement).length !== 2) throw new Error('OrderPro readiness adapter changed');
  return core.replace(map.readyReplacement, map.readyOriginal);
}
module.exports = { orderProScriptSource, normalize, expandExtractions };
