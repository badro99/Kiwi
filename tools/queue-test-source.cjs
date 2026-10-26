// La source entière de /api/order/queue, pour les tests qui la lisent.
// queue.js garde les deux portes et l'ordre de répartition ; les gestes vivent
// à côté dans ses modules _queue-*.js. queue.js d'abord, puis les modules par
// ordre alphabétique : un test qui cherche un texte le trouve où qu'il habite.
const fs = require('node:fs');
const path = require('node:path');
const reconstruct = require('./order-queue-test-source.cjs');
const extracted = new Set(require('./fixtures/order-queue/split.json').flatMap(map => map.segments.map(part => path.basename(part.file))));

module.exports = function queueTestSource() {
  const dir = path.join(__dirname, '..', 'functions', 'api', 'order');
  const modules = fs.readdirSync(dir).filter((file) => /^_queue-[a-z-]+\.js$/.test(file) && !extracted.has(file)).sort();
  return ['queue.js', ...modules].map((file) => ['queue.js', '_queue-kitchen.js'].includes(file) ? reconstruct('functions/api/order/' + file) : fs.readFileSync(path.join(dir, file), 'utf8')).join('\n');
};
