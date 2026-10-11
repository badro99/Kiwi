#!/usr/bin/env node
/* Modals, drawers and menus are opaque reading surfaces (owner, 2026-10-11).
 *
 * design-2026.css painted every sheet at 46 to 86 % of a translucent surface
 * behind a 34 px blur, so a recipe, a staff card or a price form was read over
 * the page behind it. Glass stays on ambient chrome; what people read and type
 * into is solid, in light and in dark (where --paper-muted is a wash, not a
 * fill). The custom select names its full label on hover. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const css = read('assets/design-2026.css');
const sel = read('assets/kiwi-select.js');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const block = (re) => (css.match(re) || [])[1] || '';
const sheet = block(/html:not\(\.kiwi-native\) body\.design-2026 :is\(\.kiwi-modal\.kiwi-modal\.kiwi-modal, \.kiwi-drawer\.kiwi-drawer\.kiwi-drawer\) \{([^}]*)\}/);
const menu = block(/html:not\(\.kiwi-native\) body\.design-2026 \.kiwi-menu\.kiwi-menu\.kiwi-menu \{([^}]*)\}/);
const dark = block(/html\[data-theme="dark"\]:not\(\.kiwi-native\) body\.design-2026 :is\(\.kiwi-modal[^)]*\.kiwi-menu[^)]*\) \{([^}]*)\}/);
ok(/background: var\(--paper\) !important/.test(sheet), 'modals and drawers paint --paper');
ok(/backdrop-filter: none !important/.test(sheet), 'modals and drawers draw no blur of the page behind');
ok(/background: var\(--paper\) !important/.test(menu) && /backdrop-filter: none !important/.test(menu), 'menus are opaque too');
ok(/color-mix\(in srgb, var\(--ink\) 7%, var\(--paper\)\)/.test(dark), 'dark sheets mix two opaque tokens');
ok(!/--paper-muted/.test(dark), 'dark sheets never use --paper-muted (a wash under Vexel)');
ok(!/:is\([^)]*\.kiwi-modal[^)]*\)\s*\{[^}]*g-fill-strong/.test(css), 'no sheet falls back to the glass fill');
ok(!/\.kiwi-modal input/.test(css), 'fields inside a sheet are not blurred either');
ok(/body\.design-vexel :is\(\.kiwi-modal, \.kiwi-drawer\) \.kiwi-select-trigger \{ background: var\(--paper-muted\); \}/.test(css), 'a select inside a sheet matches the filled fields beside it');
ok(/The native app keeps its own/.test(css), 'the native app keeps its own sheet colours');
ok(/control\.trigger\.title = label\.textContent/.test(sel), 'a truncated select label is readable on hover');

const dash = read('dashboard.html');
ok(/assets\/design-2026\.css\?v=\d+/.test(dash), 'design-2026.css is stamped on the dashboard');
console.log(`✓ sheet opacity: ${n} checks`);
