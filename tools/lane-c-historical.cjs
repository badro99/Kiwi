// Explicit reviewed accessibility/copy deltas for historical split proofs only.
// Behaviour suites continue to execute the unmodified live source.
const fs = require('node:fs');
module.exports = function undoLabelEdits(source, file) {
  const edits = JSON.parse(fs.readFileSync('tools/fixtures/lane-c-label-edits.json', 'utf8'));
  for (const edit of edits[file]) {
    if (!source.includes(edit.after)) throw Error('Label delta changed: ' + file);
    source = source.replace(edit.after, () => edit.before);
  }
  return source;
};
