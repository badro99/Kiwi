// Rebuild the original classic-script position for source assertions and VM extraction.
const fs = require('node:fs');
const path = require('node:path');
function originalOrder() {
  const root = path.join(__dirname, '..');
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app/split.json'), 'utf8'));
  const bodies = new Map([map.prelude, map.core].map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const offsets = new Map(), parts = [];
  for (const fragment of map.fragments) {
    const offset = offsets.get(fragment.file) || 0, length = fragment.end - fragment.start;
    parts.push(bodies.get(fragment.file).slice(offset, offset + length));
    offsets.set(fragment.file, offset + length);
  }
  for (const [file, body] of bodies) {
    if (body.length !== offsets.get(file) + (file === map.prelude ? 1 : 0)) return [...bodies.values()].join('\n');
  }
  return parts.join('');
}
module.exports = function caisseTestSource(html) {
  return html.replace(/<script src="assets\/caisse-accounting\.js\?v=\d+"><\/script>\s*/, '')
    .replace(/<script src="assets\/caisse-app\.js\?v=\d+"><\/script>/,
      () => '<script>' + originalOrder() + '</script>');
};
// Tests needing individual functions read current declarations by name.
module.exports.declarations = function declarations(...names) {
  const { declaration } = require('./js-declarations.cjs');
  const root = path.join(__dirname, '..');
  const source = ['assets/caisse-accounting.js', 'assets/caisse-app.js']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  return names.map(name => declaration(source, name)).join('\n');
};
