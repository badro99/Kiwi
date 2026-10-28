#!/usr/bin/env node
// Uses browser-trace through the shared harness (Chromium; run serially).
/* Une vente encaissée à la caisse survit à un onglet tué entre « payé » et
 * « le serveur a confirmé », et n'est comptée qu'une fois.
 *
 * Les tests de propriétés de la caisse vérifient le calcul sur du code extrait ;
 * live-link-crash-browser-test tue l'onglet après postSale() appelé à la main.
 * Ici tout passe par l'écran : la vraie caisse boutique appairée, un article
 * touché, « Valider », espèces, « Encaisser ». La vente part vers la VRAIE
 * route functions/api/sale.js (schema.sql en SQLite mémoire, jeton de caisse
 * signé), puis :
 *   K1 · le serveur enregistre la vente mais sa réponse se perd, et l'onglet
 *        est tué (Page.crash : ni unload, ni beforeunload) ;
 *   K2 · le réseau tombe avant que la requête ne parte, et l'onglet est tué.
 * La caisse est rouverte dans le même profil, réseau rétabli. Exigé : la
 * vente arrive au serveur avec son identifiant d'origine, une seule ligne en
 * base pour elle, au centime près, et la caisse ne garde rien « à envoyer ».
 *
 * Commerce inventé (« matrix-real »), code du personnel tiré au hasard pour ce
 * passage et saisi par browser-trace (jamais affiché ni enregistré). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { secret, fillSecret } from './browser-trace.mjs';
import { harness, sleep, SIZES, root } from './surface-matrix-lib.mjs';
import { pinTradingHour } from './demo-clock.mjs';
import { click, cash, openFloat } from './surface-matrix-credit-lib.mjs';

const saleApi = await import(pathToFileURL(path.join(root, 'functions/api/sale.js')).href);
const auth = await import(pathToFileURL(path.join(root, 'functions/auth/_lib.js')).href);

const h = await harness('till-crash-ack');
const merchant = 'matrix-real';
const AUTH_SECRET = 'till-crash-' + randomInt(1e9);
const code = String(randomInt(1000, 10000));
const staff = secret('synthetic-cashier', code);
const catalog = { v: 1, categories: [{ id: 'clothes', name: 'Clothes' }],
  products: [{ id: 'matrix-shirt', name: 'Matrix Shirt', categoryId: 'clothes', kind: 'tu', art: 'foulard', price: 100, priceMAD: 100, active: true }],
  variants: [{ id: 'matrix-variant', productId: 'matrix-shirt', size: 'TU', colorId: 'black', colorLabel: 'Noir', colorHex: '#111111', stock: 10, base: 10, baseAt: 1, barcodes: [] }] };

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
  sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, plan, status, updated_ts) VALUES (?, '{}', 'Matrix Boutique', 'boutique', 'pro', 'active', ?)").run(merchant, Date.now());
  const DB = {
    prepare(query) {
      let args = [];
      const st = {
        bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
        async first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
      };
      return st;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out; }
      catch (e) { try { sql.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
    async exec(q) { sql.exec(q); return {}; },
  };
  return { sql, env: { DB, AUTH_SECRET } };
}

/* One till tab in the given browser profile. `net.mode` decides what /api/sale does. */
async function tillPage(ctx, routes, seed) {
  const page = await ctx.newPage();
  await pinTradingHour(page);
  await page.setViewport(SIZES.tablet);
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = new URL(req.url());
    if (url.origin === h.base && url.pathname.startsWith('/api/')) {
      const key = req.method() + ' ' + url.pathname;
      const route = Object.hasOwn(routes, key) ? routes[key] : undefined;
      try {
        const result = typeof route === 'function' ? await route(req)
          : route === undefined ? { status: 503, body: { error: 'offline' } } : { status: 200, body: route };
        if (result.abort) return await req.abort(result.abort);
        if (result.never) return;   // the answer is lost: the request stays open until the tab dies
        return await req.respond({ status: result.status ?? 200, contentType: 'application/json', body: JSON.stringify(result.body) });
      } catch (_) { return undefined; }   // the tab may already be gone
    }
    return (url.origin === h.base || url.protocol === 'data:' ? req.continue() : req.abort()).catch(() => {});
  });
  await page.evaluateOnNewDocument((m, s) => {
    localStorage.setItem('kiwiLang', 'fr');
    localStorage.setItem('kiwiCaisseLang', 'fr');
    localStorage.setItem('kiwiDemos', '0');
    localStorage.setItem('kiwiLiveMerchant', m);
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: m, type: 'boutique', name: 'Matrix Boutique' }));
    if (s) localStorage.setItem('kiwiSkin2027:till', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, merchant, seed);
  return page;
}

async function openShift(t, page) {
  // coverage: surface=caisse-boutique locale=fr viewport=tablet
  // coverage: surface=boutique-checkout locale=fr viewport=tablet
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#cp-pin-screen k-pin-pad', { visible: true, timeout: 30000 });
  await fillSecret(page, '#cp-pin-screen k-pin-pad >>> [data-key="del"]', staff);
  /* A new shift shows the opening float; a shift still open after a restart does not. */
  await page.waitForFunction(() => {
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    return vis('#bqci-btn') || (vis('#pos-boutique.is-on') && !document.getElementById('bq-clockin'));
  }, { timeout: 30000 });
  await sleep(700);   // the opening screen is built a moment after the shelf
  if (await page.$('#bq-clockin')) {
    t.step('count the opening float');
    await openFloat(page);
  }
  await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
  assert.equal(await page.evaluate(() => KiwiEnv.isReal()), true, 'a paired real till, not the demo');
  try { await page.waitForSelector('[data-bq-item]:not(.is-out)', { visible: true, timeout: 30000 }); }
  catch (e) {
    const seen = await page.evaluate(() => ({ items: document.querySelectorAll('[data-bq-item]').length, out: document.querySelectorAll('[data-bq-item].is-out').length,
      panel: [...document.querySelectorAll('[data-bq-panel].is-on')].map((x) => x.dataset.bqPanel), cat: window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.listProducts().length : -1 }));
    throw new Error('the shelf did not show the article: ' + JSON.stringify(seen));
  }
}

/* SIGKILL the renderer process, the way the OS reclaims a tab: no unload, no
   flush. The browser process and the profile's storage stay up. */
async function crash(page) {
  const cdp = await page.browser().target().createCDPSession();
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  const renderers = processInfo.filter((p) => p.type === 'renderer').map((p) => p.id);
  assert.ok(renderers.length, 'a renderer process to kill');
  for (const pid of renderers) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
  await sleep(500);
  await Promise.race([page.close().catch(() => {}), sleep(3000)]);
}

try {
  for (const kind of ['K1 · stored, answer lost', 'K2 · network down before sending']) {
    await h.S.run(`cash sale survives a killed tab · ${kind}`, async (t) => {
      const { sql, env } = database();
      const till = `${auth.TILL_COOKIE}=${await auth.tillToken(AUTH_SECRET, merchant)}`;
      const net = { mode: kind.startsWith('K1') ? 'lose-answer' : 'down', posts: [] };
      const toServer = async (req) => {
        const body = req.postData() || '';
        let id = ''; try { id = JSON.parse(body).id || ''; } catch (_) {}
        net.posts.push({ mode: net.mode, id });
        if (net.mode === 'down') return { abort: 'internetdisconnected' };
        const request = new Request('https://kiwi-os.com/api/sale', { method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' }, body });
        const res = await saleApi.onRequestPost({ request, env, waitUntil() {} });
        const out = { status: res.status, body: await res.json() };
        return net.mode === 'lose-answer' ? { never: true } : out;
      };
      const routes = {
        'GET /api/config': { name: 'Matrix Boutique', type: 'boutique', plan: 'pro', pins: [{ name: 'Mira Test', role: 'owner' }], features: {} },
        'GET /api/pair/state': { ok: true, paired: true },
        'GET /api/catalog': { data: catalog, rev: 1 },
        'POST /api/catalog': { ok: true, rev: 2 },
        'GET /api/store': (req) => ({ body: { data: null, rev: 0, feature: new URL(req.url()).searchParams.get('feature') } }),
        'POST /api/store': { ok: true, rev: 1 },
        'GET /api/clients': { clients: [], cursor: 0, more: false },
        'GET /api/team/live': { entries: [] },
        'POST /api/team/live': { ok: true },
        'POST /api/ticket-sequence': (req) => ({ body: { start: 1001, end: 1500, period: JSON.parse(req.postData()).period } }),
        'GET /api/feed': { sales: [] },
        'POST /api/pin/verify': (req) => {
          const b = JSON.parse(req.postData() || '{}');
          return b.pin === code ? { body: { ok: true, staff: { id: 'matrix-cashier', name: 'Mira Test', role: 'owner' }, merchant } } : { status: 401, body: { error: 'bad-pin' } };
        },
        'POST /api/sale': toServer,
      };
      const ctx = await h.browser.createBrowserContext();
      t.defer(() => ctx.close());

      t.step('open the paired till, ring one 100 MAD article and take cash');
      let page = t.watch(await tillPage(ctx, routes, true));
      await openShift(t, page);
      await cash(page);
      const deadline = Date.now() + 20000;
      while (!net.posts.length && Date.now() < deadline) await sleep(200);
      assert.ok(net.posts.length >= 1, 'the till tried to send the sale');
      const saleId = net.posts[0].id;
      assert.ok(saleId, 'the sale carries its own id');
      const stored = sql.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant = ?').get(merchant).n;
      assert.equal(stored, kind.startsWith('K1') ? 1 : 0, kind.startsWith('K1') ? 'the server stored it before its answer was lost' : 'nothing reached the server');

      t.step('kill the tab (no unload), bring the network back, open the till again');
      await crash(page);
      net.mode = 'live';
      page = t.watch(await tillPage(ctx, routes, true));
      await openShift(t, page);

      t.step('the sale reaches the server with its original id, exactly once');
      const until = Date.now() + 45000;
      while (Date.now() < until && !net.posts.some((p) => p.mode === 'live')) await sleep(300);
      assert.ok(net.posts.some((p) => p.mode === 'live'), 'the reopened till sends what it had not had confirmed');
      assert.deepEqual([...new Set(net.posts.map((p) => p.id))], [saleId], 'every attempt carries the original id');
      await sleep(1500);
      const rows = sql.prepare('SELECT id, amount_cents FROM sales WHERE merchant = ?').all(merchant);
      assert.equal(rows.length, 1, 'one row on the server for one sale');
      assert.equal(rows[0].id, saleId);
      assert.equal(rows[0].amount_cents, 10000, '100,00 MAD to the centime');
      const pending = await page.evaluate(async () => {
        try { return window.KiwiLiveLink && typeof window.KiwiLiveLink.pending === 'function' ? await window.KiwiLiveLink.pending() : null; } catch (_) { return null; }
      });
      if (pending != null) assert.equal(pending, 0, 'nothing left to send on the till');
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
