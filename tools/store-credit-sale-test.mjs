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
const BOUTIQUE = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');

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
  const guard = '|| (amountCents === 0 && !complimentary && !storeCredit && !consignment && !receivable)) return;';
  const end = LIVE.indexOf(guard);
  vm.runInContext(`
    globalThis.run = function (entry) {
${LIVE.slice(head, end + guard.length).replace(/return;/g, 'return { posted: false };')}
      return { posted: true, complimentary: complimentary, storeCredit: storeCredit, consignment: consignment, receivable: receivable, amountCents: amountCents };
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
  ok(gate({ amountCents: 0, settlementKind: 'consignment', ticketAmountCents: 120000, consignedAmountCents: 120000, lines: basket }).consignment === true,
    'un ticket entièrement en dépôt-vente conserve son reçu sans créer de revenu propriétaire');
  ok(gate({ amountCents: 0, settlementKind: 'receivable', ticketAmountCents: 120000, lines: basket }).receivable === true,
    'une livraison à recevoir conserve également son panier et sa valeur de reçu');

  ok(/body\.settlementKind = 'store-credit'/.test(LIVE), 'le règlement est nommé dans le corps envoyé');
  ok(/body\.creditAmountCents = Math\.round\(Number\(entry\.creditAmountCents\)\)/.test(LIVE),
    'avec le montant d\'avoir consommé, en centimes entiers');
}

/* ═══ Le serveur accepte, et seulement dans ce cas ════════════════════════ */
{
  const head = SALE.indexOf('const settlementKind = String(');
  const block = SALE.slice(head, SALE.indexOf('const hasDiscount =', head));
  ok(/storeCredit = settlementKind === 'store-credit'/.test(block), 'le serveur connaît ce règlement');
  ok(/amountCents === 0 && !complimentary && !storeCredit && !consignment && !receivable/.test(block),
    'et n\'accepte zéro que pour une vente explicitement qualifiée');
  ok(/settlementKind && !complimentary && !storeCredit && !consignment && !receivable/.test(block),
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

/* ═══ 3 · la boutique passe aussi par le registre (feature-truth #13) ══════
 * Une vraie boutique gardait ses avoirs dans le localStorage de LA caisse qui
 * les avait émis : un bon présenté à l'autre caisse, ou après un changement de
 * tablette, était inconnu, et le tableau de bord n'en voyait aucun. */
{
  const src = BOUTIQUE;
  ok(/action: 'issue'/.test(src), 'boutique : l\'émission d\'un avoir passe par /api/store-credits');
  ok(/action: 'redeem-batch'/.test(src), 'boutique : la consommation est une seule écriture serveur');
  const doAv = src.slice(src.indexOf('async function doAvoir'), src.indexOf('async function issueAvoir'));
  ok(doAv.indexOf('await issueAvoir') > 0 && doAv.indexOf('await issueAvoir') < doAv.indexOf('restoreLines('),
    'boutique : l\'avoir est inscrit AVANT que le stock bouge (un refus ne remet rien en rayon)');
  ok(/catch \(error\) \{\s*toast\('Avoir non émis'/.test(doAv), 'boutique : un refus du registre le dit, sans retour enregistré');
  ok(/state\.retBusy/.test(doAv), 'boutique : un double appui n\'émet pas deux bons');
  const issue = src.slice(src.indexOf('async function issueAvoir'), src.indexOf('async function issueAvoir') + 1500);
  ok(/if \(!IS_DEMO\)/.test(issue) && /ensureOriginalSale/.test(issue), 'boutique : hors démo, le ticket d\'origine est adossé au registre');
  const exch = src.slice(src.indexOf('} else if (diff < 0) {'), src.indexOf('} else if (diff < 0) {') + 2200);
  ok(exch.indexOf('await issueAvoir') > 0 && exch.indexOf('await issueAvoir') < exch.indexOf('apply('),
    'boutique : à l\'échange, la différence est due au registre avant que les pièces bougent');
  ok(/releaseSale\(stockRef\)/.test(exch), 'boutique : un refus rend la pièce de remplacement réservée');
  const pay = src.slice(src.indexOf("action: 'redeem-batch'") - 1500, src.indexOf("action: 'redeem-batch'") + 1400);
  ok(/committed = false/.test(pay) && /refreshRemoteAvoirs\(\)/.test(pay),
    'boutique : un refus annule l\'encaissement et relit les soldes réels');
  ok(/id: creditCommitId/.test(pay), 'boutique : une réponse perdue se rejoue sans double débit');
  ok(/creditRequest\(null, '&code='/.test(src), 'boutique : un code inconnu en caisse est demandé au registre');

  /* les assistants, exécutés */
  const from = src.indexOf('  function creditFromServer');
  const to = src.indexOf('  /* ───────────────────────── state');
  const calls = [];
  const sandbox = {
    IS_DEMO: false, AVOIRS: [], P: { p1: { name: 'Robe lin' } }, crypto: { randomUUID: () => 'u-1' },
    merchantSlug: () => 'boutique-test', persistAvoirs() {}, renderBadges() {}, persistDay() {},
    lineReturnedQty: (line) => Number(line && line.returnedQty) || 0, rayonOf: () => 'robes',
    bqPaymentMethod: () => 'card', bqPaymentParts: (parts) => parts,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (String(url).includes('&code=AV-OTHER')) return { ok: true, status: 200, json: async () => ({ credits: [{ code: 'AV-OTHER', amountCents: 5000, balanceCents: 2500, createdAt: 1, expiresAt: Date.now() + 9e9 }] }) };
      if (init && init.body && JSON.parse(init.body).id === 'fail') return { ok: false, status: 409, json: async () => ({ error: 'sale-credit-exceeds-available' }) };
      return { ok: true, status: 200, json: async () => ({ credits: [] }) };
    },
    Date, Math, Number, String, JSON, Array, Object, Map, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(from, to).replace(/\n\s*refreshRemoteAvoirs\(\);\s*\n/g, '\n') +
    '\n;this.api = { creditFromServer, creditRequest, stableCreditIssueId, originalSalePayload, creditErrorDetail };', sandbox);
  const api = sandbox.api;
  const lookup = await api.creditRequest(null, '&code=AV-OTHER');
  ok(calls[0].url === '/api/store-credits?merchant=boutique-test&code=AV-OTHER', 'boutique : la recherche vise le registre du magasin appairé');
  const av = api.creditFromServer(lookup.credits[0]);
  ok(av.code === 'AV-OTHER' && av.balance === 25 && av.amount === 50, 'boutique : le solde vient du serveur, en dirhams');
  let refused = null;
  try { await api.creditRequest({ action: 'issue', id: 'fail' }); } catch (error) { refused = error; }
  ok(refused && refused.code === 'sale-credit-exceeds-available', 'boutique : un refus garde son code serveur');
  ok(/déjà été remboursé/.test(api.creditErrorDetail(refused)), 'boutique : et le message dit la vraie cause');
  const sale = { id: 'T-0042', at: Date.now(), total: 300, parts: [{ m: 'carte', amount: 300 }],
    lines: [{ pid: 'p1', size: 'M', color: 'Écru', unit: 150, qty: 2, returnedQty: 1 }] };
  const a = api.stableCreditIssueId(sale, new Map([[0, 1]]), 15000);
  const b = api.stableCreditIssueId(sale, new Map([[0, 1]]), 15000);
  ok(a === b && /^credit-issue:T-0042:0-2:15000$/.test(a), 'boutique : le même retour rejoué porte le même identifiant');
  const payload = api.originalSalePayload(sale);
  ok(payload.method === 'card' && payload.amountCents === 30000 && payload.lines[0].variantId === 'p1:M:Écru',
    'boutique : le ticket d\'origine part avec son règlement et ses variantes');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
