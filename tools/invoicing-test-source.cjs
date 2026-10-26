/* Rebuild from live files only. The gzip is exclusively a split-test oracle. */
const fs = require('node:fs');
const path = require('node:path');
function invoicingTestSource(root = process.env.KIWI_ROOT || path.resolve(__dirname, '..')) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const map = JSON.parse(read('tools/fixtures/invoicing/split.json'));
  let core = read('assets/invoicing.js');
  for (const edit of [...map.edits].reverse()) {
    const replacement = edit.replacement.replace(/\?v=\d+/g, '?v=N');
    if (edit.original.startsWith('(()')) {
      const live = core.slice(0, core.indexOf("  // invoicing:entry-body\n") + "  // invoicing:entry-body\n".length);
      const prefix = live.slice(live.indexOf('(() => {'));
      if (prefix.replace(/\?v=\d+/g, '?v=N') !== replacement) throw Error('Invoice import bridge changed');
      core = core.replace(prefix, () => edit.original);
    } else if (edit.tail) {
      if (!core.endsWith(edit.replacement)) throw Error('Invoice entry tail changed');
      core = core.slice(0, -edit.replacement.length) + edit.original;
    } else {
      if (!core.includes(edit.replacement)) throw Error('Invoice transport binding changed');
      core = core.replace(edit.replacement, () => edit.original);
    }
  }
  for (const part of map.parts) {
    const source = read(part.file);
    for (const e of part.entries) {
      if (e.replacement && !core.includes(e.replacement)) throw Error('Invoice forwarding changed: ' + e.name);
      const body = source.slice(e.offset, e.offset + e.length);
      // Empty replacements (private transport declarations) retain their source offsets.
      if (e.replacement) core = core.replace(e.replacement, () => body);
      else {
        const before = core.slice(0, e.start);
        core = before + body + core.slice(e.start);
      }
    }
  }
  return core;
}
module.exports = { invoicingTestSource };
