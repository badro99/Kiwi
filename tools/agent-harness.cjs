'use strict';
/* The assistant in Node: assets/agent.js and its data, features and truth
 * modules run against a small DOM shim, with the merchant's world injected
 * as window globals (venue, sales, clients, team, hours...). Shared by the
 * release gate (tools/agent-test.js) and the paraphrase bench
 * (tools/agent-bench-test.mjs) so both load the assistant the same way. */
const coreTestSource = require('./core-test-source.cjs');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AGENT = path.join(ROOT, 'assets', 'agent.js');
const DATA = path.join(ROOT, 'assets', 'agent-data.js');
const FEATURES = path.join(ROOT, 'assets', 'agent-features.js');
const TRUTH = path.join(ROOT, 'assets', 'agent-truth.js');

/* ── DOM shim ─────────────────────────────────────────────────────────────
 * Enough of a browser for agent.js to define itself. It never opens the UI
 * here, so the shim only has to survive module top-level. */
function makeCtx(opts) {
  opts = opts || {};
  const noop = () => {};
  const el = () => {
    const e = {
      dataset: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      addEventListener: noop, removeEventListener: noop, appendChild: noop, insertAdjacentHTML: noop,
      querySelectorAll: () => [], setAttribute: noop, getAttribute: () => null, textContent: '', innerHTML: '',
      focus: noop, scrollTop: 0, scrollHeight: 0,
    };
    e.querySelector = () => e;
    return e;
  };
  const document = {
    readyState: 'complete', documentElement: el(), head: el(), body: el(),
    createElement: () => el(), querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, getElementById: () => null,
  };
  const store = Object.assign({}, opts.store);
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] != null ? Object.keys(store)[i] : null,
  };
  Object.defineProperty(localStorage, 'length', { get: () => Object.keys(store).length });
  const window = {
    document, localStorage, addEventListener: noop, setTimeout: () => 0,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    KiwiI18n: { getLang: () => opts.lang || 'fr' },
  };
  if (opts.venue) window.KiwiVenue = opts.venue;
  if (opts.env) window.KiwiEnv = opts.env;
  if (opts.sales) window.KiwiSales = opts.sales;
  if (opts.role) window.__kiwiRole = opts.role;
  Object.keys(opts.globals || {}).forEach((k) => { window[k] = opts.globals[k]; });
  window.window = window;
  const ctx = {
    window, document, localStorage, console,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    navigator: { language: 'fr-FR', userAgent: 'node' },
    location: { href: 'https://kiwi-maroc.pages.dev/dashboard.html', search: '' },
    fetch: () => Promise.reject(new Error('no network in the gate')),
  };
  ctx.globalThis = ctx;
  return ctx;
}

const CORPUS = path.join(ROOT, 'tools', 'agent-corpus.js');

function load(opts) {
  const ctx = makeCtx(opts);
  vm.createContext(ctx);
  /* The full merchant corpus — 1 100 questions in fr / en / ar / darija. No
   * page loads it (it would cost a merchant a download for nothing), so the
   * gate is the only place it ever runs. runEval() picks it up off the window
   * automatically when it is there. */
  if (opts.corpus !== false && fs.existsSync(CORPUS)) vm.runInContext(coreTestSource.readFileSync(CORPUS, 'utf8'), ctx, { filename: 'agent-corpus.js' });
  vm.runInContext(coreTestSource.readFileSync(DATA, 'utf8'), ctx, { filename: 'agent-data.js' });
  vm.runInContext(coreTestSource.readFileSync(FEATURES, 'utf8'), ctx, { filename: 'agent-features.js' });
  vm.runInContext(coreTestSource.readFileSync(TRUTH, 'utf8'), ctx, { filename: 'agent-truth.js' });
  vm.runInContext(coreTestSource.live(AGENT), ctx, { filename: 'agent.js' });
  return ctx.window;
}

const strip = (s) => String(s == null ? '' : s)
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
function flatten(r) {
  if (r == null) return '[[LLM]]';
  const out = [];
  if (r.text) out.push(strip(r.text));
  (r.stats || []).forEach((s) => out.push(`${strip(s.l)}: ${strip(s.v)} (${strip(s.h)})`));
  if (r.verdict) out.push(strip(r.verdict.text));
  if (r.note) out.push(strip(r.note));
  return out.join('\n');
}
/* Every integer in a rendered answer, thousands separators folded away. NBSP
 * and narrow-NBSP are what toLocaleString('fr-FR') actually emits. */
function numbersIn(text) {
  return (String(text).match(/\d[\d    .]*\d|\d/g) || [])
    .map((s) => parseFloat(s.replace(/[    .]/g, '')))
    .filter((n) => isFinite(n));
}


module.exports = { ROOT, AGENT, DATA, FEATURES, TRUTH, CORPUS, makeCtx, load, strip, flatten, numbersIn };
