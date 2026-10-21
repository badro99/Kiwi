#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
/* Audit design-2026-10 · the opening float was pre-selected at 500 MAD, so one
 * tap on "Open till" recorded 500 whatever was in the drawer.
 *
 * The float block of kiwi-caisse.html is executed for real (sliced out of the
 * page) against a DOM double, in the demo AND on a real store. The two
 * métier clock-in screens (assets/pos-boutique.js, assets/pos-maison.js) are
 * checked at the source: nothing pre-selected, button disabled until chosen.
 *   node tools/clockin-float-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = caisseTestSource(R('kiwi-caisse.html')).replace(/<link rel="stylesheet" href="assets\/caisse-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + R('assets/caisse-shell.css') + '</style>');
let n = 0;
const ok = (name, fn) => { try { fn(); n++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };

/* ── markup ─────────────────────────────────────────────────────────────── */
ok('till: no chip is active in the template', () => assert.ok(!/class="ci-float-chip is-active"/.test(html)));
ok('till: "Open till" starts disabled and points at the hint', () => assert.match(html, /<button class="clockin-btn" id="clockin-btn" disabled aria-describedby="ci-float-err">/));
ok('till: a disabled style exists', () => assert.match(html, /\.clockin-btn:disabled[^{]*\{[^}]*not-allowed/));
for (const f of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
  const src = R(f);
  ok(`${f}: no chip pre-selected`, () => assert.ok(!/ci-float-chip is-active/.test(src)));
  ok(`${f}: "Open till" starts disabled`, () => assert.match(src, /id="bqci-btn" disabled/));
  ok(`${f}: opening is refused until a float is chosen`, () => assert.match(src, /if \(!chosen\) \{ gate\(\); return; \}/));
  ok(`${f}: no 500 fallback`, () => assert.ok(!/bqFloat = 500|\|\| 500/.test(src)));
}

/* ── behaviour of the till's float block ────────────────────────────────── */
const a = html.indexOf('    function floatMemKey() {');
const b = html.indexOf('    /* Clôture cash-count écart */', a);
assert.ok(a > 0 && b > a);
const block = html.slice(a, b);

function world({ real, saved, operator = false }) {
  const mk = (extra) => Object.assign({ hidden: false, disabled: false, dataset: {}, attrs: {}, listeners: {}, classes: new Set(),
    addEventListener(ev, fn) { this.listeners[ev] = fn; }, setAttribute(k, v) { this.attrs[k] = v; },
    classList: null, focus() {}, select() {}, blur() {} }, extra);
  const els = {
    chips: mk(), custom: mk({ hidden: true }), input: mk({ value: '' }), last: mk({ hidden: true }), err: mk(), btn: mk({ disabled: true }),
  };
  const chipNodes = ['300', '500', '1000', 'custom'].map((v) => { const c = mk({ dataset: { float: v } }); c.classList = { toggle: (cls, on) => { on ? c.classes.add(cls) : c.classes.delete(cls); }, contains: (cls) => c.classes.has(cls) }; return c; });
  els.chips.querySelector = (sel) => { const m = /data-float="([^"]+)"/.exec(sel); return m ? chipNodes.find((c) => c.dataset.float === m[1]) || null : null; };
  els.btn.classList = { contains: () => false, add() {} };
  const byId = { 'ci-float-chips': els.chips, 'ci-float-custom': els.custom, 'ci-float-input': els.input, 'ci-float-last': els.last, 'ci-float-err': els.err, 'clockin-btn': els.btn };
  const store = saved == null ? {} : { 'kiwi:openingFloat:v1:demo': String(saved) };
  const ctx = {
    parseFloat, parseInt, Number, String, document: { getElementById: (id) => byId[id] || null, addEventListener() {} },
    $: (sel) => byId[sel.replace('#', '')] || null,
    $$: () => chipNodes,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    storePaired: () => null, storeIsReal: () => real, operatorCaisseRequested: () => operator,
    openingFloat: 500,
  };
  vm.createContext(ctx);
  vm.runInContext(`${block}\nthis.__get = () => ({ openingFloat, floatChosen });`, ctx);
  return { ctx, els, chipNodes, state: () => ctx.__get(), click: (el, target) => el.listeners.click({ target: { closest: () => target } }) };
}

for (const real of [false, true]) {
  const label = real ? 'real store' : 'demo';
  ok(`${label}: nothing selected, float 0, "Open till" disabled, hint visible`, () => {
    const w = world({ real });
    assert.equal(w.state().openingFloat, 0);
    assert.equal(w.state().floatChosen, false);
    assert.ok(w.chipNodes.every((c) => !c.classes.has('is-active')));
    assert.equal(w.els.btn.disabled, true);
    assert.equal(w.els.err.hidden, false);
  });
  ok(`${label}: picking a preset enables the button and records that amount`, () => {
    const w = world({ real });
    w.click(w.els.chips, w.chipNodes[1]);
    assert.equal(w.state().openingFloat, 500);
    assert.equal(w.els.btn.disabled, false);
    assert.equal(w.els.err.hidden, true);
  });
  ok(`${label}: typing an amount enables it, clearing it disables it again`, () => {
    const w = world({ real });
    w.click(w.els.chips, w.chipNodes[3]);
    assert.equal(w.els.btn.disabled, true, '"Other" alone commits nothing');
    w.els.input.value = '750'; w.els.input.listeners.input();
    assert.equal(w.state().openingFloat, 750);
    assert.equal(w.els.btn.disabled, false);
    w.els.input.value = ''; w.els.input.listeners.input();
    assert.equal(w.els.btn.disabled, true);
    assert.equal(w.els.err.hidden, false);
  });
  ok(`${label}: 0 typed on purpose is a valid float`, () => {
    const w = world({ real });
    w.click(w.els.chips, w.chipNodes[3]);
    w.els.input.value = '0'; w.els.input.listeners.input();
    assert.equal(w.els.btn.disabled, false);
    assert.equal(w.state().openingFloat, 0);
  });
  ok(`${label}: a remembered float is only a shortcut, never taken for you`, () => {
    const w = world({ real, saved: 750 });
    assert.equal(w.state().floatChosen, false);
    assert.equal(w.state().openingFloat, 0);
    assert.equal(w.els.btn.disabled, true);
    assert.equal(w.els.last.hidden, false);
    w.els.last.listeners.click();
    assert.equal(w.state().openingFloat, 750);
    assert.equal(w.els.btn.disabled, false);
  });
}
ok('support mode (resuming an open service) keeps the button usable', () => {
  const w = world({ real: true, operator: true });
  assert.equal(w.els.btn.disabled, false);
});
ok('openService refuses to open on a demo too without a chosen float', () => {
  const m = /function openService\(\) \{[\s\S]*?\n    \}\n/.exec(html);
  assert.ok(m);
  assert.match(m[0], /if \(!floatChosen\) \{[\s\S]*?return;/);
  assert.ok(!/storeIsReal\(\) && !floatChosen/.test(m[0]));
});
console.log(`\n${n} checks`);
