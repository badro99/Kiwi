#!/usr/bin/env node
// When the assistant cannot analyse a photo, the screen says why and says it as
// an error. On 21 Nov 2026 a real photo answered « HTTP 502 » with the server's
// reason thrown away, under a toast carrying the green success tick.
// All API traffic is intercepted; no model can be reached.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';
const h = await harness('agent-doc-error');
const temp = await mkdtemp(path.join(os.tmpdir(), 'kiwi-agent-doc-error-'));
const png = path.join(temp, 'carton.png');
await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64'));
const REASON = '3007: Request timeout';
async function click(page, selector) {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await el.scrollIntoView(); await el.click();
}
/* 21 nov. 2026, le soir : un plafond du jour (429) affichait « [object Object] » :
   son message arrive en trois langues, l'écran doit en lire une. */
const QUOTA = { ok: false, error: 'quota', kind: 'visioninspect', cap: 150,
  message: { fr: 'Limite du jour atteinte pour Kiwi AI. Réessayez demain.', en: 'Daily Kiwi AI limit reached. Try again tomorrow.', ar: 'تم بلوغ الحد اليومي لـ Kiwi AI. حاول غدًا.' } };
const CASES = [
  ['a failed photo analysis names the server reason, as an error', 502, { ok: false, error: 'model-failed', message: REASON }, 'HTTP 502', REASON],
  ['a daily limit reads as a sentence in the page language, not an object', 429, QUOTA, 'HTTP 429', QUOTA.message.fr],
];
try {
  for (const [name, status, body, code, reason] of CASES) await h.S.run(name + ' · fr · phone', async (t) => {
    const { ctx, page } = await demoPage(h, 'fr', 'phone', {}, {
      'POST /api/ai/vision-inspect': () => ({ status, body }),
    });
    t.defer(() => ctx.close()); t.watch(page);
    t.step('open the demo dashboard and its assistant');
    // coverage: surface=dashboard locale=fr viewport=phone
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    const explore = await page.evaluateHandle(() => [...document.querySelectorAll('button,a')]
      .find((el) => /Explorer la d|Explore the d|استكشف/.test(el.textContent)) || null);
    if (explore.asElement()) await explore.asElement().click();
    await explore.dispose(); await page.keyboard.press('Escape');
    await page.waitForSelector('.kw-tab[data-kw-tab="ai"]');
    await click(page, '.kw-tab[data-kw-tab="ai"]');
    await page.waitForSelector('.fa-drawer .kv-attach', { visible: true });
    t.step('attach a photo and send it');
    const choosing = page.waitForFileChooser();
    await click(page, '.fa-drawer .kv-attach');
    await (await choosing).accept([png]);
    await page.waitForSelector('.fa-drawer .kv-attach-preview', { visible: true });
    await click(page, '.fa-drawer [data-fa-send]');
    t.step('the thread and the toast both report the failure');
    await page.waitForFunction((c) => (document.querySelector('.fa-drawer')?.textContent || '').includes(c), { timeout: 15000 }, code);
    const thread = await page.$eval('.fa-drawer', (el) => el.textContent);
    assert.ok(thread.includes(reason), 'the bubble keeps the reason the server gave: ' + thread.slice(-200));
    assert.ok(!thread.includes('[object Object]'), 'no object printed as text');
    await page.waitForSelector('.kiwi-toast', { timeout: 5000 });
    const toast = await page.$eval('.kiwi-toast', (el) => ({ cls: el.className, role: el.getAttribute('role') }));
    assert.ok(!/\bsuccess\b/.test(toast.cls), 'an error is not announced under the success tick: ' + toast.cls);
    assert.equal(toast.role, 'alert', 'the failure toast is an alert');
  });
} finally { await rm(temp, { recursive: true, force: true }); await h.close(); await h.S.finish(); }
