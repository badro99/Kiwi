/* Reconstitution depuis les fichiers livrés, jamais depuis l'archive figée. */
const fs = require('node:fs');
const path = require('node:path');
const map = require('./fixtures/serveur/split.json');
const { declaration } = require('./split-functions.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function fragments() {
  const parts = Object.fromEntries(map.parts.map(file => [file, read(file)]));
  const seen = new Map();
  const live = m => { const key = m.file + ":" + m.name, occurrence = seen.get(key) || 0; seen.set(key, occurrence + 1); return declaration(parts[m.file], m.name, occurrence); };
  return map.moved.map(m => ({ ...m, body: m.file === 'assets/serveur/payments.js' ? (m.prefix ? live(m).slice(m.prefix.length, -m.suffix.length) : '    ' + live(m)) : parts[m.file].slice(m.offset, m.offset + m.length) }));
}
function source() {
  let core = read('assets/serveur-app.js');
  let delta = 0;
  for (const m of fragments()) {
    const start = m.start + delta;
    core = core.slice(0, start) + m.body + core.slice(start + (m.replacement || '').length);
    delta += m.body.length - m.length;
  }
  return core;
}
module.exports = source;
module.exports.fragments = fragments;
