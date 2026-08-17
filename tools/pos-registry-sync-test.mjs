#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POS Dispatch REGISTRY ↔ Service Worker SHELL cache revision synchronization
 *
 * Verifies that every POS vertical registered in assets/pos-dispatch.js:
 * 1. Has both its .js and .css files present on disk.
 * 2. Has both its .js and .css files pre-cached in kiwi-sw.js with the exact
 *    matching ?v=<rev> query parameter when a rev is specified.
 * 3. Prevents cache drift where a vertical is bumped in REGISTRY but served
 *    stale from the service worker cache.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const swSource = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
const dispatchSource = fs.readFileSync(path.join(ROOT, 'assets/pos-dispatch.js'), 'utf8');

let passed = 0;
const failures = [];

function ok(condition, label) {
  if (condition) {
    passed++;
  } else {
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

// Extract all REGISTRY entries: { id, file, rev, label }
const entryRegex = /'([0-9]{4})':\s*\{\s*id:\s*'([^']+)',\s*file:\s*'([^']+)'(?:,\s*rev:\s*'([^']+)')?/g;
const registryEntries = [];
let match;
while ((match = entryRegex.exec(dispatchSource)) !== null) {
  registryEntries.push({
    code: match[1],
    id: match[2],
    file: match[3],
    rev: match[4] || null,
  });
}

ok(registryEntries.length >= 10, `REGISTRY declares specialist verticals (${registryEntries.length} found)`);

for (const entry of registryEntries) {
  const jsRel = `assets/${entry.file}.js`;
  const cssRel = `assets/${entry.file}.css`;

  // 1. Files exist on disk
  ok(fs.existsSync(path.join(ROOT, jsRel)), `${jsRel} exists on disk`);
  ok(fs.existsSync(path.join(ROOT, cssRel)), `${cssRel} exists on disk`);

  // 2. Exact match in SW cache
  const expectedJs = entry.rev ? `'/assets/${entry.file}.js?v=${entry.rev}'` : `'/assets/${entry.file}.js'`;
  const expectedCss = entry.rev ? `'/assets/${entry.file}.css?v=${entry.rev}'` : `'/assets/${entry.file}.css'`;

  ok(
    swSource.includes(expectedJs),
    `kiwi-sw.js precaches ${entry.file}.js with exact matching rev (${expectedJs})`
  );
  ok(
    swSource.includes(expectedCss),
    `kiwi-sw.js precaches ${entry.file}.css with exact matching rev (${expectedCss})`
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} POS registry sync failures found`);
  process.exit(1);
}

console.log(`✓ ${passed} POS dispatch REGISTRY ↔ Service Worker sync checks green`);
