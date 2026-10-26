/* Reconstruit l’ordre lexical à partir des corps actuels, jamais du gzip. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
module.exports = function printerSource() {
  let source = fs.readFileSync(path.join(root, 'assets/printer-bridge.js'), 'utf8');
  const part = fs.readFileSync(path.join(root, 'assets/printer/transports.js'), 'utf8');
  if (process.env.KIWI_PRINTER_RUNTIME === '1') return part + '\n' + source;
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/printer/transports/split.json'), 'utf8'));
  source = source.replace(map.init, '');
  for (const name of map.scalars) source = source.replaceAll('transports.' + name, name);
  for (const segment of map.segments) {
    const start = '  /* transport-part:' + segment.name + ' */\n';
    const end = '  /* /transport-part:' + segment.name + ' */';
    const body = part.slice(part.indexOf(start) + start.length, part.indexOf(end));
    source = source.replace(segment.relay, () => body);
  }
  return source;
};
