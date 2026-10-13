#!/usr/bin/env node
/* font-metrics-test · tools/font-metrics.mjs reads the shipped faces correctly.
 *
 * Design 2027 §6.1 states facts about the faces that its author read with
 * fontTools: the sizes of the files, which code points they hold, which OpenType
 * features they carry, and the four descriptors of the fallback face. This test
 * reads the same facts with the zero-dependency reader, so a copy of a face
 * that is not the one the spec measured (a different build, a re-subset, a
 * file swapped for Inter) fails here before a width in §6.6 quietly drifts.
 *
 *   node tools/font-metrics-test.mjs
 */
import assert from 'node:assert/strict';
import {
  loadFont, describeFont, locateFaces, findArial, deriveFallback, fallbackProblems, textAdvance,
  DECLARED_FALLBACK, ROOT,
} from './font-metrics.mjs';

let n = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); n++; console.log('  ✓ ' + msg); };
const eq = (a, b, msg) => { assert.equal(a, b, `${msg}: got ${a}, expected ${b}`); n++; console.log('  ✓ ' + msg); };

const { faces, sources } = locateFaces(ROOT);
console.log(`faces read from: ${[...new Set(Object.values(sources))].join(', ')}`);
for (const k of ['latin', 'latinExt', 'arabic400', 'arabic500', 'arabic600', 'arabic700']) ok(!!faces[k], `${k} is found (${sources[k]})`);

/* ── Inter Tight, Latin (§6.1) ── */
const latin = describeFont(loadFont(faces.latin));
eq(latin.bytes, 44872, 'Inter Tight Latin is the 44,872 B file of §6.1');
const wght = latin.axes.find((a) => a.tag === 'wght');
ok(wght && wght.min === 100 && wght.max === 900, 'its wght axis runs 100 to 900, so 700 exists and no faux bold is drawn');
eq(latin.cmap.size, 231, '231 code points (Latin, digits and punctuation)');
ok(latin.has(0xa0) && latin.has(0x2212), 'it holds U+00A0 and U+2212');
ok(!latin.has(0x202f), 'it does not hold U+202F (narrow no-break space is banned, not added)');
ok(latin.features.has('tnum'), 'it has the tnum feature (every frame sets tabular numerals)');
ok(!latin.features.has('zero'), 'it does not have the zero feature (slashed zero)');
const arabicInLatin = [...latin.cmap.keys()].filter((c) => (c >= 0x600 && c <= 0x6ff) || (c >= 0x750 && c <= 0x77f) || (c >= 0x8a0 && c <= 0x8ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff));
eq(arabicInLatin.join(','), String(0xfeff), 'in the Arabic ranges it holds only U+FEFF, a zero-width no-break space and not a letter');
eq(latin.unitsPerEm, 2048, 'upm is 2048');

const ext = describeFont(loadFont(faces.latinExt));
eq(ext.bytes, 89800, 'Inter Tight Latin Extended is the 89,800 B file');

/* ── IBM Plex Sans Arabic (§6.1) ── */
const SIZES = { 400: 42848, 500: 45296, 600: 45688, 700: 44280 };
for (const [w, bytes] of Object.entries(SIZES)) {
  const f = describeFont(loadFont(faces[`arabic${w}`]));
  eq(f.bytes, bytes, `Plex Arabic ${w} is ${bytes.toLocaleString('en-US')} B`);
  const inRange = [...f.cmap.keys()].filter((c) => (c >= 0x600 && c <= 0x6ff) || (c >= 0x750 && c <= 0x77f) || (c >= 0x8a0 && c <= 0x8ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff));
  const others = [...f.cmap.keys()].filter((c) => !inRange.includes(c)).sort((a, b) => a - b);
  eq(inRange.length, 676, `Plex ${w}: 676 code points in the Arabic ranges`);
  eq(others.map((c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join(' '), 'U+0000 U+000D U+0020 U+00A0 U+2010', `Plex ${w}: plus U+0000, U+000D, U+0020, U+00A0 and U+2010`);
  ok(![...f.cmap.keys()].some((c) => c >= 0x30 && c <= 0x39), `Plex ${w}: no ASCII digit, so digits come from Inter Tight`);
}
const plex = describeFont(loadFont(faces.arabic400));
ok(Math.abs(textAdvance(latin, ' ').em - 480 / 2048) < 1e-9, 'U+0020 in Inter Tight is 480/2048 em, and so is U+00A0 (French high punctuation changes no width)');
eq(textAdvance(latin, ' ').em, textAdvance(latin, ' ').em, 'U+00A0 advances like U+0020');
ok(textAdvance(plex, ' ').em > 0, 'Plex holds U+00A0 too');

/* ── The fallback face (§6.1) ── */
const arialFile = findArial();
if (!arialFile) console.log('  ○ Arial not found: the fallback descriptors were not re-derived (KIWI_ARIAL=<file> to point at one)');
else {
  const arial = describeFont(loadFont(arialFile));
  const inKiwiArabic = [...arial.cmap.keys()].filter((c) => c >= 0x600 && c <= 0x6ff).length;
  console.log(`  ○ Arial (${arialFile}) holds ${inKiwiArabic} code points in U+0600-06FF`);
  const got = deriveFallback(latin, arial, { atSizeAdjust: DECLARED_FALLBACK.sizeAdjust });
  const problems = fallbackProblems(got);
  ok(problems.length === 0, `fallback descriptors re-derived: ascent ${got.ascentOverride}, descent ${got.descentOverride}, line gap ${got.lineGapOverride} at size-adjust ${got.sizeAdjust} (measured ${got.measuredSizeAdjust}); declared 99.9, 24.9, 0 at 97.0${problems.length ? ' · differs: ' + problems.join(', ') : ''}`);
  /* A different face must not pass for Inter Tight: Plex is not Latin, so deriving from it is nonsense and the band check says so. */
  const wrong = deriveFallback(describeFont(loadFont(faces.arabic400)), arial, { atSizeAdjust: 97 });
  ok(fallbackProblems(wrong).length > 0, 'a different face laid over Arial does not reproduce the declared descriptors (the check can fail)');
}

console.log(`\nfont-metrics-test: ${n} checks passed`);
