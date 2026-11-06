/* Équipe · les libellés de section des fiches se lisent sur un téléphone et en arabe.
 *
 * r20 : « SECTION » en 11 px, capitales et 0,14 em d'espacement (illisible sur
 * un petit écran, et l'espacement coupe les lettres liées de l'arabe). Le vrai
 * MODAL_CSS de assets/team.js est injecté APRÈS assets/planning-ui.css, comme à
 * l'exécution, et Chromium mesure ce qui se peint. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }
const read = (f) => fs.readFileSync(f, 'utf8');
const team = read('assets/team.js');
const a = team.indexOf('const MODAL_CSS = `') + 'const MODAL_CSS = `'.length;
const modalCss = team.slice(a, team.indexOf('`;', a));
const planning = read('assets/planning-ui.css');
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('team-form-type', { browser });
for (const [lang, width] of [['fr', 390], ['ar', 390], ['fr', 1280]]) await S.run(`form type ${lang} ${width}`, async (t) => {
  const context = await browser.createBrowserContext(); t.defer(() => context.close());
  const page = t.watch(await context.newPage());
  await page.setViewport({ width, height: 800 });
  await page.setContent(`<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><style>:root{--mono:monospace;--n-500:#666;--n-600:#555}${planning}</style><style>${modalCss}</style></head><body>
    <div data-kt-form><div class="kt-fseclabel">Identité</div><label><span class="l">Nom</span></label></div>
    <div class="kt-pf-sec"><div class="kt-pf-title">Accès</div><div class="kt-pf-row"><span class="kt-pf-l">Poste</span><span class="kt-pf-v">Caissier</span></div></div></body></html>`);
  const m = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    const row = document.querySelector('.kt-pf-row');
    return { sec: parseFloat(cs('.kt-fseclabel').fontSize), secSpacing: cs('.kt-fseclabel').letterSpacing, secTransform: cs('.kt-fseclabel').textTransform, title: parseFloat(cs('.kt-pf-title').fontSize), l: parseFloat(cs('label .l').fontSize), pfl: parseFloat(cs('.kt-pf-l').fontSize), pfv: parseFloat(cs('.kt-pf-v').fontSize), cols: getComputedStyle(row).gridTemplateColumns.split(' ').length };
  });
  assert.ok(m.sec >= 12.5 && m.title >= 12.5 && m.l >= 12.5, `labels are at least 12.5px (got ${m.sec}/${m.title}/${m.l})`);
  assert.ok(m.pfl >= 13 && m.pfv >= 14, 'secondary rows are 13/14px');
  if (lang === 'ar') { assert.equal(m.secSpacing, 'normal', 'Arabic labels carry no letter spacing'); assert.equal(m.secTransform, 'none'); }
  else assert.ok(parseFloat(m.secSpacing) <= 12.5 * 0.08, 'Latin labels are tracked lightly, not 0.14em');
  assert.equal(m.cols, width <= 600 ? 1 : 2, 'profile rows stack on a phone and stay two columns on desktop');
});
await browser.close();
await S.finish();
