/* Read actual split bodies in their original lexical order for source-extraction
 * tests. Nothing comes from the frozen fixture; live() executes the real bridge. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const root = path.resolve(__dirname, '..');
function metadata(file) {
  const relative = path.relative(root, path.resolve(file instanceof URL ? fileURLToPath(file) : String(file))).replace(/\\/g, '/');
  const area = relative === 'assets/dateRange.js' ? 'daterange' : relative === 'assets/agent.js' ? 'agent' : null;
  return area && JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', area + '-split', 'split.json'), 'utf8'));
}
function isInteractive(file) {
  return path.resolve(file instanceof URL ? fileURLToPath(file) : String(file)) === path.join(root, 'assets/interactive.js');
}
function interactiveSource(file) {
  const between = (text, tag) => {
    const open = '/* <<split:' + tag + '>> */\n';
    const start = text.indexOf(open), end = text.indexOf('/* <</split:' + tag + '>> */');
    if (start < 0 || end <= start) throw new Error('Missing interactive split marker: ' + tag);
    return text.slice(start + open.length, end);
  };
  const part = name => fs.readFileSync(path.join(root, 'assets/interactive', name + '.js'), 'utf8');
  const handlers = between(part('handlers'), 'handlers');
  const helpers = between(part('helpers'), 'helpers').split('/* <<split:escape>> */\n');
  const core = fs.readFileSync(file, 'utf8');
  const block = core.match(/  \/\* <<split:moved>>[\s\S]*?<\/split:moved>> \*\/\n/);
  if (!block || helpers.length !== 2) throw new Error('Missing interactive split bridge');
  const escape = block[0].slice(block[0].indexOf('*/\n') + 3, block[0].indexOf('  const { '));
  return core.replace(block[0], () => handlers + helpers[0] + escape + helpers[1]);
}
function isVenues(file) {
  return path.resolve(file instanceof URL ? fileURLToPath(file) : String(file)) === path.join(root, 'assets/venues.js');
}
function venuesSource(file) {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/venues-split/split.json'), 'utf8'));
  let core = fs.readFileSync(file, 'utf8');
  for (const e of map.entries) {
    const text = fs.readFileSync(path.join(root, 'assets/venues', e.part + '.js'), 'utf8');
    const open = '/* <<split:' + e.tag + '>> */';
    const start = text.indexOf(open), end = text.indexOf('\n/* <</split:' + e.tag + '>> */');
    if (start < 0 || end <= start || !core.includes(e.bridge)) throw new Error('Missing venues split marker: ' + e.tag);
    core = core.replace(e.bridge, () => text.slice(start + open.length, end));
  }
  return core;
}
function source(file) {
  if (isVenues(file)) return venuesSource(file);
  if (isInteractive(file)) return interactiveSource(file);
  const map = metadata(file);
  let core = fs.readFileSync(file, 'utf8');
  if (!map) return core;
  const part = fs.readFileSync(path.join(root, map.part), 'utf8');
  for (const entry of map.constants || []) {
    const start = part.indexOf('const ' + entry.name + ' =');
    let expected = entry.body;
    for (const change of [...(entry.changes || [])].reverse()) expected = expected.slice(0, change.start) + change.after + expected.slice(change.end);
    const end = start + expected.length;
    if (start < 0 || part.slice(start, end) !== expected) throw new Error('Split constant changed: ' + entry.name);
    core = core.replace('const ' + entry.name + ' = installPart().' + entry.name + ';', () => entry.body);
  }
  const bridge = map.bridge.replace(/(const partUrl = ')([^']+)(')/, (_, prefix, url, suffix) => {
    const liveUrl = core.match(/const partUrl = '([^']+)'/)[1];
    return prefix + liveUrl + suffix;
  });
  core = core.replace(map.anchor + bridge, map.anchor).replace(map.attach + map.apiEnd, map.apiEnd);
  if (map.file === 'assets/dateRange.js') core = core.replace('  function init() {\n    if (!installPart()) { loadPart().then(init, () => {}); return; }', '  function init() {');
  for (const entry of map.entries) {
    // Anchors delimit live functions even if their body grows after the split.
    const start = part.indexOf('function ' + entry.name + '(');
    const next = map.entries[map.entries.indexOf(entry) + 1];
    const end = next ? part.indexOf('function ' + next.name + '(', start + 1) : map.constants?.length ? part.indexOf('const ' + map.constants[0].name + ' =', start + 1) : part.lastIndexOf('    return { ');
    if (start < 0 || end < 0) throw new Error('Missing split anchor: ' + entry.name);
    let body = part.slice(start, end).trimEnd();
    // Only generated bridge accesses are reversed; strings and merchant code
    // remain literal. Exact recorded offsets avoid replacing text in templates.
    for (const change of [...entry.changes].reverse()) {
      const shift = entry.changes.filter(c => c.start < change.start).reduce((n,c) => n + c.after.length - c.before.length, 0);
      const at = change.start + shift;
      if (body.slice(at, at + change.after.length) !== change.after) throw new Error('Split reference changed: ' + entry.name);
      body = body.slice(0, at) + change.before + body.slice(at + change.after.length);
    }
    const wrapper = `function ${entry.name}(...args) { return callPart('${entry.name}', this, args); }`;
    if (!core.includes(wrapper)) throw new Error('Missing split wrapper: ' + entry.name);
    core = core.replace(wrapper, () => body);
  }
  return core;
}
function readFileSync(file, options) {
  if (!isVenues(file) && !isInteractive(file) && !metadata(file)) return fs.readFileSync(file, options);
  const text = source(file);
  return typeof options === 'string' || options?.encoding ? text : Buffer.from(text);
}
function live(file) {
  if (isVenues(file)) return ['data', 'helpers'].map(name => fs.readFileSync(path.join(root, 'assets/venues', name + '.js'), 'utf8')).join('\n') + '\n' + fs.readFileSync(file, 'utf8');
  const map = metadata(file);
  return (map ? fs.readFileSync(path.join(root, map.part), 'utf8') + '\n' : '') + fs.readFileSync(file, 'utf8');
}
module.exports = { readFileSync, source, live };
