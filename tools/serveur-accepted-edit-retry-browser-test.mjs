#!/usr/bin/env node
/* « + » sur un plat déjà accepté en cuisine, réponse perdue, puis retapé :
 * un seul café de plus sur l'addition.
 *
 *   node tools/serveur-accepted-edit-retry-browser-test.mjs
 *
 * Café réel, 21 nov. 2026 (wifi de terrasse). Sur un plat accepté, « + »
 * ajoute une ligne pour le delta et « − » demande une annulation : ce sont des
 * deltas. Le téléphone abandonnait au bout de 12 s en disant « réessayez » ;
 * la requête arrivait quand même, le serveur retapait, et le café était
 * facturé deux fois. Maintenant le geste garde son identifiant tant qu'il n'a
 * pas eu de réponse, la table est relue, le serveur lit « vérifiez la table
 * avant de réessayer », et le même geste retapé est rejoué, pas recompté ; une
 * fois la relecture montrant le café ajouté, le « + » suivant en ajoute un.
 * Vraies routes (tools/serveur-live-harness.mjs › hold), vrais clics,
 * restaurant inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-accepted-edit-retry', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const cafes = () => h.db.tickets('4').flatMap((o) => JSON.parse(o.lines)).filter((l) => l.id === 'it_cafe').reduce((s, l) => s + Number(l.qty), 0);
const queueReads = () => h.calls.filter((c) => c.who === 'serveur' && c.method === 'GET' && c.path === '/api/order/queue').length;
const plusOnCafe = '.td-item[data-order-uid^="order-"] .td-qty-btn.plus';

try {
  await S.run('« + » sur un café accepté, réponse perdue puis retapé', async (t) => {
    const page = await h.openWaiter(t);
    await h.tap(page, '.table-card[data-table="4"]');
    await h.tap(page, '#nt-confirm');
    await h.tap(page, '[data-action="take-order"]');
    await h.tap(page, '.menu-item[data-menu-id="it_cafe"]');
    await h.tap(page, '#menu-cart-bar.is-visible');
    await h.tap(page, '[data-action="lancer"]');
    await h.until(() => h.db.tickets('4').length === 1, 'le café part en cuisine', 10000);

    t.step('la cuisine accepte le café');
    const o = h.db.tickets('4')[0];
    h.sql.prepare("UPDATE orders SET lines = ?, status = 'accepted', updated_ts = updated_ts + 1 WHERE id = ?")
      .run(JSON.stringify(JSON.parse(o.lines).map((l) => ({ ...l, stationAccepted: true }))), o.id);
    await page.evaluate(() => pollServiceSync());
    await h.tap(page, '.table-card[data-table="4"]');   // « Lancer » ramène au plan de salle
    await page.waitForSelector(plusOnCafe, { visible: true, timeout: 10000 });
    check(cafes() === 1, 'un café sur l’addition');

    t.step('« + », la réponse ne revient pas');
    h.hold('POST /api/order/queue');
    const readsBefore = queueReads();
    await h.tap(page, plusOnCafe);
    await page.waitForFunction(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /vérifiez la table avant de réessayer/.test(x.textContent)), { timeout: 20000 }).catch(() => {});
    check(await page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /vérifiez la table avant de réessayer/.test(x.textContent))), 'passé le délai : « Pas de réponse · vérifiez la table avant de réessayer »');
    await h.until(() => queueReads() > readsBefore, 'la table est relue', 10000).catch(() => {});
    check(queueReads() > readsBefore, 'et le téléphone relit la table tout de suite');

    t.step('la requête retenue arrive enfin, le serveur retape « + »');
    h.hold('GET /api/order/queue');   // le téléphone n'a pas encore relu : il ne sait pas si le « + » est passé
    h.release('POST /api/order/queue');
    await h.until(() => cafes() === 2, 'le premier « + » arrive', 10000);
    await h.tap(page, plusOnCafe);
    await h.until(() => h.calls.filter((c) => c.method === 'POST' && /"replayed":true/.test(c.body || '')).length > 0, 'la réponse rejouée', 10000).catch(() => {});
    h.release('GET /api/order/queue');
    check(cafes() === 2, `le « + » retapé est rejoué, pas recompté : 2 cafés, pas 3 (${cafes()})`);
    const total = h.db.tickets('4').reduce((s, x) => s + Number(x.total), 0);
    check(total === 24, `24 MAD sur l’addition (${total})`);

    t.step('encore un délai ; cette fois la relecture montre le café ajouté, puis un vrai « + »');
    const phoneCafes = (n) => page.waitForFunction((want) => [...serviceCanonicalOrders.values()].flatMap((o) => o.lines || []).filter((l) => l.id === 'it_cafe').reduce((k, l) => k + Number(l.qty), 0) === want, { timeout: 10000 }, n);
    await page.evaluate(() => pollServiceSync());
    await phoneCafes(2);
    await page.evaluate(() => document.querySelectorAll('#toast-stack .toast').forEach((x) => x.remove()));
    h.hold('POST /api/order/queue');
    await h.tap(page, plusOnCafe);
    await page.waitForFunction(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /vérifiez la table avant de réessayer/.test(x.textContent)), { timeout: 20000 });
    h.release('POST /api/order/queue');
    await h.until(() => cafes() === 3, 'le « + » retenu arrive', 10000);
    await page.evaluate(() => pollServiceSync());
    await phoneCafes(3);
    await h.tap(page, plusOnCafe);
    await h.until(() => cafes() === 4, 'le vrai « + » suivant', 10000).catch(() => {});
    check(cafes() === 4, `la relecture a montré le café : le « + » suivant est un nouveau geste, il ajoute un café (${cafes()}, attendu 4)`);
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-accepted-edit-retry-browser-test: ${checks} checks passed`);
// Un scénario rouge (S.run) doit sortir en rouge : sinon le gate le compte vert.
process.exit(await S.finish({ exit: false }));
