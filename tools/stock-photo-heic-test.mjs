#!/usr/bin/env node
/* Scan stock · une photo d'iPhone (HEIC) sur un ordinateur.
 *
 * 20 nov. 2026 : le BL Lahlou Menage de La Maison en Vogue, photo HEIC d'un
 * iPhone récent envoyée depuis Chrome sur Mac, tombait sur une table vide.
 * Chrome ne décode pas le HEIC : img.decode() levait, le scan se repliait sur
 * la saisie manuelle sans rien lire. photo.js reconnaît désormais le conteneur
 * HEIF par sa marque et le décode avec libheif 1.23.5 (vendored, à la demande).
 * heic2any et heic-to, essayés le même jour, refusaient cette photo. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/stock/photo.js'), 'utf8');
let api = null;
const ctx = vm.createContext({ window: { KiwiStockInternal: { install: (n, f) => { api = f(); } } }, TextDecoder, Uint8Array, Promise, Error });
vm.runInContext(src, ctx, { filename: 'assets/stock/photo.js' });
let passed = 0;
const ok = (v, label) => { assert.ok(v, label); passed++; };

const box = (brand) => new Blob([Uint8Array.from([0, 0, 0, 0x34, 0x66, 0x74, 0x79, 0x70, ...Buffer.from(brand), 0, 0, 0, 0])]);
for (const brand of ['heic', 'heix', 'hevc', 'mif1', 'msf1']) ok(await api.stIsHeif(box(brand)) === true, `brand ${brand} is a HEIF container`);
ok(await api.stIsHeif(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])])) === false, 'a JPEG is not HEIF');
ok(await api.stIsHeif(box('avif')) === false, 'AVIF is left to the browser');
ok(await api.stIsHeif(new Blob([])) === false, 'an empty file is not HEIF');

ok(/catch \(e\) \{ if \(!\(await stIsHeif\(src\)\)\) throw e; img = await stHeifCanvas\(src\); \}/.test(src),
  'only a photo the browser cannot open AND that is HEIF goes to libheif; any other failure still reaches the manual fallback');
const m = src.match(/'(\/assets\/vendor\/libheif\/libheif\.min\.js)\?v=\d+'/);
ok(m && fs.existsSync(path.join(ROOT, m[1].slice(1))), 'the decoder the page asks for is vendored');
const lib = fs.readFileSync(path.join(ROOT, 'assets/vendor/libheif/libheif.min.js'), 'utf8');
ok(lib.startsWith('var libheif=') && /libheif = libheif\.default;/.test(lib), 'single-file build: window.libheif() returns the module, wasm inlined');
ok(fs.existsSync(path.join(ROOT, 'assets/vendor/libheif/LICENSE.txt')) && /1\.23\.5/.test(fs.readFileSync(path.join(ROOT, 'assets/vendor/libheif/NOTICE.txt'), 'utf8')),
  'LGPL licence and version notice ship with it');
const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
ok(!sw.includes('/assets/vendor/libheif/'), 'not precached: 2 MB nobody pays unless they scan a HEIC');

console.log(`✓ stock photo HEIC · ${passed} checks`);
