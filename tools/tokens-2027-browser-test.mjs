#!/usr/bin/env node
/* Kiwi · tokens-2027-browser-test : la cascade des jetons 2027, dans un vrai Chromium.
 *   node tools/tokens-2027-browser-test.mjs
 *
 * token-contrast-test lit le fichier ; celui-ci le FAIT TOURNER. Les règles de
 * thème du §20.7 échouent en silence quand une spécificité est mal comptée :
 * la page rend 200, la console reste vide, et le kit peint le mauvais jeu.
 * On pose donc le vrai assets/kit/tokens-2027.css dans une page, on joue les
 * combinaisons que le spec nomme, et on lit les valeurs calculées.
 *
 *   · thème : html[data-theme], body[data-vexel-mode], préférence système, et
 *     leurs désaccords (le body gagne : le kit suit ce que la page peint) ;
 *   · color-scheme de l'élément, clair comme sombre ;
 *   · contraste accru (prefers-contrast: more) dans CHAQUE thème, body compris ;
 *   · arabe : interlignes du §6.2, approche nulle ;
 *   · grille par largeur (375, 402, 600, 1024, 1440) et cuisine ;
 *   · type : les six pas, à quatre racines (16, 20, 24, 28) et six facteurs
 *     Dynamic Type, passés au vrai type-steps-lint ;
 *   · cohabitation : avec assets/tokens.css chargé AVANT et APRÈS, aucun jeton
 *     hérité ne bouge d'un octet, et les --k-* résolvent.
 * Les @font-face sont retirées de la feuille de test : on mesure des jetons,
 * pas le réseau (les fichiers de police viennent d'une autre tranche).
 * Aucun code saisi, aucun marchand : une page locale sans réseau. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const typeSteps = require('./type-steps-lint.js');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const KIT = fs.readFileSync(path.join(root, 'assets/kit/tokens-2027.css'), 'utf8').replace(/@font-face\s*\{[^}]*\}/g, '');
const LEGACY = fs.readFileSync(path.join(root, 'assets/tokens.css'), 'utf8');

const LIGHT = { '--k-bg': '#F7F5F0', '--k-surface-1': '#FFFDFA', '--k-ink-1': '#0A0F0D', '--k-ink-3': '#666B65', '--k-line': '#E2DDD2', '--k-line-strong': '#8C877C', '--k-accent': '#0B6E4F', '--k-focus': '#0B6E4F' };
const DARK = { '--k-bg': '#0A0D0C', '--k-surface-1': '#141917', '--k-ink-1': '#F2F0EA', '--k-ink-3': '#848B85', '--k-line': '#29302D', '--k-line-strong': '#6B746F', '--k-accent': '#3CCB8F', '--k-focus': '#7DF2B0' };
const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const s = suite('tokens-2027', { browser });

/* Une page par cas : html/body portent les attributs, une sonde dans le body lit. */
async function probe(t, { htmlAttrs = '', bodyAttrs = '', scheme = 'light', contrast = 'no-preference', width = 800, css = KIT, extraCss = '', read }) {
  const page = t.watch(await browser.newPage());
  t.defer(() => page.close());
  await page.setViewport({ width, height: 700 });
  /* puppeteer-core n'expose pas prefers-contrast : on parle au protocole. */
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-contrast', value: contrast }] });
  await page.setContent(`<!doctype html><html ${htmlAttrs}><head><meta charset="utf-8"><style>${extraCss}${css}</style></head><body ${bodyAttrs}><div id="p"></div></body></html>`);
  return page.evaluate((names) => {
    const el = document.getElementById('p');
    const cs = getComputedStyle(el);
    const out = { vars: {}, colorScheme: cs.colorScheme, bodyColorScheme: getComputedStyle(document.body).colorScheme, rootColorScheme: getComputedStyle(document.documentElement).colorScheme, rootFont: getComputedStyle(document.documentElement).fontSize };
    for (const n of names) out.vars[n] = cs.getPropertyValue(n).trim();
    return out;
  }, read);
}
const check = (got, want, label) => { for (const [k, v] of Object.entries(want)) assert.equal(norm(got.vars[k]), norm(v), `${label} : ${k} vaut « ${got.vars[k]} », attendu « ${v} »`); };
const NAMES = Object.keys(LIGHT);

/* ── Thème (§20.7) ─────────────────────────────────────────────────────────── */
const THEME_CASES = [
  ['défaut : clair', {}, LIGHT, 'light'],
  ['html[data-theme=dark]', { htmlAttrs: 'data-theme="dark"' }, DARK, 'dark'],
  ['html[data-theme=light]', { htmlAttrs: 'data-theme="light"' }, LIGHT, 'light'],
  ['body[data-vexel-mode=dark], html muet', { bodyAttrs: 'data-vexel-mode="dark"' }, DARK, 'dark'],
  ['body[data-vexel-mode=light], html muet', { bodyAttrs: 'data-vexel-mode="light"' }, LIGHT, 'light'],
  ['html sombre, body clair : le body gagne', { htmlAttrs: 'data-theme="dark"', bodyAttrs: 'data-vexel-mode="light"' }, LIGHT, 'light'],
  ['html clair, body sombre : le body gagne', { htmlAttrs: 'data-theme="light"', bodyAttrs: 'data-vexel-mode="dark"' }, DARK, 'dark'],
  ['système sombre, rien ne choisit', { scheme: 'dark' }, DARK, 'dark'],
  ['système sombre, html[data-theme=light]', { scheme: 'dark', htmlAttrs: 'data-theme="light"' }, LIGHT, 'light'],
  ['système sombre, body[data-vexel-mode=light]', { scheme: 'dark', bodyAttrs: 'data-vexel-mode="light"' }, LIGHT, 'light'],
  ['système clair, html[data-theme=dark]', { scheme: 'light', htmlAttrs: 'data-theme="dark"' }, DARK, 'dark'],
];
for (const [name, opts, want, scheme] of THEME_CASES) {
  await s.run(`thème · ${name}`, async (t) => {
    t.step(name);
    const got = await probe(t, { ...opts, read: NAMES });
    check(got, want, name);
    /* color-scheme : sur l'élément qui porte le jeu (le body quand il le redéclare, sinon le html). */
    const carrier = opts.bodyAttrs ? got.bodyColorScheme : got.rootColorScheme;
    assert.equal(carrier, scheme, `${name} : color-scheme de l'élément qui porte le jeu = ${carrier}`);
    assert.equal(got.colorScheme, scheme, `${name} : color-scheme calculé sur un descendant = ${got.colorScheme}`);
  });
}

/* Élévation et liserés suivent le thème. */
await s.run('thème · élévation : ombre de niveau 1 absente en sombre, popover sur surface-3', async (t) => {
  const dark = await probe(t, { htmlAttrs: 'data-theme="dark"', read: ['--k-shadow-1', '--k-popover', '--k-surface-3', '--k-chrome-edge', '--k-line', '--k-toast-edge', '--k-line-strong'] });
  assert.equal(dark.vars['--k-shadow-1'], 'none');
  assert.equal(dark.vars['--k-popover'], dark.vars['--k-surface-3']);
  assert.equal(dark.vars['--k-chrome-edge'], dark.vars['--k-line']);
  assert.equal(dark.vars['--k-toast-edge'], dark.vars['--k-line-strong']);
  const light = await probe(t, { read: ['--k-shadow-1', '--k-popover', '--k-surface-1', '--k-chrome-edge'] });
  assert.match(light.vars['--k-shadow-1'], /^0 1px 2px rgba\(10, 15, 13, \.06\)/);
  assert.equal(norm(light.vars['--k-popover']), norm(light.vars['--k-surface-1']));
  assert.equal(light.vars['--k-chrome-edge'], 'transparent');
});

/* ── Contraste accru (§16), dans chaque thème, body compris ───────────────── */
const CONTRAST_CASES = [
  ['clair', {}, LIGHT],
  ['html sombre', { htmlAttrs: 'data-theme="dark"' }, DARK],
  ['body[data-vexel-mode=dark]', { bodyAttrs: 'data-vexel-mode="dark"' }, DARK],
  ['body[data-vexel-mode=light] sous un html sombre', { htmlAttrs: 'data-theme="dark"', bodyAttrs: 'data-vexel-mode="light"' }, LIGHT],
  ['système sombre', { scheme: 'dark' }, DARK],
];
for (const [name, opts, pal] of CONTRAST_CASES) {
  await s.run(`contraste accru · ${name}`, async (t) => {
    const more = await probe(t, { ...opts, contrast: 'more', read: [...NAMES, '--k-ink-2', '--k-chrome', '--k-surface-1', '--k-chrome-filter', '--k-select-edge-w', '--k-focus-w'] });
    assert.equal(norm(more.vars['--k-line']), norm(pal['--k-line-strong']), 'la hairline devient line-strong');
    assert.equal(norm(more.vars['--k-ink-3']), norm(more.vars['--k-ink-2']), 'ink-3 devient ink-2');
    assert.equal(norm(more.vars['--k-chrome']), norm(more.vars['--k-surface-1']), 'le chrome devient plein (surface-1)');
    assert.equal(more.vars['--k-chrome-filter'], 'none');
    assert.equal(more.vars['--k-select-edge-w'], '2px');
    assert.equal(more.vars['--k-focus-w'], '3px');
    /* Le reste de la palette ne bouge pas. */
    assert.equal(norm(more.vars['--k-bg']), norm(pal['--k-bg']));
    assert.equal(norm(more.vars['--k-ink-1']), norm(pal['--k-ink-1']));
    const normal = await probe(t, { ...opts, contrast: 'no-preference', read: ['--k-select-edge-w', '--k-focus-w', '--k-chrome-filter'] });
    assert.equal(normal.vars['--k-select-edge-w'], '1px');
    assert.equal(normal.vars['--k-focus-w'], '2px');
    assert.equal(normal.vars['--k-chrome-filter'], 'blur(24px) saturate(180%)');
  });
}

/* Contrôle négatif : sans les sélecteurs renforcés, le réglage ne fait rien en sombre, en silence. */
await s.run('contraste accru · contrôle négatif : un :root simple perd contre html[data-theme=dark]', async (t) => {
  const weak = KIT.replace(/(@media \(prefers-contrast: more\) \{\s*):root:root:root,\s*body\[data-vexel-mode\]\[data-vexel-mode\]/, '$1:root, body[data-vexel-mode]');
  assert.notEqual(weak, KIT, 'la mutation a eu lieu');
  const got = await probe(t, { htmlAttrs: 'data-theme="dark"', contrast: 'more', css: weak, read: ['--k-line', '--k-line-strong'] });
  assert.notEqual(norm(got.vars['--k-line']), norm(got.vars['--k-line-strong']), 'le fichier affaibli devrait perdre : le test ne verrait donc rien');
});

/* ── Arabe (§6.2, §20.2) ──────────────────────────────────────────────────── */
await s.run('arabe · interlignes du §6.2 et approche nulle', async (t) => {
  const ar = await probe(t, { htmlAttrs: 'lang="ar" dir="rtl"', read: ['--k-lh-display', '--k-lh-title', '--k-lh-heading', '--k-lh-body', '--k-lh-callout', '--k-lh-footnote', '--k-track-display', '--k-track-body', '--k-track-footnote', '--k-track-callout'] });
  assert.deepEqual([ar.vars['--k-lh-display'], ar.vars['--k-lh-title'], ar.vars['--k-lh-heading'], ar.vars['--k-lh-body'], ar.vars['--k-lh-callout'], ar.vars['--k-lh-footnote']], ['1.25', '1.35', '1.4', '1.6', '1.5', '1.5']);
  for (const k of ['--k-track-display', '--k-track-body', '--k-track-footnote', '--k-track-callout']) assert.equal(ar.vars[k], '0', k);
  const en = await probe(t, { htmlAttrs: 'lang="en"', read: ['--k-lh-body', '--k-track-body', '--k-track-display'] });
  assert.deepEqual([en.vars['--k-lh-body'], en.vars['--k-track-body'], en.vars['--k-track-display']], ['1.4', '0.01em', '-0.02em']);
  const fr = await probe(t, { htmlAttrs: 'lang="fr"', read: ['--k-lh-body'] });
  assert.equal(fr.vars['--k-lh-body'], '1.4', 'le français garde les interlignes latins');
});

/* ── Grille (§7.2) ────────────────────────────────────────────────────────── */
const GRID = [
  [375, '16px', '4', '12px', 'none'], [402, '20px', '4', '12px', 'none'], [599, '20px', '4', '12px', 'none'],
  [600, '24px', '8', '16px', 'none'], [1023, '24px', '8', '16px', 'none'], [1024, '24px', '12', '16px', 'none'],
  [1439, '24px', '12', '16px', 'none'], [1440, '32px', '12', '24px', '1200px'],
];
await s.run('grille · classes de largeur (§7.2)', async (t) => {
  for (const [w, margin, cols, gap, max] of GRID) {
    const g = await probe(t, { width: w, read: ['--k-grid-margin', '--k-grid-cols', '--k-grid-gap', '--k-grid-max'] });
    assert.deepEqual([g.vars['--k-grid-margin'], g.vars['--k-grid-cols'], g.vars['--k-grid-gap'], g.vars['--k-grid-max']], [margin, cols, gap, max], `largeur ${w}`);
  }
});
await s.run('cuisine · racine 24 px par défaut, réglable 20 / 28, marges 24 / 16 à toute largeur', async (t) => {
  const d = await probe(t, { htmlAttrs: 'data-k-surface="kds"', width: 1920, read: ['--k-grid-margin', '--k-grid-gap', '--k-grid-max'] });
  assert.equal(d.rootFont, '24px');
  assert.deepEqual([d.vars['--k-grid-margin'], d.vars['--k-grid-gap'], d.vars['--k-grid-max']], ['24px', '16px', 'none']);
  for (const px of [20, 28]) {
    const r = await probe(t, { htmlAttrs: `data-k-surface="kds" style="--k-kds-root:${px}px"`, width: 1920, read: [] });
    assert.equal(r.rootFont, `${px}px`);
  }
  const other = await probe(t, { width: 1920, read: [] });
  assert.equal(other.rootFont, '16px', 'le kit ne pose aucune racine hors de la cuisine');
});

/* ── Type : six pas, quatre racines, six facteurs, passés au vrai lint ────── */
await s.run('type · six pas à quatre racines et six facteurs : le quotient est un pas', async (t) => {
  const page = t.watch(await browser.newPage());
  t.defer(() => page.close());
  await page.setContent(`<!doctype html><html><head><style>${KIT}</style></head><body><div id="p"></div></body></html>`);
  const frames = [];
  for (const rootPx of [16, 20, 24, 28]) {
    for (const factor of [0.85, 0.9, 1, 1.12, 1.24, 1.35]) {
      const sizes = await page.evaluate((rootPx, factor) => {
        document.documentElement.style.fontSize = rootPx + 'px';
        document.documentElement.style.setProperty('--type-scale', String(factor));
        const el = document.getElementById('p');
        return ['display', 'title', 'heading', 'body', 'callout', 'footnote'].map((n) => {
          el.style.fontSize = `var(--k-fs-${n})`;
          return parseFloat(getComputedStyle(el).fontSize);
        });
      }, rootPx, factor);
      assert.equal(new Set(sizes).size, 6, 'six tailles distinctes');
      frames.push({ frame: `racine ${rootPx} · facteur ${factor}`, root: rootPx, factor, sizes });
    }
  }
  const failures = typeSteps.lintComputed(frames);
  assert.deepEqual(failures, [], failures.slice(0, 3).join(' | '));
  /* À la racine 16 et au facteur 1, ce sont exactement 44, 28, 20, 17, 15, 13 px. */
  const base = frames.find((f) => f.root === 16 && f.factor === 1);
  assert.deepEqual(base.sizes, [44, 28, 20, 17, 15, 13]);
  /* Contrôle : une taille hors pas dans la même image est vue. */
  assert.ok(typeSteps.lintComputed([{ ...base, sizes: [...base.sizes, 12] }]).length === 1, 'un Caption de 12 px est refusé');
});

/* ── Cohabitation avec assets/tokens.css ──────────────────────────────────── */
await s.run('cohabitation · assets/tokens.css chargé avant ou après : aucun jeton ne bouge', async (t) => {
  const NAMES_LEGACY = ['--atlas', '--paper', '--ink', '--sans'];
  const alone = await probe(t, { css: LEGACY, read: NAMES_LEGACY });
  for (const order of ['legacy-puis-kit', 'kit-puis-legacy']) {
    const css = order === 'legacy-puis-kit' ? LEGACY + '\n' + KIT : KIT + '\n' + LEGACY;
    const both = await probe(t, { css, read: [...NAMES_LEGACY, ...NAMES] });
    for (const n of NAMES_LEGACY) assert.equal(both.vars[n], alone.vars[n], `${order} : ${n} a bougé`);
    check(both, LIGHT, order);
  }
  /* Le thème sombre du legacy (html[data-theme=dark]) et celui du kit voyagent ensemble. */
  const dark = await probe(t, { htmlAttrs: 'data-theme="dark"', css: LEGACY + '\n' + KIT, read: [...NAMES] });
  check(dark, DARK, 'legacy + kit sous data-theme=dark');
});

await s.finish();
