import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.KIWI_PLAYWRIGHT_PATH || 'playwright');
const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const between = (a,b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a) + a.length));
const fn = name => between('    function ' + name + '(', '\n    function ');
const html = between('  <div class="modal-veil" id="split-modal"', '  <!-- ============',);
assert.ok(html.includes('id="split-launch"') && html.includes('id="split-all-done"'));
const css = Array.from(source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g), m => m[1]).join('\n');
const js = `
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const money = v => Math.round(Number(v)*100)/100, minor = v => Math.round(v*100), major = v => v/100;
const fmtMAD = v => v+' MAD', fmtMADcents = fmtMAD, lineCat = () => 'meal', phoneSessionOf = () => 'visit';
const effectiveTipPct = () => 0, lucide = {createIcons(){}}, toast = s => window.lastToast = s;
const splitState = {splitMode:'article', numConvives:2, numParts:2, activeConvive:1, total:90, tableId:'T7', flow:null,
itemTotals:{Pasta:{totalQty:1,unitPrice:60,itemId:'pasta'},Water:{totalQty:2,unitPrice:15,itemId:'water'}},perConvive:{}};
${['remainingQty','conviveTotal','assignUnit','unassignUnit','splitArticleAllocation','renderSplitSetup','renderArticleMode','renderConvivesChips','renderConvivesTabs','renderPool','renderConviveCart','renderPartsChips','renderTipChips','updateSplitSummary','shareMoney','shareWeighted','launchSplitFlow','renderSplitFlow'].map(fn).join('\n')}
${between("    $('#split-modal').addEventListener('click'", '    // Custom tip percentage input')}
document.querySelector('#split-modal').classList.add('is-open');
renderSplitSetup();window.testState = splitState;
`;
const browser = await chromium.launch({headless:true, executablePath:process.env.KIWI_CHROME_PATH});
try {
  for (const [width,height] of [[1440,900],[834,1112],[390,844]]) {
    const page = await browser.newPage({viewport:{width,height}});
    const errors=[]; page.on('pageerror', e => errors.push(String(e)));
    await page.setContent('<!doctype html><meta charset="utf-8"><style>'+css+'</style>'+html);
    await page.addScriptTag({content:js});
    const launch = page.locator('#split-launch');
    assert.equal(await launch.isDisabled(),true);
    await page.locator('[data-pool-item="Water"]').click();
    await page.locator('[data-conv-tab="2"]').click();
    await page.locator('[data-pool-item="Water"]').click();
    assert.equal(await launch.innerText(),'1 article à attribuer');
    assert.equal(await launch.isDisabled(),true);
    await page.locator('[data-pool-item="Pasta"]').click();
    assert.equal(await launch.isDisabled(),false);
    await launch.click();
    assert.deepEqual(await page.evaluate(() => window.testState.flow.parts.map(p => p.amount)),[15,75]);
    const bounds = await page.locator('.modal-split').boundingBox();
    assert.ok(bounds.width <= width && bounds.x >= 0, 'split modal fits viewport');
    assert.deepEqual(errors,[]);
    await page.close();
    console.log('✓ Real split UI clicks: '+width+'×'+height+', intact items and blocked incomplete assignment');
  }
} finally { await browser.close(); }
