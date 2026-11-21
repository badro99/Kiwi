#!/usr/bin/env node
/* Carnet de crédit au comptoir (assets/credit-book/till-credit.js), sans
 * navigateur : un petit DOM de banc, fetch simulé.
 *   · routes du carnet en 503 : la caisse vend quand même (pas de plafond connu,
 *     ou sous le dernier plafond connu), refuse seulement de dépasser hors ligne,
 *     et garde la promesse en file ;
 *   · double appui : une seule question au serveur, un seul pavé, une seule
 *     feuille « Paiera le … » ;
 *   · l'accord d'un responsable passe par le pavé du kit (<k-pin-pad>), le code
 *     ne va qu'à /api/credit/till et le pavé est vidé après une réponse refusée ;
 *   · les deux caisses gardent leur propre garde contre le double appui. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (name) => { n++; console.log('  ✓ ' + name); };

/* ── le banc ── */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.q = {}; this.style = {}; this.dataset = {}; this.className = ''; this.innerHTML = ''; this.textContent = ''; this.answers = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k === 'src' && this.src ? this.src : k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  dispatchEvent(e) { (this.listeners[e.type] || []).forEach((f) => f(e)); }
  querySelector(sel) { return this.q[sel] || (this.q[sel] = new El('q')); }
  querySelectorAll() { return []; }
  focus() {}
  answer(o) { this.answers.push(o); }
}
const body = new El('body'), head = new El('head');
const store = new Map();
globalThis.window = globalThis;
/* Le kit : défini d'office (caisse 2027), ou chargé à la demande (caisse
   classique) : une balise <script> de pin.js ou overlays.js le définit. */
const defined = new Set(['k-pin-pad', 'k-sheet']);
const loadedScripts = [];
head.appendChild = function (c) {
  El.prototype.appendChild.call(this, c);
  if (c.tagName === 'SCRIPT') {
    loadedScripts.push(c.src);
    setTimeout(() => {
      if (/kit\/overlays\.js/.test(c.src)) defined.add('k-sheet');
      if (/kit\/pin\.js/.test(c.src)) defined.add('k-pin-pad');
      c.onload && c.onload();
    }, 0);
  }
  return c;
};
const headFind = (pred) => head.children.find(pred) || null;
globalThis.document = { body, head, activeElement: null, createElement: (t) => new El(t), createTextNode: (t) => Object.assign(new El('#text'), { textContent: String(t) }), getElementById: () => null,
  get scripts() { return head.children.filter((c) => c.tagName === 'SCRIPT'); },
  querySelector: (sel) => (/^link/.test(sel) ? headFind((c) => c.tagName === 'LINK' && /kit\/tokens-2027\.css/.test(c.href || ''))
    : /^meta/.test(sel) ? headFind((c) => c.tagName === 'META' && c.name === 'kiwi-sprite') : null) };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.customElements = { get: (name) => (defined.has(name) ? class {} : undefined) };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
store.set('kiwiPairedVenue', JSON.stringify({ merchant: 'till-fixture' }));

const calls = [];
let answer = () => ({ status: 503, body: { error: 'credit-unavailable' } });
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: String(url), body });
  const out = await answer(String(url), body);
  return { ok: out.status >= 200 && out.status < 300, status: out.status, json: async () => out.body };
};
const flushTicks = () => new Promise((r) => setTimeout(r, 0));

const C = await import(pathToFileURL(path.join(ROOT, 'assets/credit-book/till-credit.js')).href);
await flushTicks();
const sheets = () => body.children.filter((c) => c.tagName === 'K-SHEET' || c.className === 'kc-credit-veil');

/* ── 1. les routes du carnet répondent 503 ── */
{
  const toasts = [];
  const toast = (...a) => toasts.push(a.join(' '));
  const who = { merchant: 'till-fixture', source: 'carnet', customer: 'k1', name: 'TEST KIWI', amountCents: 5000, localOwedCents: 2000, toast };
  assert.deepEqual(await C.creditGate(who), { ok: true }, 'no known limit: the till still sells');
  store.set('kiwiCreditLimits:till-fixture', JSON.stringify({ 'carnet:k1': 10000 }));
  assert.equal((await C.creditGate(who)).ok, true, 'under the last known limit: the till still sells');
  const over = await C.creditGate({ ...who, amountCents: 9000 });
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'offline', 'over the last known limit offline: refused, the code cannot be checked');
  assert.equal(sheets().length, 0, 'no code pad offline');
  const row = { source: 'carnet', customer: 'k1', id: 'tp-fixture-0001', amountCents: 5000, dueDate: '2099-01-01', at: Date.now() };
  store.set('kiwiCreditPromises:till-fixture', JSON.stringify([row]));
  await C.flushPromises('till-fixture');
  assert.deepEqual(JSON.parse(store.get('kiwiCreditPromises:till-fixture')), [row], 'a promise stays queued while the route answers 503');
  ok('routes answering 503: the till keeps selling, refuses only an offline overrun, keeps the promise queued');
}

/* ── 2. double appui ── */
{
  calls.length = 0;
  let release;
  const wait = new Promise((r) => { release = r; });
  answer = async (url, b) => (b && b.action === 'check' ? (await wait, { status: 200, body: { ok: true, over: false, limited: false } }) : { status: 503, body: {} });
  const who = { merchant: 'till-fixture', source: 'client', customer: 'c1', amountCents: 5000 };
  const first = C.creditGate(who);
  const second = await C.creditGate(who);
  assert.deepEqual(second, { ok: false, reason: 'busy' }, 'a second tap while the first question is out is ignored');
  release();
  assert.equal((await first).ok, true);
  assert.equal(calls.filter((c) => c.body && c.body.action === 'check').length, 1, 'one question to the server');
  const p1 = C.promiseAfterSale({ merchant: 'till-fixture', source: 'client', customer: 'c1', amountCents: 5000 });
  const p2 = await C.promiseAfterSale({ merchant: 'till-fixture', source: 'client', customer: 'c1', amountCents: 5000 });
  assert.equal(p2, null, 'a second « will pay on » sheet is not opened');
  assert.equal(sheets().length, 1, 'one sheet on screen');
  sheets()[0].dispatchEvent({ type: 'kc-dismiss' });
  assert.equal(await p1, null);
  assert.equal(sheets().length, 0);
  ok('double tap: one server question, one sheet, no second promise row');
}

/* ── 3. l'accord passe par le pavé du kit ── */
{
  calls.length = 0;
  let verdict = { status: 403, body: { error: 'not-manager' } };
  answer = (url, b) => (b && b.action === 'check' ? { status: 200, body: { ok: true, over: true, limited: true, afterCents: 15000, limitCents: 10000 } } : verdict);
  const toasts = [];
  const gate = C.creditGate({ merchant: 'till-fixture', source: 'carnet', customer: 'k1', name: 'TEST KIWI', amountCents: 5000, toast: (...a) => toasts.push(a.join(' ')) });
  await flushTicks(); await flushTicks();
  const sheet = sheets()[0];
  assert.ok(sheet && sheet.tagName === 'K-SHEET', 'the approval opens in a kit sheet');
  const pad = sheet.children.find((c) => c.tagName === 'K-PIN-PAD');
  assert.ok(pad, 'with the kit code pad, not a password field');
  const warn = sheet.children.find((c) => c.className === 'kc-credit-warn');
  assert.equal(warn.children.filter((c) => c.tagName === 'BDI')[0].textContent, 'TEST KIWI', 'the customer name is isolated');
  assert.equal(warn.children.filter((c) => c.tagName === 'BDI').length, 4, 'name and three amounts each in a <bdi>, so Arabic keeps its full stop in place');
  assert.equal(warn.children[warn.children.length - 1].textContent.trim().endsWith('.'), true);
  const digits = String(1000 + Math.floor(Math.random() * 9000));
  await pad.onsubmit(digits);
  assert.equal(pad.answers.length, 1);
  assert.equal(pad.answers[0].clear, true, 'a refused code is cleared from the pad');
  assert.match(pad.answers[0].message, /responsable/);
  verdict = { status: 200, body: { ok: true, over: true, approved: true, approvedBy: { name: 'TEST KIWI Manager', role: 'Manager' } } };
  await pad.onsubmit(digits);
  const out = await gate;
  assert.equal(out.ok, true);
  assert.equal(sheets().length, 0, 'the pad closes once approved');
  const carried = calls.filter((c) => JSON.stringify(c.body || {}).includes(digits));
  assert.ok(carried.length === 2 && carried.every((c) => c.url === '/api/credit/till' && c.body.action === 'approve'), 'the code goes only to the approval route');
  assert.equal(toasts.some((t) => t.includes(digits)), false, 'the code is never shown');
  ok('manager approval through <k-pin-pad>: refused code cleared, approved closes, code sent only to /api/credit/till');
}

/* ── 3b. la caisse classique, sans la peau 2027 : le kit se charge à la demande ── */
{
  defined.clear();
  calls.length = 0;
  answer = (url, b) => (b && b.action === 'check' ? { status: 200, body: { ok: true, over: true, limited: true, afterCents: 15000, limitCents: 10000 } }
    : { status: 200, body: { ok: true, over: true, approved: true, approvedBy: { name: 'TEST KIWI Manager', role: 'Manager' } } });
  const gate = C.creditGate({ merchant: 'till-fixture', source: 'carnet', customer: 'k1', name: 'TEST KIWI', amountCents: 5000 });
  for (let i = 0; i < 30 && !sheets().length; i++) await new Promise((r) => setTimeout(r, 0));
  const pad = sheets()[0] && sheets()[0].children.find((c) => c.tagName === 'K-PIN-PAD');
  assert.ok(pad, 'the classic till loads the kit pad on demand instead of refusing the sale');
  assert.deepEqual(loadedScripts.map((x) => x.split('?')[0]), ['assets/kit/strings/kit.fr.js', 'assets/kit/strings/kit.en.js', 'assets/kit/strings/kit.ar.js',
    'assets/kit/strings.js', 'assets/kit/format.js', 'assets/kit/core.js', 'assets/kit/overlays.js', 'assets/kit/pin.js'], 'the kit files, in the 2027 shell order');
  assert.ok(head.children.some((c) => c.tagName === 'LINK' && /tokens-2027\.css/.test(c.href)), 'with the --k-* tokens');
  await pad.onsubmit(String(1000 + Math.floor(Math.random() * 9000)));
  assert.equal((await gate).ok, true, 'and the manager approves the over-limit sale');
  const again = await C.ensureKit();
  assert.equal(again, true);
  assert.equal(loadedScripts.length, 8, 'loaded once');
  ok('classic till: the kit pad and sheet load on demand, the over-limit approval works');
}

/* ── 4. « Compte client » de la Maison : accountCheckout ── */
{
  calls.length = 0;
  answer = (url, b) => (b && b.action === 'check' ? { status: 200, body: { ok: true, over: false, limited: false } } : { status: 503, body: {} });
  const btn = { disabled: false };
  let commits = 0;
  const commit = async () => { commits++; await new Promise((r) => setTimeout(r, 5)); return true; };
  const credit = { merchant: 'till-fixture', source: 'client', customer: 'c2', name: 'TEST KIWI', amountCents: 4000 };
  const first = C.accountCheckout(btn, credit, commit);
  const second = await C.accountCheckout(btn, credit, commit);
  assert.equal(second, false, 'a second tap does nothing');
  assert.equal(await first, true);
  assert.equal(commits, 1, 'one sale written');
  assert.equal(calls.filter((c) => c.body && c.body.action === 'check').length, 1, 'one limit question');
  assert.equal(sheets().length, 1, 'one « will pay on » sheet');
  assert.equal(btn.disabled, true, 'the button stays off once the sale is written');
  sheets()[0].dispatchEvent({ type: 'kc-dismiss' });
  const off = { disabled: false };
  answer = (url, b) => ({ status: 200, body: { ok: true, over: true, limited: true, afterCents: 15000, limitCents: 10000 } });
  defined.delete('k-pin-pad');
  const refusedKit = C.accountCheckout(off, credit, commit);
  for (let i = 0; i < 30 && !sheets().length; i++) await new Promise((r) => setTimeout(r, 0));
  sheets()[0].dispatchEvent({ type: 'kiwi:action', detail: { action: 'k.sheet.close' } });
  assert.equal(await refusedKit, false);
  assert.equal(off.disabled, false, 'a cancelled approval gives the button back');
  assert.equal(commits, 1);
  const src = fs.readFileSync(path.join(ROOT, 'assets/credit-book/till-credit.js'), 'utf8');
  assert.equal(/type="password"/.test(src), false, 'no hand-made password field left in the till module');
  const maison = fs.readFileSync(path.join(ROOT, 'assets/pos-maison/checkout.js'), 'utf8');
  assert.match(maison, /\$\('#mz-account-ok', el\)\.onclick = \(e\) => \{ const btn = e\.currentTarget; import\('\.\.\/credit-book\/till-credit\.js\?v=\d+'\)\.then\(\(C\) => C\.accountCheckout\(btn,/, 'Maison hands its « Compte client » tap to accountCheckout');
  const epicerie = fs.readFileSync(path.join(ROOT, 'assets/pos-epicerie/carnet.js'), 'utf8');
  const charge = epicerie.slice(epicerie.indexOf('async function chargeOnCredit('), epicerie.indexOf('/* ═══', epicerie.indexOf('async function chargeOnCredit(')));
  assert.match(charge, /\|\| charging\) return;\s*charging = true;/);
  assert.match(charge, /finally \{ charging = false; \}/, 'épicerie: one credit sale at a time');
  ok('Maison « Compte client » through accountCheckout: one sale, one question, one sheet; épicerie keeps its own guard');
}

/* ── 5. l'épicerie atteint le carnet du patron depuis le menu ── */
{
  const vm = await import('node:vm');
  const listeners = { doc: [], win: {} };
  const pages = [];
  let ownerBook = 0;
  const sandbox = {
    console, setTimeout, clearTimeout, JSON, Math, Date, Object, Array, String, Number, Set, Map, Promise,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener: (t, f, cap) => listeners.doc.push({ t, f, cap }), querySelector: () => null, querySelectorAll: () => [] },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (t, f) => { (listeners.win[t] = listeners.win[t] || []).push(f); };
  sandbox.KiwiVenue = { getCurrentVenueData: () => ({ id: 'v-epicerie', type: 'epicerie', subtype: 'epicerie' }), subscribe() {} };
  sandbox.Kiwi = { handlers: { 'nav-credit': () => { ownerBook++; } }, appPage: (id, o) => { pages.push(id); return true; }, toast() {}, modal() {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/trade-workspaces.js'), 'utf8'), sandbox);
  (listeners.win.load || []).forEach((f) => f());
  await new Promise((r) => setTimeout(r, 320));
  sandbox.Kiwi.handlers['nav-credit']();
  assert.equal(ownerBook, 1, 'nav-credit opens the owner credit book (assets/pages-pro/credit-book.js) for an épicerie');
  assert.equal(pages.length, 0, 'the old ledger is not drawn in its place');
  let prevented = false;
  const anchor = { dataset: { nav: 'credit' } };
  for (const l of listeners.doc.filter((x) => x.t === 'click')) l.f({ target: { closest: () => anchor }, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
  assert.equal(prevented, false, 'the sidebar click on « Carnet de crédit » is not captured by the épicerie board');
  assert.equal(sandbox.KiwiTradeWorkspaces.config('credit').sidebar, false, 'the tabs-and-advances ledger stays reachable by its link');
  ok('épicerie: the sidebar « Carnet de crédit » reaches the owner credit book, the ledger stays one link away');
}

console.log(`credit-till-test: ${n} checks passed`);
