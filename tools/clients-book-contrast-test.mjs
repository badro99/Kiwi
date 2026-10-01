#!/usr/bin/env node
/* Ticket #0154/#0156/#0160 · Clients-book dark-mode contrast guard.
 *
 * The caisse paints dark via html[data-caisse-theme="dark"], NOT the
 * dashboard's html[data-theme="dark"]. Every light-ink text rule in
 * clients-book.js therefore needs a caisse-theme twin, and every dark
 * foreground must clear 4.5:1 against its painted dark surface.
 * This test parses the real injected stylesheet and checks the math,
 * so a new label/subtitle/section rule cannot silently ship dark-on-dark.
 *
 *   node tools/clients-book-contrast-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'assets/clients-book.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

// 1. Extract the injected stylesheet: s.textContent = [ ... ].join('')
const anchor = src.indexOf('s.textContent = [');
assert.ok(anchor !== -1, 'css() array anchor found');
let i = src.indexOf('[', anchor), depth = 0, end = -1;
for (; i < src.length; i++) {
  const c = src[i];
  if (c === '[') depth++;
  else if (c === ']') { depth--; if (!depth) { end = i + 1; break; } }
}
assert.ok(end !== -1, 'css() array closed');
// eslint-disable-next-line no-eval
const rules = eval(src.slice(src.indexOf('[', anchor), end));
const css = rules.join('');
assert.ok(css.includes(':is(html[data-theme='), 'dark rules present in extracted css');

function lum(hex) {
  const v = hex.replace('#', '');
  const f = (n) => { const c = parseInt(n, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return 0.2126 * f(full.slice(0, 2)) + 0.7152 * f(full.slice(2, 4)) + 0.0722 * f(full.slice(4, 6));
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Painted dark surfaces in clients-book (verified in headless render).
const SURFACES = { card: '#0d1512', inset: '#141d19', strip: '#101915', chip: '#1b2a23' };
function surfaceFor(selector) {
  if (/\.kcb-av\b/.test(selector)) return SURFACES.chip;
  if (/\.kcb-info\b|input|select|\.kcb-consent|\.kcb-btn\.ghost|\.kcb-x\b|\.kx-tabs|\.kx-tab\.on|\.kcb-strip \.kx-kpi|\.kcb-list|\.kcb-stat|\.kcb-kpi|\.kcb-record|\.kcb-search/.test(selector)) return SURFACES.inset;
  if (/\.kcb-strip|\.kcb-cols|\.kcb-empty/.test(selector)) return SURFACES.strip;
  return SURFACES.card;
}

// 2. Every dark twin must exist for both theme attributes.
ok('dark rules cover the caisse theme attribute', () => {
  const darkRules = css.split('}').filter((r) => r.includes('[data-theme="dark"]'));
  assert.ok(darkRules.length > 10, `found ${darkRules.length} dark rules`);
  for (const r of darkRules) {
    assert.ok(r.includes('[data-caisse-theme="dark"]'), `caisse twin missing: ${r.slice(0, 90)}`);
  }
});

// 3. Every dark foreground clears 4.5:1 on its surface.
const seen = [];
for (const chunk of css.split('}')) {
  const parts = chunk.split('{');
  if (parts.length < 2) continue;
  const sel = parts[0].trim();
  if (!sel.includes('[data-theme="dark"]')) continue;
  const body = parts.slice(1).join('{');
  const m = body.match(/(^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,6})/);
  if (!m) continue;
  seen.push([sel, m[2]]);
}
ok(`${seen.length} dark foregrounds parsed`, () => assert.ok(seen.length > 10));
for (const [sel, fg] of seen) {
  ok(`${fg} on ${surfaceFor(sel)} >= 4.5:1 :: ${sel.slice(0, 72)}`, () => {
    const r = ratio(fg, surfaceFor(sel));
    assert.ok(r >= 4.5, `ratio ${r.toFixed(2)}:1`);
  });
}

console.log(`\n${failed ? '' : ''}clients-book-contrast: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
