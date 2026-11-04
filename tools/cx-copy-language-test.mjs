/* Runtime copy regressions. KIWI_COPY_HEAD=1 runs the same cases on untouched HEAD. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const read = file => process.env.KIWI_COPY_HEAD ? execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) : fs.readFileSync(file, 'utf8');
function fn(file, name) {
  const src = read(file), ast = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let result;
  const visit = n => { if (ts.isFunctionDeclaration(n) && n.name?.text === name) result = n.getText(ast); ts.forEachChild(n, visit); };
  visit(ast); assert.ok(result, name); return result.replace(/^export /, '');
}
const fixture = fs.readFileSync('tools/caisse-lang-test.js', 'utf8');
const realm = vm.createContext({ source: read('assets/caisse-lang.js'), vm, console });
vm.runInContext(fixture.slice(fixture.indexOf('const store ='), fixture.indexOf('let failed =')) + '\nthis.L = L;', realm);
const L = realm.L;
const i18nSrc = read('assets/i18n.js');
const ast = ts.createSourceFile('i18n.js', i18nSrc, ts.ScriptTarget.Latest, true);
let dict;
const find = n => { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'T') dict = n.initializer.getText(ast); ts.forEachChild(n, find); }; find(ast);
const T = vm.runInNewContext('(' + dict + ')');
let failed = 0;
async function test(name, run) { try { await run(); console.log('PASS ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message.split('\n')[0]); } }
for (const locale of ['fr', 'en', 'ar']) {
 L.set(locale);
 const tr = s => L.tr(s), store = { getItem: () => locale };
 await test('invoice known/refused codes ' + locale, async () => {
   for (const code of ['invalid-ice', 'invalid-customer', 'forbidden-merchant', 'invoice-creation-failed']) {
     const messages = [];
     const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => '' }, getCachedInvoices: () => ({}), reserveWindow: () => null,
       cacheKey: () => 'cache:local', INVOICE_CACHE_KEY: 'cache', build: () => ({}), TOAST: { error: 'error' }, toast: text => messages.push(text),
       L: (key, fr) => T[locale]?.['invoice.' + key] || fr,
       requestInvoice: async () => ({ res: { ok: false, status: 400 }, data: { error: code, detail: 'Détail serveur synthétique' } }) });
     vm.runInContext(fn('assets/invoice.js', 'generate'), ctx);
     await ctx.generate({ id: 'fixture-sale', customer: {} });
     const message = messages.at(-1);
     assert.ok(message.includes('\n'), 'technical detail must be secondary');
     assert.ok(message.endsWith('Détail serveur synthétique'));
     const key = code === 'invalid-ice' ? 'iceInvalid' : code === 'invalid-customer' ? 'invalidRequest' : code === 'forbidden-merchant' ? 'forbidden' : 'serverRefusal';
     if (locale !== 'fr') assert.ok(message.startsWith(T[locale]['invoice.' + key]));
   }
 });
 await test('transfer and merge generic/stale errors ' + locale, async () => {
   for (const name of ['confirmCaisseTransfer', 'confirmCaisseMerge']) for (const error of ['raw-French-detail', 'stale-table-visit']) {
     const messages = [], nodes = new Map();
     const ctx = vm.createContext({ window: { KiwiCaisseLang: L }, ctrfFromId: 'A', ctrfSelectedToId: 'B', cmrgSourceId: 'A', cmrgSelectedTargetId: 'B', liveTableSplit: () => null,
       tables: { A: {}, B: {} }, IS_DEMO: false, $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
       caisseMobilityIntent: () => ({}), currentMerchantSlug: () => 'fixture', toast: m => messages.push(m), fetch: async () => ({ ok: false, status: 409, json: async () => ({ error }) }) });
     vm.runInContext(fn('assets/caisse-floor/transfer-merge.js', name), ctx); await ctx[name]();
     assert.equal(messages.length, 1);
     assert.ok(!messages[0].includes('raw-French-detail'));
     if (locale !== 'fr') assert.doesNotMatch(messages[0], /impossible|actualiser|Vérifiez/);
   }
 });
 await test('customer search and creation ' + locale, () => {
   const el = { innerHTML: '' }, nodes = new Map();
   const ctx = vm.createContext({ window: {}, root: {}, tr, esc: String, clienteHits: () => [], icons() {}, openVeil() {},
     $: id => id === '#bq-clientm' ? el : (nodes.has(id) ? nodes.get(id) : (nodes.set(id, {}), nodes.get(id))), $$: () => [] });
   vm.runInContext(fn('assets/pos-boutique/sales.js', 'openClientModal'), ctx); ctx.openClientModal();
   assert.ok(el.innerHTML.includes(tr('Rechercher par nom ou par numéro de téléphone.')));
   nodes.get('#bq-cl-new').onclick();
   assert.ok(el.innerHTML.includes(tr('Créer la fiche')));
   if (locale !== 'fr') assert.doesNotMatch(el.innerHTML, /Nouvelle cliente|Nom et prénom|Créer la fiche|aria-label="Fermer"/);
 });
 await test('return lookup empty/search results ' + locale, () => {
   for (const q of ['', 'fixture']) {
     const panel = { innerHTML: '' }, nodes = new Map(), state = { retQuery: q, retDate: '2026-11-04' };
     const ctx = vm.createContext({ root: {}, state, SALES: [], RETAIN_DAYS: 7, Date, tr, esc: String, retDayKey: () => '2026-11-04', retShiftDay: () => '2026-11-03', activeAvoirs: () => [], icons() {},
       $: id => id.startsWith('[data-bq-panel') ? panel : (nodes.has(id) ? nodes.get(id) : (nodes.set(id, {}), nodes.get(id))) });
     vm.runInContext(fn('assets/pos-boutique/checkout.js', 'renderEchanges'), ctx); ctx.renderEchanges();
     assert.ok(panel.innerHTML.includes(tr(q ? 'Vérifiez le n° de ticket ou le téléphone.' : 'Retrouver une vente')));
     assert.doesNotMatch(panel.innerHTML, /style="display:flex|style="width:40px|style="font-weight:600/);
   }
 });
 await test('promotion localized badges preserve FR ' + locale, () => {
   const src = read('functions/api/_rules-promotion-pricing.js').replace(/^export /gm, '');
   const ctx = vm.createContext({ Intl }); vm.runInContext(src + '\nthis.resolve = resolveMenu;', ctx);
   for (const kind of ['amount', 'fixed', 'percent']) {
     const p = { id: 'fixture', kind, value: 12.5, all: true }, moment = { date: 1 };
     Object.assign(ctx, { p, moment, locale });
     const got = vm.runInContext('resolveMenu([p], {}, 100, moment, locale)', ctx);
     assert.ok(got);
     const expected = kind === 'percent' ? '−12.5 %' : (kind === 'amount' ? '−' : '') + '12,5 MAD';
     if (locale === 'fr') assert.equal(got.promo.badge, expected);
     else if (locale === 'en') assert.ok(got.promo.badge.includes('12.5'));
     else assert.ok(got.promo.badge.includes('د.م.') || kind === 'percent' && got.promo.badge.includes(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(12.5)));
     assert.equal(got.price, kind === 'fixed' ? 12.5 : 87.5);
   }
 });
 await test('till promotion renderer selects its locale ' + locale, () => {
   const ctx = vm.createContext({ Intl, localStorage: store });
   vm.runInContext(read('assets/promo-rules.js'), ctx); vm.runInContext(read('assets/menu-promos.js'), ctx);
   const p = { id: 'fixture', name: 'Fixture', kind: 'amount', value: 12.5, all: true };
   ctx.p = p;
   const badge = vm.runInContext('KiwiMenuPromos.resolve([p], {}, 100, Date.UTC(2026, 10, 4, 12)).promo.badge', ctx);
   assert.equal(badge, ctx.KiwiMenuPromos.badge(p));
   if (locale === 'en') assert.ok(badge.includes('12.5'));
   if (locale === 'ar') assert.ok(badge.includes('د.م.'));
 });
 await test('folded detail rehydrates count and legacy label ' + locale, () => {
   const ctx = vm.createContext({ window: {}, localStorage: store });
   let helper = ''; try { helper = fn('assets/pos-sale.js', 'foldedLine'); } catch (_) {}
   vm.runInContext(helper + fn('assets/pos-sale.js', 'foldLines') + fn('assets/pos-sale.js', 'cleanLine'), ctx);
   const folded = vm.runInContext("foldLines(Array.from({ length: 45 }, () => ({ name: 'Fixture', qty: 1, total: .11 })))", ctx);
   assert.equal(folded[39].foldedCount, 6); assert.equal(folded[39].total, .66);
   for (const line of [JSON.parse(JSON.stringify(folded[39])), { name: '6 autres articles', qty: 6, total: .66 }]) {
     ctx.line = line; const clean = vm.runInContext('cleanLine(line)', ctx); assert.equal(clean.foldedCount, 6);
     assert.equal(clean.name, '6' + (locale === 'en' ? ' other items' : locale === 'ar' ? ' أصناف أخرى' : ' autres articles'));
   }
 });
 await test('Shopify health codes and legacy French ' + locale, () => {
   let paint;
   if (process.env.KIWI_COPY_HEAD) {
     const src = read('assets/channel-link.js'), ast = ts.createSourceFile('channel.js', src, ts.ScriptTarget.Latest, true);
     let block; const visit = n => { if (ts.isIfStatement(n) && n.expression.getText(ast) === 'connection.lastError') block = n.getText(ast); ts.forEachChild(n, visit); }; visit(ast);
     paint = (err, error) => vm.runInNewContext(block, { connection: { lastError: error }, document: { createElement: () => err }, root: { appendChild() {} } });
   }
   else { const ctx = vm.createContext({ window: { KiwiI18n: { T } }, localStorage: store }); vm.runInContext(read('assets/channel-health.js').replace('export ', ''), ctx); paint = ctx.paint; }
   for (const code of ['stock-pending', 'stock-dead', 'stock-short', 'unrecognized French error', 'Stock Shopify à synchroniser : commande fixture']) {
     const err = {}; paint(err, code);
     if (locale !== 'fr') assert.ok(err.textContent === T[locale]['shopify.health.' + (/^stock-/.test(code) ? code : code.startsWith('Stock Shopify') ? 'stock-pending' : 'error')]);
   }
 });
}
await test('Shopify retry stores a code without merchant details', async () => {
 const src = read('functions/api/shopify/_inbound-stock.js').replace(/^export /gm, ''), writes = [];
 const row = { merchant: 'fixture', order_ref: 'fixture-ref', attempts: 19, payload: '{}' };
 const DB = { prepare(sql) { return { bind(...values) { return { all: async () => ({ results: [row] }), run: async () => { writes.push({ sql, values }); } }; } }; } };
 const ctx = vm.createContext({ Date, env: { DB } }); vm.runInContext(src, ctx); await ctx.flushInboundStock({ DB }, async () => ({ unmatched: 1 }));
 const error = JSON.parse(writes.find(w => w.sql.includes('UPDATE shopify_connections')).values[0]);
 assert.equal(error.code, 'stock-dead'); assert.equal(error.orderRef, 'fixture-ref'); assert.equal(error.attempts, 20);
 const shape = vm.createContext({ clean: v => String(v || ''), n: v => Number(v) || 0 });
 vm.runInContext(fn('functions/api/shopify/status.js', 'shapeConnection'), shape);
 shape.row = { last_error: JSON.stringify(error) };
 const out = vm.runInContext('shapeConnection(row)', shape);
 assert.equal(out.lastError, 'stock-dead'); assert.equal(out.lastErrorContext.orderRef, 'fixture-ref');
});
await test('gate scanner checks returned account HTML', () => {
 const src = read('tools/dynamic-i18n-test.mjs');
 const body = src.slice(src.indexOf('const translated ='), src.indexOf('// Cas de non-régression')).replace('export function scan', 'function scan');
 const ctx = vm.createContext({ ts }); vm.runInContext(body, ctx);
 assert.equal(ctx.scan('function authPage() { return `<p>Bonjour ${t.name}</p>`; }', 'functions/_middleware.js').length, 1);
 assert.equal(ctx.scan('function authPage() { return `<p aria-label="Kiwi">${t.welcome}</p><a>FR</a><a>EN</a><a>AR</a>`; }', 'functions/_middleware.js').length, 0);
});
await test('invoice technical detail is a separate toast description', () => {
 const calls = [], ctx = vm.createContext({ window: { Kiwi: { toast: (...args) => calls.push(args) } } });
 vm.runInContext(fn('assets/invoice.js', 'toast'), ctx); ctx.toast('Translated title\nTechnical detail', 'error');
 assert.equal(calls[0][0], 'Translated title'); assert.equal(calls[0][1].desc, 'Technical detail');
});
if (failed) process.exitCode = 1;
