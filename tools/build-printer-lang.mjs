/* The printer window's words, for pages without the till dictionary.
 *
 * assets/printer/pairing-lang.js carries the English and Arabic of every
 * phrase of assets/caisse-lang.js that the printer setup window can show
 * (assets/printer/pairing-ui.js, and say() in assets/printer-bridge.js). The
 * till dictionary stays the one source: this tool copies the matching entries
 * between the two GENERATED PRINTER WORDS markers. `--check` changes nothing
 * and fails when the copy is stale; tools/printer-lang-test.mjs runs it.
 *
 *   node tools/build-printer-lang.mjs          rewrite the block
 *   node tools/build-printer-lang.mjs --check  exit 1 when it is stale
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
export const TARGET = 'assets/printer/pairing-lang.js';
export const SOURCES = ['assets/printer/pairing-ui.js', 'assets/printer-bridge.js'];
const BEGIN = '  /* GENERATED PRINTER WORDS BEGIN */\n';
const END = '  /* GENERATED PRINTER WORDS END */\n';

export function tillDictionary(lang) {
  const context = { console, localStorage: { getItem: () => lang, setItem() {} },
    document: { readyState: 'loading', addEventListener() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('assets/caisse-lang.js'), context, { filename: 'assets/caisse-lang.js' });
  return context.KiwiCaisseLang.dict();
}

/* A phrase belongs to the window when every fixed part of it is written in
   the window's sources, and at least one part is a real word. */
export function words() {
  // Read as the strings are, not as they are escaped: « d\'étiquette ».
  const source = SOURCES.map(read).join('\n').replace(/\\(['"\\])/g, '$1');
  const out = {};
  for (const lang of ['en', 'ar']) {
    const dict = tillDictionary(lang);
    const picked = {};
    for (const key of Object.keys(dict).sort()) {
      const parts = key.split(/\{[nx]\}/).map((p) => p.trim()).filter(Boolean);
      if (!parts.length || Math.max(...parts.map((p) => p.length)) < 3) continue;
      if (parts.every((p) => source.includes(p))) picked[key] = dict[key];
    }
    out[lang] = picked;
  }
  return out;
}

export function render() {
  const text = read(TARGET);
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(TARGET + ': markers missing');
  const body = '  var WORDS = ' + JSON.stringify(words(), null, 2).replace(/\n/g, '\n  ') + ';\n';
  return text.slice(0, a + BEGIN.length) + body + text.slice(b);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = render();
  const stale = next !== read(TARGET);
  if (process.argv.includes('--check')) {
    if (stale) { console.error('✗ ' + TARGET + ' is stale: run node tools/build-printer-lang.mjs'); process.exit(1); }
    console.log('✓ ' + TARGET + ' matches assets/caisse-lang.js');
  } else {
    if (stale) fs.writeFileSync(path.join(ROOT, TARGET), next);
    console.log((stale ? 'wrote ' : 'unchanged ') + TARGET);
  }
}
