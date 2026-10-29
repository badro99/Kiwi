#!/usr/bin/env node
const retailSource = require('./pos-retail-test-source.cjs');
'use strict';

const fs = require('fs');
const path = require('path');
const src = retailSource(fs.readFileSync(path.join(__dirname, '..', 'assets', 'pos-boutique.js'), 'utf8'));
// La page Retours du tableau de bord vit dans sa section chargée au premier usage.
const dash = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pages-pro', 'boutique-promos-returns.js'), 'utf8');
const feed = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', 'feed.js'), 'utf8');

const checks = [
  ['Échanges relit les sept jours réels du magasin', /start\.setDate\(start\.getDate\(\) - \(RETAIN_DAYS - 1\)\)[\s\S]*KiwiPosSale\?\.feedDay[\s\S]*'\/api\/feed\?merchant='/.test(src)],
  ['la requête garde le cookie de la caisse appairée', /syncReturnSales[\s\S]*credentials: 'same-origin'/.test(src)],
  ['une référence déjà locale gagne sur la copie serveur', /SALES\.some\(\(s\) => s && s\.id === ref\)/.test(src)],
  ['les tickets serveur sont fusionnés dans le journal des échanges', /serverId:[\s\S]*remote: true/.test(src)],
  ['un ticket sans article identifiable ne devient pas un faux échange', /if \(!lines\.length\) return/.test(src)],
  ['une copie d’une autre caisse ne rend pas deux fois le stock sur un void', /if \(sale\.remote\) return/.test(src)],
  ['le montage déclenche effectivement la synchronisation', /renderAll\(\);\s*syncReturnSales\(\);/.test(src)],
  ['Aujourd’hui et Hier sont des choix directs', /data-bq-ret-day="\$\{todayKey\}"[\s\S]*data-bq-ret-day="\$\{yesterdayKey\}"/.test(src)],
  ['le sélecteur de date reste borné à sept jours', /id="bq-ret-date"[\s\S]*min="\$\{oldestKey\}" max="\$\{todayKey\}"/.test(src)],
  ['la liste montre toutes les ventes du jour choisi', /dateKey\(s\.at\) === state\.retDate/.test(src)],
  ['un retour terminé est écrit dans le document partagé', /feature: 'returns'[\s\S]*recordReturn\(sale, idxs, amount/.test(src)],
  ['les échanges sont eux aussi journalisés', /recordReturn\(sale, \[ex\.idx\], paidUnit\(sale, ln\)/.test(src)],
  ['une ligne multiple conserve le nombre exact de pièces retournées', /function lineReturnedQty\(ln\)[\s\S]*ln\.returnedQty/.test(src)],
  ['la quantité retournée est choisissable sans dépasser le solde vendu', /data-bq-ret-qty=[\s\S]*Math\.min\(lineAvailableQty/.test(src)],
  ['un échange autorise une seule pièce issue d’une ligne multiple', /const qty = pickedQty\(ret, idx, ln\)[\s\S]*(?:state\.exchange = |ticketOwner\.startReturn\(state, )\{ saleId: ret\.saleId, idx, qty: 1[,}]/.test(src)],
  ['le motif choisi suit l’échange jusqu’au registre', /(?:state\.exchange = |ticketOwner\.startReturn\(state, )\{[^}]*motif: ret\.motif/.test(src) && /recordReturn\(sale, \[ex\.idx\], paidUnit\(sale, ln\), ex\.motif \|\| 'Non précisé', 'echange'/.test(src)],
  ['l’avoir utilise la quantité choisie et non toute la ligne', /const quantities = new Map\(idxs\.map[\s\S]*paidUnit\(sale, sale\.lines\[i\]\) \* quantities\.get\(i\)/.test(src)],
  ['seules les pièces réellement rendues reviennent au stock', /const restored = persistStock\(ln\.pid, ln\.size, ln\.color, qty,[\s\S]*markLineReturned\(ln, qty, restored/.test(src)],
  ['le journal propriétaire reçoit la quantité partielle exacte', /const motif = ret\.motif \|\| 'Non précisé'[\s\S]*recordReturn\(sale, idxs, amount, motif, 'avoir', av\.code, quantities\)/.test(src)],
  ['aucun motif n’est inventé quand la vendeuse n’en choisit pas', /state\.ret = \{ saleId, picks: new Set\(\), quantities: new Map\(\), motif: null \}/.test(src)],
  ['la pastille du dashboard se lit sur le type, pas sur le libellé', /kind: ret\.kind \|\| 'avoir'/.test(dash) && /r\.kind === 'echange' \? '(?:<span[^>]*>)?Échangé(?:<\/span>)?' : '(?:<span[^>]*>)?Retourné(?:<\/span>)?'/.test(dash)],
  ['le dashboard lit le même document de retours', /feature: 'returns'[\s\S]*liveReturnsCache[\s\S]*shownReturns\(\)\.flatMap/.test(dash)],
  ['le dashboard réel n’affiche plus les exemples', /const pending = real \? shownReturns\(\)/.test(dash)],
  ['les échanges de la caisse entrent dans la liste du dashboard', /l\.kind === 'echange'\) out\.push\(l\)/.test(dash)],
  ['le serveur ne tronque pas une semaine active à 300 tickets', /const DAY_LIMIT = 2000/.test(feed)],
];

/* Run: mutation paidUnit rounds up instead of down; the source contracts
 * survive but partial returns exceed the paid per-piece centimes. */
{
  const vm = require('node:vm'), strict = require('node:assert/strict');
  const { declaration } = require('./js-declarations.cjs');
  const live = fs.readFileSync(path.join(__dirname, '../assets/pos-boutique/checkout.js'), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(['lineReturnedQty', 'lineAvailableQty', 'markLineReturned', 'returnRatio', 'paidUnit']
    .map(name => declaration(live.slice(live.indexOf('  function ' + name + '(')), name)).join('\n'), ctx);
  const line = { qty: 3, unit: 10 };
  const sale = { lines: [line], reward: true, balanceTotal: 20 };
  strict.equal(Math.round(ctx.paidUnit(sale, line) * 100), 666, 'run: partial refund rounds down to paid centimes');
  ctx.markLineReturned(line, 1, 'partial');
  strict.equal(ctx.lineAvailableQty(line), 2); strict.equal(line.returned, false);
  ctx.markLineReturned(line, 99, 'rest');
  strict.equal(ctx.lineAvailableQty(line), 0); strict.equal(line.returnedQty, 3);
  strict.equal(ctx.lineReturnedQty({ qty: 2, returned: true }), 2, 'run: legacy returned tickets stay exhausted');
  strict.equal(ctx.paidUnit({ lines: [line], total: 30 }, line), 10);
}

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  failed.forEach(([name]) => console.error('  ✗ ' + name));
  process.exit(1);
}
console.log(`  ✓ échanges & avoirs (${checks.length} contrôles : 7 jours, dates, retours partagés, dashboard réel)`);

// Wave S: exercise the real asynchronous reader, including page two and failure.
(async () => {
  const assert = require('node:assert/strict'), vm = require('node:vm');
  const start = dash.indexOf('  const loadReturnsLedger =');
  assert.ok(start >= 0, 'server ledger reader exists');
  const reader = dash.slice(start, dash.indexOf('  function loadLiveCredits', start));
  async function run(fail) {
    const cache = [{ id: 'cached', items: [] }];
    const context = vm.createContext({ liveReturns: cache, liveReturnsSlug: 'shop', returnsLoading: false,
      returnsState: '', returnsServer: false, encodeURIComponent, Number, Error,
      document: { querySelector: () => null }, calls: [],
      fetch: async (url, options) => {
        context.calls.push(url); assert.equal(options.credentials, 'same-origin');
        const offset = Number(new URL(url, 'https://kiwi.test').searchParams.get('offset'));
        if (fail === true || (fail === 'second' && offset)) throw new Error('offline');
        return { ok: true, json: async () => ({ ok: true,
          list: Array.from({ length: offset ? 100 : 500 }, (_, i) => ({ id: 'server-' + (i + offset), ts: 1, amount: 2, reason: 'size', saleRef: 'ticket-' + i })),
          next: offset ? null : 500 }) };
      } });
    vm.runInContext(reader + ';this.readLedger = loadReturnsLedger;', context);
    await context.readLedger('shop');
    return context;
  }
  const full = await run(false);
  assert.equal(full.liveReturns.length, 600); assert.equal(full.calls.length, 2);
  assert.equal(full.liveReturns[599].id, 'server-599'); assert.equal(full.returnsState, 'ready');
  const partial = await run('second');
  assert.equal(partial.liveReturns[0].id, 'cached', 'a failed second page never exposes a partial history as complete');
  const offline = await run(true);
  assert.equal(offline.liveReturns[0].id, 'cached'); assert.equal(offline.returnsState, 'failed');
  assert.match(dash, /role="status"[\s\S]*historique incomplet/);
  const binding = dash.slice(dash.indexOf('  function bindLiveReturns()'), dash.indexOf('  const loadReturnsLedger ='));
  const cachedContext = vm.createContext({ window: { KiwiCloudDoc: { currentSlug: () => 'shop', attach: () => ({ bind() {} }) } },
    realReturnsStore: () => true, liveReturnsSlug: '', liveReturns: [], liveReturnsCloud: null,
    returnsState: '', returnsServer: false, liveReturnsCache: [], loadReturnsLedger() {},
    localStorage: { getItem: () => JSON.stringify({ m: 'shop', list: [{ id: 'disk-cache' }] }) } });
  vm.runInContext(binding + ';bindLiveReturns();', cachedContext);
  assert.equal(cachedContext.liveReturns[0].id, 'disk-cache', 'failure fallback loads the till cache');
  cachedContext.liveReturnsSlug = ''; cachedContext.localStorage.getItem = () => JSON.stringify({ m: 'other', list: [{ id: 'wrong-shop' }] });
  vm.runInContext('bindLiveReturns()', cachedContext);
  assert.equal(cachedContext.liveReturns.length, 0, 'another merchant cache never appears');
  const node = () => ({ dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    querySelector: () => node(), querySelectorAll: () => [], addEventListener() {}, setAttribute() {} });
  function render(rows, state, lang = 'fr') {
    let body;
    const handlers = {};
    const source = dash.replace('let liveReturns = [];', 'let liveReturns = ' + JSON.stringify(rows) + ';')
      .replace("let liveReturnsSlug = '';", "let liveReturnsSlug = 'shop';")
      .replace("let returnsState = ''", 'let returnsState = ' + JSON.stringify(state));
    vm.runInNewContext(source, { window: { Kiwi: { handlers, appPage: (_, options) => { body = options.body; return { el: node() }; } },
      KiwiEnv: { isReal: () => true }, KiwiI18n: { getLang: () => lang },
      KiwiCloudDoc: { currentSlug: () => 'shop', attach: () => ({ bind() {} }) } },
      document: { getElementById: () => null, createElement: () => node(), head: { appendChild() {} }, querySelector: () => null },
      setTimeout() {}, clearTimeout() {} });
    handlers['nav-returns']();
    return body;
  }
  const html = render(full.liveReturns, 'ready');
  assert.equal((html.match(/data-ret-row /g) || []).length, 600, 'register renders all 600 server events');
  assert.ok(html.includes('ticket-99')); assert.ok(html.includes('size'));
  for (const [lang, notice] of [['fr', 'historique incomplet'], ['en', 'history is incomplete'], ['ar', 'السجل غير مكتمل']]) {
    const fallback = render([{ id: 'cached', ts: 1, amount: 2, saleRef: 'cached-ticket' }], 'failed', lang);
    assert.ok(fallback.includes(notice)); assert.ok(fallback.includes('cached-ticket'));
  }

  console.log('  ✓ Wave S: 600 server returns and explicit incomplete-cache fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
