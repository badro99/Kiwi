#!/usr/bin/env node
/* tools/printer-relay-banner-test.mjs · the till says, and keeps saying, that a
 * relayed ticket is stuck on the printer (Pasta Corner, 26 Nov 2026).
 *
 * That day the Android bridge took three tickets and sat on them for twelve
 * minutes; the till showed one four-second toast once the lease ran out. This
 * runs the shipped assets/printer/transports.js in a VM with a fake page and a
 * fake /api/print/jobs, and walks one ticket through:
 *   queued → claimed for more than 15 s   → banner « le pont a pris le ticket… »
 *   → uncertain                           → « peut-être pas sorti » + « Pas sorti ? Réimprimer »
 *   → the button asks the server to requeue it, and the copy prints → banner gone.
 * Every phrase it shows must exist in the till dictionary (EN + AR).
 *
 *   node tools/printer-relay-banner-test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/printer/transports.js', import.meta.url), 'utf8');
const lang = fs.readFileSync(new URL('../assets/caisse-lang.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (v, label) => { if (v) pass++; else { fail++; console.error('  ✗ ' + label); } };

class El {
  constructor() { this.style = {}; this.attrs = {}; this.kids = {}; this.isConnected = false; this.textContent = ''; this.innerHTML = ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  querySelector(sel) { return this.kids[sel] || (this.kids[sel] = new El()); }
  remove() { this.isConnected = false; }
}
const appended = [];
const timers = new Map(); let nextTimer = 1;
let clock = 1_795_704_000_000;
let jobStatus = { id: 'pj_pasta000000001', status: 'queued' };
const posted = [];
const said = [];

const ctx = {
  Promise, Uint8Array, Object, JSON, Error, AbortController, DOMException, Number, String, RegExp, Array, Math,
  navigator: {}, console,
  document: { createElement: () => new El(), body: { appendChild(el) { el.isConnected = true; appended.push(el); } } },
  setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
  clearTimeout: (id) => { timers.delete(id); },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  fetch: async (url, init) => {
    const u = new URL(url, 'https://kiwi-os.com');
    const body = init && init.body ? JSON.parse(init.body) : null;
    let out = { ok: true };
    if (init.method === 'POST' && body && body.action === 'requeue-uncertain') { posted.push(body); jobStatus = { id: body.id, status: 'queued' }; out = { ok: true, requeued: true }; }
    else if (init.method === 'POST') { posted.push(body); out = { ok: true, id: jobStatus.id }; }
    else if (u.searchParams.get('id')) out = { ok: true, job: { ...jobStatus } };
    return { ok: true, status: 200, json: async () => out };
  },
};
ctx.window = ctx;
ctx.window.KiwiEscPos = { toB64: () => 'G0A=' };
ctx.window.dispatchEvent = () => {};
vm.createContext(ctx);
vm.runInContext('Date.now = function () { return globalThis.__clock(); };', ctx);
ctx.__clock = () => clock;
vm.runInContext(source, ctx);
const T = ctx.window.__kiwiPrinterTransports({
  getConfig: () => ({}), setConfig() {}, currentMerchantKey: () => 'pasta-corner', ls: () => null, set() {},
  fallbackNotice: (m) => said.push(m), noteBridgeState() {}, getStationConfig: () => ({ profiles: [{ name: 'Caisse', ip: '192.168.100.198' }] }),
  say: (fr) => fr,
});

const drain = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
async function step(ms) {
  clock += ms;
  for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); }
  await drain();
}
const banner = () => appended.filter((el) => el.isConnected).pop();
const text = () => { const b = banner(); return b ? b.querySelector('[data-msg]').textContent : ''; };

const r = await T.relayEnqueue(new Uint8Array([27, 64]), { ip: '192.168.100.198', port: 9100 }, 'receipt', 'sale-0001-receipt');
await drain();
ok(r && r.ok && r.via === 'relay', 'the ticket is deposited on the relay');
ok(!banner(), 'a ticket just deposited shows nothing');

jobStatus = { id: 'pj_pasta000000001', status: 'claimed', claimed_ts: clock };
await step(1500);
await step(1500);
ok(!banner(), 'a ticket claimed a few seconds ago shows nothing yet');
for (let i = 0; i < 12; i++) await step(1500);
ok(banner() && /le pont a pris le ticket/.test(text()) && /Kiwi Print Bridge/.test(text()) && /Caisse \(192\.168\.100\.198\)/.test(text()),
  'a ticket claimed and unconfirmed for 15 s raises a lasting banner naming the printer and the fix');
ok(banner() && banner().attrs.role === 'alert', 'the banner is announced as an alert');

jobStatus = { id: 'pj_pasta000000001', status: 'uncertain', error: 'output-unknown-ack-timeout' };
await step(5000);
ok(banner() && /peut-être pas sorti/.test(text()), 'an uncertain ticket stays on screen as « peut-être pas sorti »');
ok(banner() && banner().querySelector('[data-reprint]').style.display === '', 'the « Pas sorti ? Réimprimer » button shows');
ok(!said.some((m) => /incertaine/.test(m)), 'the four-second toast is no longer the only signal');

banner().querySelector('[data-reprint]').onclick();
await drain();
ok(posted.some((b) => b && b.action === 'requeue-uncertain' && b.id === 'pj_pasta000000001'), 'the button asks the server to requeue that ticket');
jobStatus = { id: 'pj_pasta000000001', status: 'done', bytes: 2 };
await step(1500);
await step(1500);
ok(!banner(), 'once the copy prints, the banner goes away');

/* Every phrase the banner can show exists in the till dictionary, in EN and AR. */
const phrases = [
  'Pas sorti ? Réimprimer',
  'le pont a pris le ticket mais l’imprimante ne l’a pas confirmé. Vérifiez qu’elle est allumée et qu’il reste du papier, puis redémarrez l’app Kiwi Print Bridge sur la tablette.',
  'impression non confirmée.',
  '{n} tickets peut-être pas sortis : regardez l’imprimante.',
  '{n} ticket peut-être pas sorti : regardez l’imprimante.',
];
for (const p of phrases) {
  ok(source.includes(p.replace(/’/g, '\\u2019')) || source.includes(p), 'transports.js shows « ' + p.slice(0, 40) + '… »');
  const at = lang.indexOf(JSON.stringify(p).slice(0, -1) + '": [');
  ok(at > 0 && /^"\: \["[^"]+", "[^"]*[؀-ۿ][^"]*"\]/.test(lang.slice(at + JSON.stringify(p).length - 1)), 'caisse-lang.js translates « ' + p.slice(0, 40) + '… » into EN and AR');
}

if (fail) { console.error(`✗ printer-relay-banner: ${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`✓ printer-relay-banner · ${pass} checks (stuck on the printer, maybe not printed, reprint on request, cleared once printed, EN/AR)`);
