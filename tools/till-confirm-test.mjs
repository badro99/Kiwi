#!/usr/bin/env node
/* till-confirm-test · les confirmations de la caisse ne passent plus par la boîte du système.
 *
 * assets/caisse-hardware.js (le vrai fichier, dans un vm ; la question s'accroche à KiwiCaisseLang) : dans l'app iPhone la feuille native,
 * ailleurs une feuille Kiwi avec focus géré, et la boîte du système seulement sans document.
 * Dans tous les cas une promesse : true sur « Confirmer », false sur « Annuler », Échap, clic à côté. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/caisse-hardware.js', import.meta.url), 'utf8');

function dom() {
  const listeners = {};
  class El {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.parentNode = null; this.className = ''; this.textContent = ''; this.id = ''; this.listeners = {}; }
    setAttribute(k, v) { this.attrs[k] = v; }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; }
    addEventListener(t, f) { this.listeners[t] = f; }
    focus() { document.activeElement = this; }
    all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  }
  const body = new El('body'), head = new El('head');
  const document = {
    body, head, activeElement: null, createElement: (t) => new El(t),
    getElementById: (id) => [...head.all(), ...body.all()].find((e) => e.id === id) || null,
    addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; },
  };
  return { document, listeners, find: (cls) => body.all().filter((e) => e.className.split(' ').includes(cls)), body };
}

function load({ withDom = true, native = null, systemConfirm = null } = {}) {
  const d = dom();
  const window = { KiwiCaisseLang: { tr: (s) => s }, __kiwiNativeRuntime: native, confirm: systemConfirm };
  const ctx = { window, navigator: {}, localStorage: { getItem: () => null } };
  if (withDom) ctx.document = d.document;
  vm.runInNewContext(source, ctx);
  assert.equal(typeof window.KiwiCaisseLang.ask, 'function', 'the question hangs on the till language interface');
  return { ask: window.KiwiCaisseLang.ask, d, window };
}

// The page sheet.
{
  const { ask, d } = load();
  const opener = d.document.createElement('button'); opener.focus();
  let result; ask('Retirer T12 du suivi ?\n\nLa vente reste enregistrée.', { danger: true, confirm: 'Retirer' }).then((v) => { result = v; });
  const sheet = d.find('kiwi-ask-card')[0];
  assert.ok(sheet, 'a Kiwi sheet is in the page, no system dialog');
  assert.equal(sheet.attrs.role, 'alertdialog'); assert.equal(sheet.attrs['aria-modal'], 'true');
  assert.equal(d.find('kiwi-ask-title')[0].textContent, 'Retirer T12 du suivi ?', 'the first paragraph is the title');
  assert.equal(d.find('kiwi-ask-body')[0].textContent, 'La vente reste enregistrée.', 'the rest is the explanation');
  const [no, yes] = d.find('kiwi-ask-btn');
  assert.equal(yes.textContent, 'Retirer'); assert.match(yes.className, /is-danger/);
  assert.equal(d.document.activeElement, no, 'the safe button has the focus: Enter erases nothing');
  d.listeners.keydown({ key: 'Tab', shiftKey: false, preventDefault() {} });
  yes.onclick(); await Promise.resolve();
  assert.equal(result, true, 'Confirmer answers true'); assert.equal(d.find('kiwi-ask').length, 0, 'the sheet is gone');
  assert.equal(d.document.activeElement, opener, 'the focus returns to the opener');
}
for (const [how, act] of [['Annuler', (d) => d.find('kiwi-ask-btn')[0].onclick()], ['Échap', (d) => d.listeners.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })], ['a click beside the card', (d) => d.find('kiwi-ask')[0].listeners.click({ target: d.find('kiwi-ask')[0] })]]) {
  const { ask, d } = load(); let result; ask('Annuler le split en cours ?').then((v) => { result = v; });
  act(d); await Promise.resolve();
  assert.equal(result, false, how + ' answers false'); assert.equal(d.find('kiwi-ask').length, 0);
}

// The iPhone app: the native sheet, never the web one nor the system box.
{
  let spec; const native = { nativeSheetAvailable: () => true, nativeSheet: (s) => { spec = s; return Promise.resolve('go'); } };
  const { ask, d } = load({ native, systemConfirm: () => { throw new Error('system dialog'); } });
  assert.equal(await ask('Supprimer Amina ?', { danger: true }), true, 'the native sheet answers');
  assert.equal(spec.title, 'Supprimer Amina ?'); assert.equal(spec.actions[0].style, 'destructive'); assert.equal(d.find('kiwi-ask').length, 0, 'no web sheet on top of the native one');
  native.nativeSheet = () => Promise.resolve('dismiss');
  assert.equal(await ask('Supprimer Amina ?'), false, 'dismissing the native sheet answers false');
}

// No document at all: the system box is the last resort.
{
  const { ask } = load({ withDom: false, systemConfirm: () => true });
  assert.equal(await ask('Supprimer ?'), true, 'the system box only without a page');
}
console.log('✓ till confirmations: native sheet in the app, Kiwi sheet with focus and Escape in the page, system box only without a document');
