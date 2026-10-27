#!/usr/bin/env node
/* Promotions dashboard · la page TOURNE (vague 12).
 *
 * tools/promotions-dashboard-test.mjs lisait assets/boutique-promos-dashboard.js
 * comme du texte (sauf saveVerdict). Ici le fichier livré, le moteur réel
 * assets/promos.js et ses règles assets/promo-rules.js tournent ensemble dans vm ;
 * seuls le catalogue, la fenêtre modale, le toast et le DOM sont des doubles.
 *   node tools/promotions-dashboard-run-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ── le monde autour de la page ───────────────────────────────────────────── */
function stubNode() {
  const memo = new Map();
  const node = { innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, remove() {}, focus() {},
    querySelector(sel) { if (!memo.has(sel)) memo.set(sel, stubNode()); return memo.get(sel); } };
  return node;
}
function world({ lang = 'fr', trade = 'boutique' } = {}) {
  const store = new Map();
  const toasts = [], pages = [], modals = [], printed = [];
  const handlers = {};
  const T = 'EAN';
  const variants = { shirt: [{ id: 'v1', colorLabel: 'Bleu', size: 'M', stock: 3, ean: '6111111111116' }] };
  const catalog = {
    use() {}, listVariants: (id) => variants[id] || [], primaryBarcode: (v) => v.ean,
    compat: () => ({ RAYONS: [{ id: 'r1', name: 'Robes' }], BY_EAN: {}, P: {
      shirt: { id: 'shirt', name: 'Chemise', price: 200, cost: 80, rayon: 'r1', createdAt: Date.now() - 400 * 86400000, sizes: {} },
      scarf: { id: 'scarf', name: 'Foulard', price: 100, cost: 150, rayon: 'r1', createdAt: Date.now() - 400 * 86400000, sizes: {} } } }),
  };
  const document = { addEventListener() {}, querySelector: () => null, getElementById: () => null, documentElement: { lang }, head: { appendChild() {} }, createElement: () => stubNode() };
  const window = {
    Kiwi: { handlers, toast: (t, o) => toasts.push({ title: t, ...(o || {}) }),
      appPage: (name, o) => pages.push({ name, ...o }),
      modal: (o) => { const m = { opts: o, el: stubNode(), close() { m.closed = true; } }; modals.push(m); return m; } },
    KiwiI18n: { getLang: () => lang }, KiwiBoutiqueCatalog: catalog, KiwiStoreTemplates: { currentTrade: () => trade },
    KiwiBarcode: { isValidEan13: () => true, printLabels: (labels, o) => printed.push({ labels, o }) },
    document, addEventListener() {},
  };
  window.window = window;
  const ctx = vm.createContext({ window, document, KiwiI18n: window.KiwiI18n, Intl, Date, JSON, Math, Promise, console,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    setTimeout, clearTimeout, CustomEvent: function () {}, CSS: undefined });
  for (const f of ['assets/promo-rules.js', 'assets/promos.js', 'assets/boutique-promos-dashboard.js']) vm.runInContext(read(f), ctx, { filename: f });
  return { window, handlers, toasts, pages, modals, printed, store, K: window.Kiwi };
}
const html = (w) => w.pages.at(-1).body;

console.log('promotions dashboard · the page runs against the real engine');

await ok('no promotion yet: the empty state explains the till, receipts and labels, and offers the three starter templates as drafts', () => {
  const w = world();
  w.handlers['nav-promos']();
  const page = w.pages.at(-1);
  assert.equal(page.name, 'promos'); assert.equal(page.title, 'Promotions');
  for (const text of ['La caisse applique le bon prix automatiquement', 'Tickets & reçus', 'Prêtes à imprimer', 'rien ne change avant votre validation'])
    assert.ok(page.body.includes(text), text);
  for (const key of ['destock', 'finserie', 'weekend']) assert.ok(page.body.includes(`data-action="bpd-starter" data-arg="${key}"`), key);
  assert.equal(w.toasts.length, 0, 'no error toast');
});
await ok('the same empty state speaks English and Arabic, never French, when the language changes', () => {
  for (const [lang, probe] of [['en', 'Receipts'], ['ar', 'الإيصالات']]) {
    const w = world({ lang });
    w.handlers['nav-promos']();
    assert.ok(html(w).includes(probe), lang + ' lacks ' + probe + ' in ' + html(w).slice(0, 200));
    assert.ok(!html(w).includes('Prêtes à imprimer'), lang + ' leaks French');
  }
});
await ok('a starter opens the composer: three numbered steps, a live preview, pressed state on choices, nothing saved yet', () => {
  const w = world();
  w.handlers['nav-promos']();
  w.handlers['bpd-starter'](null, 'weekend');
  assert.equal(w.modals.length, 1);
  const shell = w.modals[0].el.querySelector('[data-bpd-shell]');
  for (const t of ['Définir l’offre', 'Choisir les articles', 'Programmer la durée', 'Aperçu en direct', 'Lancer la promotion']) assert.ok(shell.innerHTML.includes(t), t);
  assert.match(shell.innerHTML, /aria-pressed="(?:true|false)"/);
  assert.equal(w.window.KiwiPromos.list().length, 0, 'a template stays a draft until « Lancer »');
});
await ok('launching saves the rule in the real engine, names it, tells the till is up to date, and the page lists it with a pause and a delete', async () => {
  const w = world();
  w.handlers['bpd-starter'](null, 'weekend');
  const shell = w.modals[0].el.querySelector('[data-bpd-shell]');
  shell.querySelector('#bpd-save').onclick();
  const saved = w.window.KiwiPromos.list();
  assert.equal(saved.length, 1); assert.equal(saved[0].name, 'Week-end'); assert.equal(saved[0].kind, 'percent'); assert.equal(saved[0].value, 10);
  assert.equal(w.modals[0].closed, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(w.toasts.some((t) => /lancée, la caisse est à jour/.test(t.title)), JSON.stringify(w.toasts.map((t) => t.title)));
  assert.ok(html(w).includes('Week-end') && html(w).includes('data-action="bpd-toggle"') && html(w).includes('data-action="bpd-delete"'));
});
await ok('a rule the shop settings forbid is refused with its reason, the launch button is disabled, and a forced click writes nothing', () => {
  const w = world();
  const p = w.window.KiwiPromos.save({ name: 'Soldes', kind: 'percent', value: 15, scope: { type: 'tout' } });
  w.window.KiwiDiscountPolicy = { configured: () => true, allowed: (v) => v === 10, percentages: () => [10] };
  w.handlers['bpd-edit'](null, p.id);
  const shell = w.modals.at(-1).el.querySelector('[data-bpd-shell]');
  assert.ok(shell.innerHTML.includes('Vos réglages autorisent seulement −10 %'), 'the reason is shown');
  assert.match(shell.innerHTML, /id="bpd-save" disabled/);
  const before = w.window.KiwiPromos.get(p.id).updatedAt;
  shell.querySelector('#bpd-save').onclick();
  assert.equal(w.window.KiwiPromos.get(p.id).updatedAt, before, 'validation runs before the write');
  assert.equal(w.window.KiwiPromos.get(p.id).value, 15);
});
await ok('pause and resume go through the engine and the page says so', async () => {
  const w = world();
  const p = w.window.KiwiPromos.save({ name: 'Soldes', kind: 'percent', value: 25, scope: { type: 'tout' } });
  w.handlers['bpd-toggle'](null, p.id);
  assert.equal(w.window.KiwiPromos.get(p.id).paused, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(w.toasts.some((t) => /mise en pause/.test(t.title)));
  w.handlers['bpd-toggle'](null, p.id);
  assert.equal(w.window.KiwiPromos.get(p.id).paused, false);
});
await ok('delete asks first, keeps the rule when cancelled, removes it when confirmed, and the page re-renders without it', async () => {
  const w = world();
  const p = w.window.KiwiPromos.save({ name: 'Soldes', kind: 'percent', value: 25, scope: { type: 'tout' } });
  w.handlers['bpd-delete'](null, p.id);
  const m = w.modals.at(-1);
  assert.match(m.opts.title, /Supprimer/);
  assert.ok(w.window.KiwiPromos.get(p.id), 'nothing deleted before the confirmation');
  m.el.querySelector('[data-confirm]');
  m.el.querySelector('[data-delete]').onclick();
  assert.equal(w.window.KiwiPromos.get(p.id), null);
  assert.equal(m.closed, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(w.toasts.some((t) => /supprimée/.test(t.title)));
  assert.ok(!html(w).includes('Soldes'));
});
await ok('labels print through the barcode bridge, carrying the price actually applied at the till', () => {
  const w = world();
  const p = w.window.KiwiPromos.save({ name: 'Soldes', kind: 'percent', value: 50, scope: { type: 'tout' } });
  w.handlers['bpd-print'](null, p.id);
  const m = w.modals.at(-1);
  m.el.querySelector('[data-print]').onclick();
  assert.equal(w.printed.length, 1);
  const label = plain(w.printed[0].labels)[0];
  assert.equal(label.title, 'Chemise'); assert.equal(label.code, '6111111111116');
  assert.equal(label.price, '100', '50 % off 200 MAD'); assert.equal(label.was, '200');
  assert.equal(w.printed[0].o.copies, 1); assert.equal(m.closed, true);
});
await ok('the toast waits for the server: a promotion kept here but not yet sent says so instead of « la caisse est à jour »', async () => {
  const w = world();
  w.window.KiwiPromos.lastCommit = () => ({ local: true, server: Promise.resolve({ ok: false, status: 0, offline: true }) });
  w.handlers['bpd-starter'](null, 'weekend');
  w.modals[0].el.querySelector('[data-bpd-shell]').querySelector('#bpd-save').onclick();
  assert.equal(w.toasts.length, 0, 'nothing is said before the server answers');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.toasts.length, 1);
  assert.equal(w.toasts[0].type, 'warn'); assert.ok(!/la caisse est à jour/.test(w.toasts[0].title)); assert.match(w.toasts[0].desc, /en attente/);
});
await ok('nothing is lost and nothing is claimed when the browser storage is full and the server is out: the unsaved warning shows', async () => {
  const w = world();
  w.window.KiwiPromos.lastCommit = () => ({ local: false, server: Promise.resolve({ ok: false, status: 0 }) });
  w.handlers['bpd-starter'](null, 'weekend');
  w.modals[0].el.querySelector('[data-bpd-shell]').querySelector('#bpd-save').onclick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.toasts[0].title, 'Non enregistrée sur cet appareil');
});
await ok('the sync note and the « la caisse est à jour » promise are only made for trades whose till reads promotions', () => {
  const pharmacy = world({ trade: 'pharmacie' });
  pharmacy.window.KiwiPromos.save({ name: 'Soldes', kind: 'percent', value: 25, scope: { type: 'tout' } });
  pharmacy.handlers['nav-promos']();
  assert.ok(!html(pharmacy).includes('Synchronisé avec la caisse') && html(pharmacy).includes('Remise à saisir au comptoir'));
  const shop = world({ trade: 'boutique' });
  shop.window.KiwiPromos.save({ name: 'Soldes', kind: 'percent', value: 25, scope: { type: 'tout' } });
  shop.handlers['nav-promos']();
  assert.ok(html(shop).includes('Synchronisé avec la caisse'));
});

await ok('the demo promotions page (Maison Mansour, invented numbers, buttons that wrote nothing) is no longer shipped beside the real one', () => {
  const chunk = read('assets/pages-pro/boutique-promos-returns.js');
  assert.doesNotMatch(chunk, /handlers\['(?:nav-promos|promo-[a-z-]+)'\]\s*=/, 'the returns chunk registers no promotion handler');
  assert.ok(!chunk.includes("P-2811") && !chunk.includes('Planifier une promotion'));
  const registry = read('assets/pages-pro.js');
  const entry = /url: 'assets\/pages-pro\/boutique-promos-returns\.js[^']*', handlers: (\[[^\]]+\])/.exec(registry);
  assert.ok(entry);
  assert.ok(!JSON.parse(entry[1]).some((n) => /^(?:nav-promos|promo-)/.test(n)), 'the lazy registry does not stub them either');
  const w = world();
  assert.equal(typeof w.handlers['nav-promos'], 'function', 'the dashboard file owns nav-promos');
});

console.log(`\npromotions-dashboard-run: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
