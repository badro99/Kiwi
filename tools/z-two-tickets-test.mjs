/* Le rapport Z de la boutique sort en deux tickets (magasin, puis livraisons).
 * Sans imprimante thermique, la caisse passe par la boîte d'impression du
 * système : le second ticket effaçait le premier avant l'ouverture de la boîte,
 * et seul le ticket livraisons sortait (signalé par le propriétaire, 30 oct.).
 * Ce test rejoue le tirage tel que zPrintPair l'enchaîne, et vérifie aussi
 * l'écran de clôture : la caisse hors livraisons, puis les livraisons. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import printerSource from './printer-test-source.cjs';

function realm() {
  const byId = new Map(), timers = [], printed = [];
  const el = (tag) => ({ tag, id: '', innerHTML: '', attrs: {}, style: {},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    insertAdjacentHTML(_, html) { this.innerHTML += html; },
    remove() { if (byId.get(this.id) === this) byId.delete(this.id); },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  const attach = (node) => { if (node.id) byId.set(node.id, node); return node; };
  const storage = new Map();
  const ctx = vm.createContext({ console, Promise, Uint8Array, AbortController, URLSearchParams,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    navigator: {}, location: { hostname: 'localhost', search: '', origin: 'http://localhost' },
    document: { createElement: el, getElementById: (id) => byId.get(id) || null,
      head: { appendChild: attach }, body: { appendChild: attach }, addEventListener() {}, querySelector() { return null; } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) }),
  });
  ctx.window = ctx;
  ctx.print = () => { const r = byId.get('kpr-print-root'); printed.push(r ? r.innerHTML : ''); };
  vm.runInContext(printerSource(), ctx);
  return { ctx, timers, printed, run() { while (timers.length) timers.shift()(); } };
}

const report = (net) => ({ day: '2026-10-30', net, txns: 1, sales: [], categories: [], payments: {}, cash: {} });
{
  const r = realm();
  const P = r.ctx.KiwiPrinter;
  assert.equal(typeof P.printDayReport, 'function');
  /* Exactement l'enchaînement de zPrintPair : le second part quand le premier a répondu. */
  const first = await P.printDayReport({ report: report(450), title: 'RAPPORT Z · HORS LIVRAISONS' });
  assert.ok(first.ok);
  const second = await P.printDayReport({ report: report(300), title: 'RAPPORT Z · LIVRAISONS', noDrawer: true });
  assert.ok(second.ok);
  r.run();
  assert.equal(r.printed.length, 1, 'une seule boîte d’impression pour les deux tickets');
  assert.match(r.printed[0], /HORS LIVRAISONS/, 'le ticket magasin est imprimé');
  assert.match(r.printed[0], /RAPPORT Z · LIVRAISONS/, 'le ticket livraisons est imprimé');
  assert.ok(r.printed[0].indexOf('HORS LIVRAISONS') < r.printed[0].indexOf('RAPPORT Z · LIVRAISONS'), 'magasin d’abord');
  assert.match(r.printed[0], /kpr-break/, 'saut de page entre les deux');
  /* Une impression plus tard repart d'une page neuve. */
  await P.printDayReport({ report: report(10), title: 'RAPPORT JOURNALIER' });
  r.run();
  assert.equal(r.printed.length, 2);
  assert.doesNotMatch(r.printed[1], /HORS LIVRAISONS/, 'pas de reste du tirage précédent');
}

/* Santos, 31 oct. : une imprimante réglée (Windows via le pont) mais injoignable.
 * Chaque ticket tentait le pont, échouait plus tard, puis retombait seul sur la
 * boîte d'impression : le second n'y arrivait plus. zPrintPair les envoie
 * maintenant en un seul travail. */
{
  const r = realm();
  r.ctx.localStorage.setItem('kiwiPrinterCfg', JSON.stringify({ osPrinter: 'POS-80' }));
  let sent = 0;
  r.ctx.KiwiEscPos = { dayReport: (o) => { const b = new Uint8Array([1, 2, 3]); b.title = o.title; return b; }, toB64: () => '', unsupportedLines: () => 0 };
  r.ctx.fetch = () => { sent++; return new Promise((_, no) => r.timers.push(() => no(new Error('bridge down')))); };
  const P = r.ctx.KiwiPrinter;
  const src = fs.readFileSync('assets/pos-boutique/z-split.js', 'utf8').replace(/^export \{[^}]*\};?\s*$/m, '');
  vm.runInContext(src + ';globalThis.zPrintPairT = zPrintPair;', r.ctx);
  const print = (rep, copy, only) => P.printDayReport({ report: rep, title: only === 'delivery' ? 'RAPPORT Z · LIVRAISONS' : 'RAPPORT Z · HORS LIVRAISONS' });
  const done = r.ctx.zPrintPairT(print, { store: report(13150), delivery: report(0) }, '');
  for (let i = 0; i < 40; i++) { r.run(); await new Promise((ok) => setImmediate(ok)); }
  const res = await done;
  assert.ok(res.ok, 'le Z répond imprimé');
  assert.ok(sent >= 1, 'le pont a bien été tenté');
  assert.equal(r.printed.length, 1, 'une seule boîte Windows');
  assert.match(r.printed[0], /HORS LIVRAISONS/);
  assert.match(r.printed[0], /RAPPORT Z · LIVRAISONS/, 'le ticket livraisons sort aussi quand le pont est réglé mais injoignable');
  assert.match(r.printed[0], /kpr-break/);
}

/* L'écran : les lignes et les deux chiffres d'après-clôture. */
{
  const src = fs.readFileSync('assets/pos-boutique/z-split.js', 'utf8').replace(/^export \{[^}]*\};?\s*$/m, '');
  const ctx = vm.createContext({ window: { KiwiCaisseLang: { get: () => 'fr', tr: (s) => s } } });
  ctx.globalThis = ctx;
  vm.runInContext(src + ';globalThis.Z = { zStoreHead, zDeliveryRows, zCloseTotals };', ctx);
  const fmt = (n) => n.toFixed(2) + ' MAD', esc = (s) => String(s).replace(/</g, '&lt;');
  assert.equal(JSON.stringify(ctx.Z.zStoreHead()), JSON.stringify(['Caisse · hors livraisons', '', false, 'head']));
  const rows = ctx.Z.zDeliveryRows({ txns: 3, items: 5, discounts: 0, delivery: 870 }, fmt);
  assert.equal(JSON.stringify(rows.map((x) => x[0])), JSON.stringify(['Livraisons', 'Ventes en livraison', 'Articles en livraison', 'Montant à recevoir']));
  assert.equal(rows.at(-1)[1], '870.00 MAD');
  const html = ctx.Z.zCloseTotals({ store: { net: 1200 }, delivery: { net: 0, receivable: 870 } }, 2070, fmt, esc);
  assert.match(html, /Caisse · hors livraisons.*1200\.00 MAD.*Livraisons · à recevoir.*870\.00 MAD/s);
  assert.doesNotMatch(html, /2070/, 'pas de total mélangé quand les deux tickets existent');
  assert.match(ctx.Z.zCloseTotals(null, 2070, fmt, esc), /2070\.00 MAD/);
  ctx.window.KiwiCaisseLang.get = () => 'en';
  assert.equal(ctx.Z.zStoreHead()[0], 'Till · excluding deliveries');
}
console.log('✓ z-two-tickets : deux tickets dans la même impression, écran en deux blocs');
