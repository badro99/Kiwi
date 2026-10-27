/* Historical extraction harnesses consume reconstructed LIVE production bodies.
 * The frozen archive is read only by pressing-split-test, never by this adapter. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const map = () => JSON.parse(read('tools/fixtures/pressing/split.json'));
const unstamped = value => value.replace(/\?v=\d+/g, '?v=N');
function unwrap(source, prefix, suffix) {
  const escaped = prefix.split(/\?v=\d+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\?v=\\d+');
  const match = source.match(new RegExp('^' + escaped));
  if (!match) throw Error('Pressing wrapper changed');
  prefix = match[0];
  if (!source.endsWith(suffix)) throw Error('Pressing suffix changed');
  return source.slice(prefix.length, -suffix.length);
}
function pressingTestSource() {
  const m = map(), o = m.owner;
  let core = unwrap(read(o.file), o.prefix, o.suffix);
  if (!core.includes(o.init)) throw Error('Pressing owner interface changed');
  core = core.replace(o.init, '');
  for (const part of m.parts) {
    const source = read(part.file);
    const body = unwrap(source, part.prefix, part.suffix);
    for (const f of part.fragments) {
      const text = body.slice(f.offset - part.prefix.length, f.offset - part.prefix.length + f.length);
      if (!core.includes(f.replacement)) throw Error('Pressing forwarding changed: ' + f.name);
      core = core.replace(f.replacement, () => text);
    }
  }
  // The module owner is the original closure, with UI bodies supplied above.
  const at = core.indexOf("\n  'use strict';");
  return core.slice(0, at) + o.open + core.slice(at) + o.close;
}
function runtimeSource() {
  const m = map();
  const factories = m.parts.map(p => read(p.file).replace(/^import .*;\n/gm, '').replace('export function create(owner)', 'function create' + p.name[0].toUpperCase() + p.name.slice(1) + '(owner)')).join('\n');
  const owner = read(m.owner.file).replace(/^import .*;\n/gm, '').replace(m.owner.suffix, '');
  return '(function () {\n' + factories + '\n' + owner + '\n})();\n';
}
function readFileSync(file, ...args) {
  if (String(file).replace(/\\/g, '/').endsWith('/assets/pressing-caisse.js') || String(file) === 'assets/pressing-caisse.js') {
    const source = pressingTestSource();
    return args[0] ? source : Buffer.from(source);
  }
  return fs.readFileSync(file, ...args);
}
module.exports = { pressingTestSource, runtimeSource, readFileSync, unstamped };
