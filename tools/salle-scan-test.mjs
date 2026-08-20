#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Salle scan test — « Scanner ma salle » : la photo remplit le
 * questionnaire, le générateur dessine, le commerçant confirme.
 *
 *   node tools/salle-scan-test.mjs
 *
 * Quatre invariants :
 *   1. La route serveur borne TOUT (formes, places, comptes, modèle @cf/).
 *   2. Le client convertit les faits en mix du générateur, jamais en x/y.
 *   3. Le scan n'écrit JAMAIS dans le plan — seul le magicien applique.
 *   4. Le câblage tient : estampilles accordées, boutons + case + i18n ×3.
 *
 * Discipline : contrôles exécutés = code EXTRAIT des fichiers livrés.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

console.log('■ Salle scan test (tools/salle-scan-test.mjs)');

const route = fs.readFileSync(path.join(ROOT, 'functions/api/ai/salle-import.js'), 'utf8');
const scan = fs.readFileSync(path.join(ROOT, 'assets/salle-scan.js'), 'utf8');
const pro = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
const quota = fs.readFileSync(path.join(ROOT, 'functions/api/ai/_quota.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');

const extract = (src, re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('cannot extract ' + what);
  return m[0].replace(/^export /, '');
};

// ── 1. La route serveur — bornes exécutées, modèle Cloudflare ────────────────
ok(/export const VISION_MODEL = '@cf\//.test(route), 'salle-import.js : le modèle vision est hébergé Cloudflare (@cf/)');
ok(/quotaOk\(\s*env,\s*who,\s*'salleimport'/.test(route), 'salle-import.js compte son quota sous le kind "salleimport"');
ok(/salleimport:\s*20/.test(quota), 'DAILY_CAPS.salleimport est déclaré (20/jour)');
ok(/^data:image\\\/\(jpeg\|png\|webp\);base64,/m.test(route) || route.includes('data:image\\/(jpeg|png|webp);base64,'), 'la route ne prend QUE des photos (data:image jpeg/png/webp)');
ok(!/console\.(log|info|warn|error)/.test(route), 'la route ne journalise JAMAIS le contenu de la photo');
ok(route.includes("'x-kiwi-ai-model'"), 'la route déclare le modèle utilisé dans x-kiwi-ai-model');

const vSrc = extract(route, /export function validateSalle\(raw\) \{[\s\S]*?\n\}/, 'validateSalle');
const validateSalle = new Function(vSrc + '; return validateSalle;')();
const v1 = validateSalle({ venue: 'CAFE', tables: [{ shape: 'ROUND', seats: 99, count: 3.7 }, { shape: 'plancha', seats: 4, count: 2 }] });
ok(v1 && v1.venue === 'cafe' && v1.tables.length === 1, 'validateSalle : venue normalisé, forme inconnue écartée');
ok(v1.tables[0].seats === 12 && v1.tables[0].count === 4, 'validateSalle : places plafonnées à 12, compte arrondi');
const v2 = validateSalle({ tables: [{ shape: 'rect', seats: 4, count: 500 }, { shape: 'round', seats: 2, count: 60 }, { shape: 'square', seats: 4, count: 10 }] });
ok(v2 && v2.tables[0].count === 60 && v2.tableCount === 120 && v2.tables.length === 2, 'validateSalle : 60 tables par ligne, 120 au total, le surplus tombe');
ok(validateSalle({ tables: [] }) === null && validateSalle(null) === null, 'validateSalle : rien d\'exploitable → null (repli questionnaire)');
ok(validateSalle({ error: 'not-a-room' }).error === 'not-a-room', 'validateSalle : « pas une salle » remonte comme erreur explicite');
const v3 = validateSalle({ venue: 'bistrot-inconnu', outdoor: 'oui', tables: [{ shape: 'high', seats: 2, count: 4 }] });
ok(v3.venue === 'restaurant' && v3.outdoor === false, 'validateSalle : venue inconnu → restaurant, outdoor non-booléen → false');

// ── 2. Le client — faits → mix du générateur, exécuté ────────────────────────
const typeSrc = extract(scan, /function typeFor\(shape, seats\) \{[\s\S]*?\n  \}/, 'typeFor');
const seatsSrc = extract(scan, /const TYPE_SEATS = \{[^}]*\};/, 'TYPE_SEATS');
const mixSrc = extract(scan, /function mixFrom\(hist\) \{[\s\S]*?\n  \}/, 'mixFrom');
const aggSrc = extract(scan, /function aggregate\(results\) \{[\s\S]*?\n  \}/, 'aggregate');
const lib = new Function(typeSrc + '\n' + seatsSrc + '\n' + mixSrc + '\n' + aggSrc + '; return { typeFor, mixFrom, aggregate };')();
ok(lib.typeFor('round', 2) === 'round2' && lib.typeFor('round', 4) === 'round4' && lib.typeFor('round', 7) === 'round8', 'typeFor : les rondes tombent sur round2/4/6/8 selon les places');
ok(lib.typeFor('rect', 6) === 'rect6' && lib.typeFor('rect', 12) === 'rect10' && lib.typeFor('square', 4) === 'sq4', 'typeFor : rectangles et carrées bornés aux types du plan');
ok(lib.typeFor('bar', 1) === 'bar' && lib.typeFor('high', 2) === 'high' && lib.typeFor('ovni', 4) === 'round4', 'typeFor : bar/mange-debout directs, forme inconnue → ronde 4');
const mix = lib.mixFrom({ round4: 8, round2: 4 });
ok(mix.length >= 2 && mix.length <= 8 && mix.filter(([t]) => t === 'round4').length > mix.filter(([t]) => t === 'round2').length, 'mixFrom : proportionnel au comptage, 8 entrées maximum');
ok(lib.mixFrom({}).length === 0, 'mixFrom : histogramme vide → mix vide (le générateur garde son défaut)');
const agg = lib.aggregate([
  { venue: 'cafe', outdoor: false, counter: true, tables: [{ shape: 'round', seats: 4, count: 6 }] },
  { venue: 'restaurant', outdoor: true, tables: [{ shape: 'high', seats: 2, count: 3 }] },
]);
ok(agg && agg.tables === 9 && agg.terrasse === true && agg.venue === 'cafe', 'aggregate : totaux sommés, terrasse détectée, premier venue retenu');
ok(lib.aggregate([{ venue: 'cafe', tables: [] }]) === null, 'aggregate : zéro table → null (le modal le dit au lieu d\'ouvrir un plan vide)');

// ── 3. Le scan n'écrit jamais dans le plan ───────────────────────────────────
ok(!/pdsSave|kiwiPlanDeSalle|localStorage\.setItem/.test(scan), 'salle-scan.js n\'écrit JAMAIS dans le plan ni dans localStorage');
ok(/onFacts/.test(scan) && /fetch\('\/api\/ai\/salle-import'/.test(scan), 'salle-scan.js remet les faits à onFacts et n\'appelle que sa route');

// ── 4. Câblage — boutons, case, mix, i18n ×3, estampilles accordées ──────────
ok((pro.match(/data-pds-action="scan-salle"/g) || []).length === 2, 'deux boutons « Scanner ma salle » : écran vide + rail latéral');
ok(/case 'scan-salle':/.test(pro) && /window\.KiwiSalleScan/.test(pro), 'pdsHandleAction porte le case scan-salle branché sur KiwiSalleScan');
ok(/A\.mix && A\.mix\.length\) \? A\.mix :/.test(pro), 'build() du magicien : le mix scanné gagne sur le mix par défaut du venue');
ok((pro.match(/scanSalle:/g) || []).length === 3 && (pro.match(/scanUnavailable:/g) || []).length === 3, 'les libellés du scan existent en fr, en et ar');
const tagOf = (src, p) => { const m = src.match(new RegExp(p.replace(/[./]/g, '\\$&') + '\\?v=(\\d+)')); return m ? m[1] : null; };
ok(tagOf(html, 'assets/salle-scan.js') != null && tagOf(html, 'assets/salle-scan.js') === tagOf(sw, 'assets/salle-scan.js'), 'salle-scan.js : estampille identique entre dashboard.html et kiwi-sw.js');

// ── 5. Verrou du nombre de contrôles ─────────────────────────────────────────
const EXPECTED_COUNT = 27;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
}
