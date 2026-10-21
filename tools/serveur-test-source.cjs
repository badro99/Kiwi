// Rebuild the original classic-script position for source assertions and VM extraction.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function serveurTestSource(html) {
  return html.replace(/<script src="assets\/serveur-app\.js\?v=\d+"><\/script>/,
    () => '<script>' + fs.readFileSync(path.join(__dirname, '../assets/serveur-app.js'), 'utf8') + '</script>');
};
