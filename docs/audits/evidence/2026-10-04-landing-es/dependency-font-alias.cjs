// Read-only dependency setup for isolated worktrees. Assertions and product
// files are unchanged. Four actual installed font files are resolved from
// KIWI_SHARED_FONT_ROOT; missing fonts still fail rather than being mocked.
const fs = require('node:fs');
const path = require('node:path');
const fonts = new Set([
  '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2',
  '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
  '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2'
]);
const exists = fs.existsSync;
const resolve = file => {
  if (typeof file !== 'string' || !process.env.KIWI_SHARED_FONT_ROOT) return file;
  const marker = '/app/node_modules/';
  const at = file.indexOf(marker);
  const relative = at < 0 ? '' : file.slice(at + marker.length);
  return fonts.has(relative) && !exists(file) ? path.join(process.env.KIWI_SHARED_FONT_ROOT,relative) : file;
};
for (const name of ['readFileSync','existsSync']) {
  const original = fs[name];
  fs[name] = function(file, ...options) { return original.call(this,resolve(file),...options); };
}
const copy = fs.copyFileSync;
fs.copyFileSync = function(source,destination,...options) { return copy.call(this,resolve(source),destination,...options); };
