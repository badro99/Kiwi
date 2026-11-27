import caisseTestSource from './caisse-test-source.cjs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
/* Ported from Playwright (never a dependency here, so this suite could not run)
 * to puppeteer-core, which the rest of tools/ already uses. 2026-10-12. */
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the split UI');
const source = caisseTestSource(fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8')).replace(/<link rel="stylesheet" href="assets\/caisse-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + fs.readFileSync(new URL('../assets/caisse-shell.css', import.meta.url), 'utf8') + '</style>');
const between = (a,b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a) + a.length));
const fn = name => between('    function ' + name + '(', '\n    function ');
const html = between('  <div class="modal-veil" id="split-modal"', '  <!-- ============',);
assert.ok(html.includes('id="split-launch"') && html.includes('id="split-all-done"'));
const css = Array.from(source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g), m => m[1]).join('\n');
const js = `
${fs.readFileSync(new URL('../assets/caisse/table-settlement.js', import.meta.url), 'utf8')}
const tables = { T7: { status: 'ka-yaklo' } }, tableOrders = {};
${caisseTestSource.orderDeclarations()}
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const money = v => Math.round(Number(v)*100)/100, minor = v => Math.round(v*100), major = v => v/100;
const fmtMAD = v => v+' MAD', fmtMADcents = fmtMAD, lineCat = () => 'meal', phoneSessionOf = () => 'visit';
const kdsEsc = s => String(s), effectiveTipPct = () => 0, lucide = {createIcons(){}}, toast = s => window.lastToast = s;
const splitState = {splitMode:'article', numConvives:2, numParts:2, activeConvive:1, total:90, tableId:'T7', flow:null,
itemTotals:{Pasta:{totalQty:1,unitPrice:60,itemId:'pasta'},Water:{totalQty:2,unitPrice:15,itemId:'water'}},perConvive:{}};
${['remainingQty','conviveTotal','assignUnit','unassignUnit','splitArticleAllocation','renderSplitSetup','renderArticleMode','renderConvivesChips','renderConvivesTabs','renderPool','renderConviveCart','renderPartsChips','renderTipChips','updateSplitSummary','shareMoney','shareWeighted','launchSplitFlow','renderSplitFlow','splitPartLabel','splitAmountTr','ensureSplitAmountMode','splitAmountCents','splitAmountAllocation','renderSplitAmountMode','updateSplitAmountSummary'].map(fn).join('\n')}
${between("    $('#split-modal').addEventListener('click'", '    // Custom tip percentage input')}
document.querySelector('#split-modal').classList.add('is-open');
renderSplitSetup();window.testState = splitState;
`;
const browser = await puppeteer.launch({headless:true, executablePath:bin, args:['--no-sandbox']});
try {
  for (const [width,height] of [[1440,900],[834,1112],[390,844]]) {
    const page = await browser.newPage(); await page.setViewport({width,height});
    const errors=[]; page.on('pageerror', e => errors.push(String(e)));
    await page.setContent('<!doctype html><meta charset="utf-8"><style>'+css+'</style>'+html);
    await page.addScriptTag({content:js});
    const disabled = () => page.$eval('#split-launch', e => e.disabled);
    assert.equal(await disabled(),true);
    await page.click('[data-pool-item="Water"]');
    await page.click('[data-conv-tab="2"]');
    await page.click('[data-pool-item="Water"]');
    assert.equal(await page.$eval('#split-launch', e => e.innerText),'1 article à attribuer');
    assert.equal(await disabled(),true);
    await page.click('[data-pool-item="Pasta"]');
    assert.equal(await disabled(),false);
    await page.click('#split-launch');
    assert.deepEqual(await page.evaluate(() => window.testState.flow.parts.map(p => p.amount)),[15,75]);
    const bounds = await (await page.$('.modal-split')).boundingBox();
    assert.ok(bounds.width <= width && bounds.x >= 0, 'split modal fits viewport');
    assert.deepEqual(errors,[]);
    await page.close();
    console.log('✓ Real split UI clicks: '+width+'×'+height+', intact items and blocked incomplete assignment');
    /* « Par montant » : taper ce que paie un convive, le reste va à la dernière part. */
    const page2 = await browser.newPage(); await page2.setViewport({width,height});
    const errors2=[]; page2.on('pageerror', e => errors2.push(String(e)));
    await page2.setContent('<!doctype html><meta charset="utf-8"><style>'+css+'</style>'+html);
    await page2.addScriptTag({content:js});
    await page2.click('[data-split-tab="montant"]');
    assert.equal(await page2.$eval('#split-launch', e => e.disabled), true, 'nothing typed yet');
    await page2.click('[data-split-amount="0"]');
    await page2.keyboard.type('20,50');
    assert.equal(await page2.$eval('#split-amount-rest', e => e.textContent), '69.5 MAD');
    assert.equal(await page2.$eval('#split-launch', e => e.disabled), false);
    await page2.click('#split-launch');
    assert.deepEqual(await page2.evaluate(() => window.testState.flow.parts.map(p => p.amount)),[20.5,69.5]);
    const tabs = await page2.$$eval('[data-split-tab]', els => els.map(e => e.getBoundingClientRect()).map(r => r.right));
    assert.ok(Math.max(...tabs) <= width, 'three split tabs fit the viewport');
    assert.deepEqual(errors2,[]);
    await page2.close();
    console.log('✓ Split by amount: '+width+'×'+height+', typed share plus the rest');
  }
} finally { await browser.close(); }
