#!/usr/bin/env node
/* Kiwi · kit-in-host-browser-test · a kit element looks the same in any page
 * (spec §20.2, §20.7), in both themes.
 *
 * A host page as hostile as the shipped ones get: the legacy assets/tokens.css,
 * then global rules on body, button, li, h2, p and * that set colour, font,
 * italics, letter and word spacing, line height, text transform, alignment,
 * borders, margins and box sizing. The kit is loaded after it, as a shell
 * would load it. For each of a button, a list, a segmented control, the bill
 * and the PIN pad, what paints inside the root must come from the --k-*
 * tokens and nothing the host set may reach it. Then the theme: light, dark
 * by html[data-theme], dark by body[data-vexel-mode] (the dashboard's skin),
 * and dark by the system preference with no attribute; the surfaces must take
 * the token value of that theme.
 *
 *   node tools/kit-in-host-browser-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitBrowser, settle, ROOT } from './kit-browser.mjs';
import { suite } from './browser-trace.mjs';

console.log('kit-in-host-browser-test');
const kitHtml = fs.readFileSync(path.join(ROOT, 'kit.html'), 'utf8');
const scripts = [...kitHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((s) => !/gallery\.js/.test(s));
const host = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="kiwi-sprite" content="${/name="kiwi-sprite" content="([^"]+)"/.exec(kitHtml)[1]}">
<link rel="stylesheet" href="assets/tokens.css">
<style>
  body { color: rgb(255, 0, 0); font-family: "Comic Sans MS", cursive; font-style: italic; letter-spacing: 5px; word-spacing: 9px;
         line-height: 3; text-transform: uppercase; text-align: right; text-indent: 40px; white-space: pre; font-weight: 900; }
  * { box-sizing: content-box; }
  button { background: rgb(255, 0, 255); border: 4px solid rgb(0, 0, 255); border-radius: 0; padding: 30px; font-size: 30px; text-transform: lowercase; margin: 7px; }
  li { list-style: square; margin: 13px; } h2, p { margin: 41px; font-size: 40px; } svg { width: 90px; height: 90px; }
</style>
<link rel="stylesheet" href="${/href="(assets\/kit\/tokens-2027\.css[^"]*)"/.exec(kitHtml)[1]}">
<link rel="stylesheet" href="${/href="(assets\/kit\/kit\.css[^"]*)"/.exec(kitHtml)[1]}">
</head><body>
<k-button id="b" variant="primary" label="Charge 230.00 MAD"></k-button>
<k-list id="l" label="Rows"></k-list>
<k-segmented id="s" label="Range"></k-segmented>
<div style="height:520px"><k-bill id="bill"></k-bill></div>
<k-pin-pad id="pin" heading="Dashboard locked"></k-pin-pad>
${scripts.map((s) => `<script src="${s}"></script>`).join('\n')}
<script>
  document.getElementById('l').rows = [{ id: 'a', icon: 'payments', title: 'Table 4', subtitle: '17:28', value: '230.00 MAD', trailing: 'chevron' }];
  document.getElementById('s').options = [{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }];
  document.getElementById('s').setAttribute('value', 'today');
  document.getElementById('bill').bill = { title: 'Table 4', lines: [{ id: 'x', qty: 1, name: 'Harira', price: 30 }], total: 30 };
  document.body.setAttribute('data-ready', '');
</script></body></html>`;

const kb = await kitBrowser('kit-in-host', { '/__kit-host.html': host });
const s = suite('kit-in-host', { browser: kb.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* What paints inside a root, read from computed styles. */
const probe = (page) => page.evaluate(() => {
  const cs = (el) => el && getComputedStyle(el);
  const token = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();   /* body: data-vexel-mode sits there */
  const px = (v) => { const d = document.createElement('div'); d.style.width = v; document.body.appendChild(d); const w = getComputedStyle(d).width; d.remove(); return w; };
  const rgb = (v) => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const btn = document.getElementById('b').shadowRoot.querySelector('.k-btn');
  const row = document.getElementById('l').shadowRoot.querySelector('li');
  const seg = document.getElementById('s').shadowRoot.querySelector('[role="radio"]');
  const bill = document.getElementById('bill').shadowRoot.querySelector('.bill');
  const ttl = document.getElementById('bill').shadowRoot.querySelector('.ti');
  const key = document.getElementById('pin').shadowRoot.querySelector('[data-key="5"]');
  const ic = document.getElementById('l').shadowRoot.querySelector('svg');
  const all = [btn, row, seg, ttl, key];
  return {
    fonts: all.map((e) => cs(e).fontFamily),
    styles: all.map((e) => cs(e).fontStyle),
    spacing: all.map((e) => cs(e).letterSpacing + '|' + cs(e).wordSpacing),
    transform: all.map((e) => cs(e).textTransform),
    indent: all.map((e) => cs(e).textIndent),
    white: all.map((e) => cs(e).whiteSpace),
    boxes: all.map((e) => cs(e).boxSizing),
    btn: { bg: cs(btn).backgroundColor, border: cs(btn).borderTopWidth, size: cs(btn).fontSize, margin: cs(btn).marginTop, accent: rgb(token('--k-accent')) },
    title: { size: cs(ttl).fontSize, margin: cs(ttl).marginTop, want: px(token('--k-fs-title')) },
    rowMargin: cs(row).marginTop, rowList: cs(row).listStyleType,
    icon: ic ? ic.getBoundingClientRect().width : -1,
    ink: cs(row).color, ink1: rgb(token('--k-ink-1')),
    surface: cs(bill).backgroundColor, s1: rgb(token('--k-surface-1')),
  };
});

for (const [label, setup] of [
  ['light', {}],
  ['dark by html[data-theme]', { theme: 'dark' }],
  ['dark by body[data-vexel-mode]', { vexel: 'dark' }],
  ['dark by the system, no attribute', { scheme: 'dark' }],
]) {
  await s.run(label, async (t) => {
    const page = t.watch(await kb.open('/__kit-host.html', { theme: setup.theme, scheme: setup.scheme }));
    // settle's default wait: the button's background-color transition (--k-dur-2, 160 ms) outlasts 100 ms.
    if (setup.vexel) { await page.evaluate((v) => document.body.setAttribute('data-vexel-mode', v), setup.vexel); await settle(page); }
    const p = await probe(page);
    check(p.fonts.every((f) => /Inter Tight/.test(f) && !/Comic/.test(f)), `${label}: every root sets in Inter Tight, never the host's face`);
    check(p.styles.every((v) => v === 'normal'), `${label}: roman, the host's italics stop at the host`);
    check(p.spacing.every((v) => { const [ls, ws] = v.split('|'); return ls !== '5px' && ws === '0px'; }), `${label}: no host letter or word spacing inside (${[...new Set(p.spacing)].join(', ')})`);
    check(p.transform.every((v) => v === 'none') && p.indent.every((v) => v === '0px') && p.white.every((v) => v !== 'pre'), `${label}: no host text transform, indent or white-space inside`);
    check(p.boxes.every((v) => v === 'border-box'), `${label}: border-box inside every root`);
    check(p.btn.bg === p.btn.accent && p.btn.border === '0px' && p.btn.margin === '0px' && p.btn.size !== '30px', `${label}: the primary button paints accent, with no host border, margin or size`);
    check(p.title.size === p.title.want && p.title.margin === '0px', `${label}: the bill title is the Title step (${p.title.size}), with no host margin`);
    check(p.rowMargin === '0px' && p.rowList === 'none', `${label}: list rows carry no host margin or bullet`);
    check(p.icon > 0 && p.icon <= 24, `${label}: icons keep their own size (${p.icon}), not the host's svg rule`);
    check(p.ink === p.ink1, `${label}: text inside is --k-ink-1 (${p.ink}), not the host's red`);
    check(p.surface === p.s1, `${label}: the bill surface is this theme's --k-surface-1 (${p.surface})`);
    check(page.__errors.length === 0, `${label}: no page errors`);
  });
}

await s.run('the two themes differ', async (t) => {
  const light = await probe(t.watch(await kb.open('/__kit-host.html')));
  const dark = await probe(t.watch(await kb.open('/__kit-host.html', { theme: 'dark' })));
  check(light.surface !== dark.surface && light.ink !== dark.ink, `light ${light.surface} / ${light.ink} and dark ${dark.surface} / ${dark.ink} are different paints`);
});

await kb.close();
console.log(`✓ kit-in-host-browser-test · ${checks} contrôles`);
await s.finish();
