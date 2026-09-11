import assert from 'node:assert/strict';
import fs from 'node:fs';

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const tokens = fs.readFileSync(new URL('../assets/tokens.css', import.meta.url), 'utf8');

const add = caisse.match(/\.menu-item-add\s*\{[^}]*\}/)?.[0] || '';
const hover = caisse.match(/\.menu-item:hover \.menu-item-add\s*\{[^}]*\}/)?.[0] || '';

assert.match(add, /background:\s*var\(--brand-deep\)/,
  'the add disc uses a theme-stable brand surface');
assert.match(add, /color:\s*var\(--inverse-ink\)/,
  'the plus uses ink designed for the inverse surface');
assert.match(add, /border:\s*1px solid var\(--inverse-line\)/,
  'the round control remains bounded against dark product cards');
assert.doesNotMatch(add, /background:\s*var\(--ink\)/,
  'the add disc must not invert to white in dark mode');
assert.match(hover, /background:\s*var\(--atlas\)/);
assert.match(hover, /border-color:\s*var\(--atlas\)/);
assert.match(tokens, /--brand-deep:\s*#053B2C/);
assert.match(tokens, /--inverse-ink:\s*#F7F5F0/);

console.log('caisse-menu-add-contrast-test: 8 controls passed');
