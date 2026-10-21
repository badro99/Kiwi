#!/usr/bin/env node
import serveurTestSource from './serveur-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
/* Retours et avoirs côté caisse (pos-boutique.js, pos-maison.js).
 *
 *   1. Le prix RENDU est ce que la cliente a payé : la récompense fidélité baisse
 *      le ticket, pas les lignes, et un retour au prix de ligne rendait trop.
 *   2. Un acompte ne se rend pas : le ticket n'a encaissé qu'une partie de son
 *      prix. Les quatre entrées (cocher, échange, avoir, remboursement) refusent.
 *   3. Le cache des avoirs est rangé par commerce : changer de boutique ne montre
 *      pas les bons de la précédente, et ne les efface pas non plus.
 *   4. Émettre un avoir demande l'accord d'un responsable (même mécanisme que le
 *      remboursement) et se défait si le pavé se ferme sans accord.
 * Les fonctions sont extraites des fichiers réels et exécutées.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; console.log('  ✓ ' + message); };
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const slice = (src, from, to) => {
  const a = src.indexOf(from); const b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `repère introuvable : ${from} → ${to}`);
  return src.slice(a, b);
};

for (const [label, file] of [['boutique', 'assets/pos-boutique.js'], ['maison', 'assets/pos-maison.js']]) {
  const src = read(file);
  console.log(`■ ${label} · retours`);

  /* 1 · prix rendu */
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(`${slice(src, '  function returnRatio(sale) {', '  function saleCard(')}\n;this.api = { returnRatio, paidUnit };`, sb);
  const { returnRatio, paidUnit } = sb.api;
  const line = (unit, qty) => ({ unit, qty });
  const noReward = { lines: [line(100, 2)], total: 180 };
  ok(paidUnit(noReward, noReward.lines[0]) === 100, 'sans récompense, le prix rendu est le prix de la ligne, à l\'identique');
  const rewarded = { reward: '−10 %', lines: [line(100, 2)], total: 180 };
  ok(paidUnit(rewarded, rewarded.lines[0]) === 90 && returnRatio(rewarded) === 0.9,
    'une récompense de 10 % se retrouve dans le prix rendu (90 au lieu de 100)');
  const deposit = { reward: 'Café offert', kind: 'acompte', lines: [line(100, 2)], total: 50, balanceTotal: 180 };
  ok(paidUnit(deposit, deposit.lines[0]) === 90, 'le ratio se lit sur le prix total du ticket, pas sur l\'acompte versé');
  const odd = { reward: 'x', lines: [line(100, 3)], total: 299 };
  const each = paidUnit(odd, odd.lines[0]);
  ok(each === 99.66 && each * 3 <= 299 + 1e-9, 'l\'arrondi est vers le bas : la somme des retours ne dépasse jamais l\'encaissé');
  const free = { reward: 'x', lines: [line(100, 1)], total: 120 };
  ok(paidUnit(free, free.lines[0]) === 100, 'jamais plus que le prix de la ligne (ticket plus cher, livraison par exemple)');
  const zero = { reward: 'x', lines: [line(100, 1)], total: 0 };
  ok(paidUnit(zero, zero.lines[0]) === 0, 'un ticket entièrement offert ne rend rien');

  /* les montants des retours passent tous par ce prix */
  ok(/paidUnit\(s, l\) \* pickedQty\(ret, i, l\)/.test(src) && /fmtMAD\(paidUnit\(s, l\) \* availableQty\)/.test(src),
    'la fiche de retour affiche le prix payé');
  const avoirFn = slice(src, 'async function doAvoir()', 'function restoreLines(');
  ok(/paidUnit\(sale, sale\.lines\[i\]\) \* quantities\.get\(i\)/.test(avoirFn) && !/\.unit \* quantities/.test(avoirFn),
    'l\'avoir est calculé sur le prix payé');
  ok(/const diff = Math\.round\(\(.*paidUnit\(sale, ln\)\) \* 100\) \/ 100;/.test(src), 'l\'échange compare le remplacement au prix payé');
  ok(!/recordReturn\(sale, \[ex\.idx\], ln\.unit/.test(src), 'le registre des retours ne reprend plus le prix de ligne');

  /* 2 · acompte */
  const guards = (src.match(/kind === 'acompte'\) \{ toast\('Retour suspendu sur un acompte'\); return; \}/g) || []).length
    + (src.match(/\?\.kind === 'acompte'\) \{\s*toast\('Retour suspendu : cette vente/g) || []).length;
  ok(guards >= (label === 'maison' ? 4 : 3), `un ticket d'acompte est refusé aux entrées de retour (${guards} gardes)`);
  if (label === 'maison') {
    const refundFn = slice(src, 'async function doRefund()', 'function doExchange(');
    ok(/sale\.kind === 'acompte'/.test(refundFn), 'maison : le remboursement refuse aussi un acompte');
  }

  /* 3 · cache des avoirs rangé par commerce */
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const ctx = { current: 'boutique-a' };
  const env = {
    IS_DEMO: false, AVOIRS: [], avSeq: 1000, localStorage, merchantSlug: () => ctx.current, Date, JSON, Number, Math, String, Array,
  };
  vm.createContext(env);
  const cacheSrc = slice(src, "  const AVOIR_KEY = 'kiwi:bqAvoirs';", '  function creditFromServer');
  vm.runInContext(`${cacheSrc}\n;this.api = { persistAvoirs, avoirKey, restore: () => 0 };`, env);
  ok(env.api.avoirKey() === 'kiwi:bqAvoirs@boutique-a', 'la clé du cache porte le commerce');
  env.AVOIRS.push({ code: 'AV-A1', amount: 100, balance: 100, until: new Date(Date.now() + 86400000) });
  env.api.persistAvoirs();
  ok(store.has('kiwi:bqAvoirs@boutique-a') && JSON.parse(store.get('kiwi:bqAvoirs@boutique-a'))[0].code === 'AV-A1',
    'les bons d\'une boutique s\'écrivent sous sa clé');
  ok(!store.has('kiwi:bqAvoirs'), 'plus rien sous la clé commune');
  /* une caisse qui devient une autre boutique : on recharge le module */
  ctx.current = 'boutique-b';
  const env2 = { ...env, AVOIRS: [], avSeq: 1000 };
  vm.createContext(env2);
  vm.runInContext(cacheSrc, env2);
  ok(env2.AVOIRS.length === 0, 'la boutique suivante ne voit pas les bons de la précédente');
  ok(store.has('kiwi:bqAvoirs@boutique-a'), '…et ceux de la précédente ne sont pas effacés pour autant');
  ctx.current = 'boutique-a';
  const env3 = { ...env, AVOIRS: [], avSeq: 1000 };
  vm.createContext(env3);
  vm.runInContext(cacheSrc, env3);
  ok(env3.AVOIRS.length === 1 && env3.AVOIRS[0].code === 'AV-A1', 'la première boutique retrouve les siens');

  /* 4 · l'accord d'un responsable */
  const approvalSrc = slice(src, '  function avoirApproval(', '  function creditIntent');
  const asked = [];
  const win = { requireManager: (label, onApprove, context, opts) => { asked.push({ label, onApprove, context, opts }); } };
  const sb2 = { window: win, fmtMAD: (n) => `${n} MAD`, Promise, Error, Math };
  vm.createContext(sb2);
  vm.runInContext(`${approvalSrc}\n;this.api = { avoirApproval };`, sb2);
  const pending = sb2.api.avoirApproval(60, 'credit-issue:T-1:0-1:6000', 'sale-T-1');
  ok(asked.length === 1 && asked[0].context.kind === 'refund' && asked[0].context.refundMethod === 'avoir'
    && asked[0].context.refundId === 'credit-issue:T-1:0-1:6000' && asked[0].context.originalSaleId === 'sale-T-1'
    && asked[0].context.amountCents === 6000, 'l\'accord demandé est lié à cette émission (ticket, montant, identifiant, moyen)');
  asked[0].onApprove({ approval: 'capacité-signée', name: 'Sara' });
  ok(await pending === 'capacité-signée', 'l\'accord du responsable est transmis au registre');
  const cancelled = sb2.api.avoirApproval(60, 'id-2', 'sale-T-1');
  asked[1].opts.onCancel();
  let refused = null;
  try { await cancelled; } catch (error) { refused = error; }
  ok(refused && refused.code === 'manager-cancelled', 'un pavé fermé sans accord annule l\'émission, la caisse ne reste pas en attente');
  win.requireManager = undefined;
  refused = null;
  try { await sb2.api.avoirApproval(60, 'id-3', 'sale-T-1'); } catch (error) { refused = error; }
  ok(refused && refused.code === 'manager-required', 'sans pavé responsable, pas d\'avoir');
  const issueFn = slice(src, 'async function issueAvoir(', '/* ---------- voucher print preview');
  ok(issueFn.indexOf('await avoirApproval(') > 0 && issueFn.indexOf('await avoirApproval(') < issueFn.indexOf('await creditRequest(')
    && /approval,/.test(issueFn), 'l\'accord est demandé AVANT l\'écriture au registre, et envoyé avec elle');
}

console.log('■ pavé responsable, pages et fiche client');
const caisse = caisseTestSource(read('kiwi-caisse.html'));
ok(/function requireManager\(actionLabel, onApprove, authContext, opts\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?openAuthorization\(actionLabel, onApprove, 'manager', authContext, opts\);/.test(caisse),
  'requireManager transmet ses options (onCancel) au pavé');
const pages = read('assets/pages-pro.js');
ok(/liveCreditsOwnerSlug && liveCreditsOwnerSlug !== slug\) \{ liveCredits = \[\]/.test(pages)
  && /if \(currentSlug\(\) !== slug\) return;/.test(pages),
  'le registre des avoirs du tableau de bord se vide au changement de commerce et jette une réponse tardive');
const book = read('assets/clients-book.js');
ok(/kiwi:bqAvoirs@' \+ \(creditMerchant\(\)/.test(book) && !/getItem\('kiwi:bqAvoirs'\)/.test(book),
  'la fiche client lit le cache du commerce regardé');
const serveur = serveurTestSource(read('kiwi-serveur.html'));
ok(/saleId: String\(\(saved && saved\.id\) \|\| paymentId\)/.test(serveur), 'l\'app serveur lie la fidélité à la vente qu\'elle vient d\'enregistrer');

/* 5. Mesuré le 2026-10-19 : une robe rendue contre avoir puis réglée avec cet
      avoir affichait « 2 ventes · 500 MAD » pour 250 MAD encaissés ; le
      responsable lisait « ticket sale-ref-9c08… » au lieu de « ticket 1000 » ;
      le registre ne savait pas quel ticket avait consommé le bon ; et l'avoir
      de la cliente sur le ticket ne vivait que dans un toast. */
const boutique = read('assets/pos-boutique.js');
const caCtx = vm.createContext({ salesToday: () => [
  { total: 250, parts: [{ m: 'espèces', amount: 250 }] },
  { total: 250, parts: [{ m: 'avoir', amount: 250 }] },
  { total: 400, parts: [{ m: 'avoir', amount: 100 }, { m: 'carte', amount: 300 }] },
  { total: 90 },
] });
vm.runInContext(slice(boutique, 'const notCashedOf =', 'function queueIfOffline') + ';globalThis.out = caToday();', caCtx);
ok(caCtx.out === 640, 'boutique : la recette du jour compte l\'argent encaissé, pas la part réglée en avoir');
ok(/requireManager\(`Avoir \$\{fmtMAD\(amount\)\} · ticket \$\{ticketRef \|\| originalSaleId\}`/.test(boutique)
  && /avoirApproval\(amount, requestId, fromSaleId, context && context\.originalRef\)/.test(boutique),
  'boutique : l\'accord du responsable nomme le numéro du ticket');
ok(/saleId: \(opts\.sale && opts\.sale\.id\) \|\| opts\.ref \|\| ''/.test(boutique),
  'boutique : la consommation d\'un avoir porte le numéro du ticket qui la fait');
ok(/const av = clAvoirOf\(c\);[\s\S]{0,400}data-bq-tk-av>Avoir \$\{fmtMAD\(av\.balance\)\}/.test(slice(boutique, 'function clientRow(', 'function renderTicket')),
  'boutique : l\'avoir de la cliente reste affiché sur le ticket');

/* 2026-10-19 · un retour contre avoir sort de la dépense et des points de la
   cliente (KiwiClients.recordRefund, clé = code de l'avoir) ; et le toast de
   vente annonce les points réellement crédités, plus « un point pour 10 MAD ». */
{
  const ret = slice(boutique, "recordReturn(sale, idxs, amount, motif, 'avoir', av.code, quantities);", 'openVoucher(av');
  ok(/KiwiClients\.recordRefund\(holder\.id, \{ amount, saleRef: sale\.id, eventRef: av\.code/.test(ret),
    'boutique : un avoir émis reprend la dépense de la cliente, une fois par code d\'avoir');
  ok(!/Math\.round\(receivedNow \/ 10\)/.test(boutique), 'boutique : plus de « +1 pt pour 10 MAD » codé en dur');
  ok(/pts = Math\.max\(0, \(Number\(res\.client\.points\) \|\| 0\) - ptsBefore\)/.test(boutique),
    'boutique : les points du toast sont ceux que le carnet a crédités');
  /* La caisse Maison fait le même geste sur son propre retour contre avoir. */
  const maisonRet = slice(read('assets/pos-maison.js'), "recordReturn(sale, idxs, amount, motif, resellable ? 'avoir' : 'avoir-damaged', av.code, quantities);", 'openVoucher(av');
  ok(/KiwiClients\.recordRefund\(c\.id, \{ amount, saleRef: sale\.id, eventRef: av\.code/.test(maisonRet),
    'maison : un avoir émis reprend la dépense de la cliente, une fois par code d\'avoir');
}

console.log(`\n✓ ${controls} contrôles : retours, avoirs et cache côté caisse.`);
