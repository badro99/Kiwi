#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · La vente réglée entièrement en avoir  (ticket #0020)
 *
 * Deux moitiés dans ce ticket.
 *
 * 1 · Double dépense entre caisses. VÉRIFIÉE COMME DÉJÀ CORRIGÉE : l'émission
 *     et la consommation passent toutes deux par /api/store-credits, et la
 *     consommation est un `redeem-batch` — une seule instruction serveur pour
 *     tous les bons du ticket, donc une seconde caisse ne peut pas dépenser le
 *     même code entre la validation locale et l'encaissement. localStorage
 *     n'est plus qu'un cache d'affichage. Cette suite le VERROUILLE.
 *
 * 2 · La vente à zéro dirham qui disparaissait. Un ticket réglé à 100 % en
 *     avoir remonte un montant nul, et postSale refusait tout montant nul : le
 *     serveur n'apprenait jamais le panier. La recette, elle, avait raison de
 *     rester à zéro — elle a été comptée le jour de l'émission du bon. Mais la
 *     marchandise est bien sortie du magasin, et personne ne pouvait dire
 *     laquelle. La vente passe maintenant si elle DIT ce qui l'a réglée.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIVE = fs.readFileSync(path.join(ROOT, 'assets/live-link.js'), 'utf8');
const SALE = fs.readFileSync(path.join(ROOT, 'functions/api/sale.js'), 'utf8');
const MAISON = fs.readFileSync(path.join(ROOT, 'assets/pos-maison.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Avoirs · double dépense et vente à zéro dirham');

/* ═══ 1 · la double dépense entre caisses est fermée côté serveur ═════════ */
{
  ok(/action: 'issue'/.test(MAISON), 'l\'émission d\'un avoir passe par le registre serveur');
  ok(/action: 'redeem-batch'/.test(MAISON), 'la consommation aussi, et en UNE instruction');
  const redeem = MAISON.slice(MAISON.indexOf("action: 'redeem-batch'") - 1200, MAISON.indexOf("action: 'redeem-batch'") + 2000);
  ok(/credits: creditParts\.map/.test(redeem),
    'tous les bons du ticket partent ensemble : soit tous valides, soit aucun ne bouge');
  ok(/committed = false/.test(redeem), 'un refus du registre annule l\'encaissement');
  ok(/refreshRemoteAvoirs\(\)/.test(redeem), 'et relit les soldes réels avant de rendre la main');
  ok(/une autre caisse vient de l’utiliser/.test(MAISON),
    'le message nomme la cause réelle quand une autre caisse a pris le bon');
  const persist = MAISON.slice(MAISON.indexOf('function persistAvoirs'), MAISON.indexOf('(function restoreAvoirs'));
  ok(!/fetch\(/.test(persist), 'le stockage local reste un cache d\'affichage, pas la source de vérité');
}

/* ═══ 2 · le vrai filtre de postSale, exécuté ═════════════════════════════ */
function gate(entry) {
  const sandbox = { Number, Math, Array, String, JSON, Object };
  vm.createContext(sandbox);
  const head = LIVE.indexOf('    var rawAmt = entry.amountCents != null');
  const end = LIVE.indexOf('|| (amountCents === 0 && !complimentary && !storeCredit)) return;');
  vm.runInContext(`
    globalThis.run = function (entry) {
${LIVE.slice(head, end + 70).replace(/return;/g, 'return { posted: false };')}
      return { posted: true, complimentary: complimentary, storeCredit: storeCredit, amountCents: amountCents };
    };
  `, sandbox, { filename: 'live-link-slice.js' });
  return sandbox.run(entry);
}

const basket = [{ itemId: 'p1', name: 'Caftan', qty: 1, total: 1200 }];

{
  ok(gate({ amountCents: 120000, lines: basket }).posted, 'une vente ordinaire passe, comme avant');
  ok(!gate({ amountCents: 0, lines: basket }).posted,
    'une vente à zéro sans explication reste refusée — c\'est le garde-fou d\'origine');
  ok(!gate({ amountCents: -100, lines: basket }).posted, 'un montant négatif reste refusé');

  const credit = gate({ amountCents: 0, settlementKind: 'store-credit', creditAmountCents: 120000, lines: basket });
  ok(credit.posted, 'une vente réglée entièrement en avoir passe maintenant');
  ok(credit.storeCredit === true, 'et elle est reconnue comme telle');
  ok(credit.amountCents === 0, 'avec un montant toujours nul : la recette n\'est PAS recomptée');

  ok(!gate({ amountCents: 0, settlementKind: 'store-credit', creditAmountCents: 0, lines: basket }).posted,
    'sans montant d\'avoir consommé, elle est refusée');
  ok(!gate({ amountCents: 0, settlementKind: 'store-credit', creditAmountCents: 120000, lines: [] }).posted,
    'sans panier non plus : c\'est précisément le panier qu\'on vient chercher');
  ok(!gate({ amountCents: 0, settlementKind: 'store-credit', creditAmountCents: 120000 }).posted,
    'ni sans aucune ligne du tout');
  ok(gate({ amountCents: 0, settlementKind: 'complimentary', grossAmountCents: 120000, discountAmountCents: 120000, lines: basket }).complimentary === true,
    'la vente offerte, elle, continue de passer par son propre chemin');

  ok(/body\.settlementKind = 'store-credit'/.test(LIVE), 'le règlement est nommé dans le corps envoyé');
  ok(/body\.creditAmountCents = Math\.round\(Number\(entry\.creditAmountCents\)\)/.test(LIVE),
    'avec le montant d\'avoir consommé, en centimes entiers');
}

/* ═══ Le serveur accepte, et seulement dans ce cas ════════════════════════ */
{
  const head = SALE.indexOf('const settlementKind = String(');
  const block = SALE.slice(head, SALE.indexOf('const hasDiscount =', head));
  ok(/storeCredit = settlementKind === 'store-credit'/.test(block), 'le serveur connaît ce règlement');
  ok(/amountCents === 0 && !complimentary && !storeCredit/.test(block),
    'et n\'accepte zéro que pour une vente offerte ou un règlement par avoir');
  ok(/settlementKind && !complimentary && !storeCredit/.test(block),
    'un règlement inventé reste refusé');
  ok(/bad-store-credit-settlement/.test(block), 'un règlement par avoir mal formé a son propre refus');
  ok(/amountCents !== 0/.test(block),
    'un règlement par avoir qui prétendrait encaisser de l\'argent est refusé');
  ok(/creditAmountCents <= 0/.test(block) && /creditAmountCents > MAX_AMOUNT_CENTS/.test(block),
    'le montant d\'avoir est borné des deux côtés');
  ok(/!Number\.isSafeInteger\(creditAmountCents\)/.test(block), 'et doit être un entier sûr');
  ok(/!Array\.isArray\(b && b\.lines\) \|\| !b\.lines\.length/.test(block),
    'le panier est exigé : sans lui, cette vente n\'apporte rien');
}

/* ═══ La caisse maison l'envoie, et seulement quand il le faut ════════════ */
{
  const post = MAISON.slice(MAISON.indexOf('const creditIn = (parts || [])'), MAISON.indexOf('window.KiwiLive.postSale(payload);') + 40);
  ok(/creditIn = \(parts \|\| \[\]\)\.reduce/.test(post), 'la caisse calcule l\'avoir réellement consommé');
  ok(/cashIn <= 0 && creditIn > 0 && basket\.length/.test(post),
    'et ne marque le règlement par avoir que si rien n\'est entré en caisse');
  ok(/payload\.creditAmountCents = Math\.round\(creditIn \* 100\)/.test(post), 'le montant part en centimes');
  ok(/amount: cashIn/.test(post),
    'le montant remonté reste l\'argent réellement entré — l\'avoir ne regonfle pas la recette');
  ok(/lines: basket/.test(post), 'et le panier voyage avec');

  // Le cas mixte doit rester une vente ordinaire.
  const mixed = [{ m: 'avoir', amount: 400 }, { m: 'carte', amount: 800 }];
  const credited = mixed.reduce((s, x) => s + (x.m === 'avoir' ? x.amount : 0), 0);
  const cash = mixed.reduce((s, x) => s + (x.m === 'avoir' ? 0 : x.amount), 0);
  ok(credited === 400 && cash === 800, 'un règlement mixte garde ses deux parts distinctes');
  ok(!(cash <= 0 && credited > 0), 'et n\'est donc PAS marqué comme réglé par avoir : il fait bien entrer 800');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
