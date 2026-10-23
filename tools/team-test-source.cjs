/* Reconstruct the original lexical order from the current split bodies. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const FILES = ['assets/team.js', 'assets/team/profile-ui.js', 'assets/team-hours.js'];
module.exports = function teamSource() {
  let source = fs.readFileSync(path.join(root, FILES[0]), 'utf8');
  const part = fs.readFileSync(path.join(root, FILES[1]), 'utf8');
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/team/split.json'), 'utf8'));
  for (const segment of map.segments) {
    const start = '  /* team-part:' + segment.name + ' */\n';
    const end = '  /* /team-part:' + segment.name + ' */';
    const body = part.slice(part.indexOf(start) + start.length, part.indexOf(end));
    source = source.replace(segment.relay, () => body);
  }
  return source + '\n' + fs.readFileSync(path.join(root, FILES[2]), 'utf8');
};
module.exports.FILES = FILES;
