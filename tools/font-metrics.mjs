#!/usr/bin/env node
/* Kiwi · font-metrics.mjs : read the shipped faces, re-derive the fallback face.
 *
 * Design 2027, §6.1: "Inter Tight Fallback" is declared with
 *   size-adjust 97.0%, ascent-override 99.9%, descent-override 24.9%,
 *   line-gap-override 0%
 * and the spec says those numbers were "measured from the bundled woff2's
 * `hhea` and `hmtx` tables against Arial". This tool is that measurement, so
 * nobody has to trust a number someone typed: it reads the woff2 itself (zero
 * dependencies, Node's built-in Brotli), derives the four descriptors, and
 * prints them next to the spec's. It also answers the questions §6.1 and §6.3
 * answer from fontTools (which code points a face holds, which OpenType
 * features it has, how wide a string is) so the tests that care
 * (label-fit-test, font-metrics-test) do not need Python.
 *
 *   node tools/font-metrics.mjs                 report on the shipped faces
 *   node tools/font-metrics.mjs --json          the same, machine-readable
 *   node tools/font-metrics.mjs --check         exit 1 when a derived number
 *                                               differs from the declared one
 *   node tools/font-metrics.mjs --arial <file>  Arial to compare against
 *                                               (default: macOS' own copy)
 *
 * Where the faces come from. Stage 1 copies them to assets/fonts/ (slice G
 * of the build); until that folder exists the same bytes are read from where
 * they are today: the spec preview's committed copies, then the fontsource
 * packages the app bundles. `locateFaces()` says which it used.
 *
 * Library use: import { loadFont, describeFont, locateFaces, ... } from here.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');

/* ── WOFF2 container (W3C WOFF2 §5) ─────────────────────────────────────── */

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
  'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc',
  'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

function readBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[pos + i];
    if (i === 0 && b === 0x80) throw new Error('woff2: UIntBase128 with a leading zero');
    if (value > 0x01ffffff) throw new Error('woff2: UIntBase128 overflow');
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) return [value >>> 0, pos + i + 1];
  }
  throw new Error('woff2: UIntBase128 longer than five bytes');
}

export function parseWoff2(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('woff2: bad signature');
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);
  const totalCompressed = buf.readUInt32BE(20);
  let pos = 48;
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    let tag;
    if ((flags & 0x3f) === 0x3f) { tag = buf.toString('latin1', pos, pos + 4); pos += 4; }
    else tag = KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    let origLength; [origLength, pos] = readBase128(buf, pos);
    /* glyf and loca are transformed unless the version is 3; hmtx only when it is 1; nothing else is. */
    const transformed = (tag === 'glyf' || tag === 'loca') ? version !== 3 : tag === 'hmtx' ? version === 1 : false;
    let length = origLength;
    if (transformed) [length, pos] = readBase128(buf, pos);
    dir.push({ tag, origLength, length, transformed });
  }
  const raw = zlib.brotliDecompressSync(buf.subarray(pos, pos + totalCompressed));
  const tables = new Map();
  let at = 0;
  for (const t of dir) {
    tables.set(t.tag, { data: raw.subarray(at, at + t.length), transformed: t.transformed, origLength: t.origLength });
    at += t.length;
  }
  return { kind: 'woff2', flavor, tables };
}

export function parseSfnt(buf) {
  const tag = buf.toString('latin1', 0, 4);
  if (tag === 'ttcf') throw new Error('sfnt: font collections are not supported');
  const numTables = buf.readUInt16BE(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const name = buf.toString('latin1', rec, rec + 4);
    const offset = buf.readUInt32BE(rec + 8);
    const length = buf.readUInt32BE(rec + 12);
    tables.set(name, { data: buf.subarray(offset, offset + length), transformed: false, origLength: length });
  }
  return { kind: 'sfnt', flavor: buf.readUInt32BE(0), tables };
}

export function loadFont(file) {
  const buf = fs.readFileSync(file);
  const font = buf.toString('latin1', 0, 4) === 'wOF2' ? parseWoff2(buf) : parseSfnt(buf);
  font.file = file;
  font.bytes = buf.length;
  return font;
}

/* ── Tables ─────────────────────────────────────────────────────────────── */

function need(font, tag) {
  const t = font.tables.get(tag);
  if (!t) throw new Error(`${path.basename(font.file || '?')}: no ${tag} table`);
  return t.data;
}

function readCmap(font) {
  const d = need(font, 'cmap');
  const n = d.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) subs.push({ platform: d.readUInt16BE(4 + i * 8), encoding: d.readUInt16BE(6 + i * 8), offset: d.readUInt32BE(8 + i * 8) });
  /* Prefer the full Unicode table (3,10 / 0,4+), then the BMP one (3,1 / 0,*). */
  const rank = (s) => (s.platform === 3 && s.encoding === 10 ? 0 : s.platform === 0 && s.encoding >= 4 ? 1 : s.platform === 3 && s.encoding === 1 ? 2 : s.platform === 0 ? 3 : 9);
  subs.sort((a, b) => rank(a) - rank(b));
  const map = new Map(); // code point -> glyph id
  const sub = subs.find((s) => rank(s) < 9);
  if (!sub) throw new Error('cmap: no Unicode subtable');
  const o = sub.offset;
  const format = d.readUInt16BE(o);
  if (format === 4) {
    const segX2 = d.readUInt16BE(o + 6);
    const segs = segX2 / 2;
    const endAt = o + 14, startAt = endAt + segX2 + 2, deltaAt = startAt + segX2, rangeAt = deltaAt + segX2;
    for (let s = 0; s < segs; s++) {
      const end = d.readUInt16BE(endAt + s * 2), start = d.readUInt16BE(startAt + s * 2);
      const delta = d.readInt16BE(deltaAt + s * 2), rangeOff = d.readUInt16BE(rangeAt + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (rangeOff === 0) g = (c + delta) & 0xffff;
        else {
          const gAt = rangeAt + s * 2 + rangeOff + (c - start) * 2;
          g = d.readUInt16BE(gAt);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  } else if (format === 12) {
    const groups = d.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const at = o + 16 + g * 12;
      const start = d.readUInt32BE(at), end = d.readUInt32BE(at + 4), first = d.readUInt32BE(at + 8);
      for (let c = start; c <= end; c++) map.set(c, first + (c - start));
    }
  } else throw new Error(`cmap: format ${format} is not supported`);
  return map;
}

function readAdvances(font, numGlyphs, numHMetrics) {
  const t = font.tables.get('hmtx');
  if (!t) throw new Error('no hmtx table');
  const d = t.data;
  const adv = new Array(numGlyphs);
  let pos = 0;
  if (t.transformed) pos = 1; // WOFF2 transformed hmtx: a flags byte, then advanceWidth[numHMetrics] as usual
  for (let g = 0; g < numHMetrics; g++) { adv[g] = d.readUInt16BE(pos); pos += 2 + (t.transformed ? 0 : 2); }
  for (let g = numHMetrics; g < numGlyphs; g++) adv[g] = adv[numHMetrics - 1];
  return adv;
}

function readGsubFeatures(font) {
  const out = new Set();
  const t = font.tables.get('GSUB');
  if (!t) return out;
  const d = t.data;
  const list = d.readUInt16BE(6);
  const n = d.readUInt16BE(list);
  for (let i = 0; i < n; i++) out.add(d.toString('latin1', list + 2 + i * 6, list + 6 + i * 6));
  return out;
}

function readFvar(font) {
  const t = font.tables.get('fvar');
  if (!t) return [];
  const d = t.data;
  const axesAt = d.readUInt16BE(4), count = d.readUInt16BE(8), size = d.readUInt16BE(10);
  const axes = [];
  for (let i = 0; i < count; i++) {
    const at = axesAt + i * size;
    axes.push({ tag: d.toString('latin1', at, at + 4), min: d.readInt32BE(at + 4) / 65536, default: d.readInt32BE(at + 8) / 65536, max: d.readInt32BE(at + 12) / 65536 });
  }
  return axes;
}

/* Everything a caller usually wants, read once. */
export function describeFont(font) {
  const head = need(font, 'head'), hhea = need(font, 'hhea'), maxp = need(font, 'maxp');
  const unitsPerEm = head.readUInt16BE(18);
  const numGlyphs = maxp.readUInt16BE(4);
  const numHMetrics = hhea.readUInt16BE(34);
  const cmap = readCmap(font);
  const advances = readAdvances(font, numGlyphs, numHMetrics);
  const os2 = font.tables.get('OS/2')?.data;
  return {
    file: font.file, bytes: font.bytes, kind: font.kind,
    unitsPerEm, numGlyphs,
    hhea: { ascender: hhea.readInt16BE(4), descender: hhea.readInt16BE(6), lineGap: hhea.readInt16BE(8) },
    os2: os2 ? { typoAscender: os2.readInt16BE(68), typoDescender: os2.readInt16BE(70), typoLineGap: os2.readInt16BE(72), winAscent: os2.readUInt16BE(74), winDescent: os2.readUInt16BE(76), useTypoMetrics: !!(os2.readUInt16BE(62) & 0x80) } : null,
    axes: readFvar(font),
    features: readGsubFeatures(font),
    cmap,
    has: (cp) => cmap.has(cp),
    /* Advance in em for one code point; null when the face has no glyph for it. */
    advance: (cp) => (cmap.has(cp) ? advances[cmap.get(cp)] / unitsPerEm : null),
  };
}

/* ── Widths and averages ────────────────────────────────────────────────── */

/* Sum of advances in em (no kerning, no shaping: the same simplification the
   fallback derivation uses). Characters the face does not hold are returned
   in `missing` and add nothing. */
export function textAdvance(info, text) {
  let em = 0; const missing = [];
  for (const ch of text) {
    const a = info.advance(ch.codePointAt(0));
    if (a == null) missing.push(ch); else em += a;
  }
  return { em, missing };
}

/* §6.1: "average advance 0.4746 em against 0.4895 em over a sample of a
   pangram, digits and French words". The spec does not print the sample, so
   this one is fixed here and the number is reproducible rather than recovered:
   it lands about one point under the spec's 96.96 % (the ratio moves between
   95.7 and 99 % with the text chosen, which is why size-adjust is checked to a
   band and the three overrides, which are exact, to 0.05). Spaces count,
   because they are part of a word's advance. */
export const SAMPLE = [
  'The quick brown fox jumps over the lazy dog',
  '0123456789',
  'Encaisser la commande de la table numéro douze, ajouter une remise, imprimer le reçu et envoyer en cuisine',
  'Réessayez dans quelques minutes, votre caisse est connectée et la journée est ouverte',
].join(' ');

export function averageAdvance(info, text = SAMPLE) {
  let sum = 0, n = 0;
  for (const ch of text) {
    const a = info.advance(ch.codePointAt(0));
    if (a == null) continue;
    sum += a; n++;
  }
  return n ? sum / n : 0;
}

/* The four descriptors of "Inter Tight Fallback" for a face (`target`, the one
   being imitated) laid over another (`base`, the system face, Arial).
   `size-adjust` is measured from the two averages. The three overrides are
   fractions of the font size the browser uses AFTER size-adjust, so they are
   computed at the size-adjust the rule declares (`atSizeAdjust`, in percent),
   defaulting to the measured one. */
export function deriveFallback(target, base, { text = SAMPLE, atSizeAdjust = null } = {}) {
  const measured = averageAdvance(target, text) / averageAdvance(base, text);
  const round1 = (x) => Math.round(x * 10) / 10;
  const sizeAdjust = atSizeAdjust != null ? atSizeAdjust / 100 : round1(measured * 100) / 100;
  const per = (units) => units / target.unitsPerEm / sizeAdjust * 100;
  return {
    targetAverage: averageAdvance(target, text), baseAverage: averageAdvance(base, text),
    measuredSizeAdjust: round1(measured * 100),
    sizeAdjust: round1(sizeAdjust * 100),
    ascentOverride: round1(per(target.hhea.ascender)),
    descentOverride: round1(per(-target.hhea.descender)),
    lineGapOverride: round1(per(target.hhea.lineGap)),
  };
}

/* The declaration in §6.1, copied here so the check has something to compare
   with. It is the spec's number, not a derived one. */
export const DECLARED_FALLBACK = { sizeAdjust: 97.0, ascentOverride: 99.9, descentOverride: 24.9, lineGapOverride: 0 };
/* The measured size-adjust may differ from the declared one by this many points
   (the spec's own sample is not printed); the three overrides must match to 0.05. */
export const SIZE_ADJUST_TOLERANCE = 1.5;

/* Which declared descriptors a derivation (made at the declared size-adjust)
   does not reproduce. Empty means the §6.1 numbers stand. */
export function fallbackProblems(got) {
  const out = [];
  if (Math.abs(got.measuredSizeAdjust - DECLARED_FALLBACK.sizeAdjust) > SIZE_ADJUST_TOLERANCE) out.push('sizeAdjust');
  for (const k of ['ascentOverride', 'descentOverride', 'lineGapOverride']) if (Math.abs(got[k] - DECLARED_FALLBACK[k]) > 0.05) out.push(k);
  return out;
}

/* ── Where the faces are ────────────────────────────────────────────────── */

/* First existing candidate wins. assets/fonts/ is the destination (§6.1, §6.5);
   the others are where the same bytes live today. */
export function locateFaces(root = ROOT) {
  const at = (...p) => path.join(root, ...p);
  const pick = (cands) => cands.find((f) => fs.existsSync(f)) || null;
  const preview = at('docs', 'specs', 'kiwi-design-2027-preview', 'fonts');
  const fsLatin = at('app', 'node_modules', '@fontsource-variable', 'inter-tight', 'files');
  const fsArabic = at('app', 'node_modules', '@fontsource', 'ibm-plex-sans-arabic', 'files');
  const faces = {
    latin: pick([at('assets', 'fonts', 'inter-tight-latin.woff2'), path.join(preview, 'inter-tight-latin.woff2'), path.join(fsLatin, 'inter-tight-latin-wght-normal.woff2')]),
    latinExt: pick([at('assets', 'fonts', 'inter-tight-latin-ext.woff2'), path.join(preview, 'inter-tight-latin-ext.woff2'), path.join(fsLatin, 'inter-tight-latin-ext-wght-normal.woff2')]),
  };
  for (const w of [400, 500, 600, 700]) {
    faces[`arabic${w}`] = pick([at('assets', 'fonts', `plex-arabic-${w}.woff2`), at('assets', 'fonts', `ibm-plex-sans-arabic-${w}.woff2`), path.join(preview, `ibm-plex-sans-arabic-${w}.woff2`), path.join(fsArabic, `ibm-plex-sans-arabic-arabic-${w}-normal.woff2`)]);
  }
  const source = (f) => (!f ? 'missing' : f.includes(`${path.sep}assets${path.sep}fonts${path.sep}`) ? 'assets/fonts' : f.includes('kiwi-design-2027-preview') ? 'docs/specs/kiwi-design-2027-preview/fonts' : 'app/node_modules (fontsource)');
  return { faces, sources: Object.fromEntries(Object.entries(faces).map(([k, f]) => [k, source(f)])) };
}

export function findArial(explicit) {
  const cands = [explicit, process.env.KIWI_ARIAL, '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', 'C:\\Windows\\Fonts\\arial.ttf', '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf'].filter(Boolean);
  return cands.find((f) => fs.existsSync(f)) || null;
}

/* ── CLI ────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json'), check = args.includes('--check');
  const ai = args.indexOf('--arial');
  const { faces, sources } = locateFaces();
  const report = { faces: {}, fallback: null, declared: DECLARED_FALLBACK, arial: null };
  const info = {};
  for (const [k, f] of Object.entries(faces)) {
    if (!f) { report.faces[k] = { source: 'missing' }; continue; }
    const d = describeFont(loadFont(f));
    info[k] = d;
    report.faces[k] = { source: sources[k], file: path.relative(ROOT, f), bytes: d.bytes, unitsPerEm: d.unitsPerEm, glyphs: d.numGlyphs, codePoints: d.cmap.size, hhea: d.hhea, axes: d.axes, features: [...d.features].sort() };
  }
  const arialFile = findArial(ai >= 0 ? args[ai + 1] : null);
  let bad = 0;
  if (info.latin && arialFile) {
    const arial = describeFont(loadFont(arialFile));
    const got = deriveFallback(info.latin, arial, { atSizeAdjust: DECLARED_FALLBACK.sizeAdjust });
    report.arial = arialFile;
    report.fallback = got;
    bad = fallbackProblems(got).length;
  }
  if (json) { console.log(JSON.stringify(report, (k, v) => (v instanceof Set ? [...v] : v), 2)); }
  else {
    for (const [k, v] of Object.entries(report.faces)) console.log(v.source === 'missing' ? `✗ ${k}: not found` : `· ${k.padEnd(10)} ${String(v.bytes).padStart(6)} B  ${v.codePoints} code points  upm ${v.unitsPerEm}  (${v.source})`);
    if (report.fallback) {
      const f = report.fallback;
      console.log(`\nAverage advance over the sample: Inter Tight ${f.targetAverage.toFixed(4)} em, Arial ${f.baseAverage.toFixed(4)} em  (the spec prints 0.4746 and 0.4895 for a sample it does not give)`);
      const off = fallbackProblems(f);
      console.log(`size-adjust      measured ${String(f.measuredSizeAdjust).padStart(5)}   declared ${String(DECLARED_FALLBACK.sizeAdjust).padStart(5)}${off.includes('sizeAdjust') ? '   ← differs' : `   (within ${SIZE_ADJUST_TOLERANCE})`}`);
      for (const k of ['ascentOverride', 'descentOverride', 'lineGapOverride']) console.log(`${k.padEnd(16)} derived  ${String(f[k]).padStart(5)}   declared ${String(DECLARED_FALLBACK[k]).padStart(5)}${off.includes(k) ? '   ← differs' : ''}   (at size-adjust ${DECLARED_FALLBACK.sizeAdjust})`);
    } else console.log('\n○ Arial not found: the fallback descriptors were not re-derived (--arial <file> or KIWI_ARIAL).');
  }
  if (check && bad) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
