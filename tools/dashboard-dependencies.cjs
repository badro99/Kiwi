/* Inspect the explicit dashboard dependency records. eager() expands only the
 * parser-time startup list; the default also includes optional first-use owners
 * for presence/ordering contracts that do not assert eager execution. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function eager(html) {
  const source = read('assets/pages/dashboard-startup.js');
  let tags = '';
  vm.runInNewContext(source, { document: { readyState: 'loading', write(value) { tags += value; } } });
  return html.replace(/<script src="assets\/pages\/dashboard-startup\.js(?:\?v=\d+)?"><\/script>/, tags);
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
