#!/usr/bin/env node
/* Audit design-2026-10 · "Delete my account" sat in the cashier's menu.
 *
 * The till and the team app run on a shared counter device. Account-level
 * actions (delete the account, Kiwi AI privacy, leave the demo) belong to the
 * owner's dashboard, which is also where App Store 5.1.1(v) is met.
 *
 * mountNativeAccountGroup is executed for real (sliced out of
 * app/src/native-runtime.js) against a tiny DOM double.
 *   node tools/native-account-scope-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNativeRuntime } from './native-runtime-source.mjs';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readNativeRuntime(ROOT);
const css = readFileSync(path.join(ROOT, 'app/src/native-runtime.css'), 'utf8');
let n = 0;
const ok = (name, fn) => { try { fn(); n++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };

const slice = (from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a); assert.ok(a > 0 && b > a, 'slice ' + from); return src.slice(a, b); };
const code = [
  slice('function nativeMenuCopy()', 'function closeNativeMenus()'),
  slice('function mountNativeAccountGroup(', 'function nativeMenuButton('),
].join('\n');

function mount(lang, demo, scope) {
  const container = { box: null, querySelector() { return null; }, appendChild(b) { this.box = b; } };
  const el = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener() {}, set innerHTML(v) { this.html = v; } });
  const ctx = {
    root: { lang }, document: { createElement: el }, window: { KiwiEnv: { isReal: () => !demo } },
    hapticLight() {}, closeNativeMenus() {}, nativeSheetAvailable: () => false, nativeSheet() {}, signOutCopy() {}, nativeWorkspaceAction() {},
  };
  vm.runInNewContext(code + '\nmountNativeAccountGroup(container, null, scope);', { ...ctx, container, scope });
  return [...container.box.html.matchAll(/data-kno-account="([^"]+)"/g)].map((m) => m[1]);
}

for (const lang of ['fr', 'en', 'ar']) {
  ok(`${lang} · owner drawer keeps the full account group (deletion stays reachable for 5.1.1(v))`, () =>
    assert.deepEqual(mount(lang, false, 'owner'), ['change-role', 'sign-out', 'ai-privacy', 'delete-account']));
  ok(`${lang} · till / team drawer (no scope) has change role + sign out only`, () =>
    assert.deepEqual(mount(lang, false), ['change-role', 'sign-out']));
  ok(`${lang} · shared device in the demo has no "Leave the demo", change role stays`, () =>
    assert.deepEqual(mount(lang, true), ['change-role']));
  ok(`${lang} · owner in the demo still can leave it and sees the deletion explainer`, () =>
    assert.deepEqual(mount(lang, true, 'owner'), ['change-role', 'sign-out', 'ai-privacy', 'delete-account']));
}
ok('only the dashboard drawer asks for the owner scope', () => {
  const calls = [...src.matchAll(/mountNativeAccountGroup\(([^;]*)\)/g)].map((m) => m[1]).filter((a) => !a.startsWith('container'));
  const owners = calls.filter((a) => /'owner'/.test(a));
  assert.equal(owners.length, 1, 'owner calls: ' + owners.length);
  assert.match(owners[0], /merchant-logout/);
});
ok('the iPad (min-width:601px) account group is still styled for the owner drawer', () => {
  const wide = css.slice(css.indexOf('@media (min-width:601px)'));
  assert.match(wide, /\.kno-account button\{/);
  assert.match(wide, /\.kno-account \.is-danger\{/);
});
console.log(`\n${n} checks`);
