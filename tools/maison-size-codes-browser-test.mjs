#!/usr/bin/env node
/* Kiwi · maison-size-codes-browser-test · « Nouvel article » in sizes on the
 * maison till, with the supplier code of each size.
 *
 * Owner, 24 November 2026: « do the same for maison stores ». Choosing a sized
 * type changed nothing: one « TU » line, one stock, one code. Now:
 *   A · « Tailles » swaps that line for one row per size (pieces + code);
 *       « Pièce unique » brings the single line back;
 *   B · a scanner burst into a size's code fills it, Enter moves on and never
 *       creates the article;
 *   C · a burst while the cursor is in a size's pieces lands in that size's
 *       code, and the pieces keep their value;
 *   D · an unreadable code, a code given to two sizes, and an empty grid are
 *       refused before anything is written;
 *   E · « Créer l'article » makes one size per row with pieces or a code, the
 *       scanned codes kept; rows left empty are not created;
 *   F · « Pointures » shows 36 to 45;
 *   G · « Ajouter une variante » takes the code already on the label.
 * Demo till only: nothing reaches a server.
 *   node tools/maison-size-codes-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const SHOT = process.env.SHOT || '';
const h = await harness('maison-size-codes');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };
const { page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:dashboard': '0' });
if (SHOT) await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1.5 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
// coverage: surface=caisse-maison locale=fr viewport=desktop
await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiCaisseLang, { timeout: 30000 });
await sleep(500);
await page.evaluate(() => { window.KiwiConfig = window.KiwiConfig || {}; window.KiwiConfig.features = { ...(window.KiwiConfig.features || {}), caisseInventoryAdmin: true }; window.KiwiPosDispatch.unlockById('maison'); });
await page.waitForSelector('#pos-maison.is-on', { visible: true, timeout: 20000 });
await sleep(1500);
await page.evaluate(() => document.querySelector('[data-mz-view="inventaire"]').click());
await page.waitForSelector('#mzi-new', { visible: true, timeout: 10000 });

const shot = async (name) => { if (!SHOT) return; await sleep(300); const el = await page.$('#pos-maison .mz-modal.is-open, #pos-maison [role="dialog"]:not([hidden]) .mz-modal, #mz-invmm, .mz-modal'); await (el || page).screenshot({ path: `${SHOT}/${name}.png` }); };
const scan = async (code) => { await page.keyboard.type(code, { delay: 2 }); await page.keyboard.press('Enter'); await sleep(250); };
const codes = () => page.$$eval('[data-mzs-code]', (a) => a.map((i) => i.value));
const pieces = () => page.$$eval('[data-mzs-n]', (a) => a.map((i) => i.value));
const setN = (i, v) => page.evaluate((i, v) => { const b = document.querySelectorAll('[data-mzs-n]')[i]; b.value = v; b.dispatchEvent(new Event('input', { bubbles: true })); }, i, v);
const setC = (i, v) => page.evaluate((i, v) => { const b = document.querySelectorAll('[data-mzs-code]')[i]; b.value = v; b.dispatchEvent(new Event('input', { bubbles: true })); }, i, v);
const err = () => page.$eval('[data-mzs-err]', (e) => (e.hidden ? '' : e.textContent.trim())).catch(() => '');
const productOf = (name) => page.evaluate((name) => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = (cat.listProducts({ q: name }) || []).find((x) => x.name === name);
  if (!p) return null;
  return cat.getProduct(p.id).variants.map((v) => v.size + ':' + v.stock + ':' + (cat.primaryBarcode(v) || '-')).sort().join(' ');
}, name);
const kind = (k) => page.evaluate((k) => { const s = document.querySelector('#mzi-n-kind'); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, k);

const NAME = 'TEST KIWI Robe fournisseur';
await page.click('#mzi-new'); await sleep(600);
/* H · une erreur se dit sous le champ, pas en toast qui couvre les boutons. */
await page.click('#mzi-n-save'); await sleep(400);
ok(/nom/i.test(await page.$eval('#mzi-n-name', (i) => { const e = i.closest('.mzi-fg').querySelector('.kf-err'); return e && !e.hidden ? e.textContent : ''; }).catch(() => '')), 'H · an empty name is said under the field');
ok(await page.$eval('#mzi-n-name', (i) => i.classList.contains('kf-err-in') && document.activeElement === i), 'H · the field is outlined and has the cursor');
/* I · « Sans couleur » est choisi d'office ; une pastille le remplace, et revient. */
ok(await page.$eval('[data-mzs-nocol]', (b) => b.classList.contains('on')), 'I · « Sans couleur » is selected by default');
await page.type('#mzi-n-name', NAME);
await page.type('#mzi-n-price', '450');
await page.evaluate(() => { const r = document.querySelector('input[name$="own"][value="outright"], [data-own="outright"]'); if (r) r.click(); });
ok(await page.$eval('#mzi-n-stock', (i) => i.offsetParent !== null), 'A · « Pièce unique » keeps the single line (stock, size, code)');
await kind('taille'); await sleep(300);
ok((await codes()).length === 7 && !(await page.$eval('#mzi-n-stock', (i) => i.offsetParent !== null)), 'A · « Tailles » shows 7 size rows and hides the single line', String((await codes()).length));
await shot('1-grid-empty');

await page.evaluate(() => document.querySelectorAll('[data-mzs-code]')[2].focus());
await scan('3760000001014');
ok((await codes())[2] === '3760000001014', 'B · a scan fills S', JSON.stringify(await codes()));
ok(await page.evaluate(() => document.activeElement === document.querySelectorAll('[data-mzs-code]')[3]), 'B · Enter moves on to M');
ok(await productOf(NAME) === null, 'B · and nothing was created');

await page.evaluate(() => document.querySelectorAll('[data-mzs-n]')[3].focus());
await page.keyboard.type('3', { delay: 200 }); await sleep(200);
await scan('3760000001021');
ok((await codes())[3] === '3760000001021', 'C · a scan with the cursor in M\'s pieces lands in M\'s code', JSON.stringify(await codes()));
ok((await pieces())[3] === '3', 'C · M keeps its 3 pieces', JSON.stringify(await pieces()));
await setN(2, '2');
await page.click('[data-mzs-row="L"] [data-mzs-step="1"]');
ok((await pieces())[4] === '1', 'the + adds a piece to L');
ok(await page.$eval('[data-mzs-total]', (b) => b.textContent.trim()) === '6 pièces · 3 tailles', 'the foot counts pieces and sizes', await page.$eval('[data-mzs-total]', (b) => b.textContent));
await shot('2-grid-filled');

await setC(4, '3760000001021');
await page.click('#mzi-n-save'); await sleep(400);
ok(/déjà donné à une autre taille/.test(await err()), 'D · the same code on two sizes is refused', await err());
await shot('3-error');
await setC(4, 'ab');
await page.click('#mzi-n-save'); await sleep(400);
ok(/illisible/.test(await err()), 'D · an unreadable code is refused', await err());
ok(await productOf(NAME) === null, 'D · nothing created while a code is wrong');
await setC(4, '');

await page.click('#mzi-n-save'); await sleep(900);
const saved = await productOf(NAME);
ok(saved === 'L:1:- M:3:3760000001021 S:2:3760000001014', 'E · S, M and L created, the scanned codes kept, empty sizes not created', saved);
await shot('4-saved');
ok(await page.evaluate((name) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: name }).find((x) => x.name === name); return cat.getProduct(p.id).variants.every((v) => v.colorId === 'unique'); }, NAME), 'I · saved without a colour: no more « Noir · S »');
const acts = await page.$$eval('.mzi-vact', (cells) => cells[0] ? cells[0].textContent.replace(/\s+/g, ' ').trim() : '');
ok(/Étiquette/.test(acts) && /Lier un code/.test(acts) && /Mouvement/.test(acts) && /Supprimer/.test(acts), 'J · the size row buttons carry their words', acts);

await page.evaluate(() => { const b = [...document.querySelectorAll('[data-inv-addvar]')].find((x) => x.offsetParent); if (b) b.click(); }); await sleep(500);
ok(!!(await page.$('#mzi-av-code')), 'G · « Ajouter une variante » has a field for the code already on the label');
await page.evaluate(() => { const s = document.querySelector('#mzi-av-size'); s.value = 'XL'; document.querySelector('#mzi-av-stock').value = '2'; });
await page.evaluate(() => document.querySelector('#mzi-av-stock').focus());
await scan('3760000001021');
ok(await page.$eval('#mzi-av-code', (i) => i.value) === '3760000001021', 'G · a scan anywhere in the form lands in that field');
await page.click('#mzi-av-save'); await sleep(400);
ok(await productOf(NAME) === saved, 'G · a code already worn by M is refused, no variant added', await productOf(NAME));
await page.evaluate(() => { const i = document.querySelector('#mzi-av-code'); i.value = ''; i.focus(); });
await scan('3760000001038');
await page.click('#mzi-av-save'); await sleep(700);
ok(/XL:2:3760000001038/.test(await productOf(NAME) || ''), 'G · XL added with the scanned code kept', await productOf(NAME));
ok(await page.evaluate((name) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: name }).find((x) => x.name === name); return cat.getProduct(p.id).variants.find((v) => v.size === 'XL').colorId === 'unique'; }, NAME), 'G · the new size takes the article\'s colour (none), not « Noir »');
await shot('5-variant');
await page.evaluate(() => { const b = [...document.querySelectorAll('[data-inv-x]')].find((x) => x.offsetParent); if (b) b.click(); }); await sleep(500);

await page.click('#mzi-new'); await sleep(600);
await kind('pointure'); await sleep(300);
await page.evaluate(() => { const b = document.querySelector('[data-mzs-col] [data-kc-color="bleu"], [data-mzs-col] [data-kc-color]'); b && b.click(); }); await sleep(150);
ok(await page.$eval('[data-mzs-nocol]', (b) => !b.classList.contains('on')), 'I · a swatch replaces « Sans couleur »');
await page.click('[data-mzs-nocol]'); await sleep(150);
ok(await page.evaluate(() => !document.querySelector('[data-mzs-col] [aria-checked="true"]') && document.querySelector('[data-mzs-nocol]').classList.contains('on')), 'I · « Sans couleur » clears the swatch again');
const shoe = await page.$$eval('[data-mzs-row]', (a) => a.map((r) => r.getAttribute('data-mzs-row')).join(' '));
ok(shoe === '36 37 38 39 40 41 42 43 44 45', 'F · « Pointures » shows 36 to 45', shoe);
await page.type('#mzi-n-name', 'TEST KIWI Vide');
await page.click('#mzi-n-save'); await sleep(400);
ok(/au moins une taille/.test(await err()), 'D · an empty grid is refused', await err());
/* iPad: douchette AZERTY, iPad en QWERTY, pas d'e.code → « ^#(... » ; la case doit recevoir les chiffres. */
{ const US = { 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')' }; const c = await page.createCDPSession(); let t = Date.now() / 1000;
  await page.evaluate(() => document.querySelectorAll('[data-mzs-code]')[0].focus());
  for (const d of '3760000001045') { const ch = US[d]; await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: '', text: ch, unmodifiedText: ch, timestamp: t }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: '', timestamp: t + 0.002 }); t += 0.008; }
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, timestamp: t }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, timestamp: t + 0.002 }); await c.detach(); await sleep(300);
  ok((await codes())[0] === '3760000001045', 'iPad · a QWERTY-shifted scan (#&^))))))!)$%) lands as 3760000001045', JSON.stringify((await codes())[0])); }
await kind('tu'); await sleep(200);
ok(await page.$eval('#mzi-n-stock', (i) => i.offsetParent !== null) && (await codes()).length === 0, 'A · back to « Pièce unique »: the single line returns');

ok(!errors.length, 'no page error', errors.join(' | '));
console.log(bad ? `✗ maison-size-codes: ${bad} failed, ${n} passed` : `✓ maison-size-codes: ${n} passed`);
await h.close();
process.exit(bad ? 1 : 0);
