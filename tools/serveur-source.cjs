/* Reconstitution depuis les fichiers livrés, jamais depuis l'archive figée. */
const fs = require('node:fs');
const path = require('node:path');
const map = require('./fixtures/serveur/split.json');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function fragments() {
  const parts = Object.fromEntries(map.parts.map(file => [file, read(file)]));
  return map.moved.map(m => ({ ...m, body: parts[m.file].slice(m.offset, m.offset + m.length) }));
}
function source() {
  let core = read('assets/serveur-app.js');
  for (const m of fragments()) core = core.slice(0, m.start) + m.body + core.slice(m.start);
  return core;
}
module.exports = source;
module.exports.fragments = fragments;
