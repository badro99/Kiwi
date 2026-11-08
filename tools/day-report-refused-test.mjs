#!/usr/bin/env node
/* r21 dayreport#A2: the server refuses the day-report book as over budget (413). Real cloud-doc.js, real
   day-report.js, real notice (day-report-refused.js), a transport that answers 413: the refusal reaches the
   dashboard as an alert with an Export button, and the Z saved on this device is still intact and readable. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8');
const tick = (n = 1) => new Promise((resolve) => setTimeout(resolve, n));
function node(tag) {
  const n = { tag, style: { cssText: '' }, children: [], attrs: {}, parent: null, textContent: '',
    appendChild(k) { k.parent = n; n.children.push(k); return k; }, insertBefore(k) { k.parent = n; n.children.unshift(k); return k; },
    removeChild(k) { n.children = n.children.filter((c) => c !== k); k.parent = null; }, setAttribute(k, v) { n.attrs[k] = v; }, get parentNode() { return n.parent; }, get firstChild() { return n.children[0] || null; } };
  return n;
}
const memory = new Map(), listeners = {}, requests = [];
const localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => { memory.set(k, String(v)); }, removeItem: (k) => { memory.delete(k); } };
const page = node('div'), body = node('body'); let exported = 0;
const document = { readyState: 'complete', visibilityState: 'visible', documentElement: { lang: 'fr' }, body, createElement: node, addEventListener() {}, querySelector: (q) => (q === '.dash-genpage' ? page : null) };
const window = { addEventListener(n, f) { (listeners[n] ||= []).push(f); }, dispatchEvent(e) { (listeners[e.type] || []).forEach((f) => f(e)); return true; },
  KiwiConfig: { timezone: 'Africa/Casablanca' }, KiwiEnv: { isReal: () => true }, KiwiReportPage: { exportDay() { exported++; } } };
window.window = window; window.document = document;
const fetch = async (url, init) => { requests.push({ url, method: (init && init.method) || 'GET' }); return (init && init.method === 'PUT') || (init && init.method === 'POST')
  ? { ok: false, status: 413, json: async () => ({ why: 'too-large' }), text: async () => '{"why":"too-large"}', headers: { get: () => null } }
  : { ok: true, status: 200, json: async () => ({ doc: null, rev: 0 }), text: async () => '{}', headers: { get: () => null } }; };
const context = vm.createContext({ window, document, localStorage, fetch, console, Date, Intl, JSON, Math, Promise, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, Uint8Array, AbortController,
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }, URL, btoa: (s) => Buffer.from(s, 'binary').toString('base64') });
context.globalThis = context;
memory.set('kiwiLiveMerchant', 'refused-shop');
for (const f of ['cloud-doc.js', 'day-report.js', 'day-report-refused.js']) vm.runInContext(read(f), context, { filename: 'assets/' + f });
const D = window.KiwiDayReport;
assert.ok(D && window.KiwiCloudDoc, 'real modules loaded');
const slug = D.storeSlug() || 'refused-shop';
const day = '2026-11-02';
const saved = D.save({ day, store: { slug, type: 'boutique' }, gross: 12345, net: 12345, builtAt: 10, closedAt: 20, openedAt: 1, sessionId: 's1', terminalId: 't1', closedBy: 'A', cash: { expected: 12345, counted: 12345 }, revisions: [] }, slug);
D.flush(); await tick(50); await tick(50);
const alert = page.children.find((c) => c.attrs.role === 'alert');
assert.ok(requests.some((r) => r.method !== 'GET'), 'a cloud write was attempted: ' + JSON.stringify(requests));
assert.ok(alert, 'the refusal is visible on the dashboard page as an alert');
assert.match(alert.children[0].textContent, /serveur les a refusés/);
assert.equal(alert.attrs['data-kdr-refused'], 'too-large');
const local = D.load(day, slug);
assert.ok(local && local.net === 12345, 'the local Z is intact after the refusal');
alert.children[1].onclick();
assert.equal(exported, 1, 'the Export button runs the local Z export');
window.dispatchEvent({ type: 'kiwi:report-model' });
assert.equal(page.children.filter((c) => c.attrs.role === 'alert').length, 1, 'a page re-render puts back exactly one notice');
console.log('✓ day report: over-budget refusal is visible and leaves an exportable local Z');
