/* Reconstruit l’ordre lexical original depuis les corps de production. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const map = require('./fixtures/menu-workspace/split.json');
module.exports = function menuWorkspaceSource() {
  let source = fs.readFileSync(path.join(root, 'assets/restaurant-menu-workspace.js'), 'utf8');
  for (const segment of map.segments) {
    const part = fs.readFileSync(path.join(root, segment.file), 'utf8');
    const start = '  /* menu-part:' + segment.name + ' */\n';
    const end = '  /* /menu-part:' + segment.name + ' */';
    source = source.replace(segment.relay, () => part.slice(part.indexOf(start) + start.length, part.indexOf(end)));
  }
  return source;
};
