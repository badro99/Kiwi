#!/usr/bin/env node
/* wallet-till-test · assets/wallet-till.js, the till side of the Wallet card,
 * run in a vm with a small window/document stand-in.
 *
 *   node tools/wallet-till-test.mjs
 *
 * What this holds:
 *   · parseCardScan reads « KIWI-C:<id> » and nothing else;
 *   · a scanner set to a US keyboard on a French till (W/Z and A/Q swapped,
 *     « : » typed as M, « - » as a bracket) still finds the right client, and
 *     a scan two clients could match finds nobody;
 *   · a fast scanner burst that is a card is taken BEFORE the till's own
 *     listeners (it would otherwise become an unknown product), a burst that is
 *     an article or a human typing is left alone;
 *   · the card goes to the open sale: the boutique ticket (registered handler),
 *     the restaurant note, the other counters' sale; with no sale open, or an
 *     unknown card, the cashier is told so. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(root, 'assets/wallet-till.js'), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

function load({ bodyClass = '', clients = [], sale = null, pos = null } = {}) {
  const listeners = [];
  const toasts = [];
  const el = () => {
    const n = { style: { setProperty() {} }, setAttribute() {}, appendChild() {}, remove() { if (n.className === 'kw-wt-toast') shown = null; }, className: '', textContent: '' };
    return n;
  };
  let shown = null;
  const document = {
    body: { className: bodyClass, appendChild(n) { if (n.className === 'kw-wt-toast') { shown = n; } } },
    head: { appendChild() {} },
    createElement: el,
    querySelector: (q) => (q === '.kw-wt-toast' ? shown : null),
    getElementById: () => null, readyState: 'complete',
    addEventListener() {}, removeEventListener() {},
  };
  const window = {
    document,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    KiwiClients: { list: () => clients, bookId: () => 'pasta-corner' },
    KiwiCaisseSaleClient: sale,
    KiwiPosSale: pos,
  };
  const ctx = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {}, Date, RegExp, Object, String, Promise, console });
  vm.runInContext(SRC, ctx, { filename: 'wallet-till.js' });
  const W = window.KiwiWalletTill;
  /* A burst of keys, `gap` ms apart, then Enter. Returns whether the Enter was taken. */
  let clock = 1_000_000;
  ctx.Date = { now: () => clock };
  vm.runInContext('Date = this.Date', ctx);
  function burst(keys, gap = 6, target = { tagName: 'BODY' }) {
    clock += 1000;
    const press = (key, code) => {
      const e = { key, code, target, ctrlKey: false, metaKey: false, altKey: false, stopped: false, prevented: false,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      for (const l of listeners) if (l.type === 'keydown') l.fn(e);
      return e;
    };
    for (const k of keys) { press(k.key, k.code); clock += gap; }
    return press('Enter', 'Enter');
  }
  const typed = (s) => [...s].map((ch) => ({ key: ch, code: /\d/.test(ch) ? 'Digit' + ch : '' }));
  return { W, burst, typed, toasts: () => (shown ? [shown.textContent] : []), listeners, document };
}

ok('parseCardScan reads KIWI-C:<id> and nothing else', () => {
  const { W } = load();
  assert.equal(W.parseCardScan('KIWI-C:abc'), 'abc');
  assert.equal(W.parseCardScan('  KIWI-C:wq8k2m_9  '), 'wq8k2m_9');
  for (const code of ['6111234567890', 'KIWI-C:', 'kiwi-c:abc', 'KIWI-C:abc def', 'KIWI-C:' + 'x'.repeat(81), null, '']) assert.equal(W.parseCardScan(code), null, String(code));
});

ok('a scan from a US-keyboard scanner on a French till still finds its client', () => {
  const clients = [{ id: 'c12_abc', name: 'Salma' }, { id: 'w8aqz3', name: 'Karim' }, { id: 'c7_m0', name: 'Nora' }];
  const { W } = load({ clients });
  assert.equal(W.findCard('KIWI-C:c12_abc', clients).name, 'Salma', 'clean scan');
  assert.equal(W.findCard('KIZI)CMc12°qbc', clients).name, 'Salma', 'W→Z, :→M, -→), _→°, a→q');
  assert.equal(W.findCard('KIZI)CMz8qaw3', clients).name, 'Karim', 'w↔z and a↔q inside the id');
  assert.equal(W.findCard('KIWI-C:c7_,0', clients).name, 'Nora', 'm typed as a comma');
  assert.equal(W.findCard('KIWI6C.c12_abc', clients).name, 'Salma', 'an AZERTY scanner on a US keyboard: - as 6, : as .');
  assert.equal(W.findCard('KIWI-C:nobody', clients), null);
});

ok('a scan two clients could match finds nobody', () => {
  const clients = [{ id: 'mx', name: 'A' }, { id: 'x', name: 'B' }];
  const { W } = load({ clients });
  assert.equal(W.findCard('KIZI)CMx', clients), null, '« kiwic·mx » or « kiwicm·x »: ambiguous, refused');
  assert.equal(W.findCard('KIWI-C:mx', clients).name, 'A', 'an exact id still wins');
});

ok('a card burst is taken before the till sees it; an article or a human is left alone', () => {
  const got = [];
  const { W, burst, typed, listeners } = load({ bodyClass: 'is-pos-boutique', clients: [{ id: 'w8a', name: 'Karim' }] });
  W.on('boutique', (rec) => got.push(rec.name));
  assert.ok(listeners.some((l) => l.type === 'keydown' && l.capture === true), 'listens on window, capture phase');
  const card = burst(typed('KIWI-C:w8a'));
  assert.ok(card.stopped && card.prevented, 'the Enter of a card never reaches the till');
  assert.deepEqual(got, ['Karim']);
  const ean = burst(typed('6111234567890'));
  assert.ok(!ean.stopped && !ean.prevented, 'an article scan goes on to the till');
  const human = burst(typed('KIWI-C:w8a'), 140);
  assert.ok(!human.stopped, 'typed by hand (140 ms a key): not a scanner');
  assert.deepEqual(got, ['Karim']);
});

ok('a card scanned into a search box is taken out of the box', () => {
  const { W, burst, typed } = load({ bodyClass: 'is-pos-boutique', clients: [{ id: 'w8a', name: 'Karim' }] });
  W.on('boutique', () => {});
  const input = { tagName: 'INPUT', value: 'sal' + 'KIWI-C:w8a' };
  burst(typed('KIWI-C:w8a'), 6, input);
  assert.equal(input.value, 'sal');
});

ok('the card goes to the open sale of whichever till is on screen', () => {
  const rec = { id: 'w8a', name: 'Karim' };
  const notes = [];
  const restaurant = load({ clients: [rec], sale: { available: () => true, attach: (r) => notes.push('note:' + r.name) } });
  assert.equal(restaurant.W.take('KIWI-C:w8a'), true); assert.deepEqual(notes, ['note:Karim']);
  const sales = [];
  const counter = load({ bodyClass: 'is-pos-epicerie', clients: [rec], sale: { available: () => false }, pos: { isReal: () => true, attachClient: (r) => sales.push(r.name) } });
  assert.equal(counter.W.take('KIWI-C:w8a'), true); assert.deepEqual(sales, ['Karim']);
  assert.match(counter.toasts()[0], /Karim/);
  const closed = load({ clients: [rec], sale: { available: () => false } });
  assert.equal(closed.W.take('KIWI-C:w8a'), true);
  assert.match(closed.toasts()[0], /Ouvrez une note/);
  const unknown = load({ clients: [] });
  assert.equal(unknown.W.take('KIWI-C:w8a'), true);
  assert.match(unknown.toasts()[0], /inconnue/);
  assert.equal(unknown.W.take('6111234567890'), false, 'not a card: the till carries on');
});

/* The receipt QR must name the id the server stores. live-link.js derives it
   (stableId); the real function is lifted from its source so the two cannot drift. */
const LL = fs.readFileSync(path.join(root, 'assets/live-link.js'), 'utf8');
const body = LL.slice(LL.indexOf('  function stableId(merchantId, entry) {'), LL.indexOf('  /* `flow-*` is a local split UI'));
const stableId = vm.runInNewContext('(function(){ var window = { KiwiSaleIdentity: function () { return "ref-only"; } }; function uid(){ return "uid"; }\n' + body + '\n return stableId; })()');

ok('the receipt card link names the very sale id live-link sends the server', () => {
  const ids = ['sale-0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f', 'sale-12345678-aaaa-4bbb-8ccc-1234567890ab', 'sale-ffffffff-0000-4000-8000-000000000000'];
  const W = load({ clients: [] }).W;
  W._cardState({ on: true, merchant: 'pasta-corner' });
  for (const syncId of ids) {
    const url = W.cardUrl({ syncId, clientId: null }, 'https://kiwi-os.com');
    assert.equal(url, 'https://kiwi-os.com/carte/pasta-corner?r=' + stableId('pasta-corner', { id: syncId }));
  }
  let short = 0;
  for (let i = 0; i < 400; i++) {
    const syncId = 'sale-' + [8, 4, 4, 4, 12].map((n) => [...Array(n)].map(() => '0123456789abcdef'[(Math.random() * 16) | 0]).join('')).join('-');
    const want = stableId('pasta-corner', { id: syncId });
    if (/^sale-ref-[0-9a-f]{1,7}-/.test(want)) short++;
    assert.equal(W.cardUrl({ syncId }, 'https://kiwi-os.com'), 'https://kiwi-os.com/carte/pasta-corner?r=' + want);
  }
  assert.ok(short > 0, 'short hashes were met and matched');
});

ok('no receipt card link with a client on the sale, a non-random id, or the card off', () => {
  const W = load({ clients: [] }).W;
  const syncId = 'sale-0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f';
  assert.equal(W.cardUrl({ syncId }, 'https://kiwi-os.com'), '', 'the card state is not known yet');
  W._cardState({ on: false, merchant: 'pasta-corner' });
  assert.equal(W.cardUrl({ syncId }, 'https://kiwi-os.com'), '', 'card off');
  W._cardState({ on: true, merchant: 'pasta-corner' });
  assert.equal(W.cardUrl({ syncId, clientId: 'c1_x' }, 'https://kiwi-os.com'), '', 'a client is on the sale: the visit is already theirs');
  assert.equal(W.cardUrl({ syncId: 'sale-l3k2j1-abc' }, 'https://kiwi-os.com'), '', 'an id without a UUID could be guessed');
  assert.equal(W.cardUrl({ id: '43015' }, 'https://kiwi-os.com'), '', 'a ticket number alone');
  assert.equal(W.cardUrl(null), '');
  assert.equal(W.cardUrl({ syncId, kind: 'acompte' }, 'https://kiwi-os.com'), '', 'a deposit is not a visit yet');
  assert.ok(W.cardUrl({ syncId, kind: 'vente' }, 'https://kiwi-os.com'), 'a sale is');
  W._cardState({ on: true, merchant: 'another-shop' });
  assert.equal(W.cardUrl({ syncId }, 'https://kiwi-os.com'), '', 'state read for another shop');
});

console.log(`wallet-till: ${passed} passed`);
