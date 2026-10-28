'use strict';
const fs = require('node:fs');
const path = require('node:path');
module.exports = function briefingSource() {
  return ['briefing-rules.js', 'briefing-persistence.js', 'briefing.js'].map(file => fs.readFileSync(path.join(__dirname, '..', 'assets', file), 'utf8')).join('\n');
};
