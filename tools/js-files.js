/* Every first-party script under assets/, whatever its depth. check.js used to list
 * the subfolders it knew about, so a new folder (orderpro, clients-store,
 * caisse-pairing…) escaped the syntax loop until some other test happened to
 * load it. Vendored bundles are not ours to lint. iCloud conflict copies
 * ("name 2.js") are never shipped. */
const fs = require('fs');
const path = require('path');
const STALE_COPY = / \d+\.[a-z]+$/i;
const SKIP_DIRS = new Set(['vendor', 'node_modules']);
function jsFiles(assetsDir) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full); }
      else if (entry.name.endsWith('.js') && !STALE_COPY.test(entry.name)) out.push(full);
    }
  })(assetsDir);
  return out;
}
module.exports = { jsFiles };
