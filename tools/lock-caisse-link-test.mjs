#!/usr/bin/env node
/* Ticket #0147 follow-up · the dashboard PIN screen on the WEB keeps a direct
 * way into the caisse ("Ouvrir la caisse"); the native app hides it because
 * "Change role" already does that job there.
 *   node tools/lock-caisse-link-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
const i18n = readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8');
let passed = 0, failed = 0;
function ok(label, fn) { try { fn(); passed++; console.log(`  ✓ ${label}`); } catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); } }
const lock = html.slice(html.indexOf('data-kiwi-lock'), html.indexOf('One-time greeting flash'));
ok('the PIN lock links straight to the caisse', () => assert.match(lock, /<a class="kiwi-lock-switch kiwi-lock-caisse" href="kiwi-caisse\.html"/));
ok('the link is a real <a> (works even if JS is dead) and labelled', () => assert.match(lock, /kiwi-lock-caisse"[^>]*aria-label="Ouvrir la caisse"/));
ok('the native app hides it (Change role covers it there)', () => assert.match(html, /html\.kiwi-native \.kiwi-lock-caisse \{ display: none !important; \}/));
ok('the floating launcher is still kept off the gate', () => assert.match(readFileSync(path.join(ROOT, 'assets/caisse-link.js'), 'utf8'), /!force && !dashReady\(\)/));
ok('EN and AR strings exist', () => assert.equal((i18n.match(/'dash\.lock\.caisse'/g) || []).length, 2));
console.log(`\nlock-caisse-link: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
