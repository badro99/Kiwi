/* The till's staff-code pad, for browser suites: whichever pad is showing.
 *
 * Since 26 Nov 2026 every client runs Design 2027 by default, and the till's
 * lock is the kit pad (`#cp-pin-screen k-pin-pad`, keys `[data-key]` inside
 * its shadow root, assets/kit/till-pin.js). A till with the 2027 flag off
 * keeps the shipped pad (`[data-cpp]`, assets/caisse-pairing.js). Suites that
 * waited for `[data-cpp="1"]` only timed out on every 2027 till.
 *
 *   const kind = await waitCodePad(page, 45000);   // 'kit' | 'legacy'
 *   await typeCode(page, kind, code);              // real mouse clicks
 *   await codePadShowing(page)                     // 'kit' | 'legacy' | ''
 */
const KIT = '#cp-pin-screen k-pin-pad';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(kit) {
  const legacy = document.querySelector('[data-cpp="1"]');
  if (legacy && legacy.offsetWidth) return 'legacy';
  const pad = document.querySelector(kit);
  const key = pad && pad.shadowRoot && pad.shadowRoot.querySelector('[data-key="1"]');
  if (key && key.getBoundingClientRect().width > 0) return 'kit';
  return '';
}

export const codePadShowing = (page) => page.evaluate(probe, KIT);

export async function waitCodePad(page, timeout = 45000) {
  const h = await page.waitForFunction(probe, { timeout, polling: 200 }, KIT);
  return h.jsonValue();
}

export async function typeCode(page, kind, code, gap = 90) {
  for (const d of String(code)) {
    const el = kind === 'kit'
      ? (await page.evaluateHandle((s, x) => { const p = document.querySelector(s); return p && p.shadowRoot && p.shadowRoot.querySelector('[data-key="' + x + '"]'); }, KIT, d)).asElement()
      : await page.$('[data-cpp="' + d + '"]');
    const box = el && await el.boundingBox();
    if (!box) throw new Error('code pad key ' + (kind === 'kit' ? 'kit' : 'legacy') + ' not on screen');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(gap);
  }
}
