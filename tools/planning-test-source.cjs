/* Rebuild only from live production bodies; the gzip is proof, never test input. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const map = () => JSON.parse(read('tools/fixtures/planning/split.json'));
function planningTestSource() {
  const m = map();
  let source = read('assets/team-hours.js').replaceAll('memberState.current()', 'window.__kiwiTeamV2').replace('  const memberState = window.Kiwi?.__teamMemberState;\n', '');
  source = source.replace(/(from '\.\/planning\/[^']+\.js)\?v=\d+(')/g, '$1$2');
  if (!source.startsWith(m.imports) || !source.includes(m.bindings)) throw new Error('Planning interface changed');
  source = source.slice(m.imports.length).replace(m.bindings, '').replace(m.replacement, m.old);
  for (const part of m.parts) {
    const live = read(part.file);
    if (!live.startsWith(part.prefix) || !live.endsWith(part.suffix)) throw new Error('Planning wrapper changed: ' + part.file);
    for (const f of part.fragments) {
      if (source.split(f.marker).length !== 2) throw new Error('Planning relay changed');
      source = source.replace(f.marker, () => live.slice(f.offset, f.offset + f.length));
    }
  }
  return source;
}
function planningRuntimeSource() {
  const m = map();
  return "'use strict';\n" + m.parts.map(p => read(p.file).replace('export function ', 'function ')).join('\n') + '\n' + read('assets/team-hours.js').split('\n').slice(m.parts.length).join('\n');
}
module.exports = { planningTestSource, planningRuntimeSource, planningFiles: map().parts.map(p => p.file) };
