// Rebuild the original classic-script position for source assertions and VM extraction.
const source = require('./serveur-source.cjs');
const map = require('./fixtures/serveur/split.json');
module.exports = function serveurTestSource(html) {
  for (const file of map.parts) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp('<script src="' + escaped + '\\?v=\\d+"></script>'), '');
  }
  return html.replace(/<script src="assets\/serveur-app\.js\?v=\d+"><\/script>/,
    () => '<script>' + source() + '</script>');
};
