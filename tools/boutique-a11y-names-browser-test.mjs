#!/usr/bin/env node
/* Kiwi · boutique-a11y-names-browser-test · the boutique till names its
 * controls in the cashier's language, and its promotion form can be typed in.
 *
 * Thirteenth blind rating (28 October), four gaps:
 *   boutiquetill#0 / returns#1 · checkout.js built "Fermer", "Retirer une
 *     pièce", "Ajouter une pièce" as French aria-labels and left them to a
 *     later translation sweep (two of them had no translation at all). A
 *     screen reader that reads the modal as it opens heard French.
 *   promos#1 · the promotion value took whole numbers only, and every key
 *     rebuilt the form, so the cursor left the field after one digit.
 *   promos#2 · the name and value captions were divs, so the fields had no
 *     accessible name.
 *
 * The labels are read in the same task as the click that builds them, before
 * the translation sweep can run: they must be right at construction.
 * The till has no button that opens its own promotion composer (promotions
 * are edited on the dashboard), so the test serves the real inventory module
 * with one extra export and drives the real composer through it.
 *   node tools/boutique-a11y-names-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-a11y-names');
let n = 0, bad = 0;
const ok = (cond, msg) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg); } };

// coverage: surface=caisse-boutique locale=fr viewport=desktop
const { ctx, page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:dashboard': '0' });
await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiCaisseLang, { timeout: 30000 });
await sleep(500);
await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
await sleep(1200);

/* The module URLs the till actually loaded, stamps included: importing the
   same URL hands back the same live module, the same sales and the same DOM. */
const urls = await page.evaluate(() => {
  const all = performance.getEntriesByType('resource').map((e) => e.name);
  return {
    core: all.find((u) => /\/assets\/pos-boutique\.js\?/.test(u)),
    inv: all.find((u) => /\/assets\/pos-boutique\/inventory\.js\?/.test(u)),
  };
});
ok(!!urls.core && !!urls.inv, 'the till loaded its boutique modules');

/* ── 1 · return quantity buttons, named in English at construction ───────── */
for (const [lang, want] of [['en', ['Remove one piece', 'Add one piece']], ['ar', ['إزالة قطعة', 'إضافة قطعة']]]) {
  const seen = await page.evaluate(async (u, lang) => {
    const m = await import(u);
    window.KiwiCaisseLang.set(lang);
    const base = m.SALES.find((s) => s.id === '1207');
    if (!m.SALES.some((s) => s.id === 'a11y-2')) {
      m.SALES.unshift({ ...base, id: 'a11y-2', at: new Date(), lines: [{ ...base.lines[0], qty: 2, returned: false }] });
    }
    m.state.retQuery = 'a11y-2';
    m.switchView('echanges');
    const pick = document.querySelector('[data-bq-pick="a11y-2:0"]');
    if (!pick) return null;
    if (!pick.classList.contains('on')) pick.click();
    const minus = document.querySelector('[data-bq-ret-qty="a11y-2:0:-1"]');
    const plus = document.querySelector('[data-bq-ret-qty="a11y-2:0:1"]');
    return minus && plus ? [minus.getAttribute('aria-label'), plus.getAttribute('aria-label')] : [];
  }, urls.core, lang);
  ok(Array.isArray(seen) && seen.length === 2, `${lang} · a sale of two pieces shows the return quantity buttons`);
  ok(seen && seen[0] === want[0] && seen[1] === want[1], `${lang} · return quantity buttons are named "${want.join('" and "')}" as they are built (got ${JSON.stringify(seen)})`);
}

/* ── 2 · the promotion form: labelled fields, centimes, the cursor stays ─── */
await page.evaluate(() => window.KiwiCaisseLang.set('fr'));
const opened = await page.evaluate(async (inv) => {
  const src = await (await fetch(inv)).text();
  const abs = src.replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${new URL(p, inv).href}'`)
    .replace(/^export \{/m, 'export { openPromoComposer as __openPromoComposer, ');
  const m = await import(URL.createObjectURL(new Blob([abs], { type: 'text/javascript' })));
  const root = document.getElementById('pos-boutique');
  /* The shell no longer ships this modal's frame: give it the same frame
     its siblings use (#bq-inv-veil > #bq-invmm). */
  if (!document.getElementById('bq-promomm')) {
    root.insertAdjacentHTML('beforeend', '<div class="modal-veil" id="bq-promo-veil"><div class="modal bq-rel" id="bq-promomm"></div></div>');
  }
  m.__openPromoComposer(null);
  return !!document.getElementById('bq-prc-value');
}, urls.inv);
ok(opened, 'the till\'s promotion composer opens');
if (opened) {
  const names = await page.evaluate(() => ['bq-prc-name', 'bq-prc-value'].map((id) => {
    const el = document.getElementById(id);
    return el && el.labels && el.labels.length ? el.labels[0].textContent.replace(/\s+/g, ' ').trim() : '';
  }));
  ok(/^Nom/.test(names[0]), `the promotion name field has a label (${JSON.stringify(names[0])})`);
  ok(/^De combien/.test(names[1]), `the promotion value field has a label (${JSON.stringify(names[1])})`);
  const mode = await page.$eval('#bq-prc-value', (el) => el.getAttribute('inputmode'));
  ok(mode === 'decimal', `the value field asks the phone for a decimal keypad (inputmode=${mode})`);

  await page.evaluate(() => { const v = document.getElementById('bq-prc-value'); v.focus(); v.select(); });
  await page.keyboard.type('49,90', { delay: 30 });
  await sleep(200);
  const typed = await page.evaluate(() => ({ value: document.getElementById('bq-prc-value').value, focus: document.activeElement && document.activeElement.id }));
  ok(typed.value === '49,90', `typing 49,90 keeps every key (field reads ${JSON.stringify(typed.value)})`);
  ok(typed.focus === 'bq-prc-value', `the cursor stays in the field while the preview repaints (focus on ${typed.focus})`);
}

await ctx.close();
await h.close();
if (bad) { console.log(`\n✗ boutique-a11y-names-browser-test · ${bad} failure(s)`); process.exit(1); }
console.log(`\n✓ boutique-a11y-names-browser-test · ${n} checks`);
