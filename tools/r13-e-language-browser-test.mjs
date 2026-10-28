import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, demoPage } from './surface-matrix-lib.mjs';

const h = await harness('r13-e-language');
try {
  await h.S.run('employee live text and accessible attributes survive FR EN AR cycles', async t => {
    const { ctx, page } = await demoPage(h, 'fr', 'desktop'); t.watch(page); t.defer(() => ctx.close());
    await page.goto(h.base + '/404.html');
    const shell = fs.readFileSync('kiwi-serveur.html', 'utf8');
    const controls = [...shell.matchAll(/<button[^>]*data-employee-language="(?:fr|en|ar)"[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]).join('');
    assert.equal((controls.match(/data-employee-language=/g) || []).length, 3);
    await page.setContent('<html lang="fr"><body>' + controls + '<main></main></body></html>');
    await page.addScriptTag({ url: h.base + '/assets/serveur-lang.js' });
    const source = fs.readFileSync('assets/serveur-app.js', 'utf8');
    const code = source.slice(source.indexOf('    const EMPLOYEE_LANGUAGE_KEY'), source.indexOf('    /* ---------- Calendar'));
    await page.evaluate(code => {
      Function(`const svMerchant=()=> 'synthetic-lane-e';
        const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
        const renderSchedule=()=>{}, renderHours=()=>{}, renderProfil=()=>{}, updateShiftMeta=()=>{};
        const currentTab='profil';
        ${code}`)();
      document.dispatchEvent(new Event('DOMContentLoaded'));
    }, code);
    for (const [locale, expected, direction] of [['en', 'Amount received', 'ltr'], ['ar', 'المبلغ المستلم', 'rtl'], ['fr', 'Montant reçu', 'ltr']]) {
      await page.focus(`[data-employee-language="${locale}"]`);
      await page.keyboard.press('Enter');
      await page.evaluate(() => document.querySelector('main').innerHTML = '<label><span>Montant reçu</span><input placeholder="Montant reçu" aria-label="Montant reçu" title="Montant reçu"></label>');
      await page.waitForFunction(expected => document.querySelector('main span').textContent === expected, {}, expected);
      assert.equal(await page.$eval('html', el => el.dir), direction);
      assert.equal(await page.$eval('html', el => el.lang), locale);
      const attrs = await page.$eval('input', el => ['placeholder','aria-label','title'].map(a => el.getAttribute(a)));
      assert.deepEqual(attrs, [expected, expected, expected]);
      assert.equal(await page.evaluate(() => localStorage.getItem('kiwi-employee-language:synthetic-lane-e')), locale);
    }
  });
} finally { await h.close(); }
await h.S.finish();
