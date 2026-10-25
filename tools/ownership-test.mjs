#!/usr/bin/env node
/* Fast ownership gate. Owns tools/ownership-manifest.json only; executes no
 * merchant code. Existing duplicate exports and eager order debt are enumerated
 * explicitly; new edges fail, even when the coupling count stays unchanged.
 * KIWI_UPDATE_OWNERSHIP_BASELINE=1 only removes allowances / lowers counts.
 * Requires app/node_modules/typescript (already used by the typecheck gate). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { analyse, inspect } from './ownership-lib.mjs';
const tracked = ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html', ...['caisse-app', 'pages-pro', 'hotel', 'dateRange', 'agent', 'venues', 'interactive', 'serveur-app', 'stock'].map(n => `assets/${n}.js`)];
const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'tools/ownership-manifest.json');
export function inventory(root) {
  const sources = new Map(), shells = new Map();
  function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${e.name}`;
      if (e.isDirectory() && e.name !== 'vendor') walk(file);
      else if (e.isFile() && /\.js$/.test(file) && !/\.min\.js$/.test(file)) sources.set(file, fs.readFileSync(path.join(root, file), 'utf8'));
    }
  }
  walk('assets');
  for (const shell of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html']) {
    const html = fs.readFileSync(path.join(root, shell), 'utf8'), sequence = [], deferred = [];
    let i = 0;
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\btype\s*=\s*["'](?:application\/ld\+json|application\/json|importmap)["']/i.test(m[1])) continue;
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
      if (src) {
        const file = src[1].split(/[?#]/)[0].replace(/^\//, '');
        if (sources.has(file)) (/\bdefer\b/i.test(m[1]) ? deferred : sequence).push(file);
      } else {
        const file = `${shell}#inline-${++i}`;
        sources.set(file, m[2]); sequence.push(file);
      }
    }
    shells.set(shell, sequence.concat(deferred));
  }
  return { sources, shells };
}

// Red-before / green-after proof using real temporary shell and script files.
function fixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-ownership-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets'));
    const a = 'assets/a.js', b = 'assets/b.js';
    const allowed = { files: { [a]: { owner: 'a', reads: [], coupling: 0 }, [b]: { owner: 'b', reads: [], coupling: 0 } }, duplicates: {}, order: [] };
    const run = (left, right, order = [a, b]) => {
      fs.writeFileSync(path.join(dir, a), left); fs.writeFileSync(path.join(dir, b), right);
      for (const shell of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html']) fs.writeFileSync(path.join(dir, shell), order.map(f => `<script src="${f}"></script>`).join(''));
      const inv = inventory(dir); return inspect(inv.sources, inv.shells, allowed);
    };
    assert.deepEqual(run('window.Shared = {};', 'window.Consumer = {};').failures, []);
    let red = run('window.Shared = {};', 'function later(){ window.Shared.go(); }');
    assert(red.failures.some(f => f.startsWith('unlisted:')));
    assert(red.failures.some(f => f.startsWith('coupling:')));
    assert(!red.failures.some(f => f.startsWith('order:')));
    allowed.files[b].reads = ['Shared'];
    assert(run('window.Shared = {};', 'function later(){window.Shared.go();}').failures.some(f => f.startsWith('coupling:')));
    allowed.files[b].coupling = 1;
    allowed.files[b].reads = ['Different'];
    red = run('window.Shared = {};', 'function later(){window.Shared.go();}');
    assert(red.failures.some(f => f.startsWith('unlisted:')));
    assert(!red.failures.some(f => f.startsWith('coupling:')));
    allowed.files[b].reads = ['Shared'];
    assert.deepEqual(run('window.Shared = {};', 'function later(){ window.Shared.go(); }').failures, []);
    red = run('window.Shared = {};', 'window.Shared = {};');
    assert(red.failures.some(f => f.startsWith('duplicate:')));
    assert.deepEqual(run('window.Shared = {};', 'window.Consumer = {};').failures, []);
    red = run('window.Shared = {};', '(function(w){ w.Shared.go(); })(window);', [b, a]);
    assert(red.failures.some(f => f.startsWith('order:')));
    assert(run('window.Shared = {};', 'function boot(){window.Shared.go();} boot();', [b, a]).failures.some(f => f.startsWith('order:')));
    assert.deepEqual(run('window.Shared = {};', '(function(w){ w.Shared.go(); })(window);').failures, []);
    const part = 'assets/parts/part.js';
    fs.mkdirSync(path.join(dir, 'assets/parts'));
    allowed.units = { a: { parent: a, parts: 'assets/parts/' } };
    fs.writeFileSync(path.join(dir, part), 'window.Internal = {}; function later(){window.Shared.go();}');
    assert.deepEqual(run('window.Shared = {}; window.Internal.go();', '').failures, []);
    // A part cannot hide an unlisted cross-unit edge behind its parent.
    fs.writeFileSync(path.join(dir, part), 'function later(){window.Foreign.go();}');
    red = run('', 'window.Foreign = {};');
    assert(red.failures.some(f => f.startsWith('unlisted: assets/a.js reads Foreign')));
    assert(red.failures.some(f => f.startsWith('coupling:')));
    fs.writeFileSync(path.join(dir, part), 'window.Foreign = {};');
    assert(run('', 'window.Foreign = {};').failures.some(f => f.startsWith('duplicate:')));
    fs.writeFileSync(path.join(dir, part), 'window.Foreign.go();');
    allowed.files[a].reads = ['Foreign'];
    allowed.files[a].coupling = 1;
    assert(run('', 'window.Foreign = {};', [part, b, a]).failures.some(f => f.startsWith('order:')));
    assert.deepEqual(run('', 'window.Foreign = {};', [b, part, a]).failures, []);
    fs.writeFileSync(path.join(dir, part), 'window.Shared = {};');
    assert.deepEqual(run('window.Shared = {}; window.Shared.go();', '').failures, []);
    const p = analyse('// window.Fake = 1\nconst s="window.Fake = 1"; function f(Shared){return Shared;} window["Real"] = {}; setTimeout(()=>window.Real.go());', a);
    assert(!p.definitions.has('Fake')); assert(p.definitions.has('Real')); assert.equal(p.reads.get('Real'), false);
    console.log('✓ ownership fixtures: unlisted edge, duplicate export, eager order and coupling red, corrected cases green');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
fixtures();
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.deepEqual(Object.keys(manifest.files).sort(), [...tracked].sort(), 'all required files need ownership entries');
const inv = inventory(root);
const result = inspect(inv.sources, inv.shells, manifest);
if (result.failures.length) {
  for (const f of result.failures) console.error(`✗ ${f}`);
  process.exitCode = 1;
} else {
  if (process.env.KIWI_UPDATE_OWNERSHIP_BASELINE === '1') {
    for (const [file, reads] of Object.entries(result.actual)) {
      manifest.files[file].reads = reads;
      manifest.files[file].coupling = Math.min(reads.length, manifest.files[file].coupling);
    }
    manifest.duplicates = result.duplicates;
    manifest.order = result.order;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(`✓ ownership: ${Object.keys(manifest.files).length} surfaces/units, ${Object.values(result.actual).reduce((n, a) => n + a.length, 0)} allowed cross-unit reads; no new order debt`);
}

}
