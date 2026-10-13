#!/usr/bin/env node
/* Kiwi · font-cmap-dump.mjs — les caractères qu'une fonte sait dessiner.
 *
 * docs/specs/kiwi-design-2027.md §6.3 (revision 15, M3) : font-coverage-test ne
 * peut pas supposer qu'une face `local()` (Arial, dans « Inter Tight Fallback »)
 * couvre toute sa plage déclarée. Elle ne dessine que ce que la fonte de la
 * plateforme contient, et le seul moyen de le savoir est de lire la table `cmap`
 * du fichier réel. Ce script le fait, avec les seuls modules intégrés de Node :
 *
 *   · il lit un .ttf / .otf / .woff2 (le WOFF2 par le flux Brotli de zlib) et
 *     renvoie l'ensemble de ses points de code (formats cmap 0, 4, 6, 12) ;
 *   · il liste les caractéristiques OpenType de la table GSUB (tnum, zero, …) ;
 *   · en ligne de commande, il écrit tools/fonts/local-faces.json : pour chaque
 *     plateforme, le cmap de la vraie fonte que chaque source local() nomme.
 *
 *   node tools/font-cmap-dump.mjs --list              ce que cette machine peut capturer
 *   node tools/font-cmap-dump.mjs --write             capture et fusionne dans local-faces.json
 *   node tools/font-cmap-dump.mjs <fichier> [--features]   dump d'un fichier
 *
 * Règles de capture (§6.3) : macOS depuis /System/Library/Fonts/Supplemental/Arial.ttf ;
 * iOS depuis System/Library/Fonts/WebFonts/Arial.ttf du runtime du simulateur ;
 * Windows depuis C:\Windows\Fonts\arial.ttf, à capturer UNE fois sur une machine
 * Windows et à committer ; Android : « pas d'Arial ». UNE PLATEFORME SANS CAPTURE
 * COMPTE LA FACE COMME NE COUVRANT RIEN, JAMAIS TOUT : --write ne devine donc
 * jamais une plateforme qu'il ne peut pas lire, il laisse son entrée telle quelle.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_FACES = path.join(HERE, 'fonts', 'local-faces.json');

/* ── tables WOFF2 ─────────────────────────────────────────────────────── */
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC',
  'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function readBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[pos.i++];
    if (i === 0 && b === 0x80) throw new Error('WOFF2 : UIntBase128 avec zéro de tête');
    if (value > 0x1fffffff) throw new Error('WOFF2 : UIntBase128 hors limites');
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) return value >>> 0;
  }
  throw new Error('WOFF2 : UIntBase128 trop long');
}

/* → Map tag → Buffer des tables NON transformées d'un WOFF2 (glyf et loca, que le
   format transforme, sont exposées telles quelles : on n'en lit pas le contenu). */
function woff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('pas un WOFF2');
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  const pos = { i: 48 };
  const dir = [];
  for (let t = 0; t < numTables; t++) {
    const flags = buf[pos.i++];
    const tagIndex = flags & 0x3f;
    const version = flags >> 6;
    let tag;
    if (tagIndex === 63) { tag = buf.toString('latin1', pos.i, pos.i + 4); pos.i += 4; } else tag = KNOWN_TAGS[tagIndex];
    const origLength = readBase128(buf, pos);
    /* glyf et loca sont transformés quand version vaut 0 ; toutes les autres
       tables le sont quand version ≠ 0 (hmtx : 1). */
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    const length = transformed ? readBase128(buf, pos) : origLength;
    dir.push({ tag, length, transformed });
  }
  const raw = zlib.brotliDecompressSync(buf.subarray(pos.i, pos.i + compressedSize));
  const out = new Map();
  let off = 0;
  for (const d of dir) { out.set(d.tag, d.transformed ? null : raw.subarray(off, off + d.length)); off += d.length; }
  return out;
}

/* → Map tag → Buffer pour un sfnt (ttf/otf) ; un .ttc prend sa première fonte. */
function sfntTables(buf) {
  let base = 0;
  if (buf.toString('latin1', 0, 4) === 'ttcf') base = buf.readUInt32BE(12);
  const num = buf.readUInt16BE(base + 4);
  const out = new Map();
  for (let i = 0; i < num; i++) {
    const rec = base + 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    const off = buf.readUInt32BE(rec + 8), len = buf.readUInt32BE(rec + 12);
    out.set(tag, buf.subarray(off, off + len));
  }
  return out;
}

export function fontTables(buf) {
  const sig = buf.toString('latin1', 0, 4);
  if (sig === 'wOF2') return woff2Tables(buf);
  if (sig === 'wOFF') throw new Error('WOFF 1 non pris en charge (aucune fonte du dépôt n\'en est une)');
  return sfntTables(buf);
}

/* ── cmap ─────────────────────────────────────────────────────────────── */
function parseCmapSubtable(t, o, into) {
  const format = t.readUInt16BE(o);
  if (format === 0) {
    for (let c = 0; c < 256; c++) if (t[o + 6 + c]) into.add(c);
  } else if (format === 4) {
    const segX2 = t.readUInt16BE(o + 6);
    const seg = segX2 / 2;
    const endO = o + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    for (let s = 0; s < seg; s++) {
      const end = t.readUInt16BE(endO + s * 2), start = t.readUInt16BE(startO + s * 2);
      const delta = t.readInt16BE(deltaO + s * 2), ro = t.readUInt16BE(rangeO + s * 2);
      if (start === 0xffff && end === 0xffff) continue;
      for (let c = start; c <= end; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          const gp = rangeO + s * 2 + ro + (c - start) * 2;
          if (gp + 2 > t.length) continue;
          g = t.readUInt16BE(gp);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) into.add(c);
      }
    }
  } else if (format === 6) {
    const first = t.readUInt16BE(o + 6), count = t.readUInt16BE(o + 8);
    for (let i = 0; i < count; i++) if (t.readUInt16BE(o + 10 + i * 2)) into.add(first + i);
  } else if (format === 12 || format === 13) {
    const n = t.readUInt32BE(o + 12);
    for (let g = 0; g < n; g++) {
      const p = o + 16 + g * 12;
      const s = t.readUInt32BE(p), e = t.readUInt32BE(p + 4), gid = t.readUInt32BE(p + 8);
      if (e - s > 0x110000) continue;
      for (let c = s; c <= e; c++) if (format === 13 || gid + (c - s) !== 0) into.add(c);
    }
  }
}

/* → Set de points de code que la fonte dessine (sous-tables Unicode seulement). */
export function cmapOf(buf) {
  const tables = fontTables(buf);
  const t = tables.get('cmap');
  if (!t) throw new Error('aucune table cmap');
  const n = t.readUInt16BE(2);
  const out = new Set();
  let used = 0;
  for (let i = 0; i < n; i++) {
    const platform = t.readUInt16BE(4 + i * 8), enc = t.readUInt16BE(6 + i * 8), off = t.readUInt32BE(8 + i * 8);
    const unicode = platform === 0 || (platform === 3 && (enc === 1 || enc === 10));
    if (!unicode) continue;
    parseCmapSubtable(t, off, out);
    used++;
  }
  if (!used) throw new Error('aucune sous-table cmap Unicode');
  return out;
}

/* → tags de caractéristiques de la table GSUB (['tnum', 'liga', …]) ; [] sans GSUB. */
export function gsubFeatures(buf) {
  const g = fontTables(buf).get('GSUB');
  if (!g) return [];
  const fl = g.readUInt16BE(6);
  const n = g.readUInt16BE(fl);
  const tags = new Set();
  for (let i = 0; i < n; i++) tags.add(g.toString('latin1', fl + 2 + i * 6, fl + 6 + i * 6));
  return [...tags].sort();
}

/* ── plages ───────────────────────────────────────────────────────────── */
/* Set → « 20-7E,A0,… » (hex, sans U+), trié : le format compact de local-faces.json. */
export function toRanges(set) {
  const a = [...set].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < a.length;) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(i === j ? a[i].toString(16).toUpperCase() : `${a[i].toString(16).toUpperCase()}-${a[j].toString(16).toUpperCase()}`);
    i = j + 1;
  }
  return out.join(',');
}
export function fromRanges(text) {
  const out = new Set();
  for (const part of String(text).split(',').filter(Boolean)) {
    const [s, e] = part.split('-');
    const a = parseInt(s, 16), b = e === undefined ? a : parseInt(e, 16);
    for (let c = a; c <= b; c++) out.add(c);
  }
  return out;
}

/* ── capture ──────────────────────────────────────────────────────────── */
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

function findIosArial() {
  /* Le runtime du simulateur iOS : …/RuntimeRoot/System/Library/Fonts/WebFonts/Arial.ttf.
     Sans Xcode, ou sans runtime installé, il n'y en a pas : pas de capture. */
  const roots = ['/Library/Developer/CoreSimulator/Volumes', '/Library/Developer/CoreSimulator/Profiles/Runtimes',
    path.join(os.homedir(), 'Library/Developer/CoreSimulator/Profiles/Runtimes')];
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'WebFonts' && fs.existsSync(path.join(p, 'Arial.ttf'))) hits.push(path.join(p, 'Arial.ttf'));
        else if (!/^(?:Applications|Frameworks|PrivateFrameworks|usr|bin|sbin|private|Library)$/.test(e.name) || depth < 4) walk(p, depth + 1);
      }
    }
  };
  for (const r of roots) walk(r, 0);
  if (!hits.length) {
    try {
      const out = execFileSync('xcrun', ['simctl', 'runtime', 'list', '-j'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const rt of Object.values(JSON.parse(out))) {
        const base = rt && (rt.runtimeBundlePath || rt.path);
        if (!base) continue;
        const p = path.join(base, 'Contents/Resources/RuntimeRoot/System/Library/Fonts/WebFonts/Arial.ttf');
        if (fs.existsSync(p)) hits.push(p);
      }
    } catch (_) { /* pas de simctl */ }
  }
  return hits.sort().pop() || null;
}

/* Les sources local() que les faces du kit nomment, par plateforme. */
export const CAPTURES = {
  macos: { Arial: () => '/System/Library/Fonts/Supplemental/Arial.ttf' },
  ios: { Arial: findIosArial },
  windows: { Arial: () => 'C:\\Windows\\Fonts\\arial.ttf' },
  android: {},                       // « pas d'Arial » : rien à lire, et c'est une capture
};

export function capture(platform, name) {
  const finder = CAPTURES[platform] && CAPTURES[platform][name];
  const file = finder ? finder() : null;
  if (!file || !fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const cmap = cmapOf(buf);
  /* Le chemin d'un runtime de simulateur contient un identifiant de volume propre
     à la machine : on garde le nom du runtime et le chemin dans sa racine. */
  const sim = file.match(/([^/]*\.simruntime)\/.*?(RuntimeRoot\/.*)$/);
  const source = sim ? `${sim[1]}/…/${sim[2]}` : file.replace(os.homedir(), '~');
  return { source, sha256: sha(buf), codepoints: cmap.size, cmap: toRanges(cmap) };
}

export function readLocalFaces() {
  try { return JSON.parse(fs.readFileSync(LOCAL_FACES, 'utf8')); } catch (_) { return null; }
}

/* ── CLI ──────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  if (file) {
    const buf = fs.readFileSync(file);
    const cm = cmapOf(buf);
    console.log(`${file}: ${cm.size} code points`);
    console.log(toRanges(cm));
    if (argv.includes('--features')) console.log('GSUB: ' + (gsubFeatures(buf).join(' ') || '(aucune)'));
  } else if (argv.includes('--list') || argv.includes('--write')) {
    const existing = readLocalFaces() || { note: '', platforms: {} };
    const next = JSON.parse(JSON.stringify(existing));
    next.note = 'Capturé par tools/font-cmap-dump.mjs depuis les vraies fontes ; une plateforme sans capture compte la face comme ne couvrant rien (docs/specs/kiwi-design-2027.md §6.3).';
    next.platforms = next.platforms || {};
    for (const platform of Object.keys(CAPTURES)) {
      const entry = next.platforms[platform] || { captured: false, faces: {} };
      if (platform === 'android') { entry.captured = true; entry.faces = { Arial: null }; next.platforms[platform] = entry; console.log('android  : « pas d\'Arial » (capture par définition)'); continue; }
      let got = 0;
      for (const name of Object.keys(CAPTURES[platform])) {
        const c = capture(platform, name);
        if (c) { entry.faces[name] = c; got++; console.log(`${platform.padEnd(8)} : ${name} ← ${c.source} (${c.codepoints} points de code)`); }
        else console.log(`${platform.padEnd(8)} : ${name} illisible sur cette machine${entry.faces[name] ? ' ; la capture committée est gardée' : ' ; non capturée'}`);
      }
      entry.captured = Object.keys(CAPTURES[platform]).every((n) => entry.faces[n]);
      next.platforms[platform] = entry;
    }
    if (argv.includes('--write')) {
      fs.mkdirSync(path.dirname(LOCAL_FACES), { recursive: true });
      fs.writeFileSync(LOCAL_FACES, JSON.stringify(next, null, 1) + '\n');
      console.log(`écrit ${path.relative(path.join(HERE, '..'), LOCAL_FACES)}`);
    }
  } else {
    console.error('usage : node tools/font-cmap-dump.mjs <fichier> [--features] | --list | --write');
    process.exit(2);
  }
}
