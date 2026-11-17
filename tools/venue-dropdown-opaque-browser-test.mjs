#!/usr/bin/env node
/* The sidebar venue picker is a solid sheet, never glass.
 *
 * Owner report, 17 Nov 2026 (Kiwi Pro iOS, build 45, dark mode): the venue
 * rows sat on a see-through menu and the sidebar links (Home, Sales, Daily
 * report…) read straight through them. design-2026.css lists .venue-dropdown
 * among its glass cards with an !important translucent fill; the Vexel sidebar
 * rule has to win in every theme and every glass level.
 *
 * Real demo dashboard, phone size, real clicks (hamburger, then the venue
 * switch). For each skin × theme × glass level, the open menu must paint a
 * fully opaque background, no backdrop blur, and venue names readable on it. */
import assert from 'node:assert/strict';
import { LOCALES } from './test-locales.mjs';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('venue-dropdown-opaque');

async function enterDemo(page) {
  await page.waitForFunction(() => window.KiwiVenue && document.querySelector('[data-venue-dropdown]'));
  await page.evaluate(() => {
    const go = [...document.querySelectorAll('button,a,[role="button"]')]
      .find(e => e.offsetParent && /Entrer dans la d|Explorer la d|Enter the demo|Explore the d|استكشف|الدخول إلى/.test(e.textContent));
    go?.click();
  });
  await page.keyboard.press('Escape');
}

async function openVenueMenu(page) {
  const burger = await page.$('.kw-hamburger');
  if (burger && await burger.isVisible()) {
    await burger.click();
    await page.waitForFunction(() => document.body.classList.contains('kw-menu-open'));
    await sleep(350);
  }
  await page.click('[data-action="venue-toggle"]');
  await page.waitForSelector('[data-venue-dropdown].open');
  await sleep(250);
}

/* Paint a computed colour onto a cleared 1×1 canvas: works for rgb(),
   color(srgb …), oklab() and color-mix() results alike. */
const measureMenu = (page) => page.evaluate(() => {
  const paint = (css) => {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const x = c.getContext('2d'); x.clearRect(0, 0, 1, 1); x.fillStyle = css; x.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data; return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const d = document.querySelector('[data-venue-dropdown]');
  const cs = getComputedStyle(d);
  const bg = paint(cs.backgroundColor);
  const name = d.querySelector('.venue-row-name') || d.querySelector('.venue-row');
  const fg = paint(getComputedStyle(name).color);
  const [hi, lo] = [lum(fg), lum(bg)].sort((p, q) => q - p);
  return {
    body: document.body.className,
    inSidebar: !!d.closest('.sidebar'),
    bgCss: cs.backgroundColor,
    alpha: bg.a,
    opacity: cs.opacity,
    backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
    contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
  };
});

try {
  const lang = LOCALES[0];
  for (const skin2027 of ['0', '1']) await h.S.run(`${lang} · téléphone · skin 2027 ${skin2027 === '1' ? 'actif' : 'inactif'}`, async t => {
    const { page, ctx } = await demoPage(h, lang, 'phone', { 'kiwiSkin2027:dashboard': skin2027 });
    t.defer(() => ctx.close()); t.watch(page);
    for (const theme of ['dark', 'light']) for (const glass of ['clear', 'standard', 'opaque']) {
      t.step(`Thème ${theme}, verre ${glass} : ouvrir le menu des établissements`);
      await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
      await page.evaluate((th, gl) => { localStorage.setItem('kiwiDashTheme', th); localStorage.setItem('kiwiGlassLevel', gl); }, theme, glass);
      await page.reload({ waitUntil: 'load', timeout: 60000 });
      await enterDemo(page);
      await openVenueMenu(page);
      const m = await measureMenu(page);
      const where = `${theme}/${glass}/2027=${skin2027} (${m.bgCss}; ${m.body})`;
      assert.ok(m.inSidebar, 'le menu vit dans la barre latérale ' + where);
      assert.equal(m.opacity, '1', 'menu ouvert entièrement visible ' + where);
      assert.equal(m.alpha, 255, 'fond du menu opaque, la navigation ne transparaît pas ' + where);
      assert.equal(m.backdrop, 'none', 'pas de flou de verre sous le menu ' + where);
      assert.ok(m.contrast >= 4.5, `noms d'établissements lisibles (contraste ${m.contrast}) ` + where);
    }
  });
} finally { await h.close(); await h.S.finish(); }
