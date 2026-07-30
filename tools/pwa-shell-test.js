#!/usr/bin/env node
/* Kiwi · the installable till is complete before the first outage. */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sw = read('kiwi-sw.js');
const dispatch = read('assets/pos-dispatch.js');
let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? passed++ : failed.push(label);

const files = [...dispatch.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
ok('the dispatcher declares POS verticals', files.length >= 10);
files.forEach((base) => {
  ['js', 'css'].forEach((ext) => {
    const rel = `assets/${base}.${ext}`;
    ok(`${rel} exists`, fs.existsSync(path.join(ROOT, rel)));
    ok(`${rel} is pre-cached`, sw.includes(`'/${rel}'`));
  });
});

const shell = [...sw.matchAll(/^\s*'(\/[^']+)'[,;]?/gm)].map((m) => m[1]);
shell.forEach((url) => ok(`${url} exists`, fs.existsSync(path.join(ROOT, url.slice(1)))));

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} PWA shell checks green (${files.length} POS verticals complete offline)`);
