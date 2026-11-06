#!/usr/bin/env node
/* queue-recovery.js: corrupt money copies (sales, kitchen, clients) are labelled for the merchant,
   deleted only after an in-page confirmation (no system dialog), and memory-only client events raise an alert. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/queue-recovery.js', import.meta.url), 'utf8');
function node(tag, doc) {
  const n = { tag, style: { cssText: '' }, children: [], attrs: {}, parent: null, textContent: '', disabled: false,
    append(...kids) { kids.forEach((k) => { k.parent = n; n.children.push(k); }); },
    remove() { if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n); n.parent = null; },
    setAttribute(k, v) { n.attrs[k] = v; }, focus() { doc.active = n; } };
  return n;
}
function texts(n) { return [n.textContent].concat(n.children.flatMap(texts)); }
function find(n, pred) { if (pred(n)) return n; for (const c of n.children) { const h = find(c, pred); if (h) return h; } return null; }
function boot() {
  const calls = [], doc = { readyState: 'complete', documentElement: { lang: 'fr' }, addEventListener() {} };
  doc.createElement = (t) => node(t, doc); doc.body = node('body', doc);
  const listeners = {};
  const raw = { 'kiwiSaleQueue:quarantine:1730000000000': '[bad sale', 'kiwi:kitchen-print-corrupt:1:q': '[bad kitchen' };
  const context = { document: doc, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: class {}, setTimeout,
    confirm() { throw new Error('system dialog used'); },
    KiwiLive: { queueRecoveryCopies(key, ack) { const keys = Object.keys(raw).filter((k) => k.startsWith('kiwiSale')); if (key === undefined) return keys.map((k) => ({ key: k, bytes: 40 })); if (!(key in raw)) return null; const v = raw[key]; if (ack) { delete raw[key]; calls.push('ack:' + key); } return v; } },
    KiwiKitchenPrint: { recoveryCopies(key, ack) { const keys = Object.keys(raw).filter((k) => k.startsWith('kiwi:kitchen')); if (key === undefined) return keys.map((k) => ({ key: k, bytes: 40 })); if (!(key in raw)) return null; const v = raw[key]; if (ack) { delete raw[key]; calls.push('ack:' + key); } return v; } },
    KiwiOutboxVault: { recoveryCopies: () => [], status: () => ({ memoryOnly: [], vaulted: [] }) } };
  context.window = Object.assign(context, { addEventListener(name, fn) { (listeners[name] ||= []).push(fn); } });
  vm.runInNewContext(source, context);
  return { doc, calls, context, fire: (name, detail) => (listeners[name] || []).forEach((fn) => fn({ detail })), raw };
}
{
  const t = boot(), host = node('div', t.doc);
  t.fire('kiwi:quarantine-review', host);
  const all = texts(host).join(' | ');
  assert.ok(!/kiwiSaleQueue|kiwi:kitchen/.test(all), 'no raw storage key is shown: ' + all);
  assert.match(all, /Copie de ventes/); assert.match(all, /Bons de cuisine/);
  const ack = find(host, (n) => n.tag === 'button' && n.textContent === 'Accuser réception et supprimer');
  ack.onclick();
  assert.equal(t.calls.length, 0, 'the first click only asks');
  const yes = find(host, (n) => n.tag === 'button' && n.textContent === 'Confirmer la suppression');
  assert.ok(yes && t.doc.active === yes, 'an in-page confirmation takes focus');
  const no = find(host, (n) => n.tag === 'button' && n.textContent === 'Annuler');
  no.onclick();
  assert.equal(t.calls.length, 0, 'cancel deletes nothing'); assert.equal(t.doc.active, ack, 'focus returns to the acknowledge button');
  ack.onclick(); find(host, (n) => n.tag === 'button' && n.textContent === 'Confirmer la suppression').onclick();
  assert.equal(t.calls.length, 1, 'confirmed deletion acknowledges exactly one copy');
}
{
  const t = boot(); t.context.KiwiOutboxVault.status = () => ({ memoryOnly: ['kiwi:clients-purchases:v1:x'], vaulted: [] });
  const host = node('div', t.doc); t.fire('kiwi:quarantine-review', host);
  assert.ok(find(host, (n) => n.attrs.role === 'alert' && /mémoire seulement/.test(n.textContent)), 'memory-only client events raise an alert');
}
console.log('✓ queue-recovery evidence: readable labels, in-page confirm, memory-only alert');
