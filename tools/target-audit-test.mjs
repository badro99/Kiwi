#!/usr/bin/env node
/* target-audit-test · the hit-area audit (tools/target-audit.mjs) proves itself
 * (spec §10.6 "Recorded hit test", Principle 4), with no kit component needed.
 *
 * It builds the segmented control from the §10.6 CSS (the host is the full
 * target height, each segment button is 100 % of it, the track is painted by the
 * host's ::before, containment is `layout style` and never `paint`) in a compact
 * and a default size, and requires every point of a 44 x 44 grid centred on each
 * segment to resolve to that segment's button: a measured hit height of 44.
 *
 * Then it breaks the control the ways the spec says went wrong, and requires the
 * audit to catch each one:
 *   · revision 5's segments: painted 28, grown to 44 by an overflowing ::before
 *     inside a track with `contain: layout paint` -> clipped to 36;
 *   · a 36 tall button in a 44 host; a covering overlay; pointer-events: none;
 *   · the same defects inside an OPEN shadow root (the kit's own shape);
 * and checks the options: the kitchen's 56, a justified exemption, round buttons.
 *   node tools/target-audit-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { auditTargets, assertTargets, formatFailures } from './target-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
console.log('target-audit-test');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* The §10.6 geometry, as CSS. Colours are plain test paint, not the kit's. */
const SEG_CSS = `
  body { margin: 0; padding: 12px 16px; background: #F7F5F0; font: 13px/1 sans-serif; }
  section { margin: 0 0 40px; }
  k-seg { display: flex; position: relative; width: 335px; height: 44px; contain: layout style; }
  k-seg::before { content: ""; position: absolute; inset-inline: 0; inset-block: 0; background: #E8E6E0; border-radius: 12px; }
  k-seg[size="compact"]::before { inset-block: 4px; }
  k-seg button { position: relative; flex: 1 1 auto; min-width: 44px; height: 100%; margin: 0; padding: 0 12px; border: 0; background: transparent; font: inherit; }
`;
const SEG = (size, extra = '') => `<k-seg size="${size}" ${extra}><button>Tout</button><button>Carte</button><button>Espèces</button></k-seg>`;

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>banc</title><style>${SEG_CSS}
  /* revision 5: painted 28, grown by an overflowing ::before, inside a track that clips paint */
  .r5 { display: flex; width: 335px; height: 36px; background: #E8E6E0; contain: layout paint; }
  .r5 button { position: relative; flex: 1 1 auto; align-self: center; height: 28px; border: 0; background: #fff8; }
  .r5 button::before { content: ""; position: absolute; inset: -8px 0; }
  .r5.free { contain: none; overflow: visible; }
  .short { display: flex; width: 335px; height: 44px; background: #E8E6E0; }
  .short button { flex: 1 1 auto; align-self: center; height: 36px; border: 0; background: #fff8; }
  .cover { position: relative; width: 44px; height: 44px; }
  .cover button { width: 100%; height: 100%; border: 0; background: #cfe; }
  .cover i { position: absolute; top: 0; right: 0; width: 12px; height: 100%; background: #f99; }
  .nope button { width: 120px; height: 44px; pointer-events: none; }
  .round { width: 44px; height: 44px; border-radius: 50%; border: 0; background: #0B6E4F; }
  .kitchen button { width: 120px; }
</style></head><body>
  <section id="compact">${SEG('compact')}</section>
  <section id="default">${SEG('default')}</section>
  <section id="rtl" dir="rtl">${SEG('default')}</section>
  <section id="r5"><div class="r5"><button>Tout</button><button>Carte</button><button>Espèces</button></div></section>
  <section id="r5free"><div class="r5 free"><button>Tout</button><button>Carte</button><button>Espèces</button></div></section>
  <section id="short"><div class="short"><button>Tout</button><button>Carte</button><button>Espèces</button></div></section>
  <section id="cover"><div class="cover"><button>Payer</button><i></i></div></section>
  <section id="nope"><div class="nope"><button>Payer</button></div></section>
  <section id="kitchen56"><div class="kitchen"><button data-k-target-min="56" style="height:56px">Prêt</button></div></section>
  <section id="kitchen44"><div class="kitchen"><button data-k-target-min="56" style="height:44px">Prêt</button></div></section>
  <section id="exempt"><p>Voir les <a href="#cgu" data-k-target-exempt="inline link in a sentence" style="font-size:13px">conditions</a>.</p></section>
  <section id="round"><button class="round" aria-label="Fermer"></button></section>
  <section id="hidden"><button style="display:none;height:10px">caché</button></section>
  <section id="shadow-ok"></section>
  <section id="shadow-bad"></section>
  <div style="height:1400px"></div>
<script>
  const good = '<style>${SEG_CSS.replace(/\n/g, ' ')}</style>' + ${JSON.stringify(SEG('compact'))};
  const bad = '<style>${SEG_CSS.replace(/\n/g, ' ')} k-seg button { height: 36px; align-self: center; }</style>' + ${JSON.stringify(SEG('default'))};
  for (const [id, html] of [['shadow-ok', good], ['shadow-bad', bad]]) {
    const host = document.createElement('div');
    host.className = 'shadow-host';
    host.attachShadow({ mode: 'open' }).innerHTML = html;
    document.getElementById(id).appendChild(host);
  }
</script></body></html>`;

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const s = suite('target-audit', { browser });

async function page(t) {
  const p = t.watch(await browser.newPage());
  t.defer(() => p.close());
  await p.setViewport({ width: 390, height: 844 });
  await p.setContent(PAGE);
  return p;
}
const only = (id) => `#${id} button, #${id} a, #${id} input`;

await s.run('the §10.6 segmented control hits 44 x 44, compact and default, LTR and RTL', async (t) => {
  const p = await page(t);
  for (const id of ['compact', 'default', 'rtl']) {
    const r = await auditTargets(p, { selector: only(id), record: true });
    assertTargets(r, id);
    check(r.sampled === 3 && r.passed.every((c) => c.hitH === 67 || c.hitH >= 44), `${id}: 3 segments sampled, none missed a point`);
    const hit = r.passed.map((c) => c.hitH);
    console.log(`    measured hit height of ${id}: ${hit.join(', ')} (the host is 44)`);
    /* The audit's own scan is capped at 1.5 x min each way; the host is 44 tall, so a 44 run is the whole host. */
    check(hit.every((h) => h === 44), `${id}: measured hit height 44 for every segment`);
  }
  const compactPaint = await p.evaluate(() => { const h = document.querySelector('#compact k-seg'); const b = getComputedStyle(h, '::before'); return { host: h.getBoundingClientRect().height, paint: parseFloat(b.height) }; });
  check(compactPaint.host === 44 && compactPaint.paint === 36, 'compact: host 44, track painted 36 (a 28 segment inside it hits 44 anyway)');
});

await s.run('revision 5: painted 28, grown by an overflowing ::before under paint containment, is caught at 36', async (t) => {
  const p = await page(t);
  const r = await auditTargets(p, { selector: only('r5') });
  check(r.failures.length === 3, 'all three segments fail');
  check(r.failures.every((f) => f.hitH >= 35 && f.hitH <= 37), `measured hit height ${r.failures.map((f) => f.hitH).join(', ')} (the round 6 critic measured 36)`);
  check(r.failures.every((f) => f.missed > 0 && f.total === 484), 'each misses points of the 22 x 22 grid');
  let thrown = null;
  try { assertTargets(r, 'rev5'); } catch (e) { thrown = e; }
  check(thrown && /below the hit area/.test(thrown.message) && thrown.failures.length === 3, 'assertTargets throws and names every miss');
  console.log('    ' + formatFailures(r)[0]);
  const free = await auditTargets(p, { selector: only('r5free') });
  assertTargets(free, 'r5free');
  check(true, 'the same markup with the clipping removed passes: the audit blames the containment, not the markup');
});

await s.run('a 36 tall button in a 44 host, a covering overlay and pointer-events none are caught', async (t) => {
  const p = await page(t);
  const short = await auditTargets(p, { selector: only('short') });
  check(short.failures.length === 3 && short.failures.every((f) => f.hitH >= 35 && f.hitH <= 37), 'a 36 tall button hits 36 whatever the host paints');
  const cover = await auditTargets(p, { selector: only('cover') });
  check(cover.failures.length === 1 && /^i/.test(cover.failures[0].takenBy), `an overlay taking the end of a control is named (${cover.failures[0] && cover.failures[0].takenBy})`);
  check(cover.failures[0].hitW === 32, `and the measured hit width is short of the box (${cover.failures[0].hitW} of 44; the overlay is 12 wide)`);
  const nope = await auditTargets(p, { selector: only('nope') });
  check(nope.failures.length === 1 && nope.failures[0].missed === nope.failures[0].total, 'pointer-events: none misses every point');
});

await s.run('controls inside an open shadow root are audited, good and bad', async (t) => {
  const p = await page(t);
  const all = await auditTargets(p, { selector: 'k-seg button', record: true });
  check(all.controls === 15, `the selector reaches into open shadow roots (${all.controls} segment buttons found, 6 of them in shadow DOM)`);
  check(all.failures.length === 3 && all.failures.every((f) => f.hitH >= 35 && f.hitH <= 37), 'the 36 tall buttons inside the shadow root fail, measured through the root');
  check(all.passed.filter((c) => c.hitH === 44).length === 12, 'and the shadow-root control built from the spec CSS passes with the nine light-DOM ones');
});

await s.run('options: kitchen 56, an exemption, round buttons, hidden controls', async (t) => {
  const p = await page(t);
  assertTargets(await auditTargets(p, { selector: only('kitchen56') }), 'k56');
  const k = await auditTargets(p, { selector: only('kitchen44') });
  check(k.failures.length === 1 && k.failures[0].min === 56 && k.failures[0].total === 784, 'data-k-target-min="56" raises the grid to 56 x 56: a 44 tall button fails it');
  const e = await auditTargets(p, { selector: only('exempt') });
  check(e.exempt === 1 && e.failures.length === 0 && e.sampled === 0, 'a control with data-k-target-exempt is counted, never sampled');
  const strict = await auditTargets(p, { selector: only('exempt'), exempt: null });
  check(strict.failures.length === 1, 'and with the exemption switched off, the inline link fails');
  const round = await auditTargets(p, { selector: '#round button' });
  check(round.failures.length === 1, 'a 44 round button loses its corners on the full grid');
  assertTargets(await auditTargets(p, { selector: '#round button', corners: true }), 'round');
  check(true, 'and passes with corners: true (points outside the rounded box are not asked of it)');
  const h = await auditTargets(p, { selector: '#hidden button' });
  check(h.controls === 1 && h.skipped === 1 && h.sampled === 0, 'a display: none control is skipped, not failed');
});

await s.run('the default selector finds every kind of control', async (t) => {
  const p = t.watch(await browser.newPage());
  t.defer(() => p.close());
  await p.setViewport({ width: 390, height: 844 });
  await p.setContent(`<!doctype html><meta charset="utf-8"><title>banc</title><style>body{margin:0}*{box-sizing:border-box}.c{display:block;width:100%;height:48px;border:0;margin:0}</style>
    <button class="c">b</button><a class="c" href="#x">a</a><input class="c" type="text"><input class="c" type="hidden"><select class="c"><option>x</option></select>
    <div class="c" role="switch" tabindex="0">s</div><div class="c" role="radio">r</div><div class="c" role="tab">t</div><div class="c" role="menuitem">m</div><span>texte</span>`);
  const r = await auditTargets(p, { record: true });
  check(r.controls === 8 && r.sampled === 8 && r.failures.length === 0, `button, link, text input, select, switch, radio, tab and menuitem: ${r.controls} controls, a hidden input and plain text ignored`);
});

await s.finish();
