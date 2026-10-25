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
function source(file) {
  const map = metadata(file);
  let core = fs.readFileSync(file, 'utf8');
  if (!map) return core;
  const part = fs.readFileSync(path.join(root, map.part), 'utf8');
  core = core.replace(map.anchor + map.bridge, map.anchor).replace(map.attach + map.apiEnd, map.apiEnd);
  if (map.file === 'assets/dateRange.js') core = core.replace('  function init() {\n    if (!installPart()) { loadPart().then(init, () => {}); return; }', '  function init() {');
  for (const entry of map.entries) {
    // Anchors delimit live functions even if their body grows after the split.
    const start = part.indexOf('function ' + entry.name + '(');
    const next = map.entries[map.entries.indexOf(entry) + 1];
    const end = next ? part.indexOf('function ' + next.name + '(', start + 1) : part.lastIndexOf('    return { ');
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
  if (!metadata(file)) return fs.readFileSync(file, options);
  const text = source(file);
  return typeof options === 'string' || options?.encoding ? text : Buffer.from(text);
}
function live(file) {
  const map = metadata(file);
  return (map ? fs.readFileSync(path.join(root, map.part), 'utf8') + '\n' : '') + fs.readFileSync(file, 'utf8');
}
module.exports = { readFileSync, source, live };
