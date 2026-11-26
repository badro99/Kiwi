#!/usr/bin/env node
/* Kiwi · boutique-own-codes-browser-test · supplier barcodes, size by size,
 * when a new boutique product « already has one ».
 *
 * Owner, 24 November 2026: choosing « Il a déjà un code » on a clothing or
 * shoe product gave no field to enter it. The form sent you to « Code existant »
 * on each size, a link the creation grid never showed, so every size was
 * saved with a generated Kiwi code. Now:
 *   A · the sizes screen has one code field per size, and no « Code créé à
 *       l'enregistrement »;
 *   B · a scanner burst typed into a size's field fills it, Enter moves on to
 *       the next empty field and never saves;
 *   C · a burst while the cursor is in a size's pieces box lands in that
 *       size's code field, and the pieces box keeps its value;
 *   D · a code on a size with no pieces, an unreadable one and the same code
 *       on two sizes are refused before anything is written;
 *   E · Enregistrer keeps the scanned codes as each size's code, and a size
 *       left empty gets a Kiwi code;
 *   F · « Générer un code Kiwi » keeps the screen from before;
 *   G · « Taille unique » with « Il a déjà un code » shows its one field.
 * Run with the colours option off (rows) and on (rich grid).
 * Demo till only: nothing reaches a server.
 *   node tools/boutique-own-codes-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-own-codes');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

const { page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:dashboard': '0' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
// coverage: surface=caisse-boutique locale=fr viewport=desktop
await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiCaisseLang, { timeout: 30000 });
await sleep(500);
await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
await sleep(1200);
const coreUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/assets\/pos-boutique\.js\?/.test(u)));
await page.evaluate(async (u) => {
  window.KiwiConfig = window.KiwiConfig || {};
  window.KiwiConfig.features = { ...(window.KiwiConfig.features || {}), caisseInventoryAdmin: true, boutiqueSizeColors: false };
  const m = await import(u);
  m.switchView('ventes');
  m.switchView('inventaire');
}, coreUrl);
await page.waitForSelector('#bqi-new', { visible: true, timeout: 10000 });

const type = async (sel, value) => {
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, value);
};
const click = async (sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel); await sleep(350); };
/* A handheld scanner: the whole code in a few milliseconds, then Enter. */
const scan = async (code) => { await page.keyboard.type(code, { delay: 2 }); await page.keyboard.press('Enter'); await sleep(250); };
const codes = () => page.$$eval('[data-kbs-bc]', (all) => all.map((i) => i.value));
const pieces = () => page.$$eval('[data-kbs-in]', (all) => all.map((i) => i.value));
const setPieces = (i, v) => page.evaluate((i, v) => { const b = document.querySelectorAll('[data-kbs-in]')[i]; b.value = v; b.dispatchEvent(new Event('input', { bubbles: true })); }, i, v);
const msg = () => page.$eval('[data-kbs-msg]', (m) => m.textContent.trim()).catch(() => '');
const productOf = (name) => page.evaluate((name) => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = cat.listProducts({ q: name }).find((x) => x.name === name);
  if (!p) return null;
  return cat.getProduct(p.id).variants.map((v) => v.size + ':' + v.stock + ':' + cat.primaryBarcode(v)).sort().join(' ');
}, name);
const close = async () => {
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^\s*Fermer\s*$/.test(x.textContent) && x.offsetParent); if (b) b.click(); });
  await sleep(500);
};
async function create(name, total, own, kind) {
  await click('#bqi-new');
  await type('[data-bqx-name]', name);
  await type('[data-bqi-price]', '390');
  await type('[data-bqi-cost]', '100');   // le coût d'achat est exigé (26 nov.)
  if (kind) await page.evaluate((k) => { const r = document.querySelector(`input[name="bqx-pf-kind"][value="${k}"]`); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }, kind);
  await type('[data-kbs-total]', String(total));
  if (own) await page.evaluate(() => { const r = document.querySelector('[data-kbs-bc][value="own"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(200);
}

for (const colours of [false, true]) {
  const tag = colours ? 'colours on' : 'colours off';
  await page.evaluate((c) => { window.KiwiConfig.features.boutiqueSizeColors = c; }, colours);
  const NAME = `TEST KIWI Chemise fournisseur ${colours ? 'B' : 'A'}`;
  const S = colours ? '3760000000017' : '3760000000024', M = colours ? '3760000000031' : '3760000000048';

  await create(NAME, 4, true);
  ok(await page.$eval('[data-kbs-bc-msg]', (p) => /écran suivant/.test(p.textContent)), `${tag} · the form says where the size codes go`);
  await click('#bqi-n-save');
  await page.waitForSelector('[data-kbs-bc]', { visible: true, timeout: 8000 });
  await sleep(300);

  /* A */
  ok((await codes()).length === 7, `${tag} · A · one code field per size (7)`, String((await codes()).length));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + (colours ? '-b' : '-a') + '.png' });
  ok(!(await page.$eval('[data-kbs]', (el) => /Code créé à l’enregistrement/.test(el.textContent))), `${tag} · A · no « Code créé à l’enregistrement » left`);

  /* B */
  await page.click('[data-kbs-bc]:nth-of-type(1)').catch(() => {});
  await page.evaluate(() => document.querySelectorAll('[data-kbs-bc]')[2].focus());
  await scan(S);
  ok((await codes())[2] === S, `${tag} · B · a scan into S's field fills it`, JSON.stringify(await codes()));
  ok(await page.evaluate(() => document.activeElement === document.querySelectorAll('[data-kbs-bc]')[3]), `${tag} · B · Enter moves on to M's field`);
  ok(await productOf(NAME) === '', `${tag} · B · and nothing was saved by that Enter`, String(await productOf(NAME)));

  /* C */
  await page.evaluate(() => document.querySelectorAll('[data-kbs-in]')[3].focus());
  await page.keyboard.type('2', { delay: 200 });
  await sleep(200);
  await scan(M);
  ok((await codes())[3] === M, `${tag} · C · a scan with the cursor in M's pieces lands in M's code`, JSON.stringify(await codes()));
  ok((await pieces())[3] === '2', `${tag} · C · M's pieces keep their 2`, JSON.stringify(await pieces()));

  /* D */
  await page.evaluate(() => { const i = document.querySelectorAll('[data-kbs-bc]')[4]; i.value = '3760000000055'; });
  await setPieces(2, '2');
  await click('[data-kbs-save]');
  ok(/L : écrivez ses pièces/.test(await msg()), `${tag} · D · a code on a size without pieces is refused`, await msg());
  await page.evaluate(() => { const i = document.querySelectorAll('[data-kbs-bc]')[4]; i.value = ''; });
  await page.evaluate((m) => { const i = document.querySelectorAll('[data-kbs-bc]')[2]; i.value = m; }, M);
  await click('[data-kbs-save]');
  ok(/déjà donné à une autre taille/.test(await msg()), `${tag} · D · the same code on two sizes is refused`, await msg());
  await page.evaluate((s) => { const i = document.querySelectorAll('[data-kbs-bc]')[2]; i.value = 'ab'; }, S);
  await click('[data-kbs-save]');
  ok(/illisible/.test(await msg()), `${tag} · D · an unreadable code is refused`, await msg());
  ok(await productOf(NAME) === '', `${tag} · D · nothing written while a code is wrong`);

  /* E */
  await page.evaluate((s) => { const i = document.querySelectorAll('[data-kbs-bc]')[2]; i.value = s; }, S);
  await setPieces(2, '1'); await setPieces(4, '1');
  await click('[data-kbs-save]');
  await sleep(400);
  const saved = await productOf(NAME);
  ok(saved && saved.includes(`S:1:${S}`) && saved.includes(`M:2:${M}`), `${tag} · E · S and M keep their scanned codes`, saved);
  ok(saved && /L:1:\d{13}(\s|$)/.test(saved) && !/L:1:376/.test(saved), `${tag} · E · L, left empty, gets a Kiwi code`, saved);
  ok(!(await page.$('[data-kbs-bc]')), `${tag} · E · after saving, the code fields are gone (restock screen)`);
  await close();

  /* F */
  const GEN = `TEST KIWI Chemise générée ${colours ? 'B' : 'A'}`;
  await create(GEN, 2, false);
  await click('#bqi-n-save');
  await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 8000 });
  await sleep(300);
  ok(!(await page.$('[data-kbs-bc]')), `${tag} · F · « Générer un code Kiwi » keeps the screen from before`);
  await close();
}

/* G */
await create('TEST KIWI Écharpe fournisseur', 3, true, 'tu');
ok(await page.$eval('[data-kbs-bc-in]', (i) => i.offsetParent !== null), 'G · one size + « Il a déjà un code »: its one field is shown');

ok(!errors.length, 'no page error', errors.join(' | '));
console.log(bad ? `✗ boutique-own-codes: ${bad} failed, ${n} passed` : `✓ boutique-own-codes: ${n} passed`);
await h.close();
process.exit(bad ? 1 : 0);
