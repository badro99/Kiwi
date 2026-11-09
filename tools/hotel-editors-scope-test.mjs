#!/usr/bin/env node
/* The hotel section factories receive `scope`, the shared owner state
 * (openModal, openDrawer, …). A local `const scope = cuStayScope()` shadows it
 * with the hotel slug, a string: `scope.openModal = …` then throws in strict
 * mode and `scope.openDrawer` is always undefined. That broke the dossier /
 * pré-facture modal and the monthly production page in production (9 Nov 2026).
 * The other hotel suites run the reassembled original monolith, where
 * openModal was a closure variable, so they could not see it. This suite runs
 * the live factory file, and statically refuses the pattern in every hotel
 * factory. Optional argv[2]: another editors.js to run (to prove the red). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

/* 1. Static: no function that declares its own `scope` reads a property through it. */
{
  const files = [
    ...fs.readdirSync(new URL('assets/hotel/', root)).filter(f => f.endsWith('.js')).map(f => 'assets/hotel/' + f),
    ...fs.readdirSync(new URL('assets/', root)).filter(f => /^hotel-.*\.js$/.test(f)).map(f => 'assets/' + f),
    ...fs.readdirSync(new URL('assets/hotel-core/', root)).filter(f => f.endsWith('.js')).map(f => 'assets/hotel-core/' + f),
  ];
  assert.ok(files.includes('assets/hotel/editors.js') && files.length > 10, 'hotel factory files found');
  const offenders = [];
  for (const file of files) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'scope') {
        let block = node.parent;
        while (block && !ts.isBlock(block) && !ts.isSourceFile(block)) block = block.parent;
        const scan = (n) => {
          if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && ts.isIdentifier(n.expression) && n.expression.text === 'scope') {
            const { line } = ast.getLineAndCharacterOfPosition(n.getStart(ast));
            offenders.push(`${file}:${line + 1} ${n.getText(ast).slice(0, 60)}`);
          }
          ts.forEachChild(n, scan);
        };
        if (block) scan(block);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  assert.deepEqual(offenders, [], 'a local `scope` shadows the factory state object; name the hotel token `stayScope`');
}

/* 2. Runtime: the live editors factory, with the production shape of its inputs. */
const editorsFile = process.argv[2] || 'assets/hotel/editors.js';
const source = fs.readFileSync(editorsFile.startsWith('/') ? editorsFile : new URL(editorsFile, root), 'utf8');

function fakeEl(nodes = {}) {
  return {
    innerHTML: '', textContent: '', isConnected: true, scrollTop: 0, scrollLeft: 0,
    removeAttribute() {}, setAttribute() {}, closest() { return null; }, querySelectorAll() { return []; },
    querySelector(sel) { return nodes[sel] ?? null; },
  };
}

function load({ fetch }) {
  let activeHotel = 'yassine';
  const state = { openModal: null, openDrawer: null, cuOccupancyMemo: null };
  const production = { request: 0, month: '2026-11', loading: false, error: '', report: null };
  const modals = [];
  const deps = {
    // Production: cuStayScope() returns the merchant slug, a string.
    cuStayScope: () => activeHotel,
    cuChannelMerchant: () => activeHotel,
    cuMerchantSlug: () => activeHotel,
    cuStayCache: () => new Map(),
    cuStaysChanged() {},
    cuProductionState: () => production,
    cuBillingBody: () => '',
    tx: (s) => s, txk: (s) => s, toast() {},
    isCustomHotel: () => false,
    K: () => ({
      modal(opts) {
        const host = fakeEl();
        const linked = { onclick: null };
        const m = { opts, closed: 0, host, el: fakeEl({ '[data-hx-dossier-body]': host, '[data-hx-linked-room]': linked }) };
        m.close = () => { m.closed++; };
        modals.push(m);
        return m;
      },
    }),
  };
  const target = {
    get openModal() { return state.openModal; }, set openModal(v) { state.openModal = v; },
    get openDrawer() { return state.openDrawer; }, set openDrawer(v) { state.openDrawer = v; },
    get cuOccupancyMemo() { return state.cuOccupancyMemo; }, set cuOccupancyMemo(v) { state.cuOccupancyMemo = v; },
    ...deps,
  };
  const scope = new Proxy(target, { get: (t, k) => (k in t ? Reflect.get(t, k) : () => '') });
  const window = {};
  const ctx = vm.createContext({ window, fetch, setTimeout, clearTimeout, AbortController, URLSearchParams, console });
  vm.runInContext(source, ctx, { filename: editorsFile });
  const api = window.__kiwiHotelSections.editors(scope);
  return { api, state, production, modals, switchHotel: (slug) => { activeHotel = slug; } };
}

const json = (ok, body) => ({ ok, status: ok ? 200 : 404, json: async () => body });

// Dossier / pré-facture: the modal registers in the owner state and shows the server's answer.
{
  const t = load({ fetch: async () => json(false, { error: 'dossier-not-found' }) });
  const previous = { el: fakeEl(), closes: 0 };
  previous.close = () => { previous.closes++; };
  t.state.openModal = previous;
  await t.api.cuOpenDossier({ id: 'b1', code: 'R-1', hotel: { dossierId: 'd1' } });
  const m = t.modals[0];
  assert.ok(m, 'dossier modal opened');
  assert.equal(previous.closes, 1, 'the previous modal is closed first');
  assert.equal(t.state.openModal.el, m.el, 'the dossier modal is the open modal');
  assert.match(m.host.textContent, /Dossier introuvable/, 'the loading line is replaced by the server answer');
}

// Production mensuelle: re-renders when the request starts and when the report lands.
{
  let release;
  const t = load({ fetch: () => new Promise((resolve) => { release = () => resolve(json(true, { month: '2026-11', groups: [], totals: [] })); }) });
  let renders = 0;
  const body = fakeEl();
  t.state.openDrawer = { page: 'production', el: fakeEl({ '.genpage-body': body }), bodyFn: () => { renders++; return 'report'; } };
  const done = t.api.cuLoadProduction();
  assert.equal(renders, 1, 'loading state painted');
  while (!release) await new Promise((r) => setTimeout(r, 0));
  release(); await done;
  assert.equal(renders, 2, 'report painted once it arrives');
  assert.equal(t.production.loading, false);
  assert.deepEqual(t.production.report.totals, []);
  assert.equal(body.innerHTML, 'report');

  // A hotel switch during the request still suppresses the late paint.
  let release2;
  const u = load({ fetch: () => new Promise((resolve) => { release2 = () => resolve(json(true, { month: '2026-11', groups: [], totals: [] })); }) });
  let renders2 = 0;
  u.state.openDrawer = { page: 'production', el: fakeEl({ '.genpage-body': fakeEl() }), bodyFn: () => { renders2++; return ''; } };
  const done2 = u.api.cuLoadProduction();
  while (!release2) await new Promise((r) => setTimeout(r, 0));
  u.switchHotel('other-hotel'); release2(); await done2;
  assert.equal(renders2, 1, 'no paint for a hotel that is no longer active');
}

// Cancel stay: the closed modal is released from the owner state.
{
  const t = load({ fetch: async () => json(true, { booking: { id: 's1', status: 'cancelled' } }) });
  const modal = { el: fakeEl(), closes: 0 };
  modal.close = () => { modal.closes++; };
  t.state.openModal = modal;
  const button = { disabled: false };
  await t.api.cuCancelStay('s1', button, modal);
  assert.equal(modal.closes, 1);
  assert.equal(t.state.openModal, null, 'openModal cleared after the cancel');
  assert.equal(button.disabled, false);
}

console.log('✓ hotel-editors-scope: dossier modal, production report and stay cancel run against the live factory with a string hotel token; no hotel factory shadows its state object');
