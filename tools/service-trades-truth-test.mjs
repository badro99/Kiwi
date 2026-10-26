#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
 * COMMERCES DE SERVICE (COIFFURE, SPA, SALLE DE SPORT, FLEURISTE)
 * LA CAISSE VEND LES PRIX ET LES ÉQUIPES DU COMMERÇANT, JAMAIS CEUX DE LA DÉMO
 *
 * Mesuré le 2026-10-11 sur le stack local, une caisse appairée par métier :
 *
 *  1. Coiffure, spa, salle de sport : la caisse vendait la grille de démo
 *     (120 MAD une coupe femme, 250 MAD un mois de salle) quoi que le commerçant
 *     ait saisi sur le tableau de bord, et son équipe s'appelait « Coiffeur 1 »,
 *     « Coach 2 », « Praticien 3 ». Rien ne reliait le document `workspaces`
 *     à la vente. `KiwiPosWorkspaces.services/staff/board` est ce lien.
 *  2. Un brouillon ou un archivé ne se vend pas ; un prix à 0 est un prix NON
 *     saisi : la caisse le demande (champ texte, virgule acceptée) au lieu de
 *     vendre à 0 MAD ou d'inventer un tarif.
 *  3. Salle de sport : aucune interface pour créer un cours ; un article de
 *     comptoir, un pass ou un pack de coaching ne pouvait pas être tenu.
 *     Spa : aucune fiche « Boutique & produits ». Les deux cartes existent.
 *  4. Salle de sport : deux ventes de suite au même membre, la seconde était
 *     refusée en 409 (la référence de vente était le code du membre, identité
 *     d'idempotence côté serveur) : l'argent était encaissé et jamais compté.
 *  5. Fleuriste : tiges et emballages venaient de la démo ; un prix de tige à
 *     24,5 devenait 245 avec un champ numérique qui avale la virgule.
 *  6. Fleuriste : le ticket de récapitulatif d'une vraie boutique portait
 *     « FLEURS DU DÉTROIT, Marché central, Tanger ».
 *
 * Exécute les vrais modules dans un `vm` (API partagée, schémas) et lit le code
 * des caisses pour les garde-fous qui ne se jouent qu'au clic.
 *
 *   node tools/service-trades-truth-test.mjs
 * ═════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import coreTestSource from './core-test-source.cjs';
const { readFileSync } = coreTestSource;
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const ASSET = (f) => SRC('assets/' + f);

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* ── l'API partagée, chargée telle quelle, avec une caisse appairée ── */
function bootApi(type) {
  const store = new Map();
  store.set('kiwiPairedVenue', JSON.stringify({ venueId: 'v-' + type, merchant: 'test-merchant', type }));
  const ctx = {
    console, Date, Set, Map, JSON, Math, Number, String, Array, Object, Promise, setTimeout, clearTimeout,
    setInterval: () => 0,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { addEventListener() {}, querySelector() { return null; }, documentElement: { lang: 'fr' }, visibilityState: 'visible' },
    addEventListener() {},
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    KiwiVenue: { getCurrentVenueData: () => ({ id: 'v-' + type, subtype: type, custom: true, name: 'Test' }), getVenue: () => 'v-' + type },
    KiwiI18n: { getLang: () => 'fr' },
    KiwiEnv: { isReal: () => true, demosAllowed: false },
    KiwiPlatform: { isPaired: () => true, pairedMerchant: () => 'test-merchant' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['trade-workspace-schema.js', 'trade-workspaces.js', 'pos-workspaces.js']) {
    vm.runInContext(ASSET(f), ctx, { filename: f });
  }
  return ctx;
}

const rec = (id, title, status, values, at) => ({ id, title, status, values, createdAt: at, updatedAt: at, deletedAt: 0 });

console.log('\n1. la caisse relit le catalogue et l\'équipe du tableau de bord');
{
  const c = bootApi('coiffure');
  const PW = c.KiwiPosWorkspaces;
  PW.write({
    trade: 'coiffure',
    records: {
      services: [
        rec('s1', 'Coupe femme', 1, { title: 'Coupe femme', price: 280.5, durationMinutes: 45, active: 'yes' }, 1),
        rec('s2', 'Brushing', 1, { title: 'Brushing', price: 0, durationMinutes: 30, active: 'yes' }, 2),
        rec('s3', 'Soin profond', 0, { title: 'Soin profond', price: 150, durationMinutes: 30, active: 'yes' }, 3),
        rec('s4', 'Ancienne coloration', 1, { title: 'Ancienne coloration', price: 400, durationMinutes: 90, active: 'no' }, 4),
      ],
      practitioners: [
        rec('p1', 'Karim T.', 1, { title: 'Karim T.', specialty: 'Barbier', commissionRate: 30, active: 'yes' }, 1),
        rec('p2', 'Salma B.', 1, { title: 'Salma B.', specialty: 'Coloriste', commissionRate: 0, active: 'yes' }, 2),
      ],
    },
  });
  const sv = PW.services('coiffure');
  ok('la prestation active est vendue à SON prix, centimes compris', () => {
    const s = sv.find((x) => x.name === 'Coupe femme');
    assert.ok(s); assert.equal(s.price, 280.5);
  });
  ok('un prix non saisi reste à 0 : la caisse doit le demander', () => {
    assert.equal(sv.find((x) => x.name === 'Brushing').price, 0);
  });
  ok('un brouillon et une prestation désactivée ne se vendent pas', () => {
    assert.ok(!sv.some((x) => x.name === 'Soin profond'));
    assert.ok(!sv.some((x) => x.name === 'Ancienne coloration'));
    assert.equal(sv.draft, 1, 'le brouillon est compté pour que la caisse le dise');
  });
  ok('l\'équipe est celle du commerçant, avec sa commission, jamais « Coiffeur 1 »', () => {
    const st = PW.staff('coiffure');
    assert.equal(JSON.stringify(st.map((x) => x.name)), JSON.stringify(['Karim T.', 'Salma B.']));
    assert.equal(st[0].commission, 0.3);
    assert.equal(st[1].commission, null, 'pas de commission inventée');
    assert.ok(!JSON.stringify(st).match(/pin|password|code/i), 'aucun code ne transite');
  });
}

console.log('\n2. cartes de saisie : cours, comptoir, boutique');
{
  const c = bootApi('sport');
  const S = c.KiwiTradeSchema, PW = c.KiwiPosWorkspaces;
  ok('la salle de sport tient un comptoir (article, coaching, pass) à la caisse', () => {
    assert.ok(S.get('sport', 'shop'));
    assert.ok(PW.boards.gym.some((b) => b[0] === 'shop'));
    assert.ok(PW.boards.gym.some((b) => b[0] === 'appointments'), 'planning des cours');
  });
  ok('un article de comptoir sans séance ni personne se sauve (min 0, pas 1)', () => {
    const sh = S.get('sport', 'shop');
    const r = S.validate(sh, { values: { title: 'Eau 50 cl', kind: 'counter', price: 7, sessions: 0, persons: 0, active: 'yes' } }, []);
    assert.ok(r.ok, JSON.stringify(r.errors));
  });
  ok('un cours se crée avec salle et coach', () => {
    const cl = S.get('sport', 'appointments');
    assert.ok(cl.fields.some((f) => f.id === 'room'));
    const r = S.validate(cl, { values: { title: 'Yoga', coachRef: 'c1', room: 'Salle A', startAt: '2026-10-12T09:00', endAt: '2026-10-12T10:00', capacity: 12, booked: 0 } }, []);
    assert.ok(r.ok, JSON.stringify(r.errors));
  });
  const sp = bootApi('spa');
  ok('le spa tient une boutique de produits, ouverte par défaut en Actif', () => {
    assert.ok(sp.KiwiTradeSchema.get('spa', 'products'));
    assert.ok(sp.KiwiPosWorkspaces.boards.spa.some((b) => b[0] === 'products'));
    const sc = sp.KiwiTradeSchema.get('spa', 'products');
    assert.equal(sc.stageKey, 'catalog');
  });
  const venues = SRC('assets/venues.js');
  ok('les deux entrées de menu existent sur le tableau de bord', () => {
    assert.match(venues, /nav:\s*'products'[^}]*Boutique & produits/);
    assert.match(venues, /nav:\s*'shop'[^}]*Comptoir, coaching & pass/);
  });
}

console.log('\n3. la caisse ne vend jamais un prix que le commerçant n\'a pas fixé');
const GYM = ASSET('pos-gym.js'), COI = ASSET('pos-coiffure.js'), SPA = ASSET('pos-spa.js'), FLE = ASSET('pos-fleuriste.js');
const inputs = [['gym', GYM, /id="gy-fp-price"/], ['gym', GYM, /id="gy-sell-fp"/], ['coiffure', COI, /id="cf-fp-price"/], ['spa', SPA, /id="sp-fp-price"/], ['fleuriste', FLE, /id="fl-fp-price"/], ['fleuriste', FLE, /id="fl-sheet-price"/]];
for (const [name, src, rx] of inputs) {
  ok(`${name} : le champ de prix ${String(rx).slice(5, -2)} est un texte décimal (la virgule passe)`, () => {
    const m = src.match(new RegExp('<input[^>]*' + rx.source + '[^>]*>'));
    assert.ok(m, 'champ introuvable');
    assert.match(m[0], /type="text"/);
    assert.match(m[0], /inputmode="decimal"/);
    assert.doesNotMatch(m[0], /type="number"/);
  });
}
ok('gym : la remise étudiante de la démo (−20 %) n\'existe pas en réel', () => {
  assert.match(GYM, /STUDENT_OFF\s*=\s*pvReal\(\)\s*\?\s*0\s*:\s*0\.20/);
});
ok('chaque caisse vide sa grille de démo en réel et garde un « fantôme » pour les ids retirés', () => {
  for (const [n, s] of [['gym', GYM], ['spa', SPA], ['fleuriste', FLE]]) {
    assert.match(s, /new Proxy\(/, n + ' : pas de Proxy fantôme');
    assert.match(s, /refreshReal/, n + ' : pas de relecture du catalogue réel');
  }
  assert.match(GYM, /Formule retirée/);
});
ok('chaque caisse relit le catalogue quand le tableau de bord change, sans casser un dialogue ouvert', () => {
  for (const [n, s] of [['gym', GYM], ['spa', SPA], ['coiffure', COI], ['fleuriste', FLE]]) {
    assert.match(s, /\.is-open/, n + ' : pas de garde de dialogue ouvert');
    assert.match(s, /subscribe\(/, n + ' : ne s\'abonne pas au catalogue');
  }
});
ok('une vente libre (sans catalogue) existe pour chaque métier et se mémorise', () => {
  assert.match(GYM, /FREE_PLANS/); assert.match(SPA, /FREE_ITEMS/); assert.match(FLE, /FREE_STEMS/);
  assert.match(COI, /free|libre/i);
});
ok('le prix tapé est arrondi au centime, pas à l\'unité', () => {
  assert.match(GYM, /Math\.round\(\(Number\(String\(\$\('#gy-fp-price', el\)\.value\)\.replace\(',', '\.'\)\) \|\| 0\) \* 100\) \/ 100/);
  assert.match(FLE, /replace\(',', '\.'\)/);
  assert.match(SPA, /replace\(',', '\.'\)/);
});

console.log('\n4. la vente passe, deux fois de suite');
ok('gym : la référence de vente est unique par encaissement (jamais le code du membre seul)', () => {
  assert.match(GYM, /ref = ref \? String\(ref\)\.slice\(0, 18\) \+ '-' \+ Date\.now\(\)\.toString\(36\)\.slice\(-5\) : ''/);
  assert.match(GYM, /KiwiPosSale\.record\('gym', \{ total, method, label, ref, lines \}\)/);
});

console.log('\n5. fleuriste : une vraie boutique n\'affiche pas la démo');
ok('le ticket du récapitulatif porte le nom de la boutique, pas « FLEURS DU DÉTROIT »', () => {
  assert.match(FLE, /\$\{pvReal\(\) \? esc\(String\(pvName\(''\) \|\| 'Ma boutique'\)\.toUpperCase\(\)\) : 'FLEURS DU DÉTROIT'\}/);
  assert.match(FLE, /pvReal\(\) \? \(\(pvCity\(''\)/);
});
ok('le catalogue du fleuriste vient de l\'inventaire du tableau de bord', () => {
  assert.match(FLE, /KiwiBoutiqueCatalog/);
  assert.match(FLE, /\.use\(/);
});

ok('une livraison créée à la caisse ne s\'invente ni destinataire ni ville', () => {
  assert.match(FLE, /recipient: \{ name: '', phone: '', addr: '', district: '' \}/);
  assert.doesNotMatch(FLE, /district: 'Tanger' \}\s*,?\s*\n[^\n]*(?:created|toast\(`Livraison)/);
  assert.match(FLE, /Précisez le destinataire dans Livraisons/);
  assert.match(FLE, /function recipName\(d\) \{ return d\.recipient\.name \|\| 'Destinataire à préciser'; \}/);
});
ok('le destinataire se renseigne sur le bon de livraison, nom et adresse exigés', () => {
  for (const id of ['fl-rc-name', 'fl-rc-tel', 'fl-rc-addr', 'fl-rc-zone', 'fl-rc-save', 'fl-rc-cancel', 'fl-rc-edit']) assert.match(FLE, new RegExp('id="' + id + '"'), id);
  assert.match(FLE, /const missing = !next\.name \? '#fl-rc-name' : !next\.addr \? '#fl-rc-addr' : ''/);
});
ok('une livraison sans adresse ne part pas en tournée', () => {
  const refusals = FLE.match(/if \((?:s === 'route' && )?!d\.recipient\.addr\) \{ toast\('Renseignez l\\u2019adresse avant le départ'\); openDelivDetail\(d\.id, \{ editRecipient: true \}\); return; \}/g) || [];
  assert.equal(refusals.length, 2, 'le bouton et le changement de statut refusent tous deux');
});

console.log('\n5b. coiffure : l\'agenda de la caisse est le tableau « Rendez-vous »');
ok('les rendez-vous du jour viennent du tableau, rangés par coiffeur·euse, noms relus', () => {
  const src = COI.match(/function realAppointments\(staffList\) \{[\s\S]*?\n  \}\n/);
  assert.ok(src, 'realAppointments introuvable');
  const day = '2026-10-13';
  const board = {
    appointments: [
      { id: 'a1', title: 'RDV-1', status: 1, v: { clientRef: 'c1', serviceRef: 's1', practitionerRef: 'p2', startAt: day + 'T14:30', endAt: day + 'T15:15', chair: 'Fauteuil 2' } },
      { id: 'a2', title: 'RDV-2', status: 0, v: { clientRef: 'c9', serviceRef: 's1', practitionerRef: 'gone', startAt: day + 'T10:00', endAt: '' } },
      { id: 'a3', title: 'RDV-3', status: 1, v: { clientRef: 'c1', serviceRef: 's1', practitionerRef: 'p1', startAt: '2026-10-14T10:00', endAt: '2026-10-14T11:00' } },
      { id: 'a4', title: 'RDV-4', status: 2, v: { clientRef: 'c1', serviceRef: 's1', practitionerRef: 'p1', startAt: '2026-10-14T02:00', endAt: '2026-10-14T03:00' } },
    ],
    clients: [{ id: 'c1', title: 'Nadia B.', status: 1, v: {} }],
    services: [{ id: 's1', title: 'Coupe femme', status: 1, v: {} }],
  };
  const ctx = { Date, Number, String, Math, Set, Object, MIN: 60000, bizDay: () => day,
    window: { KiwiPosWorkspaces: { rows: (t, nav) => { assert.equal(t, 'coiffure'); return board[nav] || []; } } } };
  vm.createContext(ctx);
  vm.runInContext(src[0] + ';this.realAppointments = realAppointments;', ctx);
  const out = ctx.realAppointments([{ id: 'p1' }, { id: 'p2' }]);
  assert.equal(JSON.stringify(out.map((r) => r.id)), JSON.stringify(['a1', 'a2', 'a4']), 'le lendemain matin (après 5 h) n\'est pas du jour, la nuit avant 5 h l\'est');
  const a1 = out[0];
  assert.equal(a1.staffId, 'p2'); assert.equal(a1.cliName, 'Nadia B.'); assert.equal(a1.svc, 'Coupe femme');
  assert.equal(a1.dur, 45); assert.equal(a1.chair, 'Fauteuil 2'); assert.equal(a1.state, 'attente');
  assert.equal(out[1].staffId, 'p1', 'coiffeur inconnu : première colonne');
  assert.equal(out[1].cliName, '', 'client absent du tableau : aucun nom inventé');
  assert.equal(out[1].unconfirmed, true); assert.equal(out[1].dur, 30);
  assert.equal(out[2].state, 'cours');
});
ok('un salon réel ne garde pas l\'agenda dans son instantané et « Ajouter » ouvre le tableau', () => {
  assert.match(COI, /appointments: real \? \[\] : RDV,/);
  assert.match(COI, /if \(!pvReal\(\) && Array\.isArray\(saved\.appointments\)\)/);
  assert.match(COI, /if \(pvReal\(\)\) \{ openAgenda\(\); return; \}/);
  assert.match(COI, /W\.open\(root, 'coiffure', 'appointments'\)/);
  assert.match(COI, /if \(pvReal\(\)\) fillRealRdv\(realAppointments\(STAFF\)\);/);
});

console.log('\n6. cures du spa : aucune économie inventée');
ok('une cure en réel s\'affiche « sans remise », au prix de l\'unité', () => {
  assert.match(SPA, /séance à l'unité : \$\{fmtMAD\(PRESTA\[f\.presta\]\.price\)\}\$\{pvReal\(\) \? ' · sans remise' : ''\}/);
});

console.log('\n7. langue et typographie : FR, EN et AR avancent ensemble, rien d\'italique, pas de tiret cadratin');
ok('les entrées de menu et les cartes sont traduites en trois langues', () => {
  const pw = ASSET('pos-workspaces.js');
  assert.match(pw, /\['products',L\('Boutique','Shop','المتجر'\)\]/);
  assert.match(pw, /\['shop',L\('Comptoir','Counter','الكاونتر'\)\]/);
  assert.match(SRC('assets/venues.js'), /fr: 'Boutique & produits', en: 'Shop & products', ar: 'المتجر والمنتجات'/);
  assert.match(SRC('assets/venues.js'), /fr: 'Comptoir, coaching & pass', en: 'Counter, coaching & passes', ar: 'الكاونتر والتدريب والتذاكر'/);
});
ok('aucun tiret cadratin ni italique dans le code ajouté aux caisses de service', () => {
  for (const [n, s] of [['gym', GYM], ['spa', SPA], ['coiffure', COI], ['fleuriste', FLE]]) {
    const shown = s.split('\n').filter((l) => /placeholder=|class="[^"]*"[^>]*>[^<]*—[^<]*</.test(l) && l.includes('—'));
    assert.equal(shown.length, 0, n + ' : tiret cadratin dans un libellé : ' + (shown[0] || '').trim().slice(0, 80));
    assert.doesNotMatch(s, /font-style\s*:\s*italic/, n + ' : italique');
  }
});

console.log(`\n${failed ? '✗' : '✓'} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
