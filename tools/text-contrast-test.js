#!/usr/bin/env node
'use strict';

/* Prevent decorative neutrals from drifting back into operational copy.
 * --n-400 and the old standalone --ink-4 values are useful for borders and
 * disabled decoration, but fail WCAG AA when used as normal text on Kiwi's
 * paper/card surfaces. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return ['node_modules', '.git', '_next', 'material-symbols'].includes(d.name) ? [] : walk(p);
  return /\.(?:css|html|js)$/.test(d.name) ? [p] : [];
});

const problems = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const patterns = [
    [/(?:^|[;{])\s*color\s*:\s*var\(--n-400\)/gm, 'decorative --n-400 used as text'],
    [/--ink-4\s*:\s*#9A9A9A\b/gi, 'low-contrast standalone --ink-4'],
    [/--ink-4\s*:\s*rgba\(242\s*,\s*245\s*,\s*243\s*,\s*0?\.35\)/gi, 'low-contrast dark --ink-4'],
  ];
  for (const [re, label] of patterns) {
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      problems.push(`${rel}:${line} · ${label}`);
    }
  }
}

if (problems.length) {
  console.error('✗ text contrast guard failed');
  problems.forEach((p) => console.error('  · ' + p));
  process.exit(1);
}
console.log('✓ text contrast guard · operational labels use readable neutrals');
