/* Reconstruct the original lexical order from the current split bodies. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const { originalFile } = require('./team-owners-test-source.cjs');
const FILES = ['assets/team.js', 'assets/team/profile-ui.js', 'assets/team-hours.js', 'assets/team/catalog.js'];
module.exports = function teamSource() {
  let source = originalFile(FILES[0]);
  const part = originalFile(FILES[1]);
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/team/split.json'), 'utf8'));
  for (const segment of map.segments) {
    const start = '  /* team-part:' + segment.name + ' */\n';
    const end = '  /* /team-part:' + segment.name + ' */';
    const body = part.slice(part.indexOf(start) + start.length, part.indexOf(end));
    source = source.replace(segment.relay, () => body);
  }
  /* Second stage: the role catalogue now lives in assets/team/catalog.js. */
  const stage2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/team-catalog/split.json'), 'utf8'));
  for (const segment of stage2.segments) {
    const file = fs.readFileSync(path.join(root, segment.file), 'utf8');
    const start = '  /* team-part:' + segment.name + ' */\n';
    const end = '  /* /team-part:' + segment.name + ' */';
    const body = file.slice(file.indexOf(start) + start.length, file.indexOf(end));
    source = source.replace(segment.relay, () => body);
  }
  return source + '\n' + require('./planning-test-source.cjs').planningTestSource();
};
module.exports.FILES = FILES;
