#!/usr/bin/env node
/* Les avis du service : pas d'écho de son propre geste, et dans la langue du
 * serveur.
 *
 *   node tools/serveur-notice-language-browser-test.mjs
 *
 * Café réel, 21 nov. 2026, téléphone réglé en arabe (au banc) :
 *   · le serveur ouvre la table 4 ; six secondes plus tard sa propre synchro
 *     lui renvoie « Table 4 · Table ouverte · commande en cours », en
 *     français, en plus de sa propre confirmation (chaque geste revenait en
 *     écho : addition demandée, table libérée…) ;
 *   · un vrai changement venu de la caisse s'affichait aussi en français :
 *     le titre et le corps étaient traduits ensemble, une phrase que le
 *     dictionnaire ne connaît pas ;
 *   · « Latte ajouté · Avoine » (un plat avec ses options) restait en français.
 * Vraies routes (tools/serveur-live-harness.mjs), vrais clics, restaurant
 * inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';
import * as eventsApi from '../functions/api/service/events.js';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-notice-language', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].map((x) => x.textContent));
const LATIN = /[A-Za-zÀ-ÿ]{4,}/;

try {
  await S.run('arabe : pas d’écho, et les avis traduits', async (t) => {
    // coverage: surface=employee locale=ar viewport=phone
    const page = await h.openWaiter(t, { lang: 'ar' });
    t.step('le serveur ouvre la table 4');
    await h.tap(page, '.table-card[data-table="4"]');
    await page.waitForSelector('#nt-confirm', { visible: true });
    await h.tap(page, '#nt-confirm');
    await page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 });
    for (let i = 0; i < 3; i++) { await page.evaluate(() => pollServiceSync()); await h.sleep(1200); }
    const echoes = await page.evaluate(() => serviceNotifications.filter((n) => n.table === '4').map((n) => n.body));
    check(echoes.length === 0, `son propre geste ne revient pas en avis (${JSON.stringify(echoes)})`);

    t.step('la caisse accuse l’ouverture, puis demande l’addition de la table 4');
    const tillPost = (table) => eventsApi.onRequestPost({ env: h.env, waitUntil() {}, request: new Request('https://kiwi-os.com/api/service/events', {
      method: 'POST', headers: { Cookie: h.tillCookie, 'Content-Type': 'application/json', Origin: 'https://kiwi-os.com' },
      body: JSON.stringify({ merchant: h.merchant, snapshot: { tables: [table] } }),
    }) });
    const doc = JSON.parse(h.sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='service-events'").get(h.merchant).data);
    const opened = doc.states['4'];
    check((await tillPost({ table: '4', status: opened.status, covers: opened.covers })).status === 200, 'la caisse accuse l’ouverture du serveur');
    const res = await tillPost({ table: '4', status: 'bgha-ykhlass', covers: opened.covers });
    check(res.status === 200, `la caisse publie « addition demandée » (${res.status})`);
    await page.evaluate(() => pollServiceSync());
    await page.waitForFunction(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /الفاتورة/.test(x.textContent)), { timeout: 10000 }).catch(() => {});
    const notice = (await toasts(page)).find((x) => /الفاتورة|Addition/.test(x)) || '';
    check(/الطاولة 4/.test(notice) && /طُلبت الفاتورة/.test(notice) && !LATIN.test(notice), `l’avis venu de la caisse est en arabe (« ${notice} »)`);

    t.step('téléphone en poche : la notification du système, dans la même langue');
    const system = await page.evaluate(() => {
      const shown = [];
      const real = { N: window.Notification, vis: Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState') };
      window.Notification = function (title, opts) { shown.push({ title, body: opts && opts.body }); };
      window.Notification.permission = 'granted';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      try { serviceNotify('Table 4', 'Addition demandée', { table: '4', id: 'notice-system-language-test' }); }
      finally { window.Notification = real.N; delete document.visibilityState; }
      return shown[0] || null;
    });
    check(system && /الطاولة 4/.test(system.title) && system.body === 'طُلبت الفاتورة', `la notification du système est en arabe (${JSON.stringify(system)})`);

    t.step('un latte avec options');
    await h.tap(page, '[data-action="take-order"]');
    await page.waitForSelector('.menu-item[data-menu-id="it_latte"]', { visible: true, timeout: 15000 });
    await h.tap(page, '.menu-item[data-menu-id="it_latte"]');
    await page.waitForSelector('#opt-modal.is-open .opt-pill[data-opt-val="Avoine"]', { visible: true, timeout: 5000 });
    await h.tap(page, '.opt-pill[data-opt-val="Avoine"]');
    await h.tap(page, '#opt-confirm');
    await h.sleep(300);
    const added = (await toasts(page)).find((x) => /Latte|لاتيه/.test(x)) || '';
    check(/أُضيف/.test(added) && !/ajouté/.test(added), `« Latte ajouté · Avoine » est dit en arabe (« ${added} »)`);
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-notice-language-browser-test: ${checks} checks passed`);
