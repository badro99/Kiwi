#!/usr/bin/env node
// Synthetic photo intake through public dashboard UI. No model or hosted data.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harness, demoPage, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-intake');
const wait = { visible: true, timeout: 10000 };
const temp = await mkdtemp(path.join(os.tmpdir(), 'kiwi-intake-'));
const image = path.join(temp, 'synthetic.png');
// One synthetic pixel, generated into a disposable directory on every run.
await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64'));
/* A synthetic 64 px HEIC (checkerboard, written by macOS sips) : desktop Chrome cannot
   decode HEIC, so this one only reaches the route through libheif (20 Nov 2026,
   a real iPhone BL fell back to an empty table). The file chooser sends no type. */
const heic = path.join(temp, 'synthetic.heic');
await writeFile(heic, Buffer.from('AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAATGm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAEnppcHJwAAASWWlwY28AABGoY29scnByb2YAABGcYXBwbAIAAABtbnRyR1JBWVhZWiAH3AAIABcADwAuAA9hY3NwQVBQTAAAAABub25lAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWFwcGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVkZXNjAAAAwAAAAHlkc2NtAAABPAAACBpjcHJ0AAAJWAAAACN3dHB0AAAJfAAAABRrVFJDAAAJkAAACAxkZXNjAAAAAAAAAB9HZW5lcmljIEdyYXkgR2FtbWEgMi4yIFByb2ZpbGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbWx1YwAAAAAAAAAfAAAADHNrU0sAAAAuAAABhGRhREsAAAA6AAABsmNhRVMAAAA4AAAB7HZpVk4AAABAAAACJHB0QlIAAABKAAACZHVrVUEAAAAsAAACrmZyRlUAAAA+AAAC2mh1SFUAAAA0AAADGHpoVFcAAAAaAAADTGtvS1IAAAAiAAADZm5iTk8AAAA6AAADiGNzQ1oAAAAoAAADwmhlSUwAAAAkAAAD6nJvUk8AAAAqAAAEDmRlREUAAABOAAAEOGl0SVQAAABOAAAEhnN2U0UAAAA4AAAE1HpoQ04AAAAaAAAFDGphSlAAAAAmAAAFJmVsR1IAAAAqAAAFTHB0UE8AAABSAAAFdm5sTkwAAABAAAAFyGVzRVMAAABMAAAGCHRoVEgAAAAyAAAGVHRyVFIAAAAkAAAGhmZpRkkAAABGAAAGqmhySFIAAAA+AAAG8HBsUEwAAABKAAAHLmFyRUcAAAAsAAAHeHJ1UlUAAAA6AAAHpGVuVVMAAAA8AAAH3gBWAWEAZQBvAGIAZQBjAG4A4QAgAHMAaQB2AOEAIABnAGEAbQBhACAAMgAsADIARwBlAG4AZQByAGkAcwBrACAAZwByAOUAIAAyACwAMgAgAGcAYQBtAG0AYQAtAHAAcgBvAGYAaQBsAEcAYQBtAG0AYQAgAGQAZQAgAGcAcgBpAHMAbwBzACAAZwBlAG4A6AByAGkAYwBhACAAMgAuADIAQx6lAHUAIABoAOwAbgBoACAATQDgAHUAIAB4AOEAbQAgAEMAaAB1AG4AZwAgAEcAYQBtAG0AYQAgADIALgAyAFAAZQByAGYAaQBsACAARwBlAG4A6QByAGkAYwBvACAAZABhACAARwBhAG0AYQAgAGQAZQAgAEMAaQBuAHoAYQBzACAAMgAsADIEFwQwBDMEMAQ7BEwEPQQwACAARwByAGEAeQAtBDMEMAQ8BDAAIAAyAC4AMgBQAHIAbwBmAGkAbAAgAGcA6QBuAOkAcgBpAHEAdQBlACAAZwByAGkAcwAgAGcAYQBtAG0AYQAgADIALAAyAMEAbAB0AGEAbADhAG4AbwBzACAAcwB6APwAcgBrAGUAIABnAGEAbQBtAGEAIAAyAC4AMpAadShwcJaOUUlepgAyAC4AMoJyX2ljz4/wx3y8GAAg1ozAyQAgrBC5yAAgADIALgAyACDVBLhc0wzHfABHAGUAbgBlAHIAaQBzAGsAIABnAHIA5QAgAGcAYQBtAG0AYQAgADIALAAyAC0AcAByAG8AZgBpAGwATwBiAGUAYwBuAOEAIAFhAGUAZADhACAAZwBhAG0AYQAgADIALgAyBdIF0AXeBdQAIAXQBeQF1QXoACAF2wXcBdwF2QAgADIALgAyAEcAYQBtAGEAIABnAHIAaQAgAGcAZQBuAGUAcgBpAGMBAwAgADIALAAyAEEAbABsAGcAZQBtAGUAaQBuAGUAcwAgAEcAcgBhAHUAcwB0AHUAZgBlAG4ALQBQAHIAbwBmAGkAbAAgAEcAYQBtAG0AYQAgADIALAAyAFAAcgBvAGYAaQBsAG8AIABnAHIAaQBnAGkAbwAgAGcAZQBuAGUAcgBpAGMAbwAgAGQAZQBsAGwAYQAgAGcAYQBtAG0AYQAgADIALAAyAEcAZQBuAGUAcgBpAHMAawAgAGcAcgDlACAAMgAsADIAIABnAGEAbQBtAGEAcAByAG8AZgBpAGxmbpAacHBepnz7ZXAAMgAuADJjz4/wZYdO9k4AgiwwsDDsMKQwrDDzMN4AIAAyAC4AMgAgMNcw7TDVMKEwpDDrA5MDtQO9A7kDugPMACADkwO6A8EDuQAgA5MDrAO8A7wDsQAgADIALgAyAFAAZQByAGYAaQBsACAAZwBlAG4A6QByAGkAYwBvACAAZABlACAAYwBpAG4AegBlAG4AdABvAHMAIABkAGEAIABHAGEAbQBtAGEAIAAyACwAMgBBAGwAZwBlAG0AZQBlAG4AIABnAHIAaQBqAHMAIABnAGEAbQBtAGEAIAAyACwAMgAtAHAAcgBvAGYAaQBlAGwAUABlAHIAZgBpAGwAIABnAGUAbgDpAHIAaQBjAG8AIABkAGUAIABnAGEAbQBtAGEAIABkAGUAIABnAHIAaQBzAGUAcwAgADIALAAyDiMOMQ4HDioONQ5BDgEOIQ4hDjIOQA4BDiMOIg5MDhcOMQ5IDicORA4bACAAMgAuADIARwBlAG4AZQBsACAARwByAGkAIABHAGEAbQBhACAAMgAsADIAWQBsAGUAaQBuAGUAbgAgAGgAYQByAG0AYQBhAG4AIABnAGEAbQBtAGEAIAAyACwAMgAgAC0AcAByAG8AZgBpAGkAbABpAEcAZQBuAGUAcgBpAQ0AawBpACAARwByAGEAeQAgAEcAYQBtAG0AYQAgADIALgAyACAAcAByAG8AZgBpAGwAVQBuAGkAdwBlAHIAcwBhAGwAbgB5ACAAcAByAG8AZgBpAGwAIABzAHoAYQByAG8BWwBjAGkAIABnAGEAbQBtAGEAIAAyACwAMgY6BicGRQYnACAAMgAuADIAIAZEBkgGRgAgBjEGRQYnBi8GSgAgBjkGJwZFBB4EMQRJBDAETwAgBEEENQRABDAETwAgBDMEMAQ8BDwEMAAgADIALAAyAC0EPwRABD4ERAQ4BDsETABHAGUAbgBlAHIAaQBjACAARwByAGEAeQAgAEcAYQBtAG0AYQAgADIALgAyACAAUAByAG8AZgBpAGwAZQAAdGV4dAAAAABDb3B5cmlnaHQgQXBwbGUgSW5jLiwgMjAxMgAAWFlaIAAAAAAAAPNRAAEAAAABFsxjdXJ2AAAAAAAABAAAAAAFAAoADwAUABkAHgAjACgALQAyADcAOwBAAEUASgBPAFQAWQBeAGMAaABtAHIAdwB8AIEAhgCLAJAAlQCaAJ8ApACpAK4AsgC3ALwAwQDGAMsA0ADVANsA4ADlAOsA8AD2APsBAQEHAQ0BEwEZAR8BJQErATIBOAE+AUUBTAFSAVkBYAFnAW4BdQF8AYMBiwGSAZoBoQGpAbEBuQHBAckB0QHZAeEB6QHyAfoCAwIMAhQCHQImAi8COAJBAksCVAJdAmcCcQJ6AoQCjgKYAqICrAK2AsECywLVAuAC6wL1AwADCwMWAyEDLQM4A0MDTwNaA2YDcgN+A4oDlgOiA64DugPHA9MD4APsA/kEBgQTBCAELQQ7BEgEVQRjBHEEfgSMBJoEqAS2BMQE0wThBPAE/gUNBRwFKwU6BUkFWAVnBXcFhgWWBaYFtQXFBdUF5QX2BgYGFgYnBjcGSAZZBmoGewaMBp0GrwbABtEG4wb1BwcHGQcrBz0HTwdhB3QHhgeZB6wHvwfSB+UH+AgLCB8IMghGCFoIbgiCCJYIqgi+CNII5wj7CRAJJQk6CU8JZAl5CY8JpAm6Cc8J5Qn7ChEKJwo9ClQKagqBCpgKrgrFCtwK8wsLCyILOQtRC2kLgAuYC7ALyAvhC/kMEgwqDEMMXAx1DI4MpwzADNkM8w0NDSYNQA1aDXQNjg2pDcMN3g34DhMOLg5JDmQOfw6bDrYO0g7uDwkPJQ9BD14Peg+WD7MPzw/sEAkQJhBDEGEQfhCbELkQ1xD1ERMRMRFPEW0RjBGqEckR6BIHEiYSRRJkEoQSoxLDEuMTAxMjE0MTYxODE6QTxRPlFAYUJxRJFGoUixStFM4U8BUSFTQVVhV4FZsVvRXgFgMWJhZJFmwWjxayFtYW+hcdF0EXZReJF64X0hf3GBsYQBhlGIoYrxjVGPoZIBlFGWsZkRm3Gd0aBBoqGlEadxqeGsUa7BsUGzsbYxuKG7Ib2hwCHCocUhx7HKMczBz1HR4dRx1wHZkdwx3sHhYeQB5qHpQevh7pHxMfPh9pH5Qfvx/qIBUgQSBsIJggxCDwIRwhSCF1IaEhziH7IiciVSKCIq8i3SMKIzgjZiOUI8Ij8CQfJE0kfCSrJNolCSU4JWgllyXHJfcmJyZXJocmtyboJxgnSSd6J6sn3CgNKD8ocSiiKNQpBik4KWspnSnQKgIqNSpoKpsqzysCKzYraSudK9EsBSw5LG4soizXLQwtQS12Last4S4WLkwugi63Lu4vJC9aL5Evxy/+MDUwbDCkMNsxEjFKMYIxujHyMioyYzKbMtQzDTNGM38zuDPxNCs0ZTSeNNg1EzVNNYc1wjX9Njc2cjauNuk3JDdgN5w31zgUOFA4jDjIOQU5Qjl/Obw5+To2OnQ6sjrvOy07azuqO+g8JzxlPKQ84z0iPWE9oT3gPiA+YD6gPuA/IT9hP6I/4kAjQGRApkDnQSlBakGsQe5CMEJyQrVC90M6Q31DwEQDREdEikTORRJFVUWaRd5GIkZnRqtG8Ec1R3tHwEgFSEtIkUjXSR1JY0mpSfBKN0p9SsRLDEtTS5pL4kwqTHJMuk0CTUpNk03cTiVObk63TwBPSU+TT91QJ1BxULtRBlFQUZtR5lIxUnxSx1MTU19TqlP2VEJUj1TbVShVdVXCVg9WXFapVvdXRFeSV+BYL1h9WMtZGllpWbhaB1pWWqZa9VtFW5Vb5Vw1XIZc1l0nXXhdyV4aXmxevV8PX2Ffs2AFYFdgqmD8YU9homH1YklinGLwY0Njl2PrZEBklGTpZT1lkmXnZj1mkmboZz1nk2fpaD9olmjsaUNpmmnxakhqn2r3a09rp2v/bFdsr20IbWBtuW4SbmtuxG8eb3hv0XArcIZw4HE6cZVx8HJLcqZzAXNdc7h0FHRwdMx1KHWFdeF2Pnabdvh3VnezeBF4bnjMeSp5iXnnekZ6pXsEe2N7wnwhfIF84X1BfaF+AX5ifsJ/I3+Ef+WAR4CogQqBa4HNgjCCkoL0g1eDuoQdhICE44VHhauGDoZyhteHO4efiASIaYjOiTOJmYn+imSKyoswi5aL/IxjjMqNMY2Yjf+OZo7OjzaPnpAGkG6Q1pE/kaiSEZJ6kuOTTZO2lCCUipT0lV+VyZY0lp+XCpd1l+CYTJi4mSSZkJn8mmia1ZtCm6+cHJyJnPedZJ3SnkCerp8dn4uf+qBpoNihR6G2oiailqMGo3aj5qRWpMelOKWpphqmi6b9p26n4KhSqMSpN6mpqhyqj6sCq3Wr6axcrNCtRK24ri2uoa8Wr4uwALB1sOqxYLHWskuywrM4s660JbSctRO1irYBtnm28Ldot+C4WbjRuUq5wro7urW7LrunvCG8m70VvY++Cr6Evv+/er/1wHDA7MFnwePCX8Lbw1jD1MRRxM7FS8XIxkbGw8dBx7/IPci8yTrJuco4yrfLNsu2zDXMtc01zbXONs62zzfPuNA50LrRPNG+0j/SwdNE08bUSdTL1U7V0dZV1tjXXNfg2GTY6Nls2fHadtr724DcBdyK3RDdlt4c3qLfKd+v4DbgveFE4cziU+Lb42Pj6+Rz5PzlhOYN5pbnH+ep6DLovOlG6dDqW+rl63Dr++yG7RHtnO4o7rTvQO/M8Fjw5fFy8f/yjPMZ86f0NPTC9VD13vZt9vv3ivgZ+Kj5OPnH+lf65/t3/Af8mP0p/br+S/7c/23//wAAAAxjbGxpAMsAQAAAABRpc3BlAAAAAAAAAEAAAABAAAAACWlyb3QAAAAAEHBpeGkAAAAAAwgICAAAAHBodmNDAQNwAAAAsAAAAAAAHvAA/P34+AAACwOgAAEAF0ABDAH//wNwAAADALAAAAMAAAMAHnAkoQABACJCAQEDcAAAAwCwAAADAAADAB6gFCBBwY+Ie5FlU3AgICAIogABAAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAE04AAADvAAAAAW1kYXQAAAAAAAAA/wAAAOsoAa+j/YAa9F+/7rq3R/47351jtkN5v+kIzmf7sAaB+uokTfzLGtD6Tl8r+ELasexSluOuMoo+G1jC9Tjnh5wS7HsU0tOtgQEvDLHr18S++s1r/nPdX8klxeoePDqqHB1XL9dfi2vJoazsABX3tkN8xJPOeUivNLPPkXaRrFmvs64C/NQbMF/HbaDeTPhqu6fxMb92amX4fLcaBV462Ux78KA8N1hcXlv8fhL8y9qcnei8RbA7z+XvM9svDdrW24melbEuX8U95rYNO2g8QiB7Y2NZqZI3BuVzNx3vGZfnQfLbAR/Iu6YJbmeA', 'base64'));


const documentFile = path.join(temp, 'synthetic.pdf');
// A local, text-only supplier document. The extraction route below is a fixture.
const stream = 'BT /F1 12 Tf 40 100 Td (TEST KIWI supplier invoice) Tj ET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
const xref = Buffer.byteLength(pdf);
pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
await writeFile(documentFile, pdf);

async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  await page.click(selector);
}

async function view(page) {
  const selector = '[data-nav="stock"]';
  await page.waitForSelector(selector, { timeout: 30000 });
  const off = await page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return r.right <= 0 || r.left >= innerWidth || !!el.closest('[inert]');
  });
  if (off) {
    // Off screen behind the menu (phone, tablet): same entry as dashboardWalker,
    // the sidebar link clicked in script. Every later step is a real click.
    await page.evaluate((s) => document.querySelector(s).click(), selector);
  } else await click(page, selector);
  await page.waitForSelector('.dash-stock', wait);
}

async function check(t, cell, state, locale, viewport) {
  const key = `matrix-state-intake-${state}-${locale}-${viewport}`;
  const strict = { ...h, baseline: { ...h.baseline, [key]: {} } };
  await cell.page.waitForSelector(cell.region, wait);
  await cell.page.evaluate(() => Promise.race([document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1000))]));
  await sleep(350);
  await verify(strict, t, cell, key, locale);
}

const intake = {
  async open(t, locale, viewport, assistant = false) {
    const { ctx, page } = await demoPage(h, locale, viewport, {}, {
      'POST /api/ai/invoice': { ok: true, supplier: {name:'TEST KIWI'}, lines: [{name:'TEST KIWI',qty:1,unitCost:1}] },
    });
    await page.evaluateOnNewDocument(() => performance.setResourceTimingBufferSize(4000));
    t.defer(() => ctx.close());
    t.watch(page);
    let modelRequests = 0, invoiceKind = '';
    // demoPage already responds offline to every API request and aborts every
    // external origin. Even a regression cannot reach a paid model.
    page.on('request', (r) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith('/api/ai/')) modelRequests++;
      if (p === '/api/ai/invoice') { try { const b = JSON.parse(r.postData() || '{}'); invoiceKind = b.kind + (b.kind === 'image' && /^data:image\/jpeg;base64,/.test(b.image) ? ':jpeg' : ''); } catch (_) {} }
    });
    t.step('load demo dashboard and enter the demo using its visible button');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    const explore = await page.evaluateHandle(() => [...document.querySelectorAll('button,a')]
      .find((el) => /Explorer la d|Explore the d|استكشف/.test(el.textContent)) || null);
    if (explore.asElement()) await explore.asElement().click();
    await explore.dispose();
    await page.keyboard.press('Escape');
    const ownerCounts = () => page.evaluate(() => {
      const counts = { 'catalog-import': 0, finance: 0, conformite: 0, 'operations-ui': 0 };
      for (const script of document.scripts) {
        const match = script.src.match(/\/assets\/(catalog-import|finance|conformite|operations-ui)\.js\?/);
        if (match) counts[match[1]]++;
      }
      return counts;
    });
    assert.deepEqual(await ownerCounts(), { 'catalog-import': 0, finance: 1, conformite: 1, 'operations-ui': 1 },
      'synchronous drawer providers are eager; the optional importer waits for first use');
    if (assistant) {
      t.step('open the assistant and render a synthetic invoice inspection without a model');
      await page.evaluate(() => window.KiwiAgent.open());
      await page.waitForSelector('[data-fa-thread]', wait);
      await page.evaluate(() => window.KiwiVision.renderResult({
        docType:'invoice', confidence:1, title:'TEST KIWI', summary:'Synthetic local fixture',
        entities:{supplier:'TEST KIWI'},
        suggestedActions:[{type:'stock-receive',label:'TEST KIWI',primary:true}],
      }, document.querySelector('[data-fa-thread]'), () => {}));
      t.step('hand off the inspected document to the same stock receipt workflow');
      await click(page, '[data-kv-action="stock-receive"]');
    } else {
      t.step('open stock through the sidebar, opening the phone menu first');
      await view(page);
    }
    await page.evaluate(() => window.KiwiDashboardLoader.load('workspace'));
    await sleep(700);
    assert.deepEqual(await ownerCounts(), { 'catalog-import': 1, finance: 1, conformite: 1, 'operations-ui': 1 },
      'first use loads the importer once and never executes eager providers again');
    if (!assistant) {
      if (viewport === 'phone') {
        t.step('open photo/document intake from the visible Stock header button');
        await click(page, '[data-stock-head-scan]');
      } else {
        t.step('open stock tools and photo/document intake');
        await click(page, '[data-action="stock-workspace-actions"]');
        await click(page, '[data-catalog-stock="stock-scan-invoice"]');
      }
    }
    await page.waitForSelector('[data-stock-pick-file]', wait);
    await page.waitForSelector('[data-stock-pick-cam]', wait);
    return { page, region: '.kiwi-backdrop .kiwi-modal', modelRequests: () => modelRequests, invoiceKind: () => invoiceKind };
  },
};

async function review(t, cell, locale, viewport, document = false, photo = image) {
  await check(t, cell, 'upload', locale, viewport);
  t.step(document ? 'choose a synthetic text PDF through the file picker' : photo === heic ? 'choose a synthetic iPhone HEIC through the file picker' : 'choose a synthetic PNG through the file picker');
  const chooser = cell.page.waitForFileChooser();
  await click(cell.page, '[data-stock-pick-file]');
  await chooser;
  const input = await cell.page.$('[data-stock-file-input]');
  await input.uploadFile(document ? documentFile : photo);
  await input.dispose();
  await cell.page.waitForSelector('[data-stock-receive-rows]', wait);
  await cell.page.waitForSelector('[data-stock-scan-confirm]', wait);
  assert.equal(await cell.page.$$eval('[data-stock-receive-row]', (rows) => rows.length), 1,
    'the shared review exposes the lines read from the document or the photo');
  assert.equal(cell.invoiceKind(), document ? 'text' : 'image:jpeg', 'a PDF sends its text, a photo a reduced JPEG');
  await check(t, cell, 'manual-review', locale, viewport);
  t.step('correct the first line quantity using typing and verify the editable value');
  const qty = '[data-stock-receive-qty]';
  await click(cell.page, qty);
  await cell.page.click(qty, {clickCount:3});
  await cell.page.keyboard.press('Backspace');
  await cell.page.type(qty, '2');
  await cell.page.keyboard.press('Tab');
  assert.equal(await cell.page.$eval(qty, (el) => el.value), '2');
  assert.equal(cell.modelRequests(), 1, 'only the invoice fixture route is requested, once');
  await check(t, cell, 'corrected-review', locale, viewport);
  t.step('select a stock item, name the supplier and save the reviewed receipt');
  const itemId = await cell.page.$eval('[data-stock-receive-item]', el => [...el.options].find(o => o.value).value);
  const before = await cell.page.evaluate(id => window.KiwiRestaurantStock.rows().find(r => r.id === id).currentStock, itemId);
  await cell.page.select('[data-stock-receive-item]', itemId);
  await cell.page.type('[data-stock-receive-supplier]', ' TEST KIWI');
  await click(cell.page, '[data-stock-scan-confirm]');
  await cell.page.waitForSelector('[data-stock-receive-rows]', {hidden:true,timeout:10000});
  const after = await cell.page.evaluate(id => window.KiwiRestaurantStock.rows().find(r => r.id === id).currentStock, itemId);
  assert.equal(after, before + 2, 'one confirmed receipt adds exactly the corrected quantity');
}

try {
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · fr · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · fr · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=fr viewport=phone
    // coverage: surface=dashboard-intake-photo locale=fr viewport=phone
    const cell = await intake.open(t, 'fr', 'phone');
    await review(t, cell, 'fr', 'phone', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · fr · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · fr · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=fr viewport=tablet
    // coverage: surface=dashboard-intake-photo locale=fr viewport=tablet
    const cell = await intake.open(t, 'fr', 'tablet');
    await review(t, cell, 'fr', 'tablet', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · en · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · en · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=en viewport=phone
    // coverage: surface=dashboard-intake-photo locale=en viewport=phone
    const cell = await intake.open(t, 'en', 'phone');
    await review(t, cell, 'en', 'phone', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · en · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · en · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=en viewport=tablet
    // coverage: surface=dashboard-intake-photo locale=en viewport=tablet
    const cell = await intake.open(t, 'en', 'tablet');
    await review(t, cell, 'en', 'tablet', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · ar · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · ar · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=ar viewport=phone
    // coverage: surface=dashboard-intake-photo locale=ar viewport=phone
    const cell = await intake.open(t, 'ar', 'phone');
    await review(t, cell, 'ar', 'phone', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'photo intake · ar · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('photo intake · ar · tablet', async (t) => {
    // coverage: surface=dashboard-stock locale=ar viewport=tablet
    // coverage: surface=dashboard-intake-photo locale=ar viewport=tablet
    const cell = await intake.open(t, 'ar', 'tablet');
    await review(t, cell, 'ar', 'tablet', false);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'heic photo intake · fr · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('heic photo intake · fr · tablet', async (t) => {
    const cell = await intake.open(t, 'fr', 'tablet');
    await review(t, cell, 'fr', 'tablet', false, heic);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · fr · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · fr · phone', async (t) => {
    // coverage: surface=dashboard-intake-document locale=fr viewport=phone
    const cell = await intake.open(t, 'fr', 'phone');
    await review(t, cell, 'fr', 'phone', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · fr · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · fr · tablet', async (t) => {
    // coverage: surface=dashboard-intake-document locale=fr viewport=tablet
    const cell = await intake.open(t, 'fr', 'tablet');
    await review(t, cell, 'fr', 'tablet', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · en · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · en · phone', async (t) => {
    // coverage: surface=dashboard-intake-document locale=en viewport=phone
    const cell = await intake.open(t, 'en', 'phone');
    await review(t, cell, 'en', 'phone', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · en · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · en · tablet', async (t) => {
    // coverage: surface=dashboard-intake-document locale=en viewport=tablet
    const cell = await intake.open(t, 'en', 'tablet');
    await review(t, cell, 'en', 'tablet', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · ar · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · ar · phone', async (t) => {
    // coverage: surface=dashboard-intake-document locale=ar viewport=phone
    const cell = await intake.open(t, 'ar', 'phone');
    await review(t, cell, 'ar', 'phone', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'document intake · ar · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('document intake · ar · tablet', async (t) => {
    // coverage: surface=dashboard-intake-document locale=ar viewport=tablet
    const cell = await intake.open(t, 'ar', 'tablet');
    await review(t, cell, 'ar', 'tablet', true);
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · fr · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · fr · phone', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=fr viewport=phone
    const cell = await intake.open(t, 'fr', 'phone', true);
    await review(t, cell, 'fr', 'phone');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · fr · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · fr · tablet', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=fr viewport=tablet
    const cell = await intake.open(t, 'fr', 'tablet', true);
    await review(t, cell, 'fr', 'tablet');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · en · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · en · phone', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=en viewport=phone
    const cell = await intake.open(t, 'en', 'phone', true);
    await review(t, cell, 'en', 'phone');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · en · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · en · tablet', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=en viewport=tablet
    const cell = await intake.open(t, 'en', 'tablet', true);
    await review(t, cell, 'en', 'tablet');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · ar · phone'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · ar · phone', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=ar viewport=phone
    const cell = await intake.open(t, 'ar', 'phone', true);
    await review(t, cell, 'ar', 'phone');
  });
  if (!process.env.KIWI_INTAKE_CASE || 'assistant intake · ar · tablet'.includes(process.env.KIWI_INTAKE_CASE)) await h.S.run('assistant intake · ar · tablet', async (t) => {
    // coverage: surface=dashboard-intake-assistant locale=ar viewport=tablet
    const cell = await intake.open(t, 'ar', 'tablet', true);
    await review(t, cell, 'ar', 'tablet');
  });
} finally {
  await rm(temp, { recursive: true, force: true });
  await h.close();
  await h.S.finish();
}
