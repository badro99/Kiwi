// Rebuild the original classic-script position for source assertions and VM extraction.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function caisseTestSource(html) {
  return html.replace(/<script src="assets\/caisse-app\.js\?v=\d+"><\/script>/,
    () => '<script>' + fs.readFileSync(path.join(__dirname, '../assets/caisse-app.js'), 'utf8') + '</script>');
};
