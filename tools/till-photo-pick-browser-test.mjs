#!/usr/bin/env node
/* Kiwi · till-photo-pick-browser-test · the « À la caisse » block of a product
 * sheet takes the merchant's own photo: from the camera or from the gallery.
 *
 * Owner, 28 November 2026, on a tablet in front of « Cintre · Changer la
 * photo »: « make a way to add an existing or take a pic ».
 *   A · till « Nouveau produit » (demo, tablet): « Prendre une photo » opens
 *       the camera input (capture=environment), « Choisir une photo » the
 *       gallery; a chosen photo shows in the block and the created product
 *       carries it; « Retirer ma photo » gives the ready-made photo back;
 *   B · the till's upload path outside the demo: the file goes through
 *       KiwiPlatformOps.uploads with the till's merchant, the returned URL is
 *       what the form saves; a refused upload says so and keeps nothing;
 *   C · dashboard « Nouveau produit » (Maison Mansour demo): the block hands
 *       the file to the sheet's own upload, the card and the block show it,
 *       « Retirer ma photo » takes it out of both.
 * Demo only, uploads stubbed: nothing reaches a server.
 *   node tools/till-photo-pick-browser-test.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harness, demoPage, dashboardWalker, sleep } from './surface-matrix-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(ROOT, 'assets/retail-photos/abaya-beige.webp');
const h = await harness('till-photo-pick');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

const { page } = await demoPage(h, 'fr', 'tablet', { 'kiwiSkin2027:dashboard': '0' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
// coverage: surface=caisse-boutique locale=fr viewport=tablet
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

const type = async (p, sel, value) => {
  await p.waitForSelector(sel, { visible: true, timeout: 5000 });
  await p.click(sel, { clickCount: 3 });
  await p.keyboard.press('Backspace');
  await p.type(sel, value);
};
const block = (p) => p.evaluate(() => {
  const b = document.querySelector('[data-ktp]');
  if (!b) return null;
  const vis = (s) => { const x = b.querySelector(s); return !!(x && !x.hidden && x.offsetParent); };
  return {
    take: vis('[data-ktp-take]'), choose: vis('[data-ktp-choose]'), drop: vis('[data-ktp-drop]'), stock: vis('[data-ktp-stock]'),
    capture: (b.querySelector('[data-ktp-cam]') || {}).getAttribute?.('capture') || '',
    galCapture: b.querySelector('[data-ktp-file]')?.hasAttribute('capture'),
    own: b.querySelector('.ktp-img')?.classList.contains('is-own'),
    src: b.querySelector('.ktp-img img')?.getAttribute('src') || '',
    why: b.querySelector('.ktp-t span')?.textContent || '', msg: b.querySelector('.ktp-msg')?.textContent || '',
  };
});

/* ── A · till « Nouveau produit », demo, tablet ───────────────────────────── */
const NAME = 'TEST KIWI GILET PHOTO';
await page.click('#bqi-new'); await sleep(400);
await page.waitForSelector('[data-ktp]', { visible: true, timeout: 8000 });
let s = await block(page);
if (process.env.KIWI_KTP_SHOTS) { const side = await page.$('.bqx-pf-side'); await side.screenshot({ path: path.join(process.env.KIWI_KTP_SHOTS, 'till-block-empty.png') }); }
ok(s.take && s.choose && s.stock, 'A · the block offers « Prendre une photo », « Choisir une photo » and the ready-made photos', JSON.stringify(s));
ok(s.capture === 'environment' && !s.galCapture, 'A · the camera input asks for the back camera, the gallery input does not', JSON.stringify(s));
ok(!s.drop && !s.own, 'A · no own photo yet: nothing to remove');
await type(page, '[data-bqx-name]', NAME);
await (await page.$('[data-ktp-file]')).uploadFile(IMG);
await sleep(500);
s = await block(page);
ok(s.own && /^blob:/.test(s.src) && s.drop, 'A · the chosen photo shows in the block, with « Retirer ma photo »', JSON.stringify(s));
ok(/Votre photo/.test(s.why), 'A · and says the till shows it', s.why);
if (process.env.KIWI_KTP_SHOTS) { const side = await page.$('.bqx-pf-side'); await side.screenshot({ path: path.join(process.env.KIWI_KTP_SHOTS, 'till-block-own.png') }); }
await page.click('[data-ktp-drop]'); await sleep(300);
s = await block(page);
ok(!s.own && !/^blob:/.test(s.src) && !s.drop, 'A · « Retirer ma photo » gives the ready-made photo back', JSON.stringify(s));
await (await page.$('[data-ktp-cam]')).uploadFile(IMG);
await sleep(500);
ok((await block(page)).own, 'A · a photo from the camera input shows the same way');
await page.click('input[name="bqx-pf-kind"][value="tu"]'); await sleep(200);
await type(page, '[data-bqi-price]', '290');
await type(page, '[data-bqi-cost]', '140');
await type(page, '[data-kbs-total]', '1');
await page.click('#bqi-n-save'); await sleep(800);
const made = await page.evaluate((name) => { const p = window.KiwiBoutiqueCatalog.listProducts().find((x) => x.name === name); return p ? { photo: p.photo } : null; }, NAME);
ok(made && /^blob:/.test(made.photo), 'A · the created product carries the photo', JSON.stringify(made));
await page.evaluate((name) => { const cat = window.KiwiBoutiqueCatalog; cat.listProducts().filter((p) => p.name === name).forEach((p) => cat.deleteProduct(p.id)); }, NAME);
await page.evaluate(() => { const b = [...document.querySelectorAll('[data-inv-x]')].find((x) => x.offsetParent); if (b) b.click(); }); await sleep(400);

/* ── B · the till's upload path outside the demo ──────────────────────────── */
const pickerUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/assets\/retail-icon-picker\.js/.test(u)));
ok(!!pickerUrl, 'B · the till loaded the picker module', pickerUrl);
await page.evaluate(async (u) => {
  const m = await import(u);
  const root = document.createElement('div');
  root.id = 'ktp-b';
  root.innerHTML = '<input data-bqx-name value="Abaya" /><aside class="bqx-pf-side"></aside>';
  document.body.appendChild(root);
  window.__ktpCalls = [];
  window.KiwiPlatformOps = window.KiwiPlatformOps || {};
  window.__ktpReply = { url: '/api/media/media/test-shop/a1.jpg' };
  window.KiwiPlatformOps.uploads = { upload: async (file, opts) => { window.__ktpCalls.push({ type: file.type, merchant: opts && opts.merchant }); if (window.__ktpReply.error) { const e = new Error(window.__ktpReply.error); e.code = window.__ktpReply.error; throw e; } return window.__ktpReply; } };
  m.mountTillPhoto(root, null, { lang: 'fr', trade: 'boutique', media: () => false, demo: () => false, merchant: () => 'test-shop' });
}, pickerUrl);
const bRoot = await page.$('#ktp-b');
await (await bRoot.$('[data-ktp-file]')).uploadFile(IMG);
await sleep(500);
const b1 = await page.evaluate(() => ({ calls: window.__ktpCalls, st: document.getElementById('ktp-b').__kiwiTillPhoto, src: document.querySelector('#ktp-b .ktp-img img').getAttribute('src') }));
ok(b1.calls.length === 1 && b1.calls[0].merchant === 'test-shop', 'B · the file is uploaded once, for the till\'s merchant', JSON.stringify(b1.calls));
ok(b1.st && b1.st.photo === '/api/media/media/test-shop/a1.jpg' && b1.src === b1.st.photo, 'B · the returned URL is what the form saves and shows', JSON.stringify(b1));
await page.evaluate(() => { window.__ktpReply = { error: 'offline' }; document.querySelector('#ktp-b [data-ktp-drop]').click(); });
await (await bRoot.$('[data-ktp-file]')).uploadFile(IMG);
await sleep(500);
const b2 = await page.evaluate(() => ({ st: document.getElementById('ktp-b').__kiwiTillPhoto, msg: document.querySelector('#ktp-b .ktp-msg').textContent, dis: document.querySelector('#ktp-b [data-ktp-choose]').disabled }));
ok(b2.st && b2.st.photo === '' && /Pas de réseau/.test(b2.msg) && !b2.dis, 'B · offline: nothing kept, the block says why, the buttons come back', JSON.stringify(b2));
await page.evaluate(() => document.getElementById('ktp-b').remove());
ok(errors.length === 0, 'no page error on the till', errors.slice(0, 3).join(' | '));

/* ── C · dashboard « Nouveau produit » ────────────────────────────────────── */
{
  // coverage: surface=dashboard-product-editor locale=fr viewport=tablet
  const { page: dash } = await dashboardWalker(h).open({ step() {}, watch: (p) => p }, 'dashboard-transactions', 'fr', 'tablet');
  const dErr = [];
  dash.on('pageerror', (e) => dErr.push(String(e && e.message || e)));
  const js = (sel) => dash.evaluate((sel) => document.querySelector(sel).click(), sel);
  await js('[data-action="venue-toggle"]'); await sleep(400);
  await js('[data-action="venue-pick"][data-venue="maisonMansour"]');
  await dash.waitForSelector('[data-nav="inventory"]', { timeout: 8000 });
  await js('[data-nav="inventory"]'); await sleep(800);
  await dash.evaluate(() => {
    window.__ktpUp = 0;
    window.KiwiOrderPro = window.KiwiOrderPro || {};
    window.KiwiOrderPro.uploadMedia = async () => { window.__ktpUp++; return { ok: true, url: '/assets/retail-photos/abaya-beige.webp' }; };
    /* The demo venue carries no trade template; a real Maison reads « maison ». */
    if (window.KiwiStoreTemplates) window.KiwiStoreTemplates.currentTrade = () => 'maison';
  });
  await js('[data-action="bqx-new"]');
  await dash.waitForSelector('[data-ktp]', { visible: true, timeout: 8000 }); await sleep(500);
  await dash.evaluate(() => { const c = document.querySelector('[data-kbd-clear]'); if (c) c.click(); });
  let d = await block(dash);
  ok(d.take && d.choose && !d.drop, 'C · the dashboard block offers the camera and the gallery', JSON.stringify(d));
  await (await dash.$('[data-ktp-file]')).uploadFile(IMG);
  await sleep(800);
  d = await block(dash);
  const card = await dash.evaluate(() => document.querySelector('[data-bqx-photo-box] img')?.getAttribute('src') || '');
  ok(await dash.evaluate(() => window.__ktpUp) === 1, 'C · the file goes through the sheet\'s own upload, once');
  ok(card === '/assets/retail-photos/abaya-beige.webp' && d.own && d.src === card && d.drop, 'C · the card and the block both show the uploaded photo', JSON.stringify({ card, d }));
  await dash.click('[data-ktp-drop]'); await sleep(400);
  d = await block(dash);
  const cardAfter = await dash.evaluate(() => !!document.querySelector('[data-bqx-photo-box] img'));
  ok(!cardAfter && !d.own && !d.drop, 'C · « Retirer ma photo » takes it out of the card and the block', JSON.stringify({ cardAfter, d }));
  await dash.keyboard.press('Escape'); await sleep(400);
  ok(dErr.length === 0, 'no page error on the dashboard', dErr.slice(0, 3).join(' | '));
}
await h.close?.();
console.log(`\ntill-photo-pick: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
