// Self-hosted fonts for the compiled landing (design 2027 §6.1, §6.5).
//
// The Next.js export shipped `@import "https://fonts.googleapis.com/css2?..."`
// at the top of its stylesheet: a render-blocking third-party chain, Arabic
// fetched twice (Google and assets/fonts) and every visitor's address sent to
// Google. This step removes that import and declares Inter Tight from the
// files already in assets/fonts/. IBM Plex Sans Arabic comes from
// assets/fonts/legacy-faces.css, which every landing page links after the
// Next sheet (400, 500, 600; a 200/300 request takes 400, a 700 takes 600).
//
// /_next/static is served `immutable` for a year, so a changed stylesheet MUST
// get a new file name: it is renamed with a content hash (the way the pricing
// chunk is) and every page and .txt flight file that names the old file is
// rewritten. The step is idempotent: run again over its own output it changes
// nothing. `node tools/landing-fonts.mjs` runs it alone.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const GOOGLE_IMPORT = /@import\s+(?:url\()?["']https:\/\/fonts\.googleapis\.com\/[^"']*["']\)?\s*;?\s*/g;
export const FACES_MARK = '/* kiwi self-hosted Inter Tight */';
// Same declarations as assets/kit/tokens-2027.css: variable 100 to 900, the
// latin-ext subset before latin, each with its unicode-range. Absolute URLs:
// the chunk lives in /_next/static/chunks/.
export const FACES = FACES_MARK + '\n'
  + '@font-face{font-family:"Inter Tight";src:url("/assets/fonts/inter-tight-latin-ext.woff2?v=1") format("woff2");font-weight:100 900;font-style:normal;font-display:swap;unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}\n'
  + '@font-face{font-family:"Inter Tight";src:url("/assets/fonts/inter-tight-latin.woff2?v=1") format("woff2");font-weight:100 900;font-style:normal;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n';

export function selfHostFonts(root = '.') {
  const dir = path.join(root, '_next/static/chunks');
  const renames = [];
  for (const old of fs.readdirSync(dir).filter(n => /^[0-9a-z]+(?:-[0-9a-f]{8})?\.css$/.test(n))) {
    const file = path.join(dir, old);
    let css = fs.readFileSync(file, 'utf8');
    if (!css.includes('fonts.googleapis.com') && !css.includes(FACES_MARK)) continue;
    css = css.replace(GOOGLE_IMPORT, '');
    if (!css.includes(FACES_MARK)) css = FACES + css;
    const base = old.replace(/-[0-9a-f]{8}\.css$/, '.css').replace(/\.css$/, '');
    const name = base + '-' + createHash('sha256').update(css).digest('hex').slice(0, 8) + '.css';
    fs.writeFileSync(file, css);
    if (name !== old) {
      fs.renameSync(file, path.join(dir, name));
      renames.push([old, name]);
    }
  }
  const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => {
    const rel = d === '.' ? e.name : d + '/' + e.name;
    if (e.isDirectory()) return ['_next', 'node_modules', '.git', 'assets', 'docs', 'tools', 'app', 'graphify-out', 'functions', 'guides'].includes(e.name) ? [] : walk(rel);
    return /\.(html|txt)$/.test(e.name) ? [rel] : [];
  });
  for (const rel of walk('.')) {
    const file = path.join(root, rel);
    const text = fs.readFileSync(file, 'utf8');
    let next = text;
    for (const [old, name] of renames) next = next.replaceAll(old, name);
    // Locales rebuilt from the first snapshot name the bare sheet again; point
    // them at the sheet that carries the four-plan pricing grid.
    next = next.replace(/_next\/static\/chunks\/([0-9a-z]+)\.css/g, (whole, base) => {
      if (fs.existsSync(path.join(dir, base + '.css'))) return whole;
      const sheets = fs.readdirSync(dir).filter(n => n.startsWith(base + '-') && n.endsWith('.css'));
      const pick = sheets.find(n => fs.readFileSync(path.join(dir, n), 'utf8').includes('kw-pricing-grid')) || sheets[0];
      return pick ? '_next/static/chunks/' + pick : whole;
    });
    if (next !== text) fs.writeFileSync(file, next);
  }
  return renames;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const renames = selfHostFonts('.');
  for (const [a, b] of renames) console.log(`${a} -> ${b}`);
  if (!renames.length) console.log('landing-fonts: already self-hosted');
}
