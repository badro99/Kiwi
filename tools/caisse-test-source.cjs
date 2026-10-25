// Rebuild the original classic-script position for source assertions and VM extraction.
// The till's restaurant core is four blocking classic scripts, loaded in this
// order at the end of kiwi-caisse.html: three preludes of top-level function
// declarations only (caisse-accounting.js, then caisse-floor.js and
// caisse-kitchen.js, both out of caisse-app.js since 22 October 2026), then
// caisse-app.js with the state and everything that runs at load.
const fs = require('node:fs');
const path = require('node:path');
const workflows = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app/workflows.json'), 'utf8'));
const LIVE = ['assets/caisse-accounting.js', 'assets/caisse-floor.js', 'assets/caisse-kitchen.js', ...workflows.files, 'assets/caisse-app.js'];
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const liveSource = () => LIVE.map(read).join('\n');
/* Second split (tools/fixtures/caisse-app/split-2.json): put every run of
   moved declarations back in front of the caisse-app.js text it used to
   precede, so tests that slice « from this function to the next statement »
   read caisse-app.js as it was. Runs and anchors are found by text, not by
   offset: an edit elsewhere keeps working. null when an anchor or a run start
   is gone or ambiguous, or when a prelude gained code ahead of its first run. */
function appBeforeWorkflows() {
  const crypto = require('node:crypto');
  // Changed bodies fall back to current live scripts, never frozen code.
  if (!Object.entries(workflows.splitFiles).every(([file, hash]) =>
    crypto.createHash('sha256').update(read(file)).digest('hex') === hash)) return null;
  let core = read(workflows.core);
  for (const edit of [...workflows.coreWhitespace].reverse()) core = core.slice(0, edit.at) + edit.text + core.slice(edit.at);
  const bodies = new Map([[workflows.core, core], ...workflows.files.map(file => [file, read(file).slice(workflows.headers[file].length, -1)])]);
  const offsets = new Map();
  return workflows.fragments.map(fragment => {
    const at = offsets.get(fragment.file) || 0, length = fragment.end - fragment.start;
    offsets.set(fragment.file, at + length);
    return bodies.get(fragment.file).slice(at, at + length);
  }).join('');
}
function appBeforeSecondSplit() {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app/split-2.json'), 'utf8'));
  const core = appBeforeWorkflows();
  if (core === null) return null;
  const texts = new Map();
  for (const file of new Set(map.runs.map(run => run.file))) {
    const body = read(file).replace(/\n$/, '');
    const runs = map.runs.filter(run => run.file === file);
    const at = runs.map(run => body.indexOf(run.start));
    for (let i = 0; i < runs.length; i++) {
      if (at[i] < 0 || body.indexOf(runs[i].start, at[i] + 1) >= 0 || (i && at[i] <= at[i - 1])) return null;
    }
    if (/\bfunction\b/.test(body.slice(0, at[0]))) return null;
    runs.forEach((run, i) => texts.set(run, body.slice(at[i], i + 1 < runs.length ? at[i + 1] : body.length)));
  }
  let out = '', last = 0;
  for (const run of map.runs) {
    const at = core.indexOf(run.before);
    if (at < last || core.indexOf(run.before, at + 1) >= 0) return null;
    out += core.slice(last, at) + texts.get(run);
    last = at;
  }
  return out + core.slice(last);
}
function originalOrder() {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/caisse-app/split.json'), 'utf8'));
  const app = appBeforeSecondSplit();
  if (app === null) return liveSource();
  const bodies = new Map([[map.prelude, read(map.prelude)], [map.core, app]]);
  const offsets = new Map(), parts = [];
  for (const fragment of map.fragments) {
    const offset = offsets.get(fragment.file) || 0, length = fragment.end - fragment.start;
    parts.push(bodies.get(fragment.file).slice(offset, offset + length));
    offsets.set(fragment.file, offset + length);
  }
  for (const [file, body] of bodies) {
    if (body.length !== offsets.get(file) + (file === map.prelude ? 1 : 0)) return [...bodies.values()].join('\n');
  }
  return parts.join('');
}
module.exports = function caisseTestSource(html) {
  return html.replace(/  <link[^>]+data-caisse-(?:script|lazy)[^>]*>\n/g, '')
    .replace(/<script src="assets\/caisse\/workflows-loader\.js(?:\?v=\d+)?"><\/script>\s*/g, '')
    .replace(/<script src="assets\/caisse-(?:accounting|floor|kitchen)\.js(?:\?v=\d+)?"><\/script>\s*/g, '')
    .replace(/<script src="assets\/caisse-app\.js(?:\?v=\d+)?"><\/script>/,
      () => '<script>' + originalOrder() + '</script>');
};
// Tests needing individual functions read current declarations by name.
module.exports.declarations = function declarations(...names) {
  const { declaration } = require('./js-declarations.cjs');
  const source = liveSource();
  return names.map(name => declaration(source, name)).join('\n');
};
// The four live files, concatenated in load order, for tests that read or run the core.
module.exports.FILES = LIVE;
module.exports.liveSource = liveSource;
module.exports.appBeforeSecondSplit = appBeforeSecondSplit;

module.exports.appBeforeWorkflows = appBeforeWorkflows;
module.exports.appSource = () => appBeforeWorkflows() || [...workflows.files.map(read), read(workflows.core)].join("\n");
