#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXTS = new Set(['.html', '.js', '.css', '.svg']);
const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (EXTS.has(path.extname(entry.name).toLowerCase())) files.push(file);
  }
  return files;
}

const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && EXTS.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => path.join(ROOT, entry.name));
const files = rootFiles.concat(...[
  'assets', 'functions', 'app/src', 'bridge', '_next', 'fr', 'en', 'ar'
].map((dir) => walk(path.join(ROOT, dir))));

function rel(file) { return path.relative(ROOT, file); }
function fail(file, reason) { failures.push(`${rel(file)}: ${reason}`); }

function jsVisibleDashes(source) {
  if (!source.includes('—')) return [];
  const hits = [];
  let i = 0;
  while (i < source.length) {
    if (source.charCodeAt(i) === 47 && source.charCodeAt(i + 1) === 47) {
      const end = source.indexOf('\n', i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.charCodeAt(i) === 47 && source.charCodeAt(i + 1) === 42) {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === '`') {
      const start = i++;
      let escaped = false;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) { i++; break; }
      }
      if (source.slice(start, i).includes('—')) hits.push(start);
      continue;
    }
    i++;
  }
  return hits;
}

function cssVisibleDashes(source) {
  if (!source.includes('—')) return [];
  const hits = [];
  let i = 0;
  while (i < source.length) {
    if (source.charCodeAt(i) === 47 && source.charCodeAt(i + 1) === 42) {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    const quote = source[i];
    if (quote === '"' || quote === "'") {
      const start = i++;
      let escaped = false;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) { i++; break; }
      }
      if (source.slice(start, i).includes('—')) hits.push(start);
      continue;
    }
    i++;
  }
  return hits;
}

function htmlVisibleDashes(source) {
  if (!source.includes('—')) return [];
  let s = source.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const hits = [];
  const styleMatches = [...s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  for (const m of styleMatches) {
    if (cssVisibleDashes(m[1]).length) hits.push(1);
  }
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  if (s.includes('—')) hits.push(1);
  return hits;
}

let aliasCount = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('Instrument Serif')) fail(file, 'retired Instrument Serif reference');
  if (/fonts\.googleapis\.com[^\n"']*Instrument\+Serif/i.test(source)) fail(file, 'Instrument Serif Google Fonts import');
  const generated = rel(file).startsWith('_next' + path.sep);
  if (generated) {
    if (source.includes('—')) fail(file, 'U+2014 em dash remains in a generated chunk');
    continue;
  }

  const aliases = source.matchAll(/--(?:serif|font-editorial|font-display|display-font)\s*:\s*([^;]+);/gi);
  for (const match of aliases) {
    aliasCount++;
    if (!/Inter Tight/i.test(match[1])) fail(file, `alias does not resolve to Inter Tight: ${match[0]}`);
  }

  const ext = path.extname(file).toLowerCase();
  if (ext === '.css' || ext === '.html' || ext === '.svg') {
    if (source.includes('var(--serif)') || source.includes('var(--font-editorial)')) {
      for (const rule of source.match(/[^{}]*\{[^{}]*(?:var\(--serif\)|var\(--font-editorial\))[^{}]*\}/gi) || []) {
        if (/font-style\s*:\s*italic/i.test(rule)) fail(file, 'editorial alias is italic');
      }
    }
  }

  const visible = ext === '.js' ? []
      : ext === '.css' ? cssVisibleDashes(source)
        : htmlVisibleDashes(source);
  if (visible.length) fail(file, 'U+2014 em dash remains in user-facing content');
}

for (const name of ['assets/i18n.js', 'assets/caisse-lang.js', 'assets/menu-i18n.js']) {
  const file = path.join(ROOT, name);
  if (jsVisibleDashes(fs.readFileSync(file, 'utf8')).length) fail(file, 'U+2014 remains in a language string table');
}

if (!aliasCount) failures.push('No serif/editorial/display compatibility aliases were inspected');

if (failures.length) {
  console.error(`✗ Type policy failed (${failures.length})`);
  for (const failure of failures.slice(0, 80)) console.error(`  ${failure}`);
  if (failures.length > 80) console.error(`  … ${failures.length - 80} more`);
  process.exit(1);
}

console.log(`✓ Instrument Serif absent from ${files.length} shipped files`);
console.log('✓ Google Fonts imports exclude Instrument Serif');
console.log(`✓ ${aliasCount} serif/editorial/display aliases resolve to upright Inter Tight`);
console.log('✓ visible HTML, SVG, CSS and generated chunks contain no U+2014 em dash');
console.log('✓ i18n.js, caisse-lang.js and menu-i18n.js contain no U+2014 string');
