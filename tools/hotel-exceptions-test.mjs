#!/usr/bin/env node
/* Kiwi · hotel stay-exception triage — executes the REAL evaluator shipped in
 * assets/hotel.js (extracted by brace-matching, never a local copy), plus the
 * static UI contract for the internal monthly review (labels, CSS, escaping).
 *
 * The evaluator is a pure function of (booking, todayCasa): extracting its
 * source and running it means this suite tests what the dashboard runs. If the
 * signature moves, extraction fails loudly instead of silently testing a copy.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const hotelJs = read('assets/hotel.js');
const hotelCss = read('assets/hotel.css');

let controls = 0;
function ok(value, label) { assert.ok(value, label); controls++; }

/* ── extract the real cuEvaluateStayExceptions ─────────────────────────── */
function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${name} is defined in assets/hotel.js`);
  assert.equal(src.indexOf(marker, start + 1), -1, `exactly one ${name} definition ships`);
  let i = src.indexOf('{', start);
  let depth = 0;
  let single = false, double = false, template = 0, tplExpr = 0;
  let lineComment = false, blockComment = false, escaped = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (single) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === "'") single = false; continue; }
    if (double) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') double = false; continue; }
    if (template > 0 && tplExpr === 0) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '`') template--;
      else if (ch === '$' && next === '{') { tplExpr++; i++; }
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'") { single = true; continue; }
    if (ch === '"') { double = true; continue; }
    if (ch === '`') { template++; continue; }
    if (tplExpr > 0) {
      if (ch === '{') { depth++; tplExpr++; continue; }
      if (ch === '}') { depth--; tplExpr--; if (tplExpr === 0) continue; else continue; }
    }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (tplExpr > 0) { tplExpr--; continue; }
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body never closes`);
}

const fnSrc = extractFunction(hotelJs, 'cuEvaluateStayExceptions');
ok(fnSrc.includes('(b, today)'), 'evaluator keeps its (booking, today) signature');
const evaluateStayExceptions = new Function(`${fnSrc}; return cuEvaluateStayExceptions;`)();
ok(evaluateStayExceptions.length === 2, 'extracted evaluator is callable with 2 args');

const today = '2026-09-02';
const codes = (errs) => errs.map((e) => e.code);

/* ── behavioral controls on the REAL function ──────────────────────────── */
{
  const stay = {
    id: 'bk-1', status: 'checked_in', partySize: 2,
    hotel: { checkIn: '2026-09-01', checkOut: '2026-09-04' },
    guests: [
      { name: 'Alice', sex: 'F', nationality: 'Française', birthDate: '1990-05-12', residenceCountry: 'France', idDocType: 'passeport', idDocNumber: '12AB34567' },
      { name: 'Bob', sex: 'M', nationality: 'Française', birthDate: '1988-11-23', residenceCountry: 'France', idDocType: 'passeport', idDocNumber: '12AB34568' },
    ],
  };
  ok(evaluateStayExceptions(stay, today).length === 0, 'fully compliant stay yields 0 exceptions');
}
{
  const stay = {
    id: 'bk-2', status: 'checked_in', partySize: 1,
    hotel: { checkIn: '2026-08-28', checkOut: '2026-09-01' },
    guests: [{ name: 'Charlie', nationality: 'Marocaine', idDocType: 'CNIE', idDocNumber: 'W12345', residenceCountry: 'Maroc' }],
  };
  const errs = evaluateStayExceptions(stay, today);
  ok(errs.some((e) => e.code === 'stale_checkout' && e.severity === 'danger'), 'past checkout still checked_in is danger');
}
{
  // Checkout in the future is NOT stale, even inside the reviewed month.
  const stay = {
    id: 'bk-2b', status: 'checked_in', partySize: 1,
    hotel: { checkIn: '2026-09-01', checkOut: '2026-09-05' },
    guests: [{ name: 'Future', nationality: 'Marocaine', idDocType: 'CNIE', idDocNumber: 'W99999', residenceCountry: 'Maroc' }],
  };
  ok(!codes(evaluateStayExceptions(stay, today)).includes('stale_checkout'), 'future checkout is not stale');
}
{
  const stay = {
    id: 'bk-3', status: 'checked_in', partySize: 3,
    hotel: { checkIn: '2026-09-01', checkOut: '2026-09-04' },
    guests: [{ name: 'Lead', nationality: 'Espagnole', idDocType: 'passeport', idDocNumber: 'ESP001', residenceCountry: 'Espagne' }],
  };
  ok(codes(evaluateStayExceptions(stay, today)).includes('missing_manifest'), 'guests < partySize flags missing_manifest');
}
{
  const stay = {
    id: 'bk-4', status: 'checked_in', partySize: 1,
    hotel: { checkIn: '2026-09-01', checkOut: '2026-09-04' },
    guests: [{ name: 'Incomplete', nationality: '', idDocType: '', idDocNumber: '', residenceCountry: 'Maroc' }],
  };
  const errs = evaluateStayExceptions(stay, today);
  ok(codes(errs).includes('missing_identity'), 'missing idDoc flags missing_identity');
  ok(codes(errs).includes('missing_nationality'), 'missing nationality flags missing_nationality');
}
{
  const stay = {
    id: 'bk-5', status: 'checked_in', partySize: 1,
    hotel: { checkIn: '2026-09-01', checkOut: '2026-09-04' },
    guests: [{ name: 'NoRes', nationality: 'Italienne', idDocType: 'passeport', idDocNumber: 'IT999', residenceCountry: '' }],
  };
  const errs = evaluateStayExceptions(stay, today);
  ok(errs.some((e) => e.code === 'missing_residence' && e.severity === 'warn'), 'missing residence is warn-level');
}
{
  const stay = {
    id: 'bk-6', status: 'confirmed', partySize: 2,
    hotel: { checkIn: '2026-09-02', checkOut: '2026-09-05' }, guests: [],
  };
  ok(codes(evaluateStayExceptions(stay, today)).includes('unconfirmed_arrival'), 'arrival due today without manifest is info');
}
for (const status of ['cancelled', 'no_show']) {
  const stay = { id: `bk-x-${status}`, status, partySize: 4, hotel: { checkIn: '2026-09-01', checkOut: '2026-09-04' }, guests: [] };
  ok(evaluateStayExceptions(stay, today).length === 0, `${status} stays never raise triage exceptions`);
}
{
  // Completed stays carry no triage here (the server gate checks them); the
  // client card only triages in-house and expected arrivals.
  const stay = {
    id: 'bk-7', status: 'completed', partySize: 2,
    hotel: { checkIn: '2026-08-20', checkOut: '2026-08-25' }, guests: [],
  };
  ok(!codes(evaluateStayExceptions(stay, today)).includes('stale_checkout'), 'completed stays are not stale');
}
{
  // Labels must never leak identity-document values into badges or titles.
  const canary = 'ZZCANARY998877';
  const stay = {
    id: 'bk-8', status: 'checked_in', partySize: 1,
    hotel: { checkIn: '2026-09-01', checkOut: '2026-09-04' },
    guests: [{ name: 'Canary Guest', nationality: '', idDocType: 'passeport', idDocNumber: canary, residenceCountry: '' }],
  };
  const dumped = JSON.stringify(evaluateStayExceptions(stay, today));
  ok(!dumped.includes(canary), 'exception labels carry no identity-document numbers');
}

/* ── static UI contract: internal review, never an official declaration ─── */
for (const banned of ['Clôture Mensuelle des Nuitées', 'Déclaration officielle', 'CONFORMITÉ LÉGALE', 'télé-déclaration', 'Validation souveraine']) {
  ok(!hotelJs.includes(banned), `no official-declaration claim ships: «${banned}»`);
}
ok(!/STDN/.test(hotelJs.match(/cuMonthlyClosingModal[\s\S]*?load\(activeMonth\);\n  \}/)?.[0] || ''), 'closing modal carries no STDN reference');
ok(hotelJs.includes('Contrôle mensuel interne'), 'internal review title ships');
ok(hotelJs.includes('sans valeur déclarative'), 'non-declarative disclaimer ships');
ok(hotelJs.includes('un mois sans activité peut être scellé'), 'zero-activity month copy ships');
ok(hotelJs.includes("handlers['hx-monthly-closing']"), 'monthly review entry point is wired');
ok(!hotelJs.includes('KiwiSales.add('), 'hotel money never touches the browser-only store');
const closingModal = hotelJs.match(/async function cuMonthlyClosingModal\(\)[\s\S]*?\n  \}/)?.[0] || '';
ok(closingModal.includes("'hotel-review-' + crypto.randomUUID()"), 'monthly review creates collision-safe idempotency keys');
ok(closingModal.includes('pendingReviewKeys.get(intent)'), 'network retries reuse the same operation key');
ok(!closingModal.includes("idempotencyKey: action + '-' + activeMonth + '-' + Date.now()"), 'monthly review never uses the clock as an idempotency key');

/* Presentation lives in the stylesheet, with a dark variant. */
for (const cls of ['hx-audit', 'hx-exc-badge', 'hx-close-badge', 'hx-close-grid', 'hx-close-hist', 'hx-guest-grid', 'hx-close-err']) {
  ok(hotelCss.includes(`.${cls}`), `hotel.css defines .${cls}`);
}
ok(hotelCss.includes('[data-theme="dark"] .hx-exc-badge.danger'), 'exception badges stay readable in dark mode');
ok(hotelCss.includes('[data-theme="dark"] .hx-close-stat'), 'closing stats stay readable in dark mode');

/* Guest-supplied content is escaped where the new blocks interpolate it. */
ok(hotelJs.includes('${esc(roomLabel)}') && hotelJs.includes("${esc(b.customer?.name || 'Client')}"), 'reception rows escape room and guest names');
ok(hotelJs.includes('${esc(String(e.label'), 'server exception labels are escaped before render');

console.log(`hotel-exceptions-test: ${controls} controls passed`);
