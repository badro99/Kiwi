#!/usr/bin/env node
/* UNE VENTE, UNE RÉCOMPENSE — et la récompense donnée par le comptoir, pas à la main.
 *
 * Le 28 octobre 2026, le carnet d'Amira Café a retiré 300 points à 12:25:11 et
 * encore 300 à 12:25:23 pour une seule remise : la référence d'une remise était
 * tirée au hasard à chaque appel et le serveur ne déduplique que par référence.
 * Et sur les douze métiers qui encaissent par KiwiPosSale, la seule façon de
 * donner la récompense était d'ouvrir la fiche et d'appuyer sur « Offrir la
 * récompense · réinitialiser » — un geste à la main, et le seul qui pouvait
 * retirer les points deux fois.
 *
 * Ce banc tient les deux bouts : la référence nommée d'après la vente, et la
 * récompense qui part toute seule à l'encaissement.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
/* Les commentaires de ce correctif CITENT les mots qu'ils retirent (« Offrir la
   récompense · réinitialiser »). Une absence se juge donc sur le code seul,
   sinon le banc se mordrait la queue. */
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } };
const eq = (name, a, b) => ok(name + ' (' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b) + ')', a === b);

/* ── le banc ────────────────────────────────────────────────────────────────
 * Un vrai commerce (KiwiEnv.isReal), un carnet, un programme. fetch refuse tout
 * pour que rien ne parte au serveur : on juge l'état LOCAL, celui que le
 * comptoir voit, et la file des remises en attente. */
function bench(cfg, clients, opts) {
  opts = opts || {};
  const book = 'bench-shop';
  const storage = new Map([['kiwiLive', '1'], ['kiwiLiveMerchant', book]]);
  if (opts.storage) for (const [k, v] of Object.entries(opts.storage)) storage.set(k, v);
  const values = { clients: { list: clients, seq: clients.length }, fidelity: cfg };
  const stores = {};
  const posts = [];
  const window = {
    addEventListener() {}, dispatchEvent() {},
    KiwiEnv: { isReal: () => true },
    /* tenant() nomme le locataire de la recette : sans lui record() n'écrit
       rien, et creditClient() n'est jamais atteint. */
    KiwiLive: { merchant: () => book, isOn: () => false, postSale() {} },
    KiwiStore: {
      currentVenue: () => book,
      define(name, o) {
        return stores[name] || (stores[name] = {
          get: () => (name in values ? values[name] : (o.blank ? o.blank() : null)),
          set: (v) => { values[name] = v; }, subscribe() { return function () {}; },
        });
      },
    },
  };
  const context = vm.createContext({
    window, KiwiStore: window.KiwiStore, console,
    navigator: { onLine: false },
    document: { documentElement: { lang: 'fr' }, body: { className: opts.bodyClass || '' }, addEventListener() {}, querySelectorAll: () => [] },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    CustomEvent: class { constructor(t, d) { this.type = t; Object.assign(this, d); } },
    fetch: async () => { posts.push(1); throw new Error('offline'); },
    Intl, Date, Math, JSON,
  });
  context.globalThis = context;
  vm.runInContext(src('assets/clients-store.js'), context);
  vm.runInContext(src('assets/pos-sale.js'), context);
  return {
    KC: window.KiwiClients, PS: window.KiwiPosSale, book, window,
    client: (id) => window.KiwiClients.get(id, book),
    queue: () => JSON.parse(storage.get('kiwi:clients-redemptions:v1:' + book) || '[]'),
  };
}
const AMOUNT = { model: 'amount', amount: { perMad: 1, threshold: 300, reward: '−10 %' }, visit: { target: 10, reward: '1 offert' }, product: { item: 'Café', target: 10, reward: '1 offert' } };
const STAMPS = { model: 'visit', visit: { target: 10, reward: '1 offert' }, amount: { perMad: 1, threshold: 300, reward: '−10 %' }, product: { item: 'Café', target: 10, reward: '1 offert' } };
const who = (over) => Object.assign({ id: 'c1', name: 'Badro', phone: '0600000000', points: 0, stamps: 0, visits: 0, spend: 0, consent: true, firstSeen: Date.now() - 86400000, lastSeen: Date.now() - 86400000 }, over || {});

console.log('— I · la référence porte la vente');
{
  const b = bench(AMOUNT, [who()]);
  const a = b.KC.redemptionRef('c1', 'sale-abc-123');
  eq('la même vente donne la même référence', a, b.KC.redemptionRef('c1', 'sale-abc-123'));
  ok('une autre vente, une autre référence', a !== b.KC.redemptionRef('c1', 'sale-abc-124'));
  ok('la vente est nommée dans la référence', a === 'redemption:c1:s:sale-abc-123');
  ok('sans vente, la référence reste unique', b.KC.redemptionRef('c1') !== b.KC.redemptionRef('c1'));
  const dirty = b.KC.redemptionRef('c1', 'Table 4 #7');
  ok('le serveur n’accepte que [A-Za-z0-9:_-]', /^[A-Za-z0-9:_-]{1,96}$/.test(dirty));
  ok('96 caractères au plus', b.KC.redemptionRef('c1', 'x'.repeat(300)).length <= 96);
  ok('une clé vide retombe sur l’aléatoire', /^redemption:c1:\d/.test(b.KC.redemptionRef('c1', '   ')));
}

console.log('— II · le bug d’Amira Café : deux appels, un seul retrait');
{
  const b = bench(AMOUNT, [who({ points: 769, visits: 4, spend: 769 })]);
  const ref = { ref: b.KC.redemptionRef('c1', 'sale-21502') };
  b.KC.redeem('c1', b.book, ref);
  eq('la première remise retire le seuil', b.client('c1').points, 469);
  b.KC.redeem('c1', b.book, { ref: b.KC.redemptionRef('c1', 'sale-21502') });
  eq('la seconde, sur la même vente, ne retire rien', b.client('c1').points, 469);
  eq('une seule ligne en file', b.queue().length, 1);
  /* Ce n’est pas un plafond : 469 points valent encore une remise, sur une
     AUTRE vente. Un client à deux fois le seuil garde ses deux récompenses. */
  b.KC.redeem('c1', b.book, { ref: b.KC.redemptionRef('c1', 'sale-21503') });
  eq('une autre vente peut porter la suivante', b.client('c1').points, 169);
  eq('deux lignes en file', b.queue().length, 2);
}

console.log('— III · une remise déjà acquittée par le serveur ne se reprend pas');
{
  const given = 'redemption:c1:s:sale-9';
  const b = bench(AMOUNT, [who({ points: 500, rewardRefs: [given] })]);
  b.KC.redeem('c1', b.book, { ref: given });
  eq('rewardRefs suffit à refuser', b.client('c1').points, 500);
  eq('rien en file', b.queue().length, 0);
}

console.log('— IV · carte à tampons, même règle');
{
  const b = bench(STAMPS, [who({ stamps: 12, visits: 12 })]);
  const r = { ref: b.KC.redemptionRef('c1', 'T-88') };
  b.KC.redeem('c1', b.book, r);
  eq('la carte perd sa cible, pas tout', b.client('c1').stamps, 2);
  b.KC.redeem('c1', b.book, { ref: b.KC.redemptionRef('c1', 'T-88') });
  eq('pas deux fois sur le même ticket', b.client('c1').stamps, 2);
}

console.log('— V · ce que la carte donne et ce qu’elle coûte');
{
  const AMT = (thr, reward) => ({ model: 'amount', amount: { perMad: 1, threshold: thr, reward: reward } });
  const pct = bench(AMOUNT, [who({ points: 400 })]);
  const r = pct.PS.rewardRead(pct.client('c1'), AMOUNT);
  eq('prête', r.ready, true);
  eq('un pourcentage est lu comme tel', r.kind, 'percent');
  eq('sa valeur', r.value, 10);
  eq('son coût en points', r.points, 300);
  const b2 = bench(AMT(1000, '50 MAD de remise'), [who({ points: 1200 })]);
  const r2 = b2.PS.rewardRead(b2.client('c1'), AMT(1000, '50 MAD de remise'));
  eq('un montant est lu comme tel', r2.kind, 'amount');
  eq('sa valeur', r2.value, 50);
  eq('son coût', r2.points, 1000);
  /* « un sac offert » n’est ni un pourcentage ni un montant : on n’invente pas de
     chiffre, sinon le comptoir donnerait une remise jamais écrite — la caisse
     restaurant rendait 10 % sur toute l’addition. */
  const b3 = bench(AMT(500, 'un sac offert'), [who({ points: 600 })]);
  const r3 = b3.PS.rewardRead(b3.client('c1'), AMT(500, 'un sac offert'));
  eq('un cadeau reste un cadeau', r3.kind, 'gift');
  eq('aucune valeur inventée', r3.value, 0);
  const b4 = bench(STAMPS, [who({ stamps: 10 })]);
  const r4 = b4.PS.rewardRead(b4.client('c1'), STAMPS);
  eq('une carte à tampons coûte des tampons', r4.stamps, 10);
  eq('et aucun point', r4.points, 0);
  eq('prête à la cible', r4.ready, true);
  const b5 = bench(AMOUNT, [who({ points: 10 })]);
  eq('pas prête tant que le seuil n’est pas atteint', b5.PS.rewardRead(b5.client('c1'), AMOUNT).ready, false);
  const b6 = bench({ auto: true }, [who({ points: 900 })]);
  eq('sans programme, aucune récompense', b6.PS.rewardRead(b6.client('c1'), { auto: true }), null);
}

console.log('— VI · le comptoir la donne tout seul (KiwiPosSale)');
const sale = (b, over) => b.PS.record('epicerie', Object.assign({ total: 200, method: 'especes', label: 'Courses', ref: 'T-1', lines: [{ name: 'Pain', qty: 1, total: 200 }] }, over || {}));
{
  const b = bench(AMOUNT, [who({ points: 400, visits: 2, spend: 400 })]);
  b.PS.attachClient({ id: 'c1', name: 'Badro' });
  ok('le comptoir voit la carte pleine', !!b.PS.readyReward());
  eq('rien n’est armé par défaut', b.PS.armedReward(), null);
  b.PS.armReward(true);
  ok('armée', !!b.PS.armedReward());
  eq('armer ne retire RIEN', b.client('c1').points, 400);
  sale(b, { ref: 'T-7' });
  /* L’achat d’abord (+200), la remise ensuite (−300). */
  eq('l’encaissement crédite puis retire', b.client('c1').points, 300);
  eq('une seule remise en file', b.queue().length, 1);
  ok('la vente nomme la remise', /:s:/.test((b.queue()[0] || {}).ref || ''));
  eq('la visite est comptée', b.client('c1').visits, 3);
  eq('le client est détaché', b.PS.attachedClient(), null);
}
{
  const b = bench(AMOUNT, [who({ points: 400 })]);
  b.PS.attachClient({ id: 'c1', name: 'Badro' });
  sale(b, { ref: 'T-8' });
  eq('non armée : la vente ne retire rien', b.client('c1').points, 600);
  eq('et rien en file', b.queue().length, 0);
}
{
  const b = bench(AMOUNT, [who({ points: 400 }), who({ id: 'c2', name: 'Autre', points: 0 })]);
  b.PS.attachClient({ id: 'c1', name: 'Badro' });
  b.PS.armReward(true);
  b.PS.attachClient({ id: 'c2', name: 'Autre' });
  eq('changer de client désarme', b.PS.armedReward(), null);
  sale(b, { ref: 'T-9' });
  eq('les points du premier sont intacts', b.client('c1').points, 400);
  eq('et rien ne lui est retiré', b.queue().length, 0);
}
{
  const b = bench(AMOUNT, [who({ points: 400 })]);
  b.PS.attachClient({ id: 'c1', name: 'Badro' });
  b.PS.armReward(true);
  b.PS.attachClient(null);
  eq('détacher désarme aussi', b.PS.armedReward(), null);
}
{
  const b = bench(AMOUNT, [who({ points: 400 })]);
  b.PS.attachClient({ id: 'c1', name: 'Badro' });
  b.PS.armReward(true);
  const first = sale(b, { ref: 'T-10', saleId: 'sale-uuid-10' });
  ok('la vente est écrite', !!first);
  const after = b.client('c1').points;
  /* Le même encaissement rejoué (rappel d’un paiement lent, reprise hors ligne)
     ne doit ni recompter l’achat ni reprendre la remise. */
  b.PS.attachClient({ id: 'c1', name: 'Badro' });
  b.PS.armReward(true);
  sale(b, { ref: 'T-10', saleId: 'sale-uuid-10' });
  eq('un encaissement rejoué ne retire pas deux fois', b.client('c1').points, after);
}
{
  const b = bench(AMOUNT, [who({ points: 10 })]);
  b.PS.attachClient({ id: 'c1', name: 'Badro' });
  eq('carte vide : rien à proposer', b.PS.readyReward(), null);
  eq('et rien à armer', b.PS.armReward(true), null);
}

console.log('— VII · ce que les écrans disent, et qui donne la remise');
{
  const carnet = src('assets/clients-book.js');
  const posSale = src('assets/pos-sale.js');
  const carnetCode = code('assets/clients-book.js');
  ok('« réinitialiser » a disparu du bouton', !/réinitialiser/.test(carnetCode));
  ok('« Carte réinitialisée » a disparu des messages', !/Carte réinitialisée/.test(carnetCode));
  ok('le bouton annonce son prix', /tr\(onSale \? 'Utiliser sur cette vente' : 'Utiliser la récompense'\) \+ ' · ' \+ esc\(cost\)/.test(carnet));
  ok('la fiche lit la lecture partagée', /PS\.rewardRead\(c, cfg\)/.test(carnet));
  ok('les comptoirs qui la posent eux-mêmes n’ont pas de second bouton',
    /ownedByTill/.test(carnet) && /PS\.rewardTillOwns\(/.test(carnet));
  ok('pos-sale nomme ces comptoirs', /is-pos-\(boutique\|maison\|librairie\)/.test(posSale));
  ok('et refuse d’armer sur eux', /if \(OWNS_REWARD\.test\(\(document\.body/.test(posSale));
  ok('la fiche arme, elle ne retire pas', /onSale\.arm\(!was\); renderList\(\)/.test(carnet));

  ok('l’encaissement nomme la remise d’après la vente',
    /KC\.redeem\(c\.id, null, \{ ref: KC\.redemptionRef\(c\.id, entry\.saleId \|\| entry\.ref\) \}\)/.test(posSale));
  ok('l’achat est crédité avant la remise', posSale.indexOf('recordPurchase') < posSale.indexOf('KC.redeem'));

  for (const f of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
    const t = src(f);
    ok(f + ' : sans réservation, la vente nomme la remise', /redemptionRef\(c\.id, sale\.syncId \|\| sale\.id\)/.test(t));
  }
  ok('la librairie nomme la remise d’après son ticket', /redemptionRef\(cu\.id, sale\.ref\)/.test(src('assets/librairie-loyalty.js')));
  ok('la caisse restaurant n’invente plus 10 % pour un cadeau',
    !/kind: 'pct', value: 10/.test(src('assets/caisse-loyalty-reward.js')));

  const store = src('assets/clients-store.js');
  ok('redeem refuse une référence déjà portée',
    /seen\.indexOf\(ref\) !== -1 \|\| redemptionRead\(book\)\.some\(function \(e\) \{ return e\.ref === ref; \}\)\) return rec;/.test(store));
  ok('le garde-fou passe avant tout calcul', store.indexOf('seen.indexOf(ref)') < store.indexOf('pointsDelta = thr'));
  ok('la référence sait nommer sa vente', /function redemptionRef\(id, saleKey\)/.test(store));
  /* La lecture partagée vit dans pos-sale.js, chargé par la caisse comme par chaque
     métier : la coquille de la caisse est à son plafond de <script> (ratchet), et un
     quatrième relecteur de la phrase du commerçant est précisément ce qui a produit
     les 10 % inventés. Le tableau de bord ne brûle jamais de récompense — le jour où
     un de ses écrans le ferait, cette vérification le rappellerait. */
  for (const f of ['assets/clients-directory.js', 'assets/growth-crm.js', 'assets/customer-retention.js']) {
    ok(f + ' ne brûle aucune récompense', !/KiwiClients\.redeem|KC\.redeem/.test(code(f)));
  }
}

console.log((fail ? '✗ ' : '✓ ') + 'une vente, une récompense — ' + pass + ' vérifications' + (fail ? ', ' + fail + ' échec(s)' : ''));
process.exit(fail ? 1 : 0);
