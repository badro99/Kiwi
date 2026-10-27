#!/usr/bin/env node
// Design 2027 parity, dashboard: the 2027 skin draws the figures the shipped
// dashboard already computed (KiwiDateRange.home()), it must never compute its
// own (owner, 2026-10-27: "just a skin"). Each page is opened on the demo with
// the skin off and on; every amount (MAD) and percentage 2027 shows must also
// be shown by the shipped page. 2027 may show fewer figures, never other ones.
//
//   node tools/parity-2027-dash.mjs                 every page, desktop and phone
//   node tools/parity-2027-dash.mjs --vp desktop --only transactions
//
// Writes .kiwi/parity-2027/dash-<run>/report.json.
import fs from 'node:fs';
import path from 'node:path';
import { harness, demoPage, sleep, root } from './surface-matrix-lib.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ONLY = arg('--only');
const VPS = (arg('--vp') || 'desktop,phone').split(',');

async function openDash(h, vp, on) {
  const { ctx, page } = await demoPage(h, 'fr', vp, { 'kiwiSkin2027:dashboard': on ? '1' : '0' });
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-nav="transactions"]', { timeout: 30000 });
  await sleep(1500);
  return { ctx, page };
}

/* Every visible amount and percentage, shadow DOM included, as numbers. */
const figures = (page) => page.evaluate(() => {
  const out = [];
  const vis = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement || (e.parentNode && e.parentNode.host)) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  (function walk(n) {
    for (const el of n.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      for (const t of el.childNodes) if (t.nodeType === 3 && t.textContent.trim()) out.push([el, t.textContent]);
    }
  })(document);
  const text = out.filter(([el]) => vis(el)).map(([, t]) => t).join(' ').replace(/[⁦-⁩]/g, '');
  const nums = new Set();
  for (const m of text.matchAll(/(-?\d[\d\s  ]*(?:[.,]\d+)?)\s*(MAD|DH|درهم|%)/g)) {
    const v = Number(m[1].replace(/[\s  ]/g, '').replace(',', '.'));
    if (Number.isFinite(v)) nums.add((m[2] === '%' ? '%' : '') + Math.round(v * 100) / 100);
  }
  return [...nums];
});

const navs = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('[data-nav]')].map((b) => b.dataset.nav))]);
const go = (page, nav) => page.evaluate((n) => { const b = document.querySelector('[data-nav="' + n + '"]'); if (b) b.click(); return !!b; }, nav);

const RUN = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(root, '.kiwi/parity-2027', 'dash-' + RUN);
fs.mkdirSync(OUT, { recursive: true });
const h = await harness('parity-2027-dash');
const results = [];
try {
  for (const vp of VPS) {
    const off = await openDash(h, vp, false), on = await openDash(h, vp, true);
    const pages = ['home', ...(await navs(off.page)).filter((n) => n !== 'home' && n !== 'dashboard')].filter((n) => !ONLY || n.includes(ONLY));
    for (const nav of pages) {
      if (nav !== 'home') { await go(off.page, nav); await go(on.page, nav); await sleep(1500); }
      const [a, b] = await Promise.all([figures(off.page), figures(on.page)]);
      const extra = b.filter((x) => !a.includes(x));
      results.push({ vp, nav, ok: !extra.length, extra, shipped: a.length, k2027: b.length });
      console.log(`${extra.length ? '✗' : '✓'} ${vp} · ${nav} (${b.length} figures on 2027, ${a.length} shipped)`);
      if (extra.length) console.log('    only on 2027: ' + extra.slice(0, 12).join(' · '));
      if (nav !== 'home') { await go(off.page, 'home'); await go(on.page, 'home'); await sleep(600); }
    }
    await off.ctx.close(); await on.ctx.close();
  }
} finally { await h.close(); }
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
const bad = results.filter((r) => !r.ok).length;
console.log(`parity-2027-dash: ${results.length - bad}/${results.length} pages agree → ${path.relative(root, OUT)}`);
process.exit(bad ? 1 : 0);
