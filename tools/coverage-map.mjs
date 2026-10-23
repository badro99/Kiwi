#!/usr/bin/env node
// Static inventory only: annotations are reviewed claims, not browser run results.
// Put one literal cell per comment immediately before its open/goto call. For a
// loop, list only literal iterations actually executed. Never annotate a locked
// entry as an unlocked vertical, or a dashboard entry as an unopened drawer.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { isSlow } = require('./check-guard.js');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const cellKey = (c) => [c.surface, c.locale, c.viewport].join('|');
export const viewportClass = (width) => width < 600 ? 'phone' : width <= 1100 ? 'tablet' : 'desktop';
export function ratchet(previous, current) {
  const covered = new Set(current);
  const lost = previous.filter((key) => !covered.has(key));
  if (lost.length) throw new Error(`coverage regression (update cannot remove cells): ${lost.join(', ')}`);
  return [...new Set([...previous, ...covered])].sort();
}
export function claims(source, file) {
  const lines = source.split('\n'), found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\/\/ coverage:/.test(lines[i])) continue;
    const m = lines[i].match(/^\s*\/\/ coverage: surface=([\w-]+) locale=([a-z]+) viewport=(phone|tablet|desktop)\s*$/);
    if (!m) throw new Error(`${file}:${i + 1}: malformed coverage annotation`);
    let next = i + 1;
    while (/^\s*\/\/ coverage:/.test(lines[next] || '')) next++;
    if (!/\bawait\s+.*\b(?:open|goto)\(/.test(lines[next] || '')) throw new Error(`${file}:${i + 1}: annotation must precede an awaited open/goto`);
    found.push({ surface: m[1], locale: m[2], viewport: m[3], line: i + 1, openLine: next + 1 });
  }
  return found;
}
export function scan(root = ROOT) {
  const gate = fs.readFileSync(path.join(root, 'tools/check.js'), 'utf8');
  // Same named-file extraction as check-guard.prefetch, classification delegated
  // to its actual isSlow implementation rather than a filename convention.
  const own = new Set(['check.js', 'check-guard.js', 'check-pool.js']);
  const names = [...new Set([...gate.matchAll(/['"]([A-Za-z0-9_./-]+\.m?js)['"]/g)].map((m) => m[1]))].sort();
  return names.filter((name) => !own.has(name) && fs.existsSync(path.resolve(root, 'tools', name)) && isSlow(path.resolve(root, 'tools', name))).map((name) => {
    const source = fs.readFileSync(path.join(root, 'tools', name), 'utf8');
    const lines = source.split('\n');
    // Line numbers allow review without copying fixture credentials into output.
    const evidence = { navigation: [], locale: [], viewport: [] };
    lines.forEach((line, i) => {
      if (/\b(?:goto|open)\(/.test(line)) evidence.navigation.push({ line: i + 1,
        paths: [...line.matchAll(/\/[A-Za-z0-9_/${}.-]+\.html/g)].map((m) => m[0]) });
      if (/kiwiLang|locale|Lang\b|language|\blang\b/.test(line)) evidence.locale.push({ line: i + 1,
        values: [...new Set([...line.matchAll(/['"](fr|en|ar|es|de|it|nl)['"]/g)].map((m) => m[1]))] });
      if (/setViewport|viewport|devices\[|width\s*:/.test(line)) evidence.viewport.push({ line: i + 1,
        widths: [...line.matchAll(/width\s*[:=]\s*(\d+)/g)].map((m) => ({ width: Number(m[1]), class: viewportClass(Number(m[1])) })),
        preset: line.match(/devices\[['"]([\w -]+)['"]\]/)?.[1] || null });
    });
    return { suite: `tools/${name}`, cells: claims(source, name), evidence };
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(scan(), null, 2));
