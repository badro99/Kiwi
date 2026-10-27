/* Reconstruct the pre-C1 files from live production bodies, never the archive. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const map = require('./fixtures/stock-controller/split.json');
module.exports = function stockControllerSource(file = 'assets/stock.js', base = path.resolve(__dirname, '..')) {
  const read = f => fs.readFileSync(path.join(base, f), 'utf8');
  let source = read(file);
  if (file === 'assets/stock.js') for (const edit of [...map.edits].reverse()) {
    // Asset stamps are metadata, independent of the byte proof.
    const loose = value => value.replace(/\?v=\d+/g, '?v=N');
    if (source.includes(edit.after)) source = source.replace(edit.after, () => edit.before);
    else {
      const normalized = loose(source), needle = loose(edit.after), at = normalized.indexOf(needle);
      if (at < 0) throw new Error('Stock bridge changed: ' + edit.after);
      const pattern = new RegExp(edit.after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/v=\d+/g, 'v=\\d+'));
      source = source.replace(pattern, () => edit.before);
    }
  }
  for (const part of map.parts) {
    const live = read(part.file);
    for (const fragment of [...part.fragments.map(f => ({ ...f, file: part.from || 'assets/stock.js' })), ...(part.extra || [])]) {
      if (fragment.file !== file) continue;
      if (!source.includes(fragment.replacement)) throw new Error('Stock relay changed: ' + fragment.name);
      source = source.replace(fragment.replacement, () => live.slice(fragment.offset, fragment.offset + fragment.length));
    }
  }
  for (const stamp of map.files[file]?.stamps || []) {
    const asset = stamp.split('?')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    source = source.replace(new RegExp(asset + '\\?v=\\d+', 'g'), stamp);
  }
  return source;
};
