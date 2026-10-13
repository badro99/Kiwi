#!/usr/bin/env node
/* Kiwi · font-face-census-test — chaque page qui écrit en IBM Plex Sans Arabic la
 * déclare, et chaque caractère, à chaque graisse, vient d'UNE seule URL.
 *
 * docs/specs/kiwi-design-2027.md §6.1 (revisions 9 à 17) et §6.5. Il rejoue
 * tools/plex-census.mjs sur l'arbre de travail : les pages sont DÉCOUVERTES, jamais
 * listées. Puis, dans Chromium (puppeteer-core, tools/browser-trace.mjs), pour
 * chaque page recensée :
 *
 *   statique   · aucune page qu'on ne sait pas classer ; chaque page de classe (1),
 *                (2) ou (4) porte assets/fonts/legacy-faces.css ; le lien est AVANT
 *                le lien Google sur une page de classe 1, AVANT article.css sur les
 *                pages des guides, APRÈS la feuille Next sur les 11 pages de la
 *                landing, n'importe où sur les 4 sans Plex ; chaque graisse demandée
 *                est déclarée, encore servie par Google ou dans la table de
 *                remplacement (200 et 300 → 400, 700 → 600) ; aucun nom de famille
 *                Plex autre que les deux permis ;
 *   navigateur · la page est reconstruite sans son contenu ni ses scripts : ses
 *                feuilles et ses liens Google, dans l'ordre, dans un document de
 *                sonde. Chaque caractère est alors rendu seul, à chaque graisse que
 *                la page utilise, par un chargement de face que le navigateur fait
 *                lui-même (document.fonts.load), et les requêtes de fonte qu'il
 *                provoque sont lues sur le réseau : observées, pas déduites des
 *                déclarations. Il échoue quand
 *                  · une famille qui écrit du texte sur la page n'a ni @font-face ni
 *                    lien Google (le cas que la révision 9 a manqué) ;
 *                  · un caractère, à une graisse d'une famille, est demandé à DEUX
 *                    URL (le recouvrement voulu, où la règle la plus tardive
 *                    gagne, ne provoque qu'une requête et passe ; il est nommé en
 *                    §6.1 pour que personne ne le retire comme une erreur) ;
 *                  · sur une page de la landing, l'arabe à 400, 500 et 600 ne vient
 *                    pas de assets/fonts/, ou celui à 200 et 300 ne vient plus de
 *                    fonts.gstatic.com tant que l'@import reste ;
 *                  · sur une page sans Plex, l'arabe ne vient pas de assets/fonts/ ;
 *                  · sur une page de classe 1 ou des guides, le fichier local est
 *                    demandé alors que Google déclare la graisse (la règle de Google,
 *                    plus tardive, doit gagner et le fichier local ne doit pas partir).
 *   coquille   · la coquille native (le bundle construit) tire Inter Tight et Plex
 *                depuis assets/fonts/, jamais depuis native-fonts/ ni Google.
 *
 * Google Fonts n'est pas joint : le test répond lui-même aux deux hôtes avec des
 * feuilles construites comme les siennes (un @font-face par sous-ensemble et par
 * graisse, sur fonts.gstatic.com), pour que ce soit hermétique et reproductible.
 * Tout le reste hors origine est refusé.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { build } from './build-app-www.mjs';
import { census, needsLegacy, weightProblems, stylesheetTags, MAPPED_WEIGHTS, DECLARED_WEIGHTS, LEGACY } from './plex-census.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('font-face-census-test');
/* Avant la première page, un échec s'imprime et sort ; dans une page (suite.run), il
   lève, pour que browser-trace écrive la trace de CETTE page. */
let inSuite = false;
const check = (cond, msg) => {
  if (!cond) { if (inSuite) throw new Error(msg); console.log('  ✗ ' + msg); process.exit(1); }
  console.log('  ✓ ' + msg);
};
const PLEX = 'IBM Plex Sans Arabic';
const ALLOWED_PLEX_NAMES = new Set([PLEX, 'Kiwi Arabic']);

/* ═══ statique ═══════════════════════════════════════════════════════════ */
const c = census();
console.log(`  ○ ${c.pages.length} pages *.html suivies · ${c.named.length} nomment la famille : classe 1 ${c.totals[1]}, 2 ${c.totals[2]}, 3 ${c.totals[3]}, 4 ${c.totals[4]}`);
check(!c.unclassifiable.length, `aucune page que le recensement ne sait pas classer${c.unclassifiable.length ? ' : ' + c.unclassifiable.map((p) => p.page).join(', ') : ''}`);
const needing = c.named.filter(needsLegacy);
check(needing.length > 0, `${needing.length} pages (classes 1, 2, 4) doivent porter ${LEGACY}`);
const noLegacy = needing.filter((p) => !p.legacy);
check(!noLegacy.length, `chaque page de classe 1, 2 ou 4 lie ${LEGACY}${noLegacy.length ? ' ; manque sur ' + noLegacy.map((p) => p.page).join(', ') : ''}`);
const badOrder = needing.filter((p) => p.legacy && p.order !== 'ok');
check(!badOrder.length, `le lien est à sa place : avant le lien Google, avant article.css, après la feuille Next, n'importe où ailleurs${badOrder.length ? ' ; faux sur ' + badOrder.map((p) => `${p.page} (${p.order})`).join(', ') : ''}`);
const chunkPages = needing.filter((p) => p.cls === 2 && !/article\.css$/.test(p.link || ''));
const articlePages = needing.filter((p) => p.cls === 2 && /article\.css$/.test(p.link || ''));
check(chunkPages.length > 0 && chunkPages.every((p) => /^_next\/static\/chunks\/.+\.css$/.test(p.via)), `les pages de la feuille Next (${chunkPages.length}) gardent leur @import et reçoivent le lien APRÈS elle`);
check(articlePages.length > 0, `${articlePages.length} pages passent par article.css`);
const badWeights = c.named.map((p) => ({ p, w: weightProblems(p) })).filter((x) => x.w.length);
check(!badWeights.length, `chaque graisse demandée est déclarée (${DECLARED_WEIGHTS.join(', ')}), encore servie par Google, ou remplacée (${Object.entries(MAPPED_WEIGHTS).map(([a, b]) => `${a}→${b}`).join(', ')})${badWeights.length ? ' ; sinon : ' + badWeights.map((x) => `${x.p.page} ${x.w}`).join(', ') : ''}`);
{
  /* aucun nom de famille Plex autre que les deux permis, dans le balisage et les feuilles que les pages chargent */
  const files = new Set(c.named.map((p) => p.page));
  const bad = [];
  const scan = (file, css) => { for (const m of css.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*(["']?)([^;"']+)\1/gi)) if (/plex/i.test(m[2]) && !ALLOWED_PLEX_NAMES.has(m[2].trim())) bad.push(`${file} : « ${m[2].trim()} »`); };
  for (const f of [...files, 'assets/fonts/legacy-faces.css', 'app/src/native-runtime.css', 'app/src/native-shell.css']) if (fs.existsSync(path.join(ROOT, f))) scan(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
  for (const f of fs.existsSync(path.join(ROOT, 'assets/kit')) ? fs.readdirSync(path.join(ROOT, 'assets/kit')).filter((x) => x.endsWith('.css')) : []) scan(`assets/kit/${f}`, fs.readFileSync(path.join(ROOT, 'assets/kit', f), 'utf8'));
  check(!bad.length, `aucun @font-face Plex sous un autre nom que « ${PLEX} » ou « Kiwi Arabic »${bad.length ? ' : ' + bad.join(' ; ') : ''}`);
}

/* ═══ navigateur ═════════════════════════════════════════════════════════ */
let puppeteer;
try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core indisponible, assertions navigateur non exécutées'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
if (!bin) { console.log('○ skip: Chromium indisponible, assertions navigateur non exécutées'); process.exit(process.env.CI ? 1 : 0); }

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-fontcensus-'));
const built = build({ out: path.join(work, 'www'), quiet: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

/* Les sous-ensembles que Google sert, et les vrais fichiers qui font les octets de chaque. */
const GOOGLE = {
  [PLEX]: [
    { subset: 'arabic', range: 'U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC', bytes: (w) => `assets/fonts/plex-arabic-${w <= 400 ? 400 : w >= 600 ? 600 : 500}.woff2` },
    { subset: 'latin-ext', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF', bytes: () => 'assets/fonts/inter-tight-latin-ext.woff2' },
    { subset: 'latin', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD', bytes: () => 'assets/fonts/inter-tight-latin.woff2' },
  ],
  'Inter Tight': [
    { subset: 'latin-ext', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF', bytes: () => 'assets/fonts/inter-tight-latin-ext.woff2' },
    { subset: 'latin', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD', bytes: () => 'assets/fonts/inter-tight-latin.woff2' },
  ],
  'JetBrains Mono': [
    { subset: 'latin', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD', bytes: () => 'assets/fonts/inter-tight-latin.woff2' },
  ],
};
const slug = (f) => f.toLowerCase().replace(/[^a-z]/g, '');
/* css2?family=IBM+Plex+Sans+Arabic:wght@300;400&family=Inter+Tight:wght@400 → un @font-face par sous-ensemble et par graisse. */
function googleCss(u) {
  const out = [];
  for (const m of u.search.slice(1).split('&')) {
    if (!m.startsWith('family=')) continue;
    const fam = decodeURIComponent(m.slice(7).replace(/\+/g, ' '));
    const name = fam.split(':')[0];
    if (!GOOGLE[name]) continue;
    const spec = fam.split(':')[1] || '';
    const tuple = spec.replace(/^[^@]*@/, '');
    const weights = spec.includes('@') ? tuple.split(';').map((t) => Number(t.split(',').pop().split('..')[0])) : [400];
    for (const w of weights) for (const sub of GOOGLE[name]) {
      out.push(`@font-face{font-family:'${name}';font-style:normal;font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/s/${slug(name)}/v1/${sub.subset}-${w}.woff2) format('woff2');unicode-range:${sub.range};}`);
    }
  }
  return out.join('\n');
}
const googleBytes = (u) => {
  const m = u.pathname.match(/^\/s\/([a-z]+)\/v1\/([a-z-]+)-(\d+)\.woff2$/);
  if (!m) return null;
  const name = Object.keys(GOOGLE).find((n) => slug(n) === m[1]);
  const sub = name && GOOGLE[name].find((s) => s.subset === m[2]);
  return sub ? fs.readFileSync(path.join(ROOT, sub.bytes(Number(m[3])))) : null;
};

function serve(rootDir, probeFor) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (probeFor && u.pathname === '/__probe__') {
      const page = u.searchParams.get('p');
      const dir = path.posix.dirname(page);
      const tags = stylesheetTags(page).join('\n');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html><head><meta charset="utf-8"><base href="/${dir === '.' ? '' : dir + '/'}">\n${tags}\n</head><body></body></html>`);
      return;
    }
    let file = path.resolve(rootDir, '.' + decodeURIComponent(u.pathname));
    if (!file.startsWith(path.resolve(rootDir))) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  });
}
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${srv.address().port}`)));

/* Ce qu'une page peut demander à Google : on répond, on ne sort jamais. */
async function wire(page, origin, log) {
  await page.setRequestInterception(true);
  await page.setCacheEnabled(false);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return req.continue();
    const u = new URL(url);
    if (u.hostname === 'fonts.googleapis.com') return req.respond({ status: 200, contentType: 'text/css', body: googleCss(u), headers: { 'access-control-allow-origin': '*' } });
    if (u.hostname === 'fonts.gstatic.com') {
      const body = googleBytes(u);
      return body ? req.respond({ status: 200, contentType: 'font/woff2', body, headers: { 'access-control-allow-origin': '*' } }) : req.respond({ status: 404, body: '' });
    }
    log.refused.push(url);
    return req.abort();
  });
  page.on('request', (req) => { if (req.resourceType() === 'font' || /\.woff2?(\?|$)/.test(req.url())) log.fonts.push(req.url().replace(origin, '')); });
}

const where = (u) => (u.startsWith('https://fonts.gstatic.com/') ? 'gstatic' : u.startsWith('/assets/fonts/') ? 'assets/fonts' : u.startsWith('/native-fonts/') ? 'native-fonts' : 'autre');
const settle = (page) => page.evaluate(() => document.fonts.ready);

/* Rend UN caractère d'une famille à une graisse, pour de vrai (un nœud de texte dans la
   page, pas document.fonts.load, qui charge TOUTES les faces qui conviennent, y compris
   celles qu'une règle plus tardive recouvre), et renvoie les requêtes de fonte que ce
   rendu provoque. */
async function probe(page, log, family, weight, ch) {
  const before = log.fonts.length;
  await page.evaluate(async (family, weight, ch) => {
    const s = document.createElement('span');
    s.textContent = ch; s.style.cssText = `font:${weight} 20px "${family}";position:absolute;left:-9999px;top:0`;
    document.body.appendChild(s);
    s.getBoundingClientRect();                                                  // la mise en page demande la face
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
  }, family, weight, ch);
  await new Promise((r) => setTimeout(r, 30));
  return [...new Set(log.fonts.slice(before))];
}

const AR = 'م';        // U+0645, une lettre arabe
const WEIGHTS_DEFAULT = [400, 500, 600, 700];
const s = suite('font-face-census', {});
inSuite = true;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const srv = serve(ROOT, true);
const origin = await listen(srv);
const pages = c.named.filter((p) => p.cls !== 3);          // le cas (3) est la coquille native, plus bas
const findings = [];

for (const p of pages) {
  await s.run(p.page, async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const log = { fonts: [], refused: [] };
    await wire(page, origin, log);
    t.step(`probe document of ${p.page}`);
    await page.goto(`${origin}/__probe__?p=${encodeURIComponent(p.page)}`, { waitUntil: 'load', timeout: 45000 });
    await settle(page);

    /* une famille qui écrit du texte n'a ni @font-face ni lien Google : la page nomme la famille, elle doit la déclarer */
    const declared = await page.evaluate(() => [...document.fonts].map((f) => f.family.replace(/^["']|["']$/g, '')));
    check(declared.includes(PLEX), `${p.page} : « ${PLEX} » est déclarée (@font-face ou lien Google) : ${[...new Set(declared)].filter((x) => /plex/i.test(x)).join(', ') || 'aucune'}`);
    const names = [...new Set(declared.filter((x) => /plex/i.test(x)))];
    check(names.every((n) => ALLOWED_PLEX_NAMES.has(n)), `${p.page} : aucun nom de famille Plex autre que les deux permis (${names.join(', ')})`);

    const weights = [...new Set((p.weights.length ? p.weights : WEIGHTS_DEFAULT))].sort((a, b) => a - b);
    const seen = {};
    for (const w of weights) {
      /* un caractère, à une graisse, d'une famille : combien d'URL ? */
      const ar = await probe(page, log, PLEX, w, AR);
      seen[w] = ar;
      check(ar.length <= 1, `${p.page} · ${PLEX} ${w} · « ${AR} » demandée à ${ar.length <= 1 ? (ar.length ? '1 URL' : 'aucune URL (déjà chargée)') : ar.length + ' URL : ' + ar.join(' et ')}`);
      const latin = await probe(page, log, PLEX, w, 'A');
      check(latin.length <= 1, `${p.page} · ${PLEX} ${w} · « A » demandé à ${latin.length} URL${latin.length > 1 ? ' : ' + latin.join(' et ') : ''}`);
    }
    for (const w of [400, 600]) {
      for (const ch of ['A', 'é', 'ł']) {
        const r = await probe(page, log, 'Inter Tight', w, ch);
        check(r.length <= 1, `${p.page} · Inter Tight ${w} · « ${ch} » demandé à ${r.length} URL${r.length > 1 ? ' : ' + r.join(' et ') : ''}`);
      }
    }

    /* d'où vient l'arabe, par classe */
    const origin_of = (w) => (seen[w] && seen[w].length ? where(seen[w][0]) : null);
    if (p.cls === 4) {
      for (const w of [400, 500, 600]) check(origin_of(w) === 'assets/fonts', `${p.page} (sans Plex) · l'arabe à ${w} vient de assets/fonts/ (${seen[w].join() || 'rien'})`);
      check(origin_of(700) === 'assets/fonts' && /plex-arabic-600/.test(seen[700][0] || '') || seen[700].length === 0, `${p.page} · l'arabe à 700 prend la face 600 (graisse la plus proche, jamais de gras synthétique)`);
    } else if (p.cls === 2 && !/article\.css$/.test(p.link || '')) {
      for (const w of [400, 500, 600]) check(origin_of(w) === 'assets/fonts', `${p.page} (feuille Next) · l'arabe à ${w} vient de assets/fonts/ et non de Google (${seen[w].join() || 'rien'})`);
      for (const w of [200, 300]) check(origin_of(w) === 'gstatic', `${p.page} (feuille Next) · l'arabe à ${w} vient encore de fonts.gstatic.com tant que l'@import reste (${(seen[w] || []).join() || 'rien'})`);
      const latin = await probe(page, log, PLEX, 400, 'A');
      check(latin.length === 0 || latin.every((u) => where(u) === 'gstatic'), `${p.page} (feuille Next) · le latin de Plex reste sur Google : legacy-faces.css ne couvre que l'arabe`);
    } else {
      /* classe 1 et pages des guides : Google, plus tardif, doit gagner ; le fichier local ne part pas */
      for (const w of weights) if (seen[w].length) check(where(seen[w][0]) === 'gstatic', `${p.page} · l'arabe à ${w} vient de Google (la règle la plus tardive gagne) : ${seen[w][0]}`);
      const local = log.fonts.filter((u) => u.startsWith('/assets/fonts/plex-arabic'));
      check(local.length === 0, `${p.page} · aucun fichier local de Plex n'est demandé tant que Google déclare la graisse${local.length ? ' (demandé : ' + local.join() + ')' : ''}`);
    }
    check(!log.refused.length, `${p.page} · aucune requête sortante hors Google${log.refused.length ? ' : ' + [...new Set(log.refused)].slice(0, 3).join(' ') : ''}`);
  });
}

/* ── la coquille native : le bundle construit ──────────────────────────── */
await s.run('app shell (www construit)', async (t) => {
  check(built && !built.errors.length, 'le bundle se construit sans erreur');
  const wwwSrv = serve(built.out, false);
  const wOrigin = await listen(wwwSrv);
  t.defer(() => wwwSrv.close());
  for (const [pageName, lang] of [['index.html', 'ar'], ['kiwi-caisse.html', 'ar'], ['dashboard.html', 'en']]) {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const log = { fonts: [], refused: [] };
    await wire(page, wOrigin, log);
    await page.evaluateOnNewDocument((lang) => { try { localStorage.setItem('kiwiLang', lang); localStorage.setItem('kiwiNativeLocale', lang); } catch (_) {} window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; }, lang);
    t.step(`open ${pageName} (${lang}) from the built bundle`);
    await page.goto(`${wOrigin}/${pageName}`, { waitUntil: 'load', timeout: 45000 });
    await page.evaluate(() => document.documentElement.classList.add('kiwi-native'));
    await settle(page);
    const decl = await page.evaluate(() => [...document.fonts].map((f) => f.family.replace(/^["']|["']$/g, '')));
    check(decl.includes('Inter Tight') && decl.includes(PLEX), `${pageName} : « Inter Tight » et « ${PLEX} » sont déclarées dans l'app (mêmes noms de famille)`);
    for (const w of [400, 500, 600]) {
      /* la coquille peint déjà de l'arabe au chargement : la face a pu partir avant la sonde ;
         ce qui compte est que, toutes requêtes confondues, ce soit LE fichier de cette graisse. */
      const ar = await probe(page, log, PLEX, w, AR);
      const mine = log.fonts.filter((u) => new RegExp(`^/assets/fonts/plex-arabic-${w}\\.woff2\\?v=\\d+$`).test(u));
      check(ar.length <= 1 && ar.every((u) => where(u) === 'assets/fonts') && mine.length >= 1, `${pageName} · l'arabe à ${w} vient d'assets/fonts/plex-arabic-${w}.woff2, estampillé (${mine[0] || 'rien'})`);
    }
    const lat = await probe(page, log, 'Inter Tight', 400, 'A');
    const latAll = log.fonts.filter((u) => /^\/assets\/fonts\/inter-tight-latin\.woff2\?v=\d+$/.test(u));
    check(lat.length <= 1 && lat.every((u) => /^\/assets\/fonts\/inter-tight-latin\.woff2\?v=\d+$/.test(u)) && latAll.length >= 1, `${pageName} · le latin vient d'assets/fonts/inter-tight-latin.woff2, estampillé (${latAll[0] || 'rien'})`);
    const stray = log.fonts.filter((u) => /^\/native-fonts\/(?:inter|ibm)/.test(u) || u.includes('fonts.g'));
    check(!stray.length, `${pageName} · aucune requête vers native-fonts/ pour Inter Tight ou Plex, ni vers Google${stray.length ? ' : ' + stray.join() : ''}`);
    const fontish = log.refused.filter((u) => /fonts\.|\.woff2?(\?|$)/.test(u));
    check(!fontish.length, `${pageName} · aucune requête de fonte sortante (la coquille appelle son API, pas Google)${fontish.length ? ' : ' + fontish.join() : ''}`);
  }
});

await browser.close().catch(() => {});
srv.close();
fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
await s.finish();
