#!/usr/bin/env node
// Uses browser-trace through the shared harness (Chromium; run serially).
/* Coût simple, de bout en bout : le vrai éditeur dans le vrai tableau de bord,
 * branché sur la vraie route functions/api/foodcost.js et le vrai schema.sql
 * (SQLite en mémoire). Rien n'est simulé entre le clic et la ligne en base.
 *
 *   1. Une fiche saisie mais pas enregistrée survit au rechargement de la page.
 *   2. Enregistrer écrit en base les nombres saisis (version 1), modifier puis
 *      enregistrer donne la version 2 ; l'historique liste les deux et la
 *      version 1 se relit telle qu'elle était.
 *   3. L'export CSV de la fiche porte le coût par portion calculé à l'écran.
 *   4. Après rechargement, la liste vient du serveur, pas du brouillon.
 *   5. Une version enregistrée ailleurs entre-temps : l'enregistrement est
 *      refusé (409), la saisie reste, « Prendre la version en ligne » affiche
 *      celle du serveur sans rien écraser.
 *
 * Session synthétique, sans identifiant réel ; le code du cadenas est tiré au
 * hasard pour ce passage, jamais affiché ni enregistré. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { LOCALES } from './test-locales.mjs';
import { harness, realPage, sleep } from './surface-matrix-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/foodcost.js')).href);
const auth = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

const merchant = 'matrix-real';
const SECRET = 'sfc-browser-' + randomInt(1e9);
const OWNER = String(randomInt(1000, 10000));
const words = {
  fr: { empty: 'Aucune fiche pour l’instant', restored: 'Calcul non enregistré retrouvé', saved: 'version', conflict: 'modifiée ailleurs' },
  en: { empty: 'No sheets yet', restored: 'Unsaved calculation recovered', saved: 'version', conflict: 'changed elsewhere' },
  ar: { empty: 'لا توجد بطاقات بعد', restored: null, saved: null, conflict: null },
};

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const now = Date.now();
  sqlite.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-sfc','owner@matrix.test','Matrix Kitchen','s','h',?,'active')`).run(now);
  sqlite.prepare(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,?,'pro','restaurant','acc-sfc','Matrix Kitchen','active',?)`)
    .run(merchant, JSON.stringify({ simple_food_cost: true }), now);
  const DB = {
    prepare(sql) {
      const st = sqlite.prepare(sql);
      let args = [];
      const q = {
        bind(...v) { args = v; return q; },
        async first() { const r = st.get(...args); return r === undefined ? null : r; },
        async all() { return { results: st.all(...args) }; },
        async run() { const r = st.run(...args); return { meta: { changes: r.changes }, success: true }; },
      };
      return q;
    },
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  };
  return { sqlite, env: { AUTH_SECRET: SECRET, DB } };
}

const h = await harness('simple-food-cost-browser');

async function click(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.$eval(selector, el => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.click(selector);
}
async function fill(page, field, value) {
  const selector = `[data-sfc-field="${field}"]`;
  await page.locator(selector).fill(value);
  assert.equal(await page.$eval(selector, el => el.value), value, 'input value ' + field);
}
const fieldValue = (page, field) => page.$eval(`[data-sfc-field="${field}"]`, el => el.value);
async function status(page, text) {
  await page.waitForFunction((txt) => [...document.querySelectorAll('[data-sfc-root] [role="status"]')].some((el) => el.textContent.includes(txt)), { timeout: 15000 }, text);
}
async function unlock(page) {
  // The shipped owner lock: four cells over one numeric field, typed on the keyboard.
  await page.waitForSelector('[data-kiwi-lock] [data-kiwi-pin-input]', { timeout: 30000 });
  await sleep(600);
  await page.focus('[data-kiwi-lock] [data-kiwi-pin-input]');
  for (const d of OWNER) { await page.keyboard.press(d); await sleep(60); }
  await page.waitForFunction(() => { const l = document.querySelector('[data-kiwi-lock]'); return !l || l.classList.contains('is-unlocking') || getComputedStyle(l).display === 'none' || l.hidden; }, { timeout: 15000 });
  await sleep(2600);
}
async function openCost(t, page) {
  t.step('load the dashboard, open the lock, then Analysis → Simple cost through the navigation');
  // coverage: surface=dashboard-analysis locale=fr viewport=tablet
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await unlock(page);
  await page.waitForFunction(() => window.KiwiConfig?.features?.simple_food_cost === true && window.KiwiVenue?.getCurrentVenueData?.()?.slug === 'matrix-real', { timeout: 20000 });
  await page.waitForSelector('[data-nav="finance"]', { timeout: 15000 });
  const kit = await page.$('#kit-side >>> [data-id="finance"]');
  const box = kit && await kit.boundingBox();
  if (box && box.x >= 0 && box.x < (await page.viewport()).width) await kit.click();
  else { await page.evaluate(() => document.querySelector('[data-nav="finance"]').click()); await sleep(600); }
  await click(page, '[data-fin-tab="cost"]');
  await page.waitForSelector('[data-sfc-root]', { visible: true, timeout: 15000 });
}

try {
  for (const locale of LOCALES.filter((l) => words[l] && words[l].saved)) {
    await h.S.run(`save, reload, history, export and conflict · ${locale} · tablet`, async (t) => {
      const { sqlite, env } = database();
      const owner = auth.sessionCookie(await auth.makeSession('acc-sfc', SECRET)).split(';')[0];
      const calls = { get: 0, post: 0 };
      const toServer = async (req) => {
        const u = new URL(req.url());
        const request = new Request('https://kiwi.test' + u.pathname + u.search, req.method() === 'GET'
          ? { headers: { Cookie: owner } }
          : { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' }, body: req.postData() });
        const res = await (req.method() === 'GET' ? api.onRequestGet : api.onRequestPost)({ env, request });
        calls[req.method() === 'GET' ? 'get' : 'post']++;
        return { status: res.status, body: await res.json() };
      };
      const routes = {
        'GET /api/me': { authenticated: true, onboarded: true, name: 'Mira Test', business: 'Matrix Kitchen', type: 'restaurant', stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
        'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', plan: 'pro', planExplicit: true, features: { simple_food_cost: true }, pins: [{ name: 'Mira Test', role: 'owner' }] },
        'POST /api/pin/verify': (req) => {
          let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
          return body.pin === OWNER ? { status: 200, body: { ok: true, staff: { id: 'st_owner', name: 'Mira Test', role: 'owner' }, merchant } } : { status: 401, body: { error: 'bad-pin' } };
        },
        'GET /api/foodcost': toServer,
        'POST /api/foodcost': toServer,
      };
      const { ctx, page } = await realPage(h, locale, 'tablet', routes);
      t.defer(() => ctx.close());
      t.watch(page);
      const dialogs = [];
      page.on('dialog', (d) => { dialogs.push(d.type()); d.accept().catch(() => {}); });
      // Observation only: keep the text of each CSV the page hands to the browser.
      await page.evaluateOnNewDocument(() => {
        window.__sfcCsv = [];
        const make = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { if (blob && /csv/.test(blob.type || '')) blob.text().then((x) => window.__sfcCsv.push(x)); return make(blob); };
      });

      await openCost(t, page);
      await page.waitForFunction((txt) => document.querySelector('[data-sfc-state="empty"]')?.textContent.includes(txt), { timeout: 15000 }, words[locale].empty);

      t.step('start a sheet: 250 g of a 40 MAD kilogram, two portions, and leave it unsaved');
      await click(page, '[data-sfc="new"]');
      await fill(page, 'sheet.name', 'TEST KIWI soupe');
      await fill(page, 'sheet.portions', '2');
      await click(page, '[data-sfc="add-food"]');
      await fill(page, 'name', 'TEST KIWI farine');
      await fill(page, 'packPrice', '40');
      await fill(page, 'useQty', '250');
      await sleep(400);
      assert.equal(calls.post, 0, 'nothing is sent before Save');

      t.step('reload the page: the browser asks before leaving unsaved input, and the calculation comes back');
      await openCost(t, page);
      assert.ok(dialogs.includes('beforeunload'), 'leaving with unsaved input asks first');
      await status(page, words[locale].restored);
      assert.equal(await fieldValue(page, 'sheet.name'), 'TEST KIWI soupe');
      assert.equal(await fieldValue(page, 'useQty'), '250');
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM foodcost_sheets').get().n, 0, 'still nothing on the server');

      t.step('save: version 1 lands in the database with the numbers typed');
      await click(page, '[data-sfc="save"]');
      await status(page, words[locale].saved + ' 1');
      let row = sqlite.prepare('SELECT id, name, version, data FROM foodcost_sheets WHERE merchant = ?').get(merchant);
      assert.equal(row.version, 1); assert.equal(row.name, 'TEST KIWI soupe');
      let data = JSON.parse(row.data);
      assert.equal(data.portions, 2); assert.equal(data.lines.length, 1);
      assert.equal(data.lines[0].packPrice, 40); assert.equal(data.lines[0].useQty, 250);

      t.step('use 500 g instead and save again: version 2');
      await fill(page, 'useQty', '500');
      await click(page, '[data-sfc="save"]');
      await status(page, words[locale].saved + ' 2');
      row = sqlite.prepare('SELECT id, version, data FROM foodcost_sheets WHERE merchant = ?').get(merchant);
      assert.equal(row.version, 2); assert.equal(JSON.parse(row.data).lines[0].useQty, 500);

      t.step('history lists both versions and version 1 reads back as it was (5 MAD a portion, not 10)');
      await click(page, '[data-sfc="history"]');
      await page.waitForSelector('[data-sfc-history] [data-sfc="view-version"][data-v="1"]', { visible: true, timeout: 15000 });
      const versions = await page.$$eval('[data-sfc-history] [data-sfc="view-version"]', els => els.map(el => el.dataset.v));
      assert.deepEqual(versions, ['2', '1']);
      await click(page, '[data-sfc-history] [data-sfc="view-version"][data-v="1"]');
      await page.waitForSelector('[data-sfc-snapshot="1"]', { visible: true, timeout: 15000 });
      assert.match(await page.$eval('[data-sfc-snapshot="1"]', el => el.textContent), /10[,.]00[\s\u202f]*MAD[\s\S]*5[,.]00[\s\u202f]*MAD/, 'version 1 frozen: 10 MAD batch, 5 MAD a portion');

      t.step('export the sheet: the CSV carries 10,00 MAD per portion (500 g × 40 MAD/kg ÷ 2)');
      await click(page, '[data-sfc="export-sheet"]');
      await page.waitForFunction(() => window.__sfcCsv.length > 0, { timeout: 10000 });
      const csv = await page.evaluate(() => window.__sfcCsv[0]);
      assert.match(csv, /TEST KIWI soupe/);
      assert.match(csv, /TEST KIWI farine;[^\r\n]*;40,00;/, 'pack price exported in cents');
      assert.match(csv, /\r\n[^\r\n;]*;10,00(\r\n|$)/, 'portion cost line');
      assert.match(csv, /\r\n[^\r\n;]*;20,00\r\n/, 'batch total line');

      t.step('reload: the list comes from the server, no draft is left behind');
      await openCost(t, page);
      await page.waitForSelector(`[data-sfc-row="${row.id}"]`, { visible: true, timeout: 15000 });
      assert.equal(await page.$('[data-sfc-root] [data-sfc-field="sheet.name"]'), null, 'no editor reopened from a stale draft');
      assert.match(await page.$eval(`[data-sfc-row="${row.id}"]`, el => el.textContent), /TEST KIWI soupe[\s\S]*10[,.]00/);

      t.step('another device saves version 3; saving here is refused and nothing is overwritten');
      await click(page, `[data-sfc-row="${row.id}"] [data-sfc="open"]`);
      await page.waitForSelector('[data-sfc-field="sheet.name"]', { visible: true, timeout: 15000 });
      const other = await api.onRequestPost({ env, request: new Request('https://kiwi.test/api/foodcost', { method: 'POST', headers: { Cookie: owner, 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, action: 'save', sheet: { ...JSON.parse(row.data), id: row.id, name: 'TEST KIWI soupe (caisse)' }, baseVersion: 2 }) }) });
      assert.equal(other.status, 200);
      await fill(page, 'sheet.name', 'TEST KIWI soupe (ici)');
      await click(page, '[data-sfc="save"]');
      await page.waitForSelector('[data-sfc-state="conflict"]', { visible: true, timeout: 15000 });
      assert.match(await page.$eval('[data-sfc-state="conflict"]', el => el.textContent), new RegExp(words[locale].conflict));
      assert.equal(await fieldValue(page, 'sheet.name'), 'TEST KIWI soupe (ici)', 'my input is kept');
      row = sqlite.prepare('SELECT name, version FROM foodcost_sheets WHERE merchant = ?').get(merchant);
      assert.deepEqual([row.name, row.version], ['TEST KIWI soupe (caisse)', 3], 'the other device’s version stands');
      await click(page, '[data-sfc="take-server"]');
      await page.waitForFunction(() => document.querySelector('[data-sfc-field="sheet.name"]')?.value === 'TEST KIWI soupe (caisse)', { timeout: 15000 });
      assert.equal(await page.$('[data-sfc-state="conflict"]'), null);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM foodcost_snapshots WHERE merchant = ?').get(merchant).n, 3, 'three frozen versions, none lost');
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
