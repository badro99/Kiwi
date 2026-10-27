/* Rebuild only from current production fragments and explicit interface relays. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const map = JSON.parse(read('tools/fixtures/team-owners/split.json'));
function originalFile(file) {
  if (file === 'assets/team-hours.js') return require('./planning-test-source.cjs').planningTestSource();
  let source = read(file);
  if (file === 'assets/team.js') source = stripImports(source);
  for (const edit of [...map.edits].reverse().filter(edit => edit.file === file)) {
    if (edit.routeState) { source = source.replaceAll('memberState.current()', 'window.__kiwiTeamV2'); continue; }
    let original = edit.original;
    const part = map.parts.find(part => part.fragments.some(f => f.replacement === edit.replacement));
    if (part) {
      const fragment = part.fragments.find(f => f.replacement === edit.replacement);
      original = read(part.file).slice(fragment.offset, fragment.offset + fragment.length);
    }
    if (!source.includes(edit.replacement)) throw new Error('Team interface relay changed: ' + file);
    if (!edit.replacement) throw new Error('Empty team relay');
    source = source.replace(edit.replacement, () => original);
  }
  return source;
}
function stripImports(source) {
  for (const file of map.imports) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp("^import \{\} from '" + escaped + "\\?v=\\d+';\\n", 'm');
    if (!pattern.test(source)) throw new Error('Missing team module import: ' + file);
    source = source.replace(pattern, '');
  }
  return source;
}
function runtimeSource(includeHours = true) { return map.parts.map(p => read(p.file)).concat(stripImports(read('assets/team.js')), read('assets/team/profile-ui.js'), includeHours ? require('./planning-test-source.cjs').planningRuntimeSource() : '').join('\n'); }
module.exports = { runtimeSource, originalFile, files: [...map.parts.map(p => p.file), ...map.files], map };
