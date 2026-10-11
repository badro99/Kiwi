#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * COMMANDE PAR QR / LIEN + RAPPORT MENSUEL · CE QUE LES PAGES AFFIRMENT
 *
 * kiwi-order.html est la page qu'un client ouvre en scannant le QR d'une table.
 * Chaque ligne ci-dessous est une phrase de cette page qui était fausse :
 *
 *  1. Le prix. 14,50 MAD affiché, 15 MAD facturé : le relais arrondissait la
 *     carte au dirham entier. « Grand +3 » sortait à 18 au lieu de 17,50.
 *  2. Les options. Le téléphone n'envoyait que du texte (« Grand ») ; le serveur
 *     lit des identifiants. Un plat à option obligatoire était refusé à chaque
 *     envoi (« carte modifiée »), et un supplément n'était jamais facturé.
 *  3. « Un serveur arrive » / « Addition demandée » : le message s'affichait,
 *     rien n'était envoyé. Le bouton écrit maintenant la demande sur la table.
 *  4. « Prêt dans 4–6 min » : aucun délai n'existe. La page dit l'état réel.
 *  5. Horaires : lus sur l'horloge du TÉLÉPHONE. Un touriste à Paris voyait un
 *     café de Marrakech « fermé » une heure avant l'heure réelle.
 *  6. Order Pro éteint : la page proposait quand même « + » et « Envoyer ».
 *  7. kiwi-report.html : panier moyen calculé sur le net (≠ Rapport journalier),
 *     montants arrondis au dirham (18 + 12 ≠ 29,50), « 1 ventes ».
 *  8. La carte « commande client » de la caisse affichait 18 pour 17,50.
 *
 *   node tools/order-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = read('kiwi-order.html');
const REPORT_JS = read('assets/kiwi-report.js');
const REPORT_API = read('functions/api/admin/report.js');
const INBOX = read('assets/orderpro-inbox.js');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  const done = (e) => {
    if (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
    else { passed++; console.log(`  ✓ ${label}`); }
  };
  try { const r = fn(); if (r && r.then) return r.then(() => done(), done); done(); } catch (e) { done(e); }
}

/* ── 1. le prix, au centime ───────────────────────────────────────────────── */
const { priceOrder } = await import(path.join(ROOT, 'functions/api/order/_lib.js'));
const menu = {
  items: [
    { id: 'it_2', name: 'Café crème', price: 14.5, avail: true, opts: ['og_4'] },
    { id: 'it_9', name: 'Jus', price: 14.55, avail: true, opts: [] },
  ],
  opts: [{
    id: 'og_4', name: 'Taille', kind: 'one', required: true,
    choices: [{ id: 'oc_5', name: 'Petit', price: 0 }, { id: 'oc_6', name: 'Grand', price: 3 }],
  }],
};
const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ data: JSON.stringify(menu), updated_ts: 1 }) }) }) } };

await ok('14,50 MAD reste 14,50 (et non 15) ; « Grand +3 » fait 17,50 (et non 18)', async () => {
  const r = await priceOrder(env, 'm', [{ id: 'it_2', qty: 1, optionChoices: [{ group: 'og_4', choiceId: 'oc_5', label: 'Petit' }] }]);
  assert.equal(r.total, 14.5);
  const g = await priceOrder(env, 'm', [{ id: 'it_2', qty: 1, optionChoices: [{ group: 'og_4', choiceId: 'oc_6', label: 'Grand' }] }]);
  assert.equal(g.total, 17.5);
  assert.equal(g.lines[0].unitPrice, 17.5);
});
await ok('3 × 14,55 = 43,65 exactement (somme en centimes entiers, pas de 43,650000000000006)', async () => {
  const r = await priceOrder(env, 'm', [{ id: 'it_9', qty: 3 }]);
  assert.equal(r.total, 43.65);
});
await ok('un choix de groupe obligatoire sans identifiant est refusé, pas facturé de travers', async () => {
  const r = await priceOrder(env, 'm', [{ id: 'it_2', qty: 1, optionChoices: [] }]);
  assert.ok(r.invalidOptions.length >= 1, 'option obligatoire manquante signalée');
});

/* ── 2. le téléphone envoie des identifiants ─────────────────────────────── */
const ctx = vm.createContext({ Number, Math, Array, Intl, String, JSON });
vm.runInContext([
  'var currentLang = "fr";',
  grab(HTML, 'function fmt(n)'),
  'this.fmt = fmt; this.setLang = (l) => { currentLang = l; };',
].join('\n'), ctx);
await ok('fmt : 14,50 / 12 / 1 234,50 en français, 14.50 en anglais, jamais « 14.5 »', () => {
  assert.equal(ctx.fmt(14.5).replace(/ | /g, ' '), '14,50');
  assert.equal(ctx.fmt(12), '12');
  assert.equal(ctx.fmt(1234.5).replace(/ | /g, ' '), '1 234,50');
  ctx.setLang('en');
  assert.equal(ctx.fmt(14.5), '14.50');
  assert.equal(ctx.fmt(17.499999999), '17.50');
  ctx.setLang('fr');
});

const ctx2 = vm.createContext({ Array });
vm.runInContext([
  'var currentLang = "fr"; var I18N = { fr: {}, en: {}, ar: {} }; var OPT = {};',
  'var item = { id: "it_2", options: [ { key: "og_4", type: "single", required: true, _src: true, choices: [{id:"oc_5",label:"Petit"},{id:"oc_6",label:"Grand"}] },',
  '                                    { key: "og_8", type: "multi", _src: true, choices: [{id:"oc_9",label:"Sucre"},{id:"oc_10",label:"Lait"}] } ] };',
  'function itemOf(id) { return id === "it_2" ? item : null; }',
  'function choiceLabel(k, id) { return id === "oc_6" ? "Grand" : id === "oc_5" ? "Petit" : id === "oc_9" ? "Sucre" : "Lait"; }',
  grab(HTML, 'function describeOptionChoices('),
  'this.run = describeOptionChoices;',
].join('\n'), ctx2);
await ok('describeOptionChoices envoie {group, choiceId, label} pour les choix et rien pour un groupe vide', () => {
  const out = ctx2.run({ id: 'it_2', options: { og_4: 'oc_6', og_8: [] } });
  assert.equal(JSON.stringify(out), JSON.stringify([{ group: 'og_4', choiceId: 'oc_6', label: 'Grand' }]));
  const two = ctx2.run({ id: 'it_2', options: { og_4: 'oc_5', og_8: ['oc_9', 'oc_10'] } });
  assert.equal(two.length, 3);
  assert.equal(ctx2.run({ id: 'it_2', options: { og_4: '' } }).length, 0, 'groupe facultatif décoché : aucune entrée');
});

const ctx3 = vm.createContext({});
vm.runInContext([
  'var currentLang = "fr"; var I18N = { fr: { opt_label_known: "Taille FR" }, en: {}, ar: {} }; var OPT = { og_4: { label: "Taille" } };',
  grab(HTML, 'function groupLabel('),
  'this.g = groupLabel;',
].join('\n'), ctx3);
await ok('groupLabel retombe sur le nom du groupe publié, jamais sur « opt_label_og_4 »', () => {
  assert.equal(ctx3.g('og_4'), 'Taille');
  assert.equal(ctx3.g('known'), 'Taille FR');
  assert.equal(ctx3.g('inconnu'), 'inconnu');
});

const ctx4 = vm.createContext({});
vm.runInContext([
  'var orderMode = "takeout";',
  grab(HTML, 'function tableSessionErrKey('),
  grab(HTML, 'function serviceErrKey('),
  'this.t = tableSessionErrKey; this.s = serviceErrKey; this.setMode = (m) => { orderMode = m; };',
].join('\n'), ctx4);
await ok('les refus du serveur deviennent une phrase vraie, pas « réessayez » pour une panne définitive', () => {
  assert.equal(ctx4.t({ code: 'orderpro-off' }), 'ordering_off_note');
  assert.equal(ctx4.t({ code: 'subscription-required' }), 'ordering_off_note');
  assert.equal(ctx4.t({ code: 'menu-changed' }), 'menu_changed');
  assert.equal(ctx4.t({ code: 'menu-not-published' }), 'menu_unpublished');
  assert.equal(ctx4.t({ code: 'service-closed' }), 'service_closed_takeout');
  ctx4.setMode('table');
  assert.equal(ctx4.t({ code: 'service-closed' }), 'service_closed');
  assert.equal(ctx4.s({ code: 'floor-table-required' }), 'service_no_table');
  assert.equal(ctx4.s({ code: 'boom' }), 'service_err');
});

await ok('la page n\'envoie plus ni nom, ni prix, ni total : ils viennent de la carte publiée', () => {
  const block = grab(HTML, 'function postOrderToTill(');
  assert.ok(!/unitPrice\s*:/.test(block), 'unitPrice n\'est pas envoyé');
  assert.ok(!/\btotal\s*:\s*totalNow/.test(block), 'total n\'est pas envoyé');
  assert.ok(/optionChoices\s*:/.test(block) && /ref\s*:/.test(block), 'identifiants + clé d\'idempotence envoyés');
});

/* ── 3. les boutons de service écrivent vraiment ─────────────────────────── */
await ok('« Appeler un serveur » et « Addition » appellent /api/order/session (action), pas seulement un toast', () => {
  assert.ok(/function sendServiceRequest\(action\)/.test(HTML));
  assert.ok(/\/api\/order\/session/.test(grab(HTML, 'function sendServiceRequest(')));
  assert.ok(/sendServiceRequest\('call-server'\)/.test(grab(HTML, 'function callServer(')));
  assert.ok(/sendServiceRequest\('ask-bill'\)/.test(grab(HTML, 'function confirmBill(')));
  assert.ok(!/pourcentage|toast_bill_tip_post/.test(grab(HTML, 'function confirmBill(')), 'plus de pourboire annoncé comme envoyé');
});

/* ── 4. aucun délai inventé ──────────────────────────────────────────────── */
await ok('plus de « prêt dans 4–6 min » écrit en dur pour une vraie commande', () => {
  assert.ok(!/data-i18n="success_eta_em"/.test(HTML), 'plus aucun élément ne porte l\'ancien délai');
  assert.ok(/id="success-status"/.test(HTML));
  const start = grab(HTML, 'function startPreparing(');
  assert.ok(/pollUntilReady\(\)\)\s*return/.test(start), 'une vraie commande suit son état, pas un minuteur');
  const poll = grab(HTML, 'function pollUntilReady(');
  assert.ok(/'pending'/.test(poll) && /'accepted'/.test(poll) && /'ready'/.test(poll) && /'rejected'/.test(poll));
});
await ok('le titre de la page n\'est pas celui d\'un autre commerçant', () => {
  assert.ok(!/<title>[^<]*Café Atlas/.test(HTML), 'titre statique neutre');
  assert.ok(!/apple-mobile-web-app-title" content="Café Atlas/.test(HTML));
});

/* ── 5. horaires : l'heure du magasin, pas celle du téléphone ─────────────── */
const hoursProbe = `
  global.window = global; global.document = {};
  require(${JSON.stringify(path.join(ROOT, 'assets/hours.js'))});
  const wk = {}; for (const k of ['mon','tue','wed','thu','fri','sat','sun']) wk[k] = { open: true, periods: [{ from: '09:00', to: '18:00' }] };
  const doc = { v: 1, week: wk, exceptions: [], overrides: [] };
  // dimanche 11 octobre 2026, 16:30 UTC = 17:30 à Casablanca (UTC+1), 18:30 à Berlin
  const ts = Date.UTC(2026, 9, 11, 16, 30);
  const a = KiwiHours.statusOf(doc, ts, 'Africa/Casablanca');
  const b = KiwiHours.statusOf(doc, ts, 'Europe/Berlin');
  const c = KiwiHours.statusOf(doc, ts);
  process.stdout.write(JSON.stringify({ casa: a.open, berlin: b.open, local: c.open }));
`;
for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Africa/Casablanca']) {
  await ok(`horaires : même réponse quel que soit le fuseau du téléphone (${tz})`, () => {
    const r = spawnSync(process.execPath, ['-e', hoursProbe], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const o = JSON.parse(r.stdout);
    assert.equal(o.casa, true, '17:30 à Casablanca, ouvert jusqu\'à 18:00');
    assert.equal(o.berlin, false, '18:30 à Berlin, fermé');
  });
}

/* ── 6. Order Pro éteint ─────────────────────────────────────────────────── */
await ok('Order Pro éteint : la page lit orderpro, masque « + » et la barre, affiche un bandeau', () => {
  assert.ok(/payload\.orderpro === true/.test(HTML), 'le drapeau publié est lu');
  assert.ok(/body\.ordering-off \.item-add/.test(HTML) && /body\.ordering-off #custom-add-btn/.test(HTML));
  assert.ok(/id="oo-banner"/.test(HTML));
  const menuApi = read('functions/api/menu.js');
  assert.ok(/zone/.test(menuApi) && /merchantZone/.test(menuApi), '/api/menu publie le fuseau du magasin');
});

/* ── 7. rapport mensuel ──────────────────────────────────────────────────── */
const rctx = vm.createContext({ Intl, Math, Number });
const lines = REPORT_JS.split('\n').filter((l) => /^\s*var (nf|nf1|nf2|madExact|mad|ventes) = /.test(l)).join('\n');
vm.runInContext(lines + '\nthis.mad = mad; this.ventes = ventes; this.madExact = madExact;', rctx);
await ok('rapport : 29,50 reste 29,50 (centimes conservés), 12 reste 12', () => {
  assert.equal(rctx.mad(2950).replace(/ | /g, ' '), '29,50 MAD');
  assert.equal(rctx.mad(1200), '12 MAD');
  assert.equal(rctx.mad(1750).replace(/ | /g, ' '), '17,50 MAD');
  assert.equal(rctx.mad(123400).replace(/ | /g, ' '), '1 234 MAD');
});
await ok('rapport : singulier pour 0 et 1 (« 1 vente », « 0 vente »), pluriel dès 2', () => {
  assert.equal(rctx.ventes(0), '0 vente');
  assert.equal(rctx.ventes(1), '1 vente');
  assert.equal(rctx.ventes(2), '2 ventes');
});
await ok('rapport : le panier moyen est le BRUT / ventes, comme Rapport journalier', () => {
  assert.ok(/basketCents:\s*count \? Math\.round\(gross \/ count\)/.test(REPORT_API));
  assert.ok(!/basketCents:\s*count \? Math\.round\(cents \/ count\)/.test(REPORT_API));
});

/* ── 8. la caisse annonce le montant du client ───────────────────────────── */
const ictx = vm.createContext({ Number, Math, window: {}, document: { documentElement: { lang: 'fr' } } });
vm.runInContext(grab(INBOX, 'function fmt(n)') + '\nthis.fmt = fmt;', ictx);
await ok('carte « commande client » : 17,50 s\'affiche 17,50 (et non 18) ; 12 reste 12', () => {
  assert.equal(String(ictx.fmt(17.5)).replace(/ | /g, ' '), '17,50');
  assert.equal(String(ictx.fmt(12)), '12');
});

ok('les libellés d’options viennent de la carte du commerçant : échappés avant le HTML', () => {
  // groupLabel / choiceLabel return merchant-published text; a template sink must escape it.
  const raw = HTML.match(/\$\{(?:groupLabel|choiceLabel)\([^)]*\)\}/g) || [];
  assert.deepEqual(raw, [], 'unescaped option label in a template: ' + raw.join(', '));
  assert.match(HTML, /\$\{escapeHtml\(groupLabel\(opt\.key\)\)\}/);
});

ok('OrderPro bill: no tip preselected, the tip is said to be outside the bill, the button only asks', () => {
  const OP = read('OrderPro.html');
  assert.match(OP, /let tipPercent = 0;/);
  assert.match(OP, /setTipPercent\(0\);/);
  assert.ok(!/class="tip-chip is-active" type="button" data-tip="15"/.test(OP), '15 % is not pre-ticked');
  assert.equal((OP.match(/tip_note: "/g) || []).length, 3, 'tip note in FR, EN and AR');
  assert.ok(!/Le serveur arrive avec l'addition|Your waiter is bringing the check|الجارسون جاي بالحساب/.test(OP), 'no promise that the waiter is coming');
  assert.ok(!/Addition divisée ·|Bill split ·/.test(OP), 'the split calculator does not claim the bill was split');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
