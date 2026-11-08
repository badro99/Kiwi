/* r21 console#A2 · operator workspace journey: a note (and a task) is sent, the server APPLIES it but the
   reply is lost, the operator opens another merchant, comes back and sends the same text again. The real
   assets/admin-workspace.js runs in a vm with a recording DOM and a bridge whose server is idempotent on
   the client id (as functions/api/admin/notes.js and tasks.js are: ON CONFLICT(id) DO NOTHING / replayed).
   Without a surviving id the second send creates a duplicate. What this does not prove: real layout, real
   focus, or the browser's own fetch; the route side is covered by the operator suites. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const policy = createRequire(import.meta.url)('../assets/admin-policy.js');
const source = readFileSync('assets/admin-workspace-copy.js', 'utf8') + ';' + readFileSync('assets/admin-workspace.js', 'utf8');

const listeners = {}; let n = 0;
/* A permissive element: any property is another element, calls return one, so rendering never throws. */
function el(name = 'el', own = {}) {
  const target = function () {};
  return new Proxy(target, {
    get(t, k) {
      if (k in own) return own[k];
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'dataset') return (own.dataset ||= {});
      if (k === 'closest') return () => null;
      if (k === 'innerHTML' || k === 'textContent' || k === 'value') return '';
      if (k === 'querySelectorAll' || k === 'children') return () => [];
      return el(String(k));
    },
    set(t, k, v) { own[k] = v; return true; },
    apply() { return el('call'); },
  });
}
const serverNotes = new Map(), serverTasks = new Map();
let loseNext = false, calls = 0;
const bridge = {
  snapshot: () => ({ clients: [{ merchant: 'shop-a', business: 'A' }, { merchant: 'shop-b', business: 'B' }], now: 1, live: true }),
  refresh() {}, refreshMetrics() {}, close() {}, select() {},
  async api(path, opts) {
    calls++;
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    let result = { ok: true };
    if (path === '/notes') { if (!serverNotes.has(body.id)) serverNotes.set(body.id, body); }
    else if (path === '/tasks') { if (serverTasks.has(body.id)) result = { ok: true, replayed: true, task: serverTasks.get(body.id) }; else serverTasks.set(body.id, body); }
    else result = { ok: true, tasks: [], notes: [], sources: {} };
    if (loseNext && (path === '/notes' || path === '/tasks')) { loseNext = false; throw Object.assign(new Error('network'), { status: 0, code: 'network', uncertainCommit: true }); }
    return result;
  },
};
const documentEl = el('document', {
  addEventListener(type, fn) { (listeners['d:' + type] ||= []).push(fn); },
  getElementById: () => el('byId', { addEventListener() {}, set onclick(v) {} }),
  querySelector: () => null, hidden: false, createElement: () => el('created'),
  documentElement: { lang: 'fr', dir: 'ltr' }, body: el('body', { appendChild() {}, dataset: {}, classList: { add() {}, remove() {} } }),
});
const win = { KiwiAdminPolicy: policy, KiwiOperator: bridge, KiwiAdminI18n: { lang: 'fr' },
  addEventListener(type, fn) { (listeners['w:' + type] ||= []).push(fn); }, dispatchEvent() {}, scrollTo() {} };
const ctx = vm.createContext({ window: win, document: documentEl, Intl, URLSearchParams, Date, Math, JSON, Object, Array, String, Number, Promise,
  crypto: { randomUUID: () => 'id-' + (++n) }, location: { hash: '', search: '' }, localStorage: { getItem: () => null }, setTimeout, clearTimeout, setInterval: () => 0, FormData: class { constructor(f) { this.f = f; } get(k) { return this.f.fields[k]; } }, console, CSS: { escape: String } });
let loaded = true;
try { vm.runInContext(source, ctx); } catch (e) { loaded = e; }
assert.equal(loaded, true, 'the real workspace boots in the recording DOM: ' + (loaded && loaded.message));

/* The note form as the dossier renders it (a new object each render, like innerHTML does). */
const noteForm = (merchant, text) => {
  const submit = el('submit', { disabled: false }); const field = el('field', { value: text, focus() {}, setAttribute() {} });
  const form = { dataset: { note: merchant }, elements: { body: field }, querySelector: (s) => (s === '[type=submit]' ? submit : el('err')), closest: (s) => (s === '[data-note]' ? form : null) };
  return form;
};
const sendNote = async (form) => { const ev = { target: form, preventDefault() {} }; for (const fn of listeners['d:submit'] || []) await fn(ev); };
const settle = () => new Promise((r) => setTimeout(r, 5));

const first = noteForm('shop-a', 'Rappeler le patron demain');
loseNext = true; await sendNote(first); await settle();
assert.equal(serverNotes.size, 1, 'the server applied the note although the reply was lost');
/* The operator opens another merchant, then returns: the dossier is rendered again, a brand new form. */
for (const fn of listeners['w:kiwi:operator-select'] || []) fn({ detail: { merchant: 'shop-b' } });
for (const fn of listeners['w:kiwi:operator-select'] || []) fn({ detail: { merchant: 'shop-a' } });
await settle();
const second = noteForm('shop-a', 'Rappeler le patron demain');
await sendNote(second); await settle();
assert.equal(serverNotes.size, 1, 'the same text sent again after navigating away is the SAME note, not a duplicate');
const other = noteForm('shop-b', 'Rappeler le patron demain');
await sendNote(other); await settle();
assert.equal(serverNotes.size, 2, 'the same text for another merchant is a different note');
const again = noteForm('shop-a', 'Rappeler le patron demain');
await sendNote(again); await settle();
assert.equal(serverNotes.size, 3, 'once confirmed, writing the same words again later is a deliberate new note');
console.log('✓ console-lost-reply: note applied with a lost reply, navigation to another merchant, resend = one note');
