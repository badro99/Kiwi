#!/usr/bin/env node
'use strict';

/* Les règles de prix des promotions, vérifiées sans navigateur.
 *
 * Ce qui se casse silencieusement dans un moteur de promotions, ce n'est pas
 * l'affichage : c'est l'arbitrage. Deux affiches en vitrine sur le même caftan,
 * une promotion terminée hier qui s'applique encore, un cumul qui descend un
 * ticket à zéro. Rien de tout ça ne se voit à l'œil sur une capture d'écran —
 * ça se voit sur un prix, et un prix se vérifie ici. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'promos.js'), 'utf8');
const data = new Map();
const localStorage = {
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => data.set(k, String(v)),
  removeItem: (k) => data.delete(k),
};
const window = { localStorage };
const context = { window, localStorage, console, Set, Math, Date, JSON, Number, Object, Array, String, Intl };
vm.runInNewContext(source, context, { filename: 'promos.js' });
const PR = window.KiwiPromos;

let failed = 0, ran = 0;
function check(ok, label) {
  ran++;
  if (!ok) { console.error(`  ✗ ${label}`); failed++; return; }
  console.log(`  ✓ ${label}`);
}
const DAY = 86400000;
const now = 1767225600000;                      /* instant fixe : un test daté « maintenant » ment un jour sur deux */

const item = (o) => Object.assign({ id: 'p1', name: 'Caftan', price: 1000, cost: 400, rayon: 'caftans', createdAt: now - 200 * DAY, sizes: { M: 4 } }, o);

/* ── la baisse elle-même ─────────────────────────────────────────────────── */
PR.reset();
PR.save({ id: 'a', name: 'Trente', kind: 'percent', value: 30, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }).price === 700, 'une remise en pourcentage baisse le prix affiché');

PR.reset();
PR.save({ id: 'a', kind: 'amount', value: 150, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }).price === 850, 'une remise en dirhams se retire du prix');

PR.reset();
PR.save({ id: 'a', kind: 'fixed', value: 499, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }).price === 499, 'un prix fixe remplace le prix catalogue');

/* Un article à 200 MAD dans une promotion « −500 MAD » ne peut pas finir à
   −300 : la caisse rendrait de l'argent à chaque vente. */
PR.reset();
PR.save({ id: 'a', kind: 'amount', value: 500, scope: { type: 'tout' } });
check(PR.priceFor(item({ price: 200 }), { now }).price === 0, 'une baisse plus grande que le prix s\'arrête à zéro, jamais en dessous');

/* Un « prix fixe » supérieur au prix catalogue ferait payer la promotion PLUS
   cher que l'étiquette. On ne l'applique pas du tout. */
PR.reset();
PR.save({ id: 'a', kind: 'fixed', value: 1500, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }) === null, 'une promotion qui ne baisse rien ne s\'applique pas');

/* ── la cible ────────────────────────────────────────────────────────────── */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 10, scope: { type: 'rayon', ids: ['caftans'] } });
check(!!PR.priceFor(item(), { now }), 'un rayon visé est remisé');
check(PR.priceFor(item({ rayon: 'sacs' }), { now }) === null, 'un rayon non visé garde son prix');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 10, scope: { type: 'produits', ids: ['p1'] } });
check(!!PR.priceFor(item(), { now }), 'un article choisi un par un est remisé');
check(PR.priceFor(item({ id: 'p2' }), { now }) === null, 'son voisin ne l\'est pas');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 10, scope: { type: 'avant', before: now - 100 * DAY } });
check(!!PR.priceFor(item(), { now }), 'le déstockage vise ce qui est entré avant la date');
check(PR.priceFor(item({ createdAt: now - 10 * DAY }), { now }) === null, 'l\'arrivage récent n\'est pas déstocké');

/* Une cible « avant » sans date visait TOUT le magasin dans une première
   version : une promotion à moitié saisie bradait la boutique entière. */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 50, scope: { type: 'avant' } });
check(PR.priceFor(item(), { now }) === null, 'un déstockage sans date ne vise rien plutôt que tout');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 20, scope: { type: 'stock', max: 5 } });
check(!!PR.priceFor(item({ sizes: { M: 3 } }), { now }), 'la fin de série vise les articles sous le seuil');
check(PR.priceFor(item({ sizes: { M: 9 } }), { now }) === null, 'un article bien approvisionné garde son prix');
check(PR.priceFor(item({ sizes: { M: 0 } }), { now }) === null, 'un article épuisé ne porte pas d\'affiche de fin de série');

/* ── la fenêtre de temps ─────────────────────────────────────────────────── */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, from: now + DAY });
check(PR.priceFor(item(), { now }) === null, 'une promotion programmée ne s\'applique pas avant l\'heure');
check(PR.priceFor(item(), { now: now + 2 * DAY }).price === 700, 'elle s\'applique une fois l\'heure venue');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, to: now - DAY });
check(PR.priceFor(item(), { now }) === null, 'une promotion terminée cesse d\'elle-même, sans geste');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, paused: true });
check(PR.priceFor(item(), { now }) === null, 'une promotion en pause ne remise plus');
PR.setPaused('a', false);
check(PR.priceFor(item(), { now }).price === 700, 'la reprendre la remet en vitrine');

/* ── DEUX PROMOTIONS SUR UN MÊME ARTICLE ─────────────────────────────────── */
/* La MEILLEURE est enregistrée en PREMIER, la moins bonne ensuite : sans cet
   ordre, « on garde la dernière créée » passerait le test par accident et on
   croirait avoir vérifié l'arbitrage alors qu'on n'a rien vérifié du tout. */
PR.reset();
PR.save({ id: 'b', name: 'Tout −30', kind: 'percent', value: 30, scope: { type: 'tout' }, createdAt: now - 5 * DAY });
PR.save({ id: 'a', name: 'Rayon −10', kind: 'percent', value: 10, scope: { type: 'rayon', ids: ['caftans'] }, createdAt: now - DAY });
const two = PR.priceFor(item(), { now });
check(two.price === 700, 'deux promotions ne se cumulent pas — la meilleure pour la cliente gagne');
check(two.promo.id === 'b', 'et c\'est bien celle-là qui est nommée sur le ticket');
/* 1000 − 30 % puis − 10 % ferait 630 : le cumul se voit ici et nulle part
   ailleurs, parce qu'à l'écran 630 ressemble à un prix parfaitement normal. */
check(two.price !== 630, 'les deux baisses ne s\'empilent pas l\'une sur l\'autre');

/* À prix égal, la plus ancienne : sinon l'affiche en vitrine change de nom le
   jour où le commerçant crée une promotion équivalente. */
PR.reset();
PR.save({ id: 'vieille', kind: 'percent', value: 20, scope: { type: 'tout' }, createdAt: now - 10 * DAY });
PR.save({ id: 'neuve', kind: 'amount', value: 200, scope: { type: 'tout' }, createdAt: now - DAY });
check(PR.priceFor(item(), { now }).promo.id === 'vieille', 'à prix égal, c\'est la plus ancienne qui reste affichée');

/* ── l'aperçu avant d'enregistrer ────────────────────────────────────────── */
PR.reset();
const cat = [item({ id: 'p1', price: 1000, cost: 400 }), item({ id: 'p2', price: 500, cost: 450 }), item({ id: 'p3', price: 300, cost: 100, rayon: 'sacs' })];
const pv = PR.preview({ kind: 'percent', value: 50, scope: { type: 'tout' } }, cat);
check(pv.count === 3, 'l\'aperçu compte les articles visés avant d\'enregistrer');
check(pv.from === 1800 && pv.to === 900, 'il chiffre le avant et le après');
check(pv.under === 1, 'et il compte ceux qui passeraient sous le prix d\'achat');

/* ── suppression et fusion entre deux caisses ────────────────────────────── */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' } });
PR.remove('a');
check(PR.list().length === 0 && PR.priceFor(item(), { now }) === null, 'une promotion supprimée cesse de remiser');

/* La caisse du fond porte encore la promotion effacée au comptoir. Sans pierre
   tombale, elle la renvoie à chaque échange et la remise ne meurt jamais. */
const comptoir = { v: 1, promos: [], deleted: [{ id: 'a', at: now }] };
const fond = { v: 1, promos: [PR.normalize({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, updatedAt: now - DAY })], deleted: [] };
check(PR.merge(comptoir, fond).promos.length === 0, 'la suppression d\'une caisse ne revient pas par l\'autre');

/* Mais la corriger APRÈS l'avoir supprimée doit la ressusciter, sinon un
   commerçant ne peut plus jamais réutiliser cette promotion. */
const reprise = { v: 1, promos: [PR.normalize({ id: 'a', kind: 'percent', value: 15, scope: { type: 'tout' }, updatedAt: now + DAY })], deleted: [] };
check(PR.merge(comptoir, reprise).promos.length === 1, 'une promotion recréée après coup revit');

/* mergeDefault() de cloud-doc.js garde toujours NOTRE version : la correction
   faite au bureau n'atteindrait jamais le comptoir. On arbitre par date. */
const vieux = { v: 1, promos: [PR.normalize({ id: 'a', name: 'Ancien', kind: 'percent', value: 10, scope: { type: 'tout' }, updatedAt: now - DAY })], deleted: [] };
const frais = { v: 1, promos: [PR.normalize({ id: 'a', name: 'Corrigé', kind: 'percent', value: 40, scope: { type: 'tout' }, updatedAt: now })], deleted: [] };
check(PR.merge(vieux, frais).promos[0].value === 40, 'la version la plus récente l\'emporte, d\'où qu\'elle vienne');

/* ── saisie hostile ──────────────────────────────────────────────────────── */
const junk = PR.normalize({ kind: 'chelou', value: -40, scope: { type: 'nawak' } });
check(junk.kind === 'percent' && junk.value === 0 && junk.scope.type === 'tout', 'une promotion illisible retombe sur une valeur inoffensive');
check(PR.normalize({ kind: 'percent', value: 300 }).value === 100, 'on ne remise pas plus de cent pour cent');

/* ── des jours et des heures ─────────────────────────────────────────────
   Heure de Casablanca (UTC+1 hors Ramadan) et journée de caisse à 05:00.
   Le mardi 13 octobre 2026 sert d'étalon. */
PR.reset();
const at = (iso) => Date.parse(iso);
const midi = PR.save({ name: 'Midi du mardi', kind: 'percent', value: 20, scope: { type: 'tout' }, days: [2], start: '12:00', end: '14:00' });
check(JSON.stringify(midi.days) === '[2]' && midi.start === '12:00' && midi.end === '14:00', 'jours et heures sont gardés tels quels');
check(PR.status(midi, at('2026-10-13T11:30:00Z')) === 'active', 'mardi 12:30 à Casablanca : la promotion s\'applique');
check(PR.priceFor(item(), { now: at('2026-10-13T11:30:00Z') }).price === 800, '… et le caftan passe à 800');
check(PR.status(midi, at('2026-10-13T10:59:00Z')) === 'waiting', 'mardi 11:59 : en attente, pas encore');
check(PR.status(midi, at('2026-10-13T13:00:00Z')) === 'waiting', 'mardi 14:00 pile : la fin est exclue');
check(PR.priceFor(item(), { now: at('2026-10-13T13:30:00Z') }) === null, 'hors créneau, aucun prix ne bouge');
check(PR.status(midi, at('2026-10-14T11:30:00Z')) === 'waiting', 'mercredi midi : pas le bon jour');
check(PR.stats(at('2026-10-14T11:30:00Z')).waiting === 1, 'stats compte la promotion hors créneau à part');
const n1 = PR.nextWindow(midi, at('2026-10-13T09:00:00Z'));
check(n1 && n1.day === 0 && n1.at === '12:00', 'le matin : « reprend aujourd\'hui à 12:00 »');
const n2 = PR.nextWindow(midi, at('2026-10-14T09:00:00Z'));
check(n2 && n2.day === 6 && n2.weekday === 2, 'le mercredi : reprend mardi prochain, dans six jours');

PR.reset();
const nuit = PR.save({ name: 'Nuit du vendredi', kind: 'amount', value: 100, scope: { type: 'tout' }, days: [5], start: '22:00', end: '01:00' });
check(PR.status(nuit, at('2026-10-16T21:30:00Z')) === 'active', 'vendredi 22:30 : la nuit du vendredi a commencé');
check(PR.status(nuit, at('2026-10-16T23:30:00Z')) === 'active', 'samedi 00:30 : c\'est encore la journée du vendredi');
check(PR.status(nuit, at('2026-10-17T00:30:00Z')) === 'waiting', 'samedi 01:30 : la fenêtre est close');
const n3 = PR.nextWindow(nuit, at('2026-10-17T01:00:00Z'));
check(n3 && n3.day === 7 && n3.at === '22:00', 'à 02:00 le samedi, le 22:00 du vendredi est derrière : vendredi prochain');

const lone = PR.normalize({ name: 'x', kind: 'percent', value: 10, start: '12:00' });
check(lone.start === '' && lone.end === '', 'une heure sans l\'autre ne crée aucune fenêtre');
check(PR.normalize({ name: 'x', kind: 'percent', value: 10, start: '12:00', end: '12:00' }).start === '', 'deux heures égales non plus');
check(PR.normalize({ name: 'x', kind: 'percent', value: 10, start: '25:00', end: '26:00' }).start === '', 'une heure impossible est ignorée');
check(PR.normalize({ name: 'x', kind: 'percent', value: 10, days: [0, 1, 2, 3, 4, 5, 6] }).days.length === 0, 'sept jours sur sept, c\'est tous les jours');
check(JSON.stringify(PR.normalize({ name: 'x', kind: 'percent', value: 10, days: [9, -1, 'a', 3, 3, 1] }).days) === '[1,3]', 'des jours illisibles sont écartés');
const datedOut = PR.normalize({ name: 'x', kind: 'percent', value: 10, days: [2], start: '12:00', end: '14:00', to: at('2026-10-13T12:00:00Z') });
check(PR.status(datedOut, at('2026-10-14T11:30:00Z')) === 'ended', 'après sa date de fin, une promotion à créneau est terminée, pas en attente');
check(PR.nextWindow(datedOut, at('2026-10-13T13:30:00Z')) === null, 'et elle n\'annonce pas un créneau qui n\'arrivera pas');
check(PR.status(PR.normalize({ name: 'x', kind: 'percent', value: 10 }), at('2026-10-14T03:00:00Z')) === 'active', 'sans créneau, rien ne change : active à toute heure');

/* ── un stockage local qui lève ne se fait pas passer pour un enregistrement ──
   Quota plein ou navigation privée : localStorage.setItem lève. commit()
   avalait l'exception et lançait la remontée sans l'attendre ; l'écran
   annonçait « la caisse est à jour » sans rien savoir. Attendu : la promotion
   reste en mémoire et s'applique, lastCommit() dit { local:false } et rend la
   PROMESSE de la réponse serveur, durable() est faux, un événement
   kiwi:local-save le dit, et la première écriture qui reprend rétablit tout. */
async function storageFailure() {
  const mem = new Map();
  let full = true;
  const ls = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { if (full && /^kiwi:bqPromos:/.test(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } mem.set(k, String(v)); },
    removeItem: (k) => mem.delete(k),
  };
  const events = [], posted = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const w = {
    localStorage: ls,
    dispatchEvent: (e) => { events.push(e); return true; },
    KiwiCloudDoc: {
      currentSlug: () => 'plein',
      attach: () => ({
        bind: () => Promise.resolve(true),
        push() { posted.push('push'); },
        pushNow: () => { posted.push('pushNow'); return gate.then(() => ({ ok: true, status: 200, rev: 1 })); },
      }),
    },
  };
  class CustomEvent { constructor(type, o) { this.type = type; this.detail = (o || {}).detail; } }
  vm.runInNewContext(source, { window: w, localStorage: ls, CustomEvent, console, Set, Math, Date, JSON, Number, Object, Array, String, Intl, Promise }, { filename: 'promos.js' });
  const P = w.KiwiPromos;
  P.cloud(() => 'plein');
  let threw = null;
  try { P.save({ id: 'q', name: 'Quota', kind: 'percent', value: 20, scope: { type: 'tout' } }); } catch (e) { threw = e; }
  check(!threw, 'un stockage plein ne fait pas échouer l\'enregistrement d\'une promotion');
  check(P.priceFor(item(), { now }).price === 800, 'la promotion reste en mémoire et s\'applique');
  const c = typeof P.lastCommit === 'function' ? P.lastCommit() : null;
  check(!!c && c.local === false, 'lastCommit() dit que la copie locale n\'a pas pris');
  check(typeof P.durable === 'function' && P.durable() === false, 'durable() est faux tant que rien n\'a pris sur l\'appareil');
  const said = events.filter((e) => e.type === 'kiwi:local-save');
  check(said.length === 1 && said[0].detail.store === 'promos' && said[0].detail.durable === false, 'un événement kiwi:local-save { durable:false } prévient la surface');
  let settled = null;
  if (c && c.server && typeof c.server.then === 'function') c.server.then((r) => { settled = r; });
  await new Promise((r) => setTimeout(r, 10));
  check(posted.includes('pushNow'), 'la promotion part quand même au serveur');
  check(settled === null, 'la réponse serveur n\'est pas présumée : elle n\'arrive qu\'avec le serveur');
  release();
  await new Promise((r) => setTimeout(r, 10));
  check(!!settled && settled.ok === true, 'lastCommit().server rend la réponse du serveur une fois attendue');

  full = false;
  events.length = 0;
  P.setPaused('q', true);
  check(P.durable() === true && P.lastCommit().local === true, 'la première écriture qui reprend rétablit durable()');
  check(events.length === 1 && events[0].detail.durable === true, 'et le retour à la normale est annoncé une fois');
  check(JSON.parse(mem.get('kiwi:bqPromos:v1:maisonMansour')).promos.some((p) => p.id === 'q'), 'la copie locale rattrape la promotion');
}

storageFailure().catch((e) => check(false, 'stockage plein : ' + (e && e.stack))).then(() => {
  if (failed) { console.error(`\n✗ ${failed} vérification(s) de promotions en échec.`); process.exit(1); }
  console.log(`\n✓ ${ran} règles de promotions vérifiées.`);
});
