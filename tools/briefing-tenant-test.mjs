#!/usr/bin/env node
/* A store's morning briefing carries that store's days, never another's.
 *
 * Found in prod D1 on 2026-09-26: maison-121's briefing document held 34 days,
 * 26 of them la-maison-en-vogue's, verbatim (also mon-etablissement <-> yassine,
 * pasta-corner <-> amira-boutique). assets/briefing.js kept its in-memory
 * document across a venue switch: slug() already named the new store, the
 * next compute() (a cash-session or backfill event) prepended the new store's
 * day to the old store's days, and the lot was saved and pushed under the new
 * store. Replayed here with the real module and a recording cloud stub.
 *
 * `node tools/briefing-tenant-test.mjs`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(ROOT, 'assets/briefing.js'), 'utf8');

let passed = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail ? '\n      ' + detail : '')); passed++; console.log('  \x1b[32m✓\x1b[0m ' + label); };

const memory = {};
const localStorage = { getItem: (k) => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; } };
const listeners = {};
const document = {
  readyState: 'complete', documentElement: { lang: 'fr' }, head: { appendChild() {} },
  querySelector() { return null; }, createElement() { return { setAttribute() {}, addEventListener() {}, className: '', textContent: '' }; },
  addEventListener() {}
};
let venue = 'maison-121';
let attached = null;
const pushed = [];
const window = {
  document, localStorage, KiwiEnv: { isReal: () => true }, KiwiMe: {},
  KiwiDayReport: { businessDay: () => '2026-09-26', cutoff: () => 5 },
  KiwiAgentTier: () => 'owner',
  KiwiCloudDoc: {
    currentSlug: () => venue,
    attach(opts) {
      attached = opts;
      return { bind: () => Promise.resolve(false), push: () => { pushed.push({ slug: opts.slug(), data: JSON.parse(JSON.stringify(opts.read())) }); } };
    }
  },
  addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }
};
window.window = window;
vm.runInNewContext(source, { window, document, localStorage, console, Date, setTimeout, clearTimeout, Promise }, { filename: 'assets/briefing.js' });
const B = window.KiwiBriefing;
const flush = () => new Promise((r) => setTimeout(r, 0));
const fire = (name) => (listeners[name] || []).forEach((fn) => fn({}));
const venuesOf = (d) => [...new Set((d.days || []).map((x) => x.venue))];
const day = (v, d) => ({ id: `session:${v}:${d}`, accountId: 'session', venue: v, day: d, generatedAt: 1758000000000, updatedAt: 1758000000000, lines: [], dismissed: {}, handled: {} });

await flush();
ok(attached, 'the briefing attaches to the store document sync');

/* 1. An operator on maison-121 builds a few days of history. */
B._test.write({ days: [day('maison-121', '2026-09-24'), day('maison-121', '2026-09-25')] });
B.compute();
await flush();
ok(venuesOf(B._test.read()).join() === 'maison-121' && B._test.read().days.length === 3, 'maison-121 holds its own three days');

/* 2. The operator switches to la-maison-en-vogue. The venue engine has already
 *    moved (slug() answers the new store) and a cash-session event lands before
 *    any subscriber reloads the document. */
venue = 'la-maison-en-vogue';
pushed.length = 0;
fire('kiwi:cash-sessions');
await flush();
const last = pushed.at(-1);
ok(last && last.slug === 'la-maison-en-vogue', 'the compute after the switch pushes under the new store');
ok(venuesOf(last.data).join() === 'la-maison-en-vogue', 'the pushed document carries la-maison-en-vogue days only', JSON.stringify(venuesOf(last.data)));
const localVogue = Object.keys(memory).filter((k) => k.includes(':la-maison-en-vogue:')).map((k) => JSON.parse(memory[k]));
ok(localVogue.length && localVogue.every((d) => venuesOf(d).join() === 'la-maison-en-vogue'), 'the local copy of la-maison-en-vogue holds none of maison-121\'s days');

/* 3. Returning to maison-121 brings its own days back, untouched. */
venue = 'maison-121';
ok(B._test.read().days.length === 3 && venuesOf(B._test.read()).join() === 'maison-121', 'maison-121 finds its own three days again');

/* 4. A server copy already contaminated is pruned on pull/merge, and the
 *    document handed back to the sync never carries a foreign day. */
const contaminated = { days: [day('maison-121', '2026-09-17'), day('la-maison-en-vogue', '2026-09-17'), day('mon-etablissement', '2026-09-17')] };
const merged = attached.merge({ days: [day('pasta-corner', '2026-09-18')] }, contaminated);
ok(venuesOf(merged).join() === 'maison-121', 'merge keeps only the current store\'s days', JSON.stringify(venuesOf(merged)));
attached.write(contaminated);
ok(venuesOf(attached.read()).join() === 'maison-121', 'a contaminated server copy is written back without the foreign days');
ok(attached.read().days.every((d) => d.venue === 'maison-121'), 'read() never offers a foreign day to the sync');

/* 5. A day with no venue at all is not trusted either. */
attached.write({ days: [{ id: 'session::2026-09-10', day: '2026-09-10', updatedAt: 1 }] });
ok(!attached.read().days.some((d) => d.day === '2026-09-10'), 'a day without a venue is dropped');

console.log(`\n\x1b[32mbriefing-tenant: ${passed} passed, 0 failed\x1b[0m`);
