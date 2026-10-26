/* Reconstruction des corps réels pour les tests historiques d'extraction. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function source(file) {
  const part = fs.readFileSync(path.join(root, 'assets/live-link/queue-store.js'), 'utf8');
  const bodies = new Map([...part.matchAll(/\/\* <<queue:([^>]+)>> \*\/\n([\s\S]*?)\n\/\* <<\/queue:\1>> \*\//g)].map(m => [m[1], m[2].replace(/\bctx\.(\w+)/g, '$1').replace('ack(row.id, row.leaseToken)', 'O.acknowledge(row.id, row.leaseToken)')]));
  let core = fs.readFileSync(file, 'utf8').replace(/^import \{\} from '\.\/live-link\/queue-store\.js\?v=1';\n/, '');
  core = core.replace(/  \/\* <<queue-owner>> \*\/[\s\S]*?  \/\* <<\/queue-owner>> \*\//, () => bodies.get('state:0'));
  core = core.replace(/\/\* <<queue:([^>]+)>> \*\//g, (_, tag) => bodies.get(tag));
  core = core.replace(/function (\w+)\(\.\.\.args\) \{ return saleQueue\.\w+\(\.\.\.args\); \}/g, (_, name) => bodies.get(name));
  return core.replace('pending: function () { return saleQueue.count(); },', 'pending: function () { return queueStatus().total; },');
}
module.exports = { source };
