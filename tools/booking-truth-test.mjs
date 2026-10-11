#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * RÉSERVATIONS · CE QUE LA PAGE ET LE LIEN PUBLIC AFFIRMENT
 *
 * Mesuré le 2026-10-11 sur le stack local, réservation « TEST KIWI » :
 *
 * 1. La page publique affichait les créneaux à l'heure du VISITEUR. Depuis
 *    Paris, une table de 11:00 (Casablanca) se lisait 12:00 : le client
 *    venait une heure après la table qu'on lui gardait.
 * 2. Ouverte en ligne sans horaire, elle proposait quatorze jours vides ; le
 *    tableau de bord, lui, disait « Réservation en ligne ouverte ».
 * 3. La page ouverte ne voyait jamais arriver une réservation en ligne.
 * 4. « Occupation 0 % · 5 équipe & ressources » : un ratio inventé.
 * 5. « 1 services ».
 *
 * Exécute les vraies fonctions de assets/booking.js et functions/api/booking.js.
 *
 *   node tools/booking-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(path.join(ROOT, 'assets/booking.js'), 'utf8');
const API = readFileSync(path.join(ROOT, 'functions/api/booking.js'), 'utf8');
const DASH = readFileSync(path.join(ROOT, 'assets/reservations.js'), 'utf8');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* The page's own helpers, run as a visitor whose clock is NOT Casablanca's. */
const pageCtx = vm.createContext({ state: { lang: 'fr', config: null }, Intl, Date, Object, String, Number });
vm.runInContext([
  "var VENUE_TZ='Africa/Casablanca';",
  grab(PAGE, 'function vtz('),
  grab(PAGE, 'function ymd('),
  grab(PAGE, 'function fmt('),
  grab(PAGE, 'function venueToday('),
  grab(PAGE, 'function venueHour('),
  'this.fmt=fmt; this.venueHour=venueHour; this.venueToday=venueToday;',
].join('\n'), pageCtx);

// 11:00 in Casablanca (UTC+1) on 2026-10-12 is 10:00 UTC, 12:00 in Paris.
const ELEVEN_CASA = Date.UTC(2026, 9, 12, 10, 0);

ok('un créneau de 11:00 à Casablanca s’affiche 11:00, quel que soit le fuseau du visiteur', () => {
  assert.equal(pageCtx.fmt(ELEVEN_CASA, { hour: '2-digit', minute: '2-digit' }), '11:00');
  assert.equal(pageCtx.venueHour(ELEVEN_CASA), 11);
});
ok('le jour affiché est celui de l’établissement', () => {
  assert.match(pageCtx.venueToday(), /^\d{4}-\d{2}-\d{2}$/);
  const casa = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal(pageCtx.venueToday(), casa);
});
ok('la page ne lit plus l’heure locale pour classer ni pour dater', () => {
  assert.ok(!/new Date\(s\.startAt\)\.getHours\(\)/.test(PAGE), 'slot grouping on visitor clock');
  assert.ok(/function dateButtons\(\)\{var out=\[\],today=venueToday\(\);/.test(PAGE), 'date strip from the venue day');
  assert.ok(/state\.date=plusDays\(venueToday\(\),1\);/.test(PAGE), 'default day');
});

/* The API's own hours check. */
const apiCtx = vm.createContext({});
vm.runInContext(grab(API, 'function hasBookableHours(') + '\nthis.h = hasBookableHours;', apiCtx);
const doc = (resources = []) => ({ resources });
ok('sans aucun horaire : pas d’heures réservables', () => {
  assert.equal(apiCtx.h({ week: {}, exceptions: [] }, doc()), false);
  assert.equal(apiCtx.h({ week: { mon: { open: false, periods: [{ from: '09:00', to: '19:00' }] } } }, doc()), false);
});
ok('une semaine type, une ressource avec ses heures, ou une exception ouverte suffisent', () => {
  assert.equal(apiCtx.h({ week: { mon: { open: true, periods: [{ from: '09:00', to: '19:00' }] } } }, doc()), true);
  assert.equal(apiCtx.h({ week: {} }, doc([{ active: true, week: { tue: { periods: [{ from: '10:00', to: '12:00' }] } } }])), true);
  assert.equal(apiCtx.h({ week: {}, exceptions: [{ kind: 'hours', periods: [{ from: '10:00', to: '12:00' }] }] }, doc()), true);
});
ok('le lien public le dit une fois, à l’entrée', () => {
  assert.ok(/hasBookableHours\(rows\.hours, doc\)/.test(API), 'API reports it');
  assert.ok(/if\(j\.hoursSet===false\)\{state\.closedKey='noHours';closed\(t\('noHours'\)\);return\}/.test(PAGE), 'page shows it');
  assert.ok(/noHours:'Cet établissement n’a pas encore publié ses horaires de réservation\.'/.test(PAGE));
    // …and its note must not say "once booking is enabled": it already is.
    assert.ok(/state\.closedKey==='noHours'\?\(state\.lang==='ar'\?.*dès que l.établissement aura renseigné ses horaires\.'\)/.test(PAGE), 'note for missing hours');
});

ok('le tableau de bord ne dit plus « ouverte » quand aucun créneau n’existe', () => {
  assert.ok(/onlineNoHours: 'En ligne · aucun créneau, horaires à renseigner'/.test(DASH));
  assert.ok(/var onlineText = doc\.settings\.published \? \(hoursMissing \? t\('onlineNoHours'\) : t\('onlineOn'\)\) : t\('onlineOff'\);/.test(DASH));
});
ok('la page ouverte relit le serveur, seulement quand elle est à l’écran', () => {
  const body = grab(DASH, 'function schedulePull(');
  assert.ok(/root\.offsetParent && document\.visibilityState === 'visible'/.test(body));
  assert.ok(/c\.pull\(false\)/.test(body));
  assert.ok(/open = true;\s*if \(!pollTimer\) schedulePull\(\);/.test(DASH));
});
ok('hors hôtel, la tuile dit les personnes attendues, pas un pourcentage inventé', () => {
  assert.ok(/guestsToday: 'Personnes attendues'/.test(DASH));
  assert.ok(/var guestsToday = todayRows\.reduce/.test(DASH));
  assert.ok(!/t\('resources'\)\.toLowerCase\(\)/.test(DASH), '"5 équipe & ressources" gone');
});
ok('« 1 service · 1 table · 1 couvert » au singulier', () => {
  const ctx = vm.createContext({ lang: () => 'fr' });
  vm.runInContext(grab(DASH, 'var TEMPLATE_COPY = {') + ';\n' + grab(DASH, 'function tt(') + '\n' + grab(DASH, 'function ttn(') + '\nthis.ttn = ttn;', ctx);
  assert.equal(ctx.ttn(1, 'services'), '1 service');
  assert.equal(ctx.ttn(2, 'tables'), '2 tables');
  assert.equal(ctx.ttn(1, 'seats'), '1 couvert');
  assert.ok(/emptyTitle: 'Préparez votre agenda'/.test(DASH));
});

/* The dashboard's own clock and hours check, run in a Berlin process. */
const dashCtx = vm.createContext({
  Intl, Date, Object, Array, Math, String, Number,
  lang: () => 'fr',
  venueId: () => 'v1',
  window: { KiwiHours: {
    // the real shape (assets/hours.js): an object, not an array
    periodsOn: () => ({ periods: [{ from: '09:00', to: '19:00' }], exception: null }),
    isConfigured: () => true,
    toMin: (v) => { const m = /^(\d{2}):(\d{2})$/.exec(v); return m ? +m[1] * 60 + +m[2] : null; },
  } },
});
vm.runInContext([
  "var VENUE_TZ='Africa/Casablanca';",
  grab(DASH, 'function venueParts('),
  grab(DASH, 'function venueWall('),
  grab(DASH, 'function venueEpoch('),
  grab(DASH, 'function dateLabel('),
  grab(DASH, 'function dayStart('),
  grab(DASH, 'function withinHours('),
  'this.withinHours=withinHours; this.dateLabel=dateLabel; this.venueEpoch=venueEpoch; this.dayStart=dayStart;',
].join('\n'), dashCtx);

ok('une table à 11:00 dans des horaires 09:00–19:00 est acceptée au tableau de bord', () => {
  const tue11 = Date.UTC(2026, 9, 13, 10, 0);   // 11:00 Casablanca
  assert.equal(dashCtx.withinHours(null, tue11, tue11 + 3600000), true);
  const tue20 = Date.UTC(2026, 9, 13, 19, 0);   // 20:00 Casablanca, after closing
  assert.equal(dashCtx.withinHours(null, tue20, tue20 + 3600000), false);
});
ok('l’agenda affiche l’heure de l’établissement, pas celle de l’appareil', () => {
  assert.equal(dashCtx.dateLabel(ELEVEN_CASA, false), '11:00');
  assert.equal(dashCtx.venueEpoch(2026, 10, 12, 11, 0), ELEVEN_CASA, 'typed 11:00 is 11:00 in Casablanca');
  assert.equal(dashCtx.dayStart(ELEVEN_CASA), Date.UTC(2026, 9, 11, 23, 0), 'venue midnight');
});
ok('le formulaire lit et écrit l’heure saisie à l’heure de l’établissement', () => {
  assert.ok(!/getTimezoneOffset\(\)\*60000/.test(DASH), 'no device-offset datetime-local');
  assert.ok(/startAt=\(function\(v\)\{var m=.*venueEpoch\(/.test(DASH), 'submit parses as venue time');
});
ok('un seul service : présélectionné, et « Sans frais » plutôt que « 0 MAD »', () => {
  assert.ok(/\(services\.length>1\?'<option value="">·<\/option>':''\)/.test(DASH));
  assert.ok(/x\.price>0\?money\(x\.price\):t\('free'\)/.test(DASH));
  assert.ok(/free: 'Sans frais'/.test(DASH) && /free: 'Free'/.test(DASH));
});

ok('« Annuler » ferme le formulaire ; annuler la réservation se dit en toutes lettres', () => {
  assert.ok(/buttons\.push\(\['cancelled',t\('cancelBooking'\)\]\)/.test(DASH));
  assert.ok(/cancelBooking: 'Annuler la réservation'/.test(DASH) && /cancelBooking: 'Cancel booking'/.test(DASH));
});

console.log(`\nbooking-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
