#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · tools/css-important-audit.mjs · quels `!important` des trois couches du
 * tableau de bord ne servent à rien, prouvé dans un vrai Chromium.
 *
 * Pas une suite du gate (check.js ne la nomme pas) : un outil qu'on lance à la
 * main quand on veut faire baisser les épingles `important` de
 * tools/file-size-baseline.json sans changer un pixel.
 *
 *   node tools/css-important-audit.mjs self-test [--product] # racines CSSOM, activation des modes
 *   node tools/css-important-audit.mjs list                  # les candidats, par fichier
 *   node tools/css-important-audit.mjs audit [--write]       # la preuve, et l'écriture
 *   node tools/css-important-audit.mjs snapshot <out.json.gz> [--all-pages]
 *   node tools/css-important-audit.mjs diff <a.json.gz> <b.json.gz>
 *
 *   --files a.css,b.css   restreint les fichiers (défaut : les trois ci-dessous)
 *   --jobs N              onglets en parallèle dans le même navigateur (défaut 3)
 *   --configs std-light-desktop-fr,…   restreint les configurations
 *   --report <file.json>  écrit le détail (acceptés, rejetés, non exercés)
 *
 * La démo seulement : serveur statique local, /api/ répond 503, tout le reste du
 * réseau est coupé, l'horloge figée à 15 h (tools/demo-clock.mjs). Jamais la
 * production, jamais un commerce réel.
 *
 * ── Ce que « redondant » veut dire ici ──────────────────────────────────────
 * Retirer `!important` d'une déclaration ne change que la cascade de SA
 * propriété (ses longhands) sur les éléments que SA règle sélectionne. Si la
 * valeur calculée de ces longhands reste identique sur chaque élément (et sur
 * ::before / ::after quand la règle les vise), rien d'autre ne peut bouger :
 * héritage, var(), em, currentColor et mise en page partent tous de valeurs
 * calculées. Le test compare donc, dans la MÊME tâche JavaScript (pas de
 * minuteur entre les deux mesures, transitions terminées de force), getComputedStyle
 * et computedStyleMap (la valeur calculée, `50%` et pas `612px`) de ces
 * longhands sur tous les éléments, plus le rectangle de chaque élément, avec et
 * sans le retrait.
 *
 * Les états mesurés : démo standard et Go Ultra (bouton produit), chacun ×
 * drapeau kit 2027 éteint et allumé × clair et sombre ×
 * bureau 1440×900 et téléphone 390×844 × FR et AR × chaque destination de la
 * barre latérale (accueil, transactions, rapport, clients, équipe, stock, menu,
 * …), le tiroir des réglages, le sélecteur de lieu, le calendrier et les
 * détails de commande / transaction présents dans la démo. Pour les remplacer à chaud, chaque <link> audité
 * devient un <style> au même rang de la cascade, url() rendues absolues ; une
 * mesure complète avant et après ce remplacement vérifie qu'il ne change rien.
 *
 * Un candidat n'est retenu que si :
 *   · chaque sélecteur de sa liste trouve au moins un élément dans au moins un
 *     état (sinon il n'est pas exercé, on le garde) ;
 *   · aucun de ses sélecteurs ne dépend d'un état d'interaction (:hover, :focus,
 *     :checked, …) ni ne vise un pseudo-élément autre que ::before / ::after ;
 *   · il n'est ni préfixé (-webkit-…, Safari n'est pas Chromium), ni le jumeau
 *     d'une déclaration préfixée !important de sa règle, ni écrasé par une
 *     déclaration !important plus loin dans la même règle, ni ignoré par
 *     Chromium, ni un garde-fou `[hidden] { display: none !important }` ;
 *   · aucune règle concurrente, de n'importe quelle feuille, qui ne s'applique
 *     pas dans les états mesurés mais dont le dernier composé prend déjà
 *     l'élément (ses ancêtres pouvant changer : une autre page, un parent
 *     ouvert, un autre thème, une autre @media, l'impression, le survol, le
 *     focus, …) ne gagnerait la cascade une fois l'!important retiré
 *     (spécificité et ordre comparés), et aucune @keyframes ne touche la
 *     propriété sur ces éléments ;
 *   · et chaque mesure de chaque état reste identique, retraits retenus
 *     cumulés, vérifié à la fin d'un seul tenant contre le texte d'origine
 *     dans tous les états, jusqu'au point fixe.
 * Limite connue : un état que seul du JavaScript crée (une classe ajoutée, un
 * style en ligne posé au clic) et qu'aucune destination mesurée ne montre n'est
 * pas vu. C'est le prix d'une preuve par mesure.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pinTradingHour } from './demo-clock.mjs';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FILES = ['assets/dashboard-shell.css', 'assets/design-vexel.css', 'assets/kit/dash-desktop.css'];
const argv = process.argv.slice(2);
const cmd = argv[0] || 'list';
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i < 0 ? dflt : argv[i + 1]; };
const has = (name) => argv.includes('--' + name);
const FILES = (opt('files', '') || DEFAULT_FILES.join(',')).split(',').filter(Boolean);
const JOBS = Math.max(1, +opt('jobs', 3));
const log = (...a) => console.log(...a);

/* ── Sélecteurs : découpe, pseudo-éléments, spécificité, relâchement ─────────
   Une seule fonction autonome : elle tourne dans Node et, telle quelle
   (toString), dans la page. */
function selectorKit() {
  const DYN = ['hover', 'active', 'focus', 'focus-visible', 'focus-within', 'target', 'target-within', 'visited',
    'checked', 'indeterminate', 'placeholder-shown', 'invalid', 'valid', 'user-invalid', 'user-valid', 'autofill',
    '-webkit-autofill', 'open', 'popover-open', 'modal', 'fullscreen', 'playing', 'paused', 'in-range', 'out-of-range',
    'default', 'drop', 'current', 'past', 'future'];
  const LEGACY_PE = ['before', 'after', 'first-line', 'first-letter'];
  /* Coupe au niveau zéro (hors parenthèses, crochets et chaînes). */
  function splitTop(s, sep) {
    const out = []; let depth = 0, q = '', cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === '\\') { cur += s[++i] || ''; } else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '\\') { cur += ch + (s[++i] || ''); continue; }
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
      if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter((x) => x.length);
  }
  /* Lit un identifiant CSS à partir de i ; renvoie l'index qui suit. */
  function identEnd(s, i) {
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\') { i += 2; continue; }
      if (/[\w\- -￿]/.test(ch)) { i++; continue; }
      break;
    }
    return i;
  }
  function parenEnd(s, i) { // s[i] === '('
    let depth = 0, q = '';
    for (; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '\\') i++; else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) return i + 1; }
    }
    return s.length;
  }
  function bracketEnd(s, i) {
    let q = '';
    for (; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '\\') i++; else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === ']') return i + 1;
    }
    return s.length;
  }
  /* Spécificité d'un sélecteur complexe, sous la forme a*1e6 + b*1e3 + c. */
  function specificity(sel) {
    let a = 0, b = 0, c = 0, i = 0;
    const s = sel;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '#') { a++; i = identEnd(s, i + 1); }
      else if (ch === '.') { b++; i = identEnd(s, i + 1); }
      else if (ch === '[') { b++; i = bracketEnd(s, i); }
      else if (ch === ':') {
        if (s[i + 1] === ':') {
          const e = identEnd(s, i + 2); c++; i = e;
          if (s[i] === '(') i = parenEnd(s, i);
        } else {
          const e = identEnd(s, i + 1); const name = s.slice(i + 1, e).toLowerCase(); i = e;
          let args = null;
          if (s[i] === '(') { const pe = parenEnd(s, i); args = s.slice(i + 1, pe - 1); i = pe; }
          if (LEGACY_PE.includes(name)) c++;
          else if (name === 'where') { /* 0 */ }
          else if (['is', 'not', 'has', 'matches', '-webkit-any', 'any'].includes(name) && args != null) {
            const best = Math.max(0, ...splitTop(args, ',').map(specificity));
            a += Math.floor(best / 1e6); b += Math.floor(best / 1e3) % 1e3; c += best % 1e3;
          } else if ((name === 'nth-child' || name === 'nth-last-child') && args && /\sof\s/i.test(args)) {
            b++;
            const best = Math.max(0, ...splitTop(args.split(/\sof\s/i).slice(1).join(' of '), ',').map(specificity));
            a += Math.floor(best / 1e6); b += Math.floor(best / 1e3) % 1e3; c += best % 1e3;
          } else if (name === 'host' || name === 'host-context') { b++; }
          else b++;
        }
      }
      else if (ch === '*') { i++; if (s[i] === '|') i++; }
      else if (/[A-Za-z_\-\\ -￿]/.test(ch)) { const e = identEnd(s, i); if (s[e] === '|') { i = e + 1; } else { c++; i = e; } }
      else i++;
    }
    return a * 1e6 + b * 1e3 + c;
  }
  /* Le pseudo-élément d'un sélecteur complexe, et sa base (l'élément d'origine). */
  function splitPE(sel) {
    let i = 0; const s = sel;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '[') { i = bracketEnd(s, i); continue; }
      if (ch === '(') { i = parenEnd(s, i); continue; }
      if (ch === '"' || ch === "'") { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } i++; continue; }
      if (ch === '\\') { i += 2; continue; }
      if (ch === ':') {
        const dbl = s[i + 1] === ':';
        const st = dbl ? i + 2 : i + 1;
        const e = identEnd(s, st); const name = s.slice(st, e).toLowerCase();
        if (dbl || LEGACY_PE.includes(name)) {
          let base = s.slice(0, i).trim();
          if (!base || /[\s>+~]$/.test(base)) base += '*';
          return { base, pe: name, rest: s.slice(e).trim() };
        }
        i = e; continue;
      }
      i++;
    }
    return { base: sel.trim(), pe: '', rest: '' };
  }
  const dynRe = new RegExp(':(' + DYN.map((d) => d.replace(/[-]/g, '\\-')).join('|') + ')(?![\\w-])', 'i');
  const hasDynamic = (sel) => dynRe.test(sel);
  /* Un sur-ensemble du sélecteur où chaque état d'interaction est supposé
     possible : les pseudo-classes dynamiques disparaissent, et toute fonction
     (:not, :is, :where, :has) qui en contient une disparaît entière. */
  function relax(sel) {
    let s = sel, out = '', i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '[') { const e = bracketEnd(s, i); out += s.slice(i, e); i = e; continue; }
      if (ch === '"' || ch === "'") { out += ch; i++; continue; }
      if (ch === ':' && s[i + 1] !== ':') {
        const e = identEnd(s, i + 1); const name = s.slice(i + 1, e).toLowerCase();
        let end = e;
        if (s[e] === '(') end = parenEnd(s, e);
        const chunk = s.slice(i, end);
        if (DYN.includes(name)) { i = end; continue; }
        if (s[e] === '(' && hasDynamic(chunk)) { i = end; continue; }
        out += chunk; i = end; continue;
      }
      out += ch; i++;
    }
    /* Un composé vidé devient « * ». */
    out = out.replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, '$1').replace(/^ /, '');
    out = out.replace(/(^|[>+~ (,])(?=[>+~ ),]|$)/g, '$1*');
    return out.trim() || '*';
  }
  /* Le dernier composé d'un sélecteur complexe (ce qui doit prendre l'élément
     lui-même), après le dernier combinateur de niveau zéro. */
  function lastCompound(sel) {
    let i = 0, cut = 0; const s = sel;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '[') { i = bracketEnd(s, i); continue; }
      if (ch === '(') { i = parenEnd(s, i); continue; }
      if (ch === '"' || ch === "'") { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } i++; continue; }
      if (ch === '\\') { i += 2; continue; }
      if (ch === ' ' || ch === '>' || ch === '+' || ch === '~') cut = i + 1;
      i++;
    }
    return s.slice(cut).trim() || '*';
  }
  return { splitTop, specificity, splitPE, hasDynamic, relax, lastCompound, DYN };
}
const SK = selectorKit();

/* ── Lecture d'une feuille : règles, déclarations, candidats ──────────────── */
function maskCss(text) {
  /* Deux masques de même longueur : commentaires blanchis (pour lire le texte)
     et, en plus, contenu des chaînes neutralisé (pour lire la structure). */
  let cm = '', sm = '', i = 0;
  while (i < text.length) {
    if (text.startsWith('/*', i)) {
      const j = text.indexOf('*/', i + 2); const end = j < 0 ? text.length : j + 2;
      const blank = text.slice(i, end).replace(/[^\n]/g, ' ');
      cm += blank; sm += blank; i = end;
    } else if (text[i] === '"' || text[i] === "'") {
      const q = text[i]; let j = i + 1;
      while (j < text.length && text[j] !== q && text[j] !== '\n') { if (text[j] === '\\') j++; j++; }
      const chunk = text.slice(i, j + 1);
      cm += chunk; sm += q + chunk.slice(1, -1).replace(/[^\n]/g, '_') + (chunk.length > 1 ? chunk.slice(-1) : ''); i = j + 1;
    } else { cm += text[i]; sm += text[i]; i++; }
  }
  return { cm, sm };
}
function braceEnd(sm, i) { // sm[i] === '{'
  let d = 0;
  for (; i < sm.length; i++) { if (sm[i] === '{') d++; else if (sm[i] === '}') { d--; if (d === 0) return i; } }
  return sm.length;
}
export function parseCss(text, rel) {
  const { cm, sm } = maskCss(text);
  const lineAt = (() => { const starts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1); return (off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo + 1; }; })();
  const rules = []; const cands = [];
  const bangRe = /!\s*important/gi;
  function scanDecls(s, e, rule, kind) {
    const body = sm.slice(s, e);
    if (kind === 'style' && body.includes('{')) kind = 'nested';
    /* Déclarations séparées par « ; » au niveau zéro. */
    const decls = []; let depth = 0, st = s;
    for (let i = s; i <= e; i++) {
      const ch = i < e ? sm[i] : ';';
      if (ch === '(' ) depth++; else if (ch === ')') depth--;
      else if ((ch === ';' && depth <= 0) || i === e) {
        const seg = cm.slice(st, i);
        const colon = sm.slice(st, i).indexOf(':');
        if (colon > 0 && seg.trim()) {
          const prop = seg.slice(0, colon).trim().toLowerCase();
          const segS = sm.slice(st, i);
          bangRe.lastIndex = 0; const m = bangRe.exec(segS);
          let bang = null;
          if (m) { let ws = st + m.index; while (ws > st + colon + 1 && /\s/.test(text[ws - 1])) ws--; bang = [ws, st + m.index + m[0].length]; }
          decls.push({ prop, important: !!m, bang, value: seg.slice(colon + 1).replace(/!\s*important/i, '').trim(), line: lineAt(st + colon) });
        }
        st = i + 1;
      }
    }
    if (rule) rule.decls = decls;
    decls.forEach((d, k) => {
      if (!d.important) return;
      const later = decls.slice(k + 1).some((x) => x.important && x.prop === d.prop);
      /* `-webkit-backdrop-filter: … !important` à côté de `backdrop-filter` :
         Chromium les confond, Safari pas toujours ; on garde la paire. */
      const twin = decls.some((x) => x !== d && x.important && /^-(webkit|moz|ms|o)-/.test(x.prop) && x.prop.replace(/^-(webkit|moz|ms|o)-/, '') === d.prop);
      cands.push({ id: `${rel}:${cands.length}`, rel, n: cands.length, line: d.line, prop: d.prop, value: d.value, bang: d.bang,
        kind, rule: rule ? rule.idx : -1, selector: rule ? rule.selector : '', chain: rule ? rule.chain : [], shadowedInBlock: later, vendorTwin: twin });
    });
  }
  function block(s, e, chain) {
    let i = s;
    while (i < e) {
      let j = i; while (j < e && sm[j] !== '{' && sm[j] !== ';' && sm[j] !== '}') j++;
      if (j >= e) break;
      if (sm[j] !== '{') { i = j + 1; continue; }
      const prelude = cm.slice(i, j).trim().replace(/\s+/g, ' ');
      const close = braceEnd(sm, j);
      if (prelude.startsWith('@')) {
        const name = (/^@([\w-]+)/.exec(prelude) || [, ''])[1].toLowerCase();
        if (['media', 'supports', 'layer', 'container', 'document', '-moz-document', 'scope', 'starting-style'].includes(name)) block(j + 1, close, [...chain, prelude]);
        else scanDecls(j + 1, close, null, name.endsWith('keyframes') ? 'keyframes' : 'at-rule');
      } else {
        const rule = { idx: rules.length, selector: prelude, chain, start: i, end: close };
        rules.push(rule);
        scanDecls(j + 1, close, rule, 'style');
      }
      i = close + 1;
    }
  }
  block(0, text.length, []);
  return { rules, cands };
}
export function removeBangs(text, cands) {
  const list = [...cands].sort((a, b) => b.bang[0] - a.bang[0]);
  let out = text;
  for (const c of list) out = out.slice(0, c.bang[0]) + out.slice(c.bang[1]);
  return out;
}
const isVendor = (c) => /^-(webkit|moz|ms|o)-/.test(c.prop) || /(^|[\s(,])-(webkit|moz|ms|o)-/.test(c.value);

/* ── Le serveur et le navigateur ──────────────────────────────────────────── */
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
async function startServer() {
  const server = http.createServer((req, res) => {
    const p = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
    if (!p.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
async function launch() {
  let puppeteer;
  try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); }
  catch { console.error('puppeteer-core introuvable : npm --prefix app ci (ou le lien app/node_modules dans un worktree)'); process.exit(2); }
  const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
  if (!bin) { console.error('Chromium introuvable (KIWI_CHROMIUM_BIN)'); process.exit(2); }
  return puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Mode produit × drapeau du kit × thème × écran × langue. */
const CONFIGS = [];
for (const theme of ['light', 'dark']) for (const vp of ['desktop', 'phone']) for (const lang of ['fr', 'ar']) for (const ultra of [false, true]) for (const flag of [false, true])
  CONFIGS.push({ id: `${ultra ? 'ultra-' : ''}${flag ? 'kit' : 'std'}-${theme}-${vp}-${lang}`, ultra, flag, theme, vp, lang });
const KEY_PAGES = ['accueil', 'transactions', 'equipe', 'stock', 'menu', 'settings'];

async function openDashboard(browser, base, cfg) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.setDefaultTimeout(60000);
  await pinTradingHour(page);
  if (cfg.vp === 'phone') await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1440, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((flag, theme, lang) => {
    try {
      if (flag) localStorage.setItem('kiwiSkin2027:dashboard', '1');
      localStorage.setItem('kiwiSkipOnboard', '1');
      localStorage.setItem('kiwiTheme', theme); localStorage.setItem('kiwiDashTheme', theme);
      localStorage.setItem('kiwiLang', lang);
    } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, cfg.flag, cfg.theme, cfg.lang);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 30000 });
  await sleep(1200);
  await page.waitForFunction(() => document.body.classList.contains('design-vexel'));
  if (cfg.flag) await page.waitForFunction(() => document.documentElement.getAttribute('data-skin-2027') === 'dashboard');
  if (cfg.ultra) {
    // Product handler owns the palette, venue, storage, render and subscribers.
    await page.evaluate(() => document.querySelector('[data-action="venue-toggle"]').click());
    await page.waitForSelector('[data-action="venue-enter-fusion"]');
    await page.evaluate(() => document.querySelector('[data-action="venue-enter-fusion"]').click());
    await page.waitForFunction(() => window.KiwiVenue?.isFusion?.() && document.body.classList.contains('fusion-mode'));
    await sleep(4000);
    await page.waitForFunction(() => !document.body.classList.contains('fusion-reconstruct') && !document.body.classList.contains('fusion-glass-melt'));
  }
  return { ctx, page };
}
async function pageList(page) {
  return page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('.sidebar nav a')) {
      const id = a.dataset.nav ? a.dataset.nav : a.dataset.action ? 'act:' + a.dataset.action : '';
      if (id && !out.includes(id)) out.push(id);
    }
    if (document.querySelector('[data-action="settings"]')) out.push('settings');
    return [...out, 'overlay:venue-toggle', 'overlay:open-date-picker', 'overlay:open-order', 'overlay:tx-detail'];
  });
}
async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(80); }
  await page.evaluate(() => document.querySelectorAll('.kiwi-modal-close, .kiwi-drawer-close, [data-dismiss], [data-close]').forEach((b) => { try { if (b.offsetWidth) b.click(); } catch (_) {} }));
  await sleep(250);
}
async function goPage(page, name) {
  await closeOverlays(page);
  if (name.startsWith('overlay:')) await goPage(page, name === 'overlay:tx-detail' ? 'transactions' : 'accueil');
  const ok = await page.evaluate((n) => {
    let el = null;
    if (n.startsWith('overlay:')) el = document.querySelector('[data-action="' + n.slice(8) + '"]');
    else if (n === 'settings') el = document.querySelector('[data-action="settings"]');
    else if (n.startsWith('act:')) el = document.querySelector('.sidebar nav a[data-action="' + n.slice(4) + '"]');
    else el = document.querySelector('.sidebar [data-nav="' + n + '"]');
    if (el) el.click();
    return !!el;
  }, name);
  await sleep(1100);
  return ok;
}

/* ── Le code qui tourne dans la page ───────────────────────────────────────
   install() : les textes d'origine, les candidats, le kit des sélecteurs. */
function pageRuntime() {
  const SK = window.__ciaSK;
  const W = {};
  W.files = {};       // rel -> { href, text, cands: {id: [s,e]}, style }
  W.expandCache = new Map();
  W.expand = (prop) => {
    if (W.expandCache.has(prop)) return W.expandCache.get(prop);
    let out;
    if (prop.startsWith('--')) out = [prop];
    else {
      const d = document.createElement('div');
      d.style.setProperty(prop, 'initial');
      out = [...d.style];
      if (!out.length) { d.style.setProperty(prop, 'inherit'); out = [...d.style]; }
    }
    W.expandCache.set(prop, out);
    return out;
  };
  const absolutize = (text, href) => text.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (m, q, u) => {
    const t = u.trim();
    if (!t || /^(data:|https?:|blob:|#|\/\/)/i.test(t)) return m;
    try { return 'url(' + q + new URL(t, href).href + q + ')'; } catch (_) { return m; }
  });
  W.build = (rel, ids) => {
    const f = W.files[rel];
    const list = ids.map((id) => f.cands[id]).filter(Boolean).sort((a, b) => b[0] - a[0]);
    let t = f.text;
    for (const [s, e] of list) t = t.slice(0, s) + t.slice(e);
    return absolutize(t, f.href);
  };
  W.settle = () => {
    /* Une transition terminée peut en déclencher une autre : jusqu'au calme. */
    for (let round = 0; round < 5; round++) {
      let n = 0;
      for (const a of document.getAnimations()) {
        try { if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) { a.finish(); n++; } } catch (_) {}
      }
      if (!n) break;
    }
  };
  /* Mesure : les longhands demandées sur chaque élément (calculée et
     résolue), le rectangle, et les pseudo-éléments visés. Deux fois, la
     première pour rien : sous un <details> fermé (mise en page sautée),
     Chromium répond « calc(100% + 6px) » à la première lecture de `top` et
     « 6px » à la suivante, une fois la mise en page forcée par une autre
     lecture. Seule la seconde passe est stable. */
  W.measure = (props, pseudo) => { measureOnce(props, pseudo); return measureOnce(props, pseudo); };
  const measureOnce = (props, pseudo) => {
    const out = [];
    const els = document.querySelectorAll('*');
    for (const el of els) {
      const cs = getComputedStyle(el); let map = null;
      try { map = el.computedStyleMap(); } catch (_) {}
      let row = el.tagName === 'LINK' || el.tagName === 'STYLE' ? 'SHEET' : el.tagName;   // le <link> audité devient un <style>
      for (const p of props) {
        row += '\u0001' + cs.getPropertyValue(p);
        if (map && !p.startsWith('--')) { let v; try { v = map.get(p); } catch (_) { v = '!'; } row += '\u0002' + (v == null ? '' : String(v)); }
      }
      const r = el.getBoundingClientRect();
      row += '\u0003' + r.x + ',' + r.y + ',' + r.width + ',' + r.height;
      out.push(row);
    }
    for (const [sel, pe] of pseudo) {
      let list = [];
      try { list = document.querySelectorAll(sel); } catch (_) {}
      for (const el of list) {
        const cs = getComputedStyle(el, '::' + pe);
        let row = pe;
        for (const p of props) row += '\u0001' + cs.getPropertyValue(p);
        out.push(row);
      }
    }
    return out;
  };
  W.firstDiff = (a, b) => {
    if (a.length !== b.length) return 'longueur ' + a.length + ' ≠ ' + b.length;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
      const x = a[i].split(/[\u0001\u0002\u0003]/), y = b[i].split(/[\u0001\u0002\u0003]/);
      for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return '#' + i + ' ' + x[0] + ' champ ' + k + ' « ' + String(y[k]).slice(0, 60) + ' » → « ' + String(x[k]).slice(0, 60) + ' »';
      return '#' + i;
    }
    return '';
  };
  /* Remplace chaque <link> audité par un <style> au même rang. */
  W.swapLinks = () => {
    const done = [];
    for (const rel of Object.keys(W.files)) {
      const f = W.files[rel];
      if (f.style && f.style.isConnected) { done.push(rel); continue; }
      const link = [...document.querySelectorAll('link[rel~="stylesheet"]')].find((l) => { try { return new URL(l.href).pathname === '/' + rel; } catch (_) { return false; } });
      if (!link) continue;
      f.href = new URL(link.href).href.replace(/\?.*$/, '');
      const st = document.createElement('style');
      st.setAttribute('data-cia', rel);
      st.textContent = W.build(rel, []);
      link.replaceWith(st);
      f.style = st;
      done.push(rel);
    }
    return done;
  };
  /* Toutes les règles de style du document, dans l'ordre de la cascade. */
  W.cssom = () => {
    const recs = []; let order = 0;
    const walk = (rules, ok, sheetTag) => {
      for (const r of rules) {
        if (r instanceof CSSStyleRule) {
          recs.push({ r, order: order++, ok, sheetTag });
          if (r.cssRules && r.cssRules.length) walk(r.cssRules, ok, sheetTag);
        } else if (r instanceof CSSMediaRule) walk(r.cssRules, ok && (!r.media.mediaText || matchMedia(r.media.mediaText).matches), sheetTag);
        else if (typeof CSSSupportsRule !== 'undefined' && r instanceof CSSSupportsRule) walk(r.cssRules, ok && CSS.supports(r.conditionText), sheetTag);
        else if (r instanceof CSSImportRule) { try { if (r.styleSheet) walk(r.styleSheet.cssRules, ok && (!r.media.mediaText || matchMedia(r.media.mediaText).matches), sheetTag); } catch (_) {} }
        else if (r.cssRules) walk(r.cssRules, false, sheetTag);   // @container, @layer, … : jamais « observé »
      }
    };
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (_) { continue; }
      const ok = !sh.disabled && (!sh.media || !sh.media.mediaText || matchMedia(sh.media.mediaText).matches);
      const tag = sh.ownerNode && sh.ownerNode.getAttribute ? sh.ownerNode.getAttribute('data-cia') || '' : '';
      walk(rules, ok, tag);
    }
    return recs;
  };
  const norm = (s) => String(s).replace(/::(before|after|first-line|first-letter)/gi, ':$1').replace(/["'\s]/g, '').toLowerCase()
    .replace(/\(even\)/g, '(2n)').replace(/\(odd\)/g, '(2n+1)');
  /* Analyse d'un état : pour chaque candidat, ses sélecteurs exercés, ses
     éléments, et les règles concurrentes qui gagneraient hors des états
     mesurés. */
  W.analyze = (C) => {
    for (const f of Object.values(W.files)) if (f.style && f.style.isConnected) f.style.textContent = W.build(Object.keys(W.files).find((k) => W.files[k] === f), []);
    W.settle();
    const recs = W.cssom();
    const byRel = {};
    for (const rec of recs) if (rec.sheetTag) (byRel[rec.sheetTag] = byRel[rec.sheetTag] || []).push(rec);
    /* Alignement texte ↔ CSSOM, règle par règle, dans l'ordre. */
    const ruleMap = {};
    const alignMiss = [];
    for (const rel of Object.keys(C.rules)) {
      const list = byRel[rel] || []; let k = 0;
      ruleMap[rel] = {};
      for (const pr of C.rules[rel]) {
        const want = norm(pr.selector);
        let found = -1;
        for (let t = k; t < Math.min(list.length, k + 40); t++) if (norm(list[t].r.selectorText) === want) { found = t; break; }
        if (found < 0) { alignMiss.push(rel + ' ' + pr.selector.slice(0, 80)); continue; }
        ruleMap[rel][pr.idx] = list[found]; k = found + 1;
      }
    }
    /* Index de toutes les règles par longhand déclarée. Une règle concurrente
       « pourrait » prendre un élément si son dernier composé, pseudo-classes
       d'état retirées, le prend déjà : ses ancêtres (body.page-x, une classe
       d'ouverture sur un parent, un autre thème, une autre @media) sont
       supposés pouvoir changer. */
    const hidden = new Map();
    for (const rec of recs) {
      const sel = rec.r.selectorText;
      const parts = SK.splitTop(sel, ',').map((p) => { const { base, pe } = SK.splitPE(p); return { spec: SK.specificity(p), pe, base, relaxed: SK.lastCompound(SK.relax(base)) }; });
      const st = rec.r.style;
      for (let i = 0; i < st.length; i++) {
        const l = st[i];
        if (!hidden.has(l)) hidden.set(l, []);
        hidden.get(l).push({ rec, parts, imp: st.getPropertyPriority(l) === 'important' });
      }
    }
    const relaxCache = new Map();
    const matchSet = (hp) => {
      if (!relaxCache.has(hp)) { let s = null; try { s = new Set(document.querySelectorAll(hp.relaxed)); } catch (_) { s = null; } relaxCache.set(hp, s); }
      return relaxCache.get(hp);   // null : sélecteur relâché illisible, on le suppose partout
    };
    const noContest = new Set(C.noContest || []);
    /* Les animations : une @keyframes passe devant une déclaration normale,
       pas devant une !important. Retirer l'!important d'une longhand qu'une
       animation peut toucher sur ces éléments changerait l'entrée animée,
       même si l'état final mesuré reste le même. */
    const kfLong = new Map();   // nom -> Set(longhands)
    const walkKf = (rules) => { for (const r of rules) {
      if (typeof CSSKeyframesRule !== 'undefined' && r instanceof CSSKeyframesRule) {
        const set = kfLong.get(r.name) || new Set();
        for (const k of r.cssRules) for (let i = 0; i < k.style.length; i++) set.add(k.style[i]);
        kfLong.set(r.name, set);
      } else if (r.cssRules) walkKf(r.cssRules);
    } };
    for (const sh of document.styleSheets) { try { walkKf(sh.cssRules); } catch (_) {} }
    const animRules = [];
    for (const rec of recs) {
      const v = rec.r.style.getPropertyValue('animation-name');
      if (!v) continue;
      const names = v.split(',').map((x) => x.trim()).filter((x) => x && x !== 'none');
      if (!names.length) continue;
      animRules.push({ names, parts: SK.splitTop(rec.r.selectorText, ',').map((p) => { const { base, pe } = SK.splitPE(p); return { pe, base, relaxed: SK.lastCompound(SK.relax(base)) }; }) });
    }
    const animatedBy = (l) => { const out = []; for (const [n, set] of kfLong) if (set.has(l)) out.push(n); return out; };
    const result = {};
    for (const c of C.cands) {
      const rec = ruleMap[c.rel] && ruleMap[c.rel][c.rule];
      const L = W.expand(c.prop);
      const o = { parts: [], live: false, aligned: !!rec, contest: '', els: 0 };
      result[c.id] = o;
      if (!rec) continue;
      o.live = L.some((l) => rec.r.style.getPropertyPriority(l) === 'important');
      const parts = SK.splitTop(rec.r.selectorText, ',');
      const matched = [];
      for (const p of parts) {
        const { base, pe } = SK.splitPE(p);
        let st = 'ok';
        if (SK.hasDynamic(p)) st = 'dynamic';
        else if (pe && pe !== 'before' && pe !== 'after') st = 'pseudo:' + pe;
        let n = 0;
        if (st === 'ok' && rec.ok) {
          try { const els = document.querySelectorAll(base); n = els.length; if (n) matched.push({ p, base, pe, spec: SK.specificity(p), els: [...els] }); }
          catch (_) { st = 'invalid'; }
        }
        o.parts.push({ st, n });
      }
      o.els = matched.reduce((s, m) => s + m.els.length, 0);
      if (!matched.length || !o.live || noContest.has(c.id)) continue;
      /* Concurrents cachés : pour chaque élément pris (et son pseudo-élément),
         la plus forte spécificité du candidat sur lui. */
      const U = new Map();
      for (const m of matched) for (const e of m.els) {
        let per = U.get(e); if (!per) { per = {}; U.set(e, per); }
        if (!(m.pe in per) || per[m.pe] < m.spec) per[m.pe] = m.spec;
      }
      for (const l of L) {
        const names = animatedBy(l);
        if (!names.length) continue;
        for (const [e, per] of U) {
          for (const pe of Object.keys(per)) {
            const cur = getComputedStyle(e, pe ? '::' + pe : null).animationName.split(',').map((x) => x.trim());
            if (cur.some((n) => names.includes(n))) { o.contest = l + ' ← animation ' + cur.join(','); break; }
          }
          if (o.contest) break;
        }
        if (o.contest) break;
        for (const ar of animRules) {
          if (!ar.names.some((n) => names.includes(n))) continue;
          for (const ap of ar.parts) {
            const set = matchSet(ap);
            const hit = set === null ? [...U.keys()] : [...U.keys()].filter((e) => set.has(e));
            if (hit.some((e) => ap.pe in U.get(e))) { o.contest = l + ' ← @keyframes ' + ar.names.join(',') + ' (' + ap.base.slice(0, 80) + ')'; break; }
          }
          if (o.contest) break;
        }
        if (o.contest) break;
      }
      if (o.contest) continue;
      outer:
      for (const l of L) {
        for (const h of hidden.get(l) || []) {
          if (h.rec === rec) continue;
          for (const hp of h.parts) {
            const set = matchSet(hp);
            const hits = [];
            if (set === null) hits.push(...U.keys());
            else if (set.size < U.size) { for (const e of set) if (U.has(e)) hits.push(e); }
            else { for (const e of U.keys()) if (set.has(e)) hits.push(e); }
            for (const e of hits) {
              const sc = U.get(e)[hp.pe];
              if (sc === undefined) continue;
              let observed = false;
              if (h.rec.ok) { try { observed = e.matches(hp.base); } catch (_) {} }
              if (observed) continue;
              const kc = sc * 1e7 + rec.order, kh = hp.spec * 1e7 + h.rec.order;
              if ((!h.imp && kh > kc) || (h.imp && kh < kc)) {
                o.contest = l + ' ← ' + (h.imp ? '!important ' : '') + h.rec.r.selectorText.slice(0, 120) + (h.rec.ok ? '' : ' (hors @media courante)');
                break outer;
              }
            }
          }
        }
      }
    }
    return { result, alignMiss, alignMissCount: alignMiss.length };
  };
  /* link → style, mesuré avant et après dans la même tâche. */
  W.swapChecked = (props) => {
    W.settle();
    const before = W.measure(props, []);
    const again = W.measure(props, []);
    const unstable = W.firstDiff(again, before);
    if (unstable) return { done: [], n: before.length, diff: 'mesure instable : ' + unstable };
    const done = W.swapLinks();
    W.settle();
    const after = W.measure(props, []);
    return { done, n: before.length, diff: W.firstDiff(after, before) };
  };
  /* Un essai : h1 = base + retraits, h0 = base, dans la même tâche. */
  W.test = (h1, h0, props, pseudo) => {
    W.settle();
    const rels = Object.keys(W.files).filter((rel) => W.files[rel].style && W.files[rel].style.isConnected);
    for (const rel of rels) W.files[rel].style.textContent = W.build(rel, h1[rel] || []);
    W.settle();
    const m1 = W.measure(props, pseudo);
    for (const rel of rels) W.files[rel].style.textContent = W.build(rel, h0[rel] || []);
    W.settle();
    const m0 = W.measure(props, pseudo);
    return W.firstDiff(m1, m0);
  };
  window.__cia = W;
}

async function installRuntime(page, payload) {
  await page.evaluate(`window.__ciaSK = (${selectorKit.toString()})();`);
  await page.evaluate(`(${pageRuntime.toString()})();`);
  await page.evaluate((files) => {
    for (const f of files) window.__cia.files[f.rel] = { href: '', text: f.text, cands: f.cands, style: null };
  }, payload);
}

/* Les propriétés de la photo complète (mode snapshot, et le contrôle du
   remplacement link → style). */
const FULL_PROPS = ['display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear', 'z-index', 'box-sizing',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'outline-style', 'outline-width', 'outline-color', 'outline-offset',
  'color', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-clip',
  'box-shadow', 'text-shadow', 'opacity', 'visibility', 'filter', 'backdrop-filter', 'mix-blend-mode', 'transform', 'clip-path', 'mask-image',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform',
  'text-decoration-line', 'text-decoration-color', 'text-overflow', 'white-space', 'direction', 'unicode-bidi', 'vertical-align',
  'overflow-x', 'overflow-y', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'order', 'justify-content', 'align-items', 'align-self', 'align-content',
  'grid-template-columns', 'grid-template-rows', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end', 'row-gap', 'column-gap',
  'content', 'cursor', 'pointer-events', 'fill', 'stroke', 'inset-inline-start', 'inset-inline-end'];

/* ── Préparation commune ──────────────────────────────────────────────────── */
function loadFiles() {
  return FILES.map((rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const { rules, cands } = parseCss(text, rel);
    return { rel, text, rules, cands };
  });
}
function payloadOf(files) {
  return files.map((f) => ({ rel: f.rel, text: f.text, cands: Object.fromEntries(f.cands.filter((c) => c.bang).map((c) => [c.id, c.bang])) }));
}

/* A real CSSOM check: root subjects, pseudo-elements and a missing part.
   Uses exactly the analyzer used by audit, including its media guards. */
if (cmd === 'self-test') {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const text = 'html { color: red !important } body.design-vexel { color: blue !important } body.fusion-mode { padding: 2px !important } html[data-skin-2027="dashboard"] body { margin: 3px !important } body::before { content: "test" !important } body, .absent { border: 0 !important } @media (min-width: 99999px) { body { opacity: 0 !important } }';
    const rel = 'fixture.css';
    const parsed = parseCss(text, rel);
    await page.setContent('<html data-skin-2027="dashboard"><head></head><body class="design-vexel fusion-mode"><main></main></body></html>');
    await installRuntime(page, payloadOf([{ rel, text, ...parsed }]));
    await page.evaluate((text) => {
      const style = document.createElement('style');
      style.dataset.cia = 'fixture.css'; style.textContent = text;
      document.head.append(style); window.__cia.files['fixture.css'].style = style;
    }, text);
    const result = await page.evaluate((C) => window.__cia.analyze(C), {
      rules: { [rel]: parsed.rules }, cands: parsed.cands,
    });
    const rows = Object.values(result.result);
    if (result.alignMiss.length || rows.slice(0, 5).some((r) => !r.aligned || !r.live || r.parts[0].n !== 1) ||
        rows[5].parts[0].n !== 1 || rows[5].parts[1].n !== 0 || rows[6].parts[0].n !== 0)
      throw new Error('root / pseudo-element / missing selector / media regression');
    log('✓ analyzer: html, body skins, body::before, missing selector and inactive media');
    if (has('product')) {
      const { server, base } = await startServer();
      try {
        for (const cfg of CONFIGS.filter((c) => c.theme === 'light' && c.vp === 'desktop' && c.lang === 'fr')) {
          const { ctx } = await openDashboard(browser, base, cfg);
          await ctx.close();
          log('✓ product activation: ' + cfg.id);
        }
      } finally { server.close(); }
    }
  } finally { await browser.close(); }
  process.exit(0);
}

/* ── list ─────────────────────────────────────────────────────────────────── */
if (cmd === 'list') {
  for (const f of loadFiles()) {
    const total = (f.text.match(/!important/g) || []).length;
    const by = {};
    for (const c of f.cands) by[c.kind] = (by[c.kind] || 0) + 1;
    log(`${f.rel}: ${total} « !important » dans le texte, ${f.cands.length} déclarations · ${JSON.stringify(by)} · ${f.cands.filter(isVendor).length} préfixées · ${f.cands.filter((c) => c.shadowedInBlock).length} écrasées dans leur bloc`);
  }
  process.exit(0);
}

/* ── diff ─────────────────────────────────────────────────────────────────── */
const readSnap = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
if (cmd === 'diff') {
  const A = readSnap(argv[1]), B = readSnap(argv[2]);
  let states = 0, bad = 0, els = 0;
  for (const id of Object.keys(A.states)) {
    const a = A.states[id], b = B.states[id];
    if (!b) { log(`  ? ${id} absent de ${argv[2]}`); bad++; continue; }
    states++; els += a.rows.length;
    const show = rowsDiff(a.rows.map((r) => r.map((v) => A.strings[v])), b.rows.map((r) => r.map((v) => B.strings[v])), A.props);
    if (show.length) { bad++; log(`  ✗ ${id}\n      ${show.join('\n      ')}`); }
  }
  log(`${states} états, ${els} lignes (éléments et pseudo-éléments) comparés · ${bad ? bad + ' état(s) différent(s)' : 'identiques'}`);
  process.exit(bad ? 1 : 0);
}

/* ── snapshot ─────────────────────────────────────────────────────────────── */
/* La photo complète d'un état : FULL_PROPS sur chaque élément et sur ses
   ::before / ::after quand ils existent, le rectangle, l'origine du serveur
   remplacée (le port change à chaque lancement), les animations infinies
   arrêtées à leur début et les transitions terminées : deux chargements de la
   même page diffèrent sinon par l'heure de l'animation d'ambiance. */
function fullRowsInPage(props) {
  for (const a of document.getAnimations()) {
    try {
      if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) a.finish();
      else { a.pause(); a.currentTime = 0; }
    } catch (_) {}
  }
  const origin = location.origin;
  const out = [];
  const take = (el, pe) => {
    const cs = getComputedStyle(el, pe || null);
    const key = (pe ? pe + '@' : '') + (el.tagName === 'LINK' || el.tagName === 'STYLE' ? 'sheet' : el.tagName.toLowerCase()) + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const row = [key];
    for (const p of props) row.push(cs.getPropertyValue(p).split(origin).join('ORIGIN'));
    if (!pe) { const r = el.getBoundingClientRect(); row.push([r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(',')); }
    else row.push('');
    out.push(row);
  };
  /* Deux passes, la seconde seule gardée (voir W.measure). */
  for (let pass = 0; pass < 2; pass++) {
    out.length = 0;
    for (const el of document.querySelectorAll('*')) {
      take(el, '');
      for (const pe of ['::before', '::after']) { const c = getComputedStyle(el, pe).content; if (c && c !== 'none' && c !== 'normal') take(el, pe); }
    }
  }
  return out;
}
function rowsDiff(a, b, props, max = 4) {
  const show = [];
  if (a.length !== b.length) show.push(`${a.length} lignes → ${b.length}`);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n && show.length < max; i++) {
    const x = a[i], y = b[i];
    if (x.join('\u0001') === y.join('\u0001')) continue;
    const k = x.findIndex((v, j) => v !== y[j]);
    const name = k === 0 ? 'clé' : k <= props.length ? props[k - 1] : 'rect';
    show.push(`#${i} ${x[0]} · ${name}: « ${String(x[k]).slice(0, 70)} » → « ${String(y[k]).slice(0, 70)} »`);
  }
  return show;
}

if (cmd === 'snapshot' || cmd === 'verify') {
  /* snapshot <out> : la photo des états, fichiers tels que sur le disque.
     verify <out> [--base-rev HEAD] : dans chaque état (toutes les destinations),
     la même page photographiée trois fois dans la même tâche : la feuille servie
     (le disque), puis le texte de --base-rev, puis à nouveau le texte du disque,
     ces deux-là en <style> au rang du <link>. Les trois photos doivent être
     identiques. */
  const out = argv[1];
  if (!out || out.startsWith('--')) { console.error(cmd + ' <out.json.gz>'); process.exit(2); }
  const rev = opt('base-rev', 'HEAD');
  const { execFileSync } = await import('node:child_process');
  const pairs = cmd === 'verify' ? FILES.map((rel) => ({ rel, old: execFileSync('git', ['show', `${rev}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }), cur: fs.readFileSync(path.join(ROOT, rel), 'utf8') })) : [];
  const { server, base } = await startServer();
  const browser = await launch();
  const strings = []; const sid = new Map();
  const intern = (s) => { let i = sid.get(s); if (i == null) { i = strings.length; strings.push(s); sid.set(s, i); } return i; };
  const states = {};
  const cfgFilter = opt('configs', '');
  const configs = CONFIGS.filter((c) => !cfgFilter || cfgFilter.split(',').includes(c.id));
  let next = 0, bad = 0, lines = 0;
  const worker = async () => {
    while (next < configs.length) {
      const cfg = configs[next++];
      const { ctx, page } = await openDashboard(browser, base, cfg);
      if (cmd === 'verify') {
        await page.evaluate(`window.__ciaSK = (${selectorKit.toString()})();`);
        await page.evaluate(`(${pageRuntime.toString()})();`);
        await page.evaluate(`window.__ciaFull = ${fullRowsInPage.toString()};`);
        await page.evaluate((pairs) => { for (const f of pairs) window.__cia.files[f.rel] = { href: '', text: f.cur, old: f.old, cands: {}, style: null }; }, pairs);
      }
      const pages = has('all-pages') || cmd === 'verify' ? await pageList(page) : KEY_PAGES;
      for (const p of pages) {
        if (!(await goPage(page, p))) continue;
        const id = `${cfg.id}/${p}`;
        if (cmd === 'snapshot') {
          const rows = await page.evaluate(fullRowsInPage, FULL_PROPS);
          states[id] = { rows: rows.map((r) => r.map(intern)) };
          lines += rows.length;
          log(`  · ${id} · ${rows.length} lignes`);
          continue;
        }
        const r = await page.evaluate((props) => {
          const W = window.__cia;
          const served = window.__ciaFull(props);
          W.swapLinks();
          const set = (which) => {
            for (const [rel, f] of Object.entries(W.files)) {
              if (!f.style || !f.style.isConnected) continue;
              const keep = f.text;
              if (which === 'old') f.text = f.old;
              f.style.textContent = W.build(rel, []);
              f.text = keep;
            }
          };
          set('old'); W.settle();
          const old = window.__ciaFull(props);
          set('cur'); W.settle();
          const cur = window.__ciaFull(props);
          return { served, old, cur };
        }, FULL_PROPS);
        const swap = rowsDiff(r.served, r.cur, FULL_PROPS);
        const change = rowsDiff(r.old, r.cur, FULL_PROPS);
        states[id] = { rows: r.cur.map((x) => x.map(intern)), swap, change };
        lines += r.cur.length;
        if (swap.length || change.length) { bad++; log(`  ✗ ${id}\n      ${[...swap.map((x) => 'link→style ' + x), ...change.map((x) => 'base→disque ' + x)].join('\n      ')}`); }
        else log(`  ✓ ${id} · ${r.cur.length} lignes identiques`);
      }
      await ctx.close();
    }
  };
  try { await Promise.all(Array.from({ length: Math.min(JOBS, configs.length) }, worker)); }
  finally { await browser.close().catch(() => {}); server.close(); }
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ props: FULL_PROPS, strings, states })));
  log(`${cmd} · ${Object.keys(states).length} états, ${lines} lignes (éléments et pseudo-éléments) → ${out}` + (cmd === 'verify' ? ` · ${bad ? bad + ' état(s) différent(s)' : 'base et disque identiques partout'}` : ''));
  process.exit(bad ? 1 : 0);
}

/* ── apply <report.json> [--except id,id] : écrit les retraits retenus d'un
   rapport d'audit (les identifiants supposent les fichiers inchangés depuis). */
if (cmd === 'apply') {
  const rep = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const except = new Set((opt('except', '') || '').split(',').filter(Boolean));
  const ok = new Set(rep.accepted.map((a) => a.id).filter((id) => !except.has(id)));
  for (const f of loadFiles()) {
    const acc = f.cands.filter((c) => ok.has(c.id));
    for (const a of rep.accepted.filter((x) => x.id.startsWith(f.rel + ':'))) {
      const c = f.cands.find((x) => x.id === a.id);
      if (!c || c.line !== a.line || c.prop !== a.prop) { console.error(`${a.id} ne correspond plus au fichier : relancer l'audit`); process.exit(2); }
    }
    if (!acc.length) continue;
    fs.writeFileSync(path.join(ROOT, f.rel), removeBangs(f.text, acc));
    log(`  écrit ${f.rel} (−${acc.length})`);
  }
  process.exit(0);
}

/* ── audit ────────────────────────────────────────────────────────────────── */
if (cmd !== 'audit') { console.error('commande inconnue : ' + cmd); process.exit(2); }

const files = loadFiles();
const all = files.flatMap((f) => f.cands);
const byId = new Map(all.map((c) => [c.id, c]));
const C = {
  rules: Object.fromEntries(files.map((f) => [f.rel, f.rules.map((r) => ({ idx: r.idx, selector: r.selector }))])),
  cands: all.filter((c) => c.kind === 'style' && c.bang).map((c) => ({ id: c.id, rel: c.rel, rule: c.rule, prop: c.prop })),
};
/* Écartés d'avance : hors règle de style simple, préfixés, écrasés dans leur bloc. */
const pre = new Map();
for (const c of all) {
  if (c.kind !== 'style') pre.set(c.id, 'hors règle de style (' + c.kind + ')');
  else if (isVendor(c)) pre.set(c.id, 'préfixe propriétaire');
  else if (c.shadowedInBlock) pre.set(c.id, 'écrasé plus bas dans la même règle');
  else if (c.vendorTwin) pre.set(c.id, 'jumeau préfixé !important dans la même règle');
  /* `[hidden] { display: none !important }` est un garde-fou : il doit gagner
     contre toute règle d'affichage qu'un état futur poserait. */
  else if (/\[(hidden|aria-hidden)/.test(c.selector)) pre.set(c.id, 'garde-fou [hidden]');
}
/* Ce que les états ont appris de chaque candidat. */
const info = new Map(all.map((c) => [c.id, { partsSeen: null, live: false, aligned: false, contest: '', states: 0, dyn: '' }]));
const ACC = new Set();   // retenus (provisoirement, jusqu'au point fixe)
const REJ = new Map();   // id -> raison
let tests = 0;
const alignSeen = new Set();
const t0 = Date.now();

const { server, base } = await startServer();
const browser = await launch();
const cfgFilter = opt('configs', '');
const configs = CONFIGS.filter((c) => !cfgFilter || cfgFilter.split(',').includes(c.id));
const payload = payloadOf(files);

/* Les longhands et les pseudo-éléments d'un lot, calculés dans la page. */
async function lotSpec(page, ids) {
  const props = await page.evaluate((list) => [...new Set(list.flatMap((p) => window.__cia.expand(p)))], [...new Set(ids.map((id) => byId.get(id).prop))]);
  const pseudo = [];
  for (const id of ids) {
    const c = byId.get(id);
    for (const part of SK.splitTop(c.selector, ',')) { const { base: b, pe } = SK.splitPE(part); if (pe === 'before' || pe === 'after') pseudo.push([b, pe]); }
  }
  return { props, pseudo };
}
const group = (ids) => { const g = {}; for (const id of ids) { const c = byId.get(id); (g[c.rel] = g[c.rel] || []).push(id); } return g; };
async function runTest(page, h1ids, h0ids, lotIds) {
  tests++;
  const { props, pseudo } = await lotSpec(page, lotIds);
  const h1 = group(h1ids), h0 = group(h0ids);
  for (const rel of Object.keys(h0)) if (!h1[rel]) h1[rel] = h0[rel];
  for (const rel of Object.keys(h1)) if (!h0[rel]) h0[rel] = [];
  return page.evaluate((h1, h0, props, pseudo) => window.__cia.test(h1, h0, props, pseudo), h1, h0, props, pseudo);
}
/* Bissection incrémentale : base = retraits déjà vérifiés dans cet état. */
async function bisect(page, stateId, items, baseIds, onReject) {
  const verified = [];
  const lots = [];
  /* D'abord par règle (les !important d'un même bloc tombent souvent
     ensemble), puis un à un. */
  const byRule = new Map();
  for (const id of items) { const c = byId.get(id); const k = c.rel + '#' + c.rule; if (!byRule.has(k)) byRule.set(k, []); byRule.get(k).push(id); }
  const ruleLots = [...byRule.values()];
  const tryLot = async (ids) => {
    const b = [...baseIds(), ...verified];
    const d = await runTest(page, [...b, ...ids], b, ids);
    if (!d) { verified.push(...ids); return; }
    if (ids.length === 1) { onReject(ids[0], `${stateId} · ${d}`); return; }
    const mid = ids.length >> 1;
    await tryLot(ids.slice(0, mid));
    await tryLot(ids.slice(mid));
  };
  /* Un premier essai d'un seul tenant : dans la plupart des états, tout passe. */
  const whole = items;
  if (whole.length) {
    const b = baseIds();
    const d = await runTest(page, [...b, ...whole], b, whole);
    if (!d) return whole;
    for (const lot of ruleLots) await tryLot(lot);
  }
  void lots;
  return verified;
}

async function visitStates(pass, handler) {
  let next = 0;
  const visitConfig = async (cfg) => {
    let ctx, page;
    try {
      ({ ctx, page } = await openDashboard(browser, base, cfg));
      await installRuntime(page, payload);
      const pages = await pageList(page);
      for (const p of pages) {
        if (!(await goPage(page, p))) continue;
        const stateId = `${cfg.id}/${p}`;
        /* Le remplacement link → style ne doit rien changer, et la mesure doit
           être stable ; sinon l'état ne prouve rien, et ses candidats actifs
           sont refusés. */
        const swapped = await page.evaluate(() => window.__cia.files && Object.values(window.__cia.files).some((f) => f.style && f.style.isConnected));
        let bad = '';
        if (!swapped || pass === 1) {
          const sw = await page.evaluate((props) => window.__cia.swapChecked(props), FULL_PROPS);
          if (sw.diff) { bad = sw.diff; log(`  ✗ ${stateId} : remplacement link → style ou mesure non fiable (${sw.diff})`); }
          else if (!swapped) log(`  ${stateId} · link → style sans effet (${sw.done.join(', ')}) · ${sw.n} éléments`);
        }
        const present = await page.evaluate(() => Object.entries(window.__cia.files).filter(([, f]) => f.style && f.style.isConnected).map(([rel]) => rel));
        const noContest = C.cands.filter((c) => pre.has(c.id) || REJ.has(c.id) || info.get(c.id).contest).map((c) => c.id);
        const Cp = { rules: Object.fromEntries(Object.entries(C.rules).filter(([rel]) => present.includes(rel))), cands: C.cands.filter((c) => present.includes(c.rel)), noContest };
        const an = await page.evaluate((C) => window.__cia.analyze(C), Cp);
        for (const m of an.alignMiss) if (!alignSeen.has(m)) { alignSeen.add(m); log(`    ! règle non alignée : ${m}`); }
        const active = [];
        for (const [id, o] of Object.entries(an.result)) {
          const inf = info.get(id);
          inf.aligned = inf.aligned || o.aligned;
          inf.live = inf.live || o.live;
          if (!inf.partsSeen) inf.partsSeen = o.parts.map(() => 0);
          o.parts.forEach((p, k) => { if (p.n) inf.partsSeen[k] = (inf.partsSeen[k] || 0) + 1; if (p.st !== 'ok' && p.st !== 'invalid') inf.dyn = inf.dyn || p.st; if (p.st === 'invalid') inf.dyn = inf.dyn || 'sélecteur refusé'; });
          if (o.contest && !inf.contest) inf.contest = `${stateId} · ${o.contest}`;
          if (o.els) { inf.states++; active.push(id); }
        }
        if (bad) { for (const id of active) reject(id, `${stateId} · état non mesurable (${bad})`); continue; }
        await handler(page, stateId, active);
      }
    } finally { if (ctx) await ctx.close().catch(() => {}); }
  };
  const worker = async () => {
    while (next < configs.length) {
      const cfg = configs[next++];
      try { await visitConfig(cfg); }
      catch (err) {
        console.error(`  ✗ ${cfg.id} : ${err && err.message || err} · second essai`);
        await visitConfig(cfg);   // un second échec arrête tout : un état non visité ne prouve rien
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, configs.length) }, worker));
}
const eligibleNow = (id) => !pre.has(id) && !REJ.has(id) && !info.get(id).contest;
const reject = (id, why) => { if (!REJ.has(id)) REJ.set(id, why); ACC.delete(id); };

try {
  /* Passe 1 : chaque état éprouve ses candidats actifs, retraits retenus cumulés. */
  log(`audit · ${FILES.join(', ')} · ${all.length} déclarations !important · ${configs.length} configurations`);
  await visitStates(1, async (page, stateId, active) => {
    const verifiedHere = new Set();
    for (let round = 0; round < 4; round++) {
      const pending = active.filter((id) => eligibleNow(id) && !verifiedHere.has(id));
      if (!pending.length) break;
      const activeSet = new Set(active);
      const baseIds = () => [...[...ACC].filter((id) => !activeSet.has(id)), ...verifiedHere];
      const ok = await bisect(page, stateId, pending, baseIds, reject);
      for (const id of ok) { verifiedHere.add(id); if (eligibleNow(id)) ACC.add(id); }
    }
    log(`  ${stateId} · ${active.length} actifs · retenus ${ACC.size} · rejetés ${REJ.size} · ${tests} essais · ${Math.round((Date.now() - t0) / 1000)} s`);
  });
  /* Ce que l'ensemble des états n'a pas exercé ne se prouve pas. */
  const unexercised = new Map();
  // A matched root blocked by a potential competitor is exercised, but unsafe.
  const guarded = new Map();
  for (const c of all) {
    if (pre.has(c.id)) continue;
    const inf = info.get(c.id);
    let why = '';
    if (!inf.aligned) why = 'règle introuvable dans le CSSOM de Chromium';
    else if (!inf.live) why = 'déclaration ignorée par Chromium';
    else if (inf.dyn) why = 'sélecteur à état (' + inf.dyn + ')';
    else if (!inf.partsSeen || inf.partsSeen.some((n) => !n)) why = 'un sélecteur de la liste ne trouve aucun élément';
    else if (inf.contest) { guarded.set(c.id, inf.contest); ACC.delete(c.id); }
    if (why) { unexercised.set(c.id, why); ACC.delete(c.id); }
  }
  /* Passes de vérification : tout ACC d'un seul tenant contre le texte
     d'origine, dans chaque état, jusqu'au point fixe. */
  for (let pass = 2; pass < 8; pass++) {
    const before = REJ.size;
    await visitStates(pass, async (page, stateId, active) => {
      const activeSet = new Set(active);
      const S = [...ACC].filter((id) => activeSet.has(id));
      if (!S.length) return;
      const d = await runTest(page, [...ACC], [], S);
      if (!d) return;
      log(`    ${stateId} · l'ensemble change la page (${d}) : bissection`);
      await bisect(page, stateId, S, () => [...ACC].filter((id) => !activeSet.has(id)), reject);
    });
    log(`passe ${pass} · retenus ${ACC.size} · rejetés ${REJ.size} · ${tests} essais · ${Math.round((Date.now() - t0) / 1000)} s`);
    if (REJ.size === before) break;
  }
  /* Le rapport. */
  const per = {};
  for (const f of files) {
    const total = (f.text.match(/!important/g) || []).length;
    const acc = f.cands.filter((c) => ACC.has(c.id));
    per[f.rel] = { before: total, after: total - acc.length, removed: acc.length,
      rejected: f.cands.filter((c) => REJ.has(c.id)).length,
      unexercised: f.cands.filter((c) => unexercised.has(c.id)).length,
      guarded: f.cands.filter((c) => guarded.has(c.id)).length,
      excluded: f.cands.filter((c) => pre.has(c.id)).length };
  }
  log('\nrésultat :');
  for (const [rel, p] of Object.entries(per)) log(`  ${rel} · ${p.before} → ${p.after} (retirés ${p.removed} · rejetés à la mesure ${p.rejected} · concurrents potentiels ${p.guarded} · non exercés ${p.unexercised} · écartés d'avance ${p.excluded})`);
  log(`  ${tests} essais en ${Math.round((Date.now() - t0) / 1000)} s`);
  const report = opt('report', '');
  if (report) {
    const row = (c, why) => ({ id: c.id, line: c.line, prop: c.prop, selector: c.selector.slice(0, 200), why });
    fs.writeFileSync(report, JSON.stringify({
      per, tests, configs: configs.map((c) => c.id),
      accepted: all.filter((c) => ACC.has(c.id)).map((c) => row(c, '')),
      rejected: all.filter((c) => REJ.has(c.id)).map((c) => row(c, REJ.get(c.id))),
      unexercised: all.filter((c) => unexercised.has(c.id)).map((c) => row(c, unexercised.get(c.id))),
      guarded: all.filter((c) => guarded.has(c.id)).map((c) => row(c, guarded.get(c.id))),
      coverage: Object.fromEntries([...info].map(([id, inf]) => [id, { partsSeen: inf.partsSeen, states: inf.states }])),
      excluded: all.filter((c) => pre.has(c.id)).map((c) => row(c, pre.get(c.id))),
    }, null, 1));
    log(`  détail → ${report}`);
  }
  if (has('write')) {
    for (const f of files) {
      const acc = f.cands.filter((c) => ACC.has(c.id));
      if (!acc.length) continue;
      fs.writeFileSync(path.join(ROOT, f.rel), removeBangs(f.text, acc));
      log(`  écrit ${f.rel} (−${acc.length})`);
    }
  }
} finally {
  await browser.close().catch(() => {});
  server.close();
}
