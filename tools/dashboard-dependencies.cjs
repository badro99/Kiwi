/* Inspect the explicit dashboard dependency records. eager() expands only the
 * parser-time startup list; the default also includes optional first-use owners
 * for presence/ordering contracts that do not assert eager execution. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function eager(html) {
  // Planning imports preserve the entry position; historical order proofs compare URLs.
  // Les preuves historiques comparent le calendrier différé, pas le mode ESM.
  // L'import statique du propriétaire de file précède désormais ce même corps.
  html = html.replace(/<script type="module" defer src="assets\/live-link\.js(\?v=\d+)"><\/script>/,
    '<script defer src="assets/live-link.js$1"></script>');
  const source = read('assets/pages/dashboard-startup.js');
  return html.replace(/<script src="assets\/pages\/dashboard-startup\.js(?:\?v=\d+)?"([^>]*)><\/script>/g, (_tag, attributes) => {
    let tags = '';
    const dataset = attributes.includes('data-startup="menu"') ? { startup: 'menu' } : {};
    vm.runInNewContext(source, { document: { readyState: 'loading', currentScript: { dataset }, write(value) { tags += value; } } });
    tags = tags.replace(/<script type="module" src="assets\/(team|team-hours)\.js/g, '<script src="assets/$1.js');
    return tags;
  });
}
module.exports = function dashboardDependencies(html) {
  const loader = read('assets/pages/dashboard-loader.js');
  const block = loader.match(/workspace: \{ dependencies: \[\], scripts: \[([\s\S]*?)\n    \] \}/);
  if (!block) throw new Error('Missing first-use workspace dependency list');
  const urls = [...block[1].matchAll(/'(assets\/[^']+)'/g)].map(m => m[1]);
  const tags = urls.map(url => `<script src="${url}" defer fetchpriority="low"></script>`).join('\n');
  return eager(html).replace(/(?=<script src="assets\/pages\/dashboard-loader\.js)/, tags + '\n');
};
module.exports.eager = eager;

// The home entry uses the same parser-time scheduling contract as startup.
// Expand separately so historical shell-count proofs still count their own tags.
module.exports.home = function home(html) {
  let tags = '';
  vm.runInNewContext(read('assets/daterange/renderers.js'), { window: {}, document: {
    readyState: 'loading', write(value) { tags += value; },
  } });
  return html.replace(/(<script src="assets\/daterange\/renderers\.js(?:\?v=\d+)?"><\/script>)/, '$1\n' + tags);
};
