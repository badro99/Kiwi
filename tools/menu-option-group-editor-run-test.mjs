#!/usr/bin/env node
/* Menu · l'éditeur de groupe d'options TOURNE (vague 12).
 *
 * tools/menu-option-group-editor-test.mjs découpait la source et la lisait par
 * expressions régulières : l'éditeur n'était jamais exécuté. Ici openGroup() et
 * emojiPicker() de assets/restaurant-menu-workspace.js sont chargés tels quels
 * dans vm ; seuls les collaborateurs (le DOM, le magasin S(), la fenêtre
 * modale) sont des doubles qui enregistrent ce que l'éditeur leur fait.
 *   node tools/menu-option-group-editor-run-test.mjs
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import menuWorkspaceSource from './menu-workspace-test-source.cjs';
import { declaration } from './js-declarations.cjs';

const src = menuWorkspaceSource();
const slice = (from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); return src.slice(a, src.indexOf(to, a + from.length)); };
const openGroupSrc = slice('  function openGroup(g){', '  function groupStyle(){');
const pickerSrc = slice('  function emojiPicker(button){', '  function choiceRow(c){');
const choiceRowSrc = declaration(src.slice(src.indexOf('  function choiceRow(c){')), 'choiceRow');
const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const ui = (k) => k;
const plain = (v) => JSON.parse(JSON.stringify(v));   // objects built inside vm have another realm's prototypes
const itSvg = (n) => `<svg data-icon="${n}"/>`;

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* ── un formulaire de doubles, que l'éditeur lit et écrit comme un vrai ───── */
function classList() { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, on) => { if (on) s.add(c); else s.delete(c); }, has: (c) => s.has(c) }; }
function makeRow(id = '', name = '', price = '', emoji = '') {
  const row = { dataset: { id }, removed: false, remove() { this.removed = true; } };
  row.name = { value: name, attrs: {}, focused: 0, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() { this.focused++; }, matches: (s) => s === '[data-choice-name]' };
  row.price = { value: String(price) };
  row.emoji = { dataset: { value: emoji }, innerHTML: '', classList: classList() };
  return row;
}
function harness({ group = null, rows = [], kind, required } = {}) {
  const writes = [];
  const state = { kind: kind || (group && group.kind === 'many' ? 'many' : 'one'), req: required != null ? (required ? '1' : '0') : (group && group.required ? '1' : '0') };
  const form = { rows: rows.length ? rows : [makeRow()], errs: {}, errEls: {}, rule: { textContent: '' }, nameEl: null, listeners: {}, focusedName: 0 };
  form.nameEl = { value: group ? group.name : '', attrs: {}, focus() { form.focusedName++; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, matches: () => false };
  // Rows know their live neighbours, like DOM siblings: deleting a choice hands the focus to the next one.
  const sibling = (row, step) => { const live = form.rows.filter((r) => !r.removed), i = live.indexOf(row); return i < 0 ? null : live[i + step] || null; };
  const link = (row) => Object.defineProperties(row, { nextElementSibling: { get: () => sibling(row, 1), configurable: true }, previousElementSibling: { get: () => sibling(row, -1), configurable: true } });
  form.rows.forEach(link);
  const wrap = { insertAdjacentHTML(_w, html) { wrap.added = (wrap.added || 0) + 1; wrap.lastHtml = html; form.rows.push(link(makeRow())); }, get lastElementChild() { return form.rows.at(-1); }, onclick: null };
  const button = {}, cancel = {}, add = {};
  const segEls = { kind: { classList: classList() }, req: { classList: classList() } };
  let closed = 0, rendered = 0, modalArgs = null;
  const errEl = (k) => (form.errEls[k] ||= { textContent: '', hidden: true });
  const $ = (sel, root) => {
    if (sel === '[data-choices]') return wrap;
    if (sel === '[data-name]') return form.nameEl;
    if (sel === '[data-save]') return button;
    if (sel === '[data-cancel]') return cancel;
    if (sel === '[data-choice-add]') return add;
    if (sel === '[data-og-rule]') return form.rule;
    const radio = /^input\[name="rmw-og-(\w+)"\]:checked$/.exec(sel);
    if (radio) return { value: state[radio[1]] };
    const err = /^\[data-og-err="(\w+)"\]$/.exec(sel);
    if (err) return errEl(err[1]);
    if (sel === '[data-choice-name]') return root === wrap ? form.rows[0].name : root.name;
    if (sel === '[data-choice-price]') return root.price;
    if (sel === '[data-emoji-btn]') return root.emoji;
    if (sel === '[data-choice-name]') return root.name;
    return null;
  };
  const $$ = (sel, root) => {
    if (sel === '[data-choice]') return form.rows.filter((r) => !r.removed);
    if (sel === '[data-choice-name][aria-invalid="true"]') return form.rows.filter((r) => !r.removed && r.name.attrs['aria-invalid'] === 'true').map((r) => r.name);
    if (sel === '.rmw-og-segi') return [];
    return [];
  };
  const el = { classList: classList(), addEventListener(type, fn) { form.listeners[type] = fn; } };
  const calls = [];
  const S = () => new Proxy({}, { get: (_t, name) => (...a) => { calls.push([name, ...a]); if (name === 'addOptGroup') return 'created'; return undefined; } });
  const D = () => ({ opts: [{ id: 'g-new' }] });
  const ctx = {
    recipeStyle() {}, itemStyle() {}, groupStyle() {}, esc, ui, itSvg, S, D, $, $$,
    render() { rendered++; },
    modal(opts) { modalArgs = opts; return { el, close() { closed++; } }; },
    choiceRow: vm.runInNewContext(`(function(){ ${choiceRowSrc}; return choiceRow; })()`, { esc, ui, itSvg }),
    emojiPicker() {}, setTimeout() {},
    HTMLElement: function () {},
  };
  vm.runInNewContext(`${openGroupSrc}\nthis.__open = openGroup;`, ctx);
  ctx.__open(group);
  return { form, calls, button, cancel, add, wrap, state, modalArgs: () => modalArgs, closed: () => closed, rendered: () => rendered, errEl, rows: form.rows };
}

console.log('option groups · the editor runs');

await ok('the sheet renders both rules as radio groups, the rule sentence first says one choice, optional', () => {
  const h = harness();
  const body = h.modalArgs().body;
  assert.match(body, /data-og-seg="kind"[\s\S]*value="one" checked[\s\S]*value="many"/);
  assert.match(body, /data-og-seg="req"[\s\S]*value="0" checked[\s\S]*value="1"/);
  assert.ok(!/<select/.test(body), 'no select left');
  assert.equal(h.form.rule.textContent, 'ogRuleOneOpt');
  assert.match(body, /<div class="rmw-og-cols" aria-hidden="true"><span>ogMark<\/span><span>ogChoiceName<\/span><span>ogSupplement<\/span>/, 'choice columns are named');
  assert.match(body, /data-choice-price value="" placeholder="0" aria-label="ogSupplement"/, 'the supplement starts empty, not 0');
});
await ok('each of the four kind and requirement combinations says its own sentence when changed', () => {
  const expected = { 'one|0': 'ogRuleOneOpt', 'one|1': 'ogRuleOneReq', 'many|0': 'ogRuleManyOpt', 'many|1': 'ogRuleManyReq' };
  for (const [combo, sentence] of Object.entries(expected)) {
    const [kind, req] = combo.split('|');
    const h = harness();
    h.state.kind = kind; h.state.req = req;
    h.form.listeners.change({ target: { closest: (s) => (s === '[data-og-seg]' ? { } : null) } });
    assert.equal(h.form.rule.textContent, sentence, combo);
  }
});
await ok('an existing group opens with its own kind and requirement', () => {
  const h = harness({ group: { id: 'g1', name: 'Lait', kind: 'many', required: true, choices: [] } });
  assert.match(h.modalArgs().body, /value="many" checked/); assert.match(h.modalArgs().body, /value="1" checked/);
  assert.equal(h.form.rule.textContent, 'ogRuleManyReq');
});
await ok('« Enregistrer » with an empty name answers under the field, takes the focus and writes nothing', () => {
  const h = harness();
  h.button.onclick();
  assert.equal(h.errEl('name').textContent, 'ogNameRequired'); assert.equal(h.errEl('name').hidden, false);
  assert.equal(h.form.nameEl.attrs['aria-invalid'], 'true'); assert.equal(h.form.focusedName, 1);
  assert.deepEqual(h.calls, []); assert.equal(h.closed(), 0);
});
await ok('a name but no named choice says so and focuses the choice; a priced choice without a name is flagged, not dropped', () => {
  let h = harness({ group: null }); h.form.nameEl.value = 'Extras';
  h.button.onclick();
  assert.equal(h.errEl('choices').textContent, 'ogChoicesRequired'); assert.equal(h.form.rows[0].name.focused, 1); assert.deepEqual(h.calls, []);
  h = harness({ rows: [makeRow('', '', '2.5', ''), makeRow('', 'Lait', '', '')] }); h.form.nameEl.value = 'Extras';
  h.button.onclick();
  assert.equal(h.errEl('choices').textContent, 'ogChoiceUnnamed'); assert.equal(h.form.rows[0].name.attrs['aria-invalid'], 'true');
  assert.equal(h.form.rows[1].name.attrs['aria-invalid'], undefined); assert.deepEqual(h.calls, []);
});
await ok('creating a group writes the name, then kind and requirement, then every named choice with its price (no row element)', () => {
  const h = harness({ rows: [makeRow('', 'Lait', '1.5', '🥛'), makeRow('', '', '', ''), makeRow('', 'Avoine', '', '')], kind: 'many', required: true });
  h.form.nameEl.value = '  Lait  ';
  h.button.onclick();
  assert.deepEqual(plain(h.calls), [
    ['addOptGroup', 'Lait'], ['updateOptGroup', 'g-new', { kind: 'many', required: true }],
    ['addOptChoice', 'g-new', 'Lait', 1.5, '🥛'], ['addOptChoice', 'g-new', 'Avoine', 0, ''],
  ]);
  assert.equal(h.closed(), 1); assert.equal(h.rendered(), 1);
});
await ok('editing patches a saved choice with its fields only, adds a new one, and deletes the ones removed from the sheet', () => {
  const group = { id: 'g1', name: 'Lait', kind: 'one', required: false, choices: [{ id: 'c1' }, { id: 'c2' }] };
  const h = harness({ group, rows: [makeRow('c1', 'Soja', '2', ''), makeRow('', 'Amande', '-4', '')], kind: 'one', required: true });
  h.button.onclick();
  assert.deepEqual(plain(h.calls), [
    ['updateOptGroup', 'g1', { name: 'Lait', kind: 'one', required: true }],
    ['deleteOptChoice', 'g1', 'c2'],
    ['updateOptChoice', 'g1', 'c1', { name: 'Soja', price: 2, emoji: '' }],
    ['addOptChoice', 'g1', 'Amande', 0, ''],
  ]);
  assert.ok(!JSON.stringify(h.calls).includes('"el"'), 'the row element is never sent to the store');
});
await ok('typing a name clears its error; typing a choice name clears the choice errors', () => {
  const h = harness();
  h.button.onclick();
  assert.equal(h.errEl('name').hidden, false);
  h.form.nameEl.value = 'Extras';
  h.form.listeners.input({ target: h.form.nameEl });
  assert.equal(h.errEl('name').hidden, true); assert.equal(h.form.nameEl.attrs['aria-invalid'], undefined);
  const flagged = makeRow('', '', '3', ''), fine = makeRow('', 'Lait', '', '');
  const h2 = harness({ rows: [flagged, fine] }); h2.form.nameEl.value = 'Extras';
  h2.button.onclick();
  assert.equal(h2.errEl('choices').hidden, false); assert.equal(flagged.name.attrs['aria-invalid'], 'true');
  flagged.name.value = 'Soja';
  h2.form.listeners.input({ target: flagged.name });
  assert.equal(flagged.name.attrs['aria-invalid'], undefined); assert.equal(h2.errEl('choices').hidden, true);
});
await ok('removing a choice drops its row and hands the focus to its neighbour; the only choice is cleared in place and refocused', () => {
  const h = harness({ rows: [makeRow('c1', 'Lait', '1'), makeRow('c2', 'Soja', '2'), makeRow('c3', 'Avoine', '3')] });
  const [first, second, third] = h.rows;
  const del = (row) => ({ target: { closest: (s) => (s === '[data-choice-del]' ? { closest: () => row } : null) } });
  h.wrap.onclick(del(third));
  assert.equal(third.removed, true); assert.equal(second.name.focused, 1, 'the last row gone, the focus goes to the one above');
  h.wrap.onclick(del(first));
  assert.equal(first.removed, true); assert.equal(second.name.focused, 2, 'the first row gone, the focus goes to the one below');
  h.wrap.onclick(del(second));
  assert.equal(second.removed, false); assert.equal(second.dataset.id, ''); assert.equal(second.name.value, ''); assert.equal(second.price.value, '');
  assert.equal(second.name.focused, 3);
});
await ok('adding a choice appends a blank row and focuses its name', () => {
  const h = harness();
  h.add.onclick();
  assert.equal(h.wrap.added, 1); assert.match(h.wrap.lastHtml, /data-choice-name/); assert.equal(h.rows.at(-1).name.focused, 1);
});

/* ── le sélecteur de repère ───────────────────────────────────────────────── */
function picker({ rect, size, win = { w: 400, h: 800 }, emojis = ['🥛', '<b>'] }) {
  const listeners = { pointerdown: [], keydown: [] }, timers = [];
  const popups = [];
  const body = { appendChild(p) { popups.push(p); } };
  const document = {
    createElement() {
      const p = { style: {}, attrs: {}, removed: false, setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; }, contains(t) { return t === p; },
        offsetWidth: size.w, offsetHeight: size.h, querySelector() { return { focus() { p.focused = 1; } }; } };
      Object.defineProperty(p, 'innerHTML', { set(v) { p.html = v; }, get() { return p.html; } });
      return p;
    },
    body, addEventListener: (t, f) => listeners[t].push(f), removeEventListener: (t, f) => { listeners[t] = listeners[t].filter((x) => x !== f); },
  };
  const button = { dataset: {}, innerHTML: '', classList: classList(), focused: 0, getBoundingClientRect: () => rect, focus() { this.focused++; }, contains: (t) => t === button };
  const ctx = { $$: () => [], S: () => ({ optionEmojis: () => emojis }), document, ui, esc, itSvg, innerWidth: win.w, innerHeight: win.h, setTimeout: (f) => timers.push(f) };
  vm.runInNewContext(`${pickerSrc}\nthis.__pick = emojiPicker;`, ctx);
  ctx.__pick(button);
  timers.forEach((f) => f());
  return { p: popups[0], button, listeners };
}
await ok('the marker picker stays on screen: clamped to the left edge, to the right edge, and flipped above when there is no room below', () => {
  assert.equal(picker({ rect: { left: -50, bottom: 100, top: 60 }, size: { w: 200, h: 120 } }).p.style.left, '8px');
  assert.equal(picker({ rect: { left: 390, bottom: 100, top: 60 }, size: { w: 200, h: 120 } }).p.style.left, '192px');
  assert.equal(picker({ rect: { left: 100, bottom: 100, top: 60 }, size: { w: 200, h: 120 } }).p.style.top, '106px');
  assert.equal(picker({ rect: { left: 100, bottom: 760, top: 720 }, size: { w: 200, h: 120 } }).p.style.top, String(720 - 6 - 120) + 'px');
});
await ok('the marker picker is a labelled dialog, says « no marker » in the user language, and escapes every emoji it prints', () => {
  const { p } = picker({ rect: { left: 10, bottom: 10, top: 0 }, size: { w: 100, h: 50 } });
  assert.equal(p.attrs.role, 'dialog'); assert.equal(p.attrs['aria-label'], 'ogMarkPick');
  assert.match(p.html, /class="rmw-none">ogNoMark</);
  assert.ok(p.html.includes('data-emoji="&lt;b&gt;">&lt;b&gt;<'), 'markup in an emoji is escaped'); assert.ok(!p.html.includes('<b>'));
  assert.equal(p.focused, 1, 'the first button takes the focus');
});
await ok('Escape closes the picker without reaching the sheet and returns the focus; a click away closes it; a click on it does not', () => {
  let r = picker({ rect: { left: 10, bottom: 10, top: 0 }, size: { w: 100, h: 50 } });
  let stopped = 0;
  r.listeners.keydown[0]({ key: 'Escape', stopPropagation() { stopped++; } });
  assert.equal(r.p.removed, true); assert.equal(stopped, 1); assert.equal(r.button.focused, 1);
  assert.equal(r.listeners.keydown.length + r.listeners.pointerdown.length, 0, 'both listeners are released');
  r = picker({ rect: { left: 10, bottom: 10, top: 0 }, size: { w: 100, h: 50 } });
  r.listeners.pointerdown[0]({ target: r.p }); assert.equal(r.p.removed, false);
  r.listeners.pointerdown[0]({ target: {} }); assert.equal(r.p.removed, true);
});
await ok('picking a marker writes it on the button, a blank pick clears it, and the picker closes', () => {
  const r = picker({ rect: { left: 10, bottom: 10, top: 0 }, size: { w: 100, h: 50 } });
  r.p.onclick({ target: { closest: () => ({ dataset: { emoji: '🥛' } }) } });
  assert.equal(r.button.dataset.value, '🥛'); assert.equal(r.button.innerHTML, '🥛'); assert.equal(r.p.removed, true);
  const r2 = picker({ rect: { left: 10, bottom: 10, top: 0 }, size: { w: 100, h: 50 } });
  r2.p.onclick({ target: { closest: () => ({ dataset: { emoji: '' } }) } });
  assert.equal(r2.button.dataset.value, ''); assert.match(r2.button.innerHTML, /data-icon="add"/);
});

console.log(`\nmenu-option-group-editor-run: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
