// Reconstruit les sources livrées, sans lire la référence gzip.
const fs = require('node:fs');
const path = require('node:path');
const maps = require('./fixtures/order-queue/split.json');
const root = path.resolve(__dirname, '..');
module.exports = function orderQueueTestSource(file) {
  const map = maps.find(entry => entry.file === file);
  if (!map) throw new Error('Source inconnue : ' + file);
  let result = fs.readFileSync(path.join(root, file), 'utf8');
  if (!result.startsWith(map.prefix)) throw new Error('Contrat absent : ' + file);
  result = result.slice(map.prefix.length);
  for (const part of map.segments) {
    const source = fs.readFileSync(path.join(root, part.file), 'utf8');
    if (!source.startsWith(part.header) || !source.endsWith(part.footer)) throw new Error('Contrat modifié : ' + part.file);
    const body = source.slice(part.header.length, part.footer ? -part.footer.length : undefined);
    result = result.replace(part.marker, () => body);
  }
  return result;
};
