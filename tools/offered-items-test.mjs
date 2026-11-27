#!/usr/bin/env node
/* « Offert » et remise de 100 % (27 nov. 2026).
 *
 * Le client : « on ne peut pas faire une remise de 100 %, ni encaisser 0 MAD,
 * ni offrir un cookie ; il faut que ce soit traité et compté pour le stock,
 * mais gratuit ». Cette suite exécute le vrai code :
 *   · caisse restaurant : offerPrice / offeredValue / offerDiscount
 *     (assets/caisse/discounts.js), les chips 50 % et 100 %, « Encaisser »
 *     à 0 MAD qui enregistre une vente offerte au lieu de « Addition vide » ;
 *   · boutique : la remise de ticket à 100 % (sale-discount.js) et le ticket
 *     entièrement offert qui saute l'écran de paiement (pos-boutique/offered.js).
 * L'aller-retour serveur (/api/sale, D1 en mémoire) vit dans
 * tools/caisse-payment-upload-test.mjs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { declaration } from './js-declarations.cjs';
import { mzSaleDiscount } from '../assets/pos-maison/sale-discount.js';
import { payOffered, OFFERED_PART } from '../assets/pos-boutique/offered.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

/* ── caisse restaurant : les helpers, exécutés ─────────────────────────── */
const DISC = read('assets/caisse/discounts.js');
const ctx = vm.createContext({
  money: (x) => Math.round((Number(x) || 0) * 100) / 100,
  fmtMAD: (x) => Math.round(x) + ' MAD', kdsEsc: (s) => String(s).replace(/[<>&"]/g, ''),
  window: {}, globalThis: {},
});
for (const name of ['offeredValue', 'offerDiscount', 'offerPrice']) vm.runInContext(declaration(DISC, name), ctx);
const lines = [{ name: 'Pasta', qty: 2, price: 30, total: 60 }, { uid: 'u2', name: 'Cookie', qty: 1, price: 0, total: 0, offered: 15, offeredBy: 'manager-1' }];
ok(ctx.offeredValue(lines) === 15, 'offeredValue sums what the offered lines were worth');
const synth = ctx.offerDiscount(null, lines);
ok(synth && synth.actorId === 'manager-1' && /commercial/i.test(synth.reason), 'with no remise, an offered line still yields a discount carried by its approver');
const real = { kind: 'pct', value: 10, reason: 'Client habitué', actorId: 'm2' };
ok(ctx.offerDiscount(real, lines) === real, 'an approved remise stays the discount of record');
ok(ctx.offerDiscount(null, [lines[0]]) === null, 'no gift, no synthetic discount');
const offeredHtml = ctx.offerPrice(lines[1]), paidHtml = ctx.offerPrice({ uid: 'u1', name: 'Pasta', qty: 2, price: 30 });
ok(/is-offered/.test(offeredHtml) && /<s class="rp-offer-was">15 MAD<\/s> Offert/.test(offeredHtml) && /aria-pressed="true"/.test(offeredHtml), 'an offered line strikes its price and says « Offert »');
ok(/60 MAD/.test(paidHtml) && /data-offer-uid="u1"/.test(paidHtml) && /aria-pressed="false"/.test(paidHtml), 'a paid line shows its price and a gift button');
ok(!/data-offer-uid/.test(ctx.offerPrice({ uid: 'p', kind: 'formula-part', qty: 1, price: 0 })), 'a formula component cannot be offered on its own');

/* ── caisse restaurant : les chips, encaisser 0 MAD et le bouton « Offrir », exécutés ── */
ok(vm.runInContext(declaration(DISC, 'REMISE_PCTS') + ' REMISE_PCTS.join()', ctx) === '5,10,15,20,50,100', 'the restaurant remise offers 50 % and 100 % by default');
const PAY = read('assets/caisse/payment.js');
const payCtx = vm.createContext({ tenderInFlight: false, mode: 'vrap', selectedId: '', globalThis: {}, calls: [] });
for (const name of ['billFullyOffered', 'settleOfferedBill']) vm.runInContext(declaration(PAY, name), payCtx);
const payRun = async (total, d) => {
  const calls = [];
  Object.assign(payCtx, { tenderInFlight: false, currentTotal: () => total, currentSaleLines: () => [], activeSaleDiscount: () => d,
    finalizeTender: async (m) => { calls.push('tender:' + m); return 'complete'; }, toast: (m) => calls.push('toast:' + m),
    printSaleTicket: () => calls.push('print'), lastSaleEntry: () => ({}) });
  const res = await payCtx.settleOfferedBill();
  return { res, calls: calls.join('|') };
};
const fullyOff = await payRun(0, { grossAmountCents: 4500, discountAmountCents: 4500 });
ok(fullyOff.res === true && fullyOff.calls === 'tender:complimentary|toast:Addition offerte enregistrée|print', 'a bill brought to 0 by an approved discount settles through the normal tender, as complimentary, and prints');
ok((await payRun(0, null)).calls === 'toast:Addition vide', 'an empty bill still says « Addition vide »');
ok((await payRun(0, { grossAmountCents: 4500, discountAmountCents: 3000 })).calls === 'toast:Addition vide', 'only a full discount settles at 0 MAD');
ok((await payRun(10, { grossAmountCents: 4500, discountAmountCents: 4500 })).calls === 'toast:Addition vide', 'a bill with money still due never settles for free');
const FRAME = read('assets/caisse/till-frame.js');
const frameCtx = vm.createContext({ money: (x) => Math.round((Number(x) || 0) * 100) / 100 + ' MAD', globalThis: {} });
for (const name of ['tillKitOffer', 'tillKitOpenPay']) vm.runInContext(declaration(FRAME, name), frameCtx);
const kitPaid = frameCtx.tillKitOffer({ uid: 'a', price: 45, qty: 1 }), kitGift = frameCtx.tillKitOffer({ uid: 'b', price: 0, offered: 45, qty: 2 });
ok(kitPaid && kitPaid.on === false && kitPaid.label === 'Offrir cet article', 'the 2027 bill offers a paid line');
ok(kitGift && kitGift.on === true && kitGift.label === 'Remettre au prix' && kitGift.tag === 'Offert' && kitGift.was === '90 MAD', 'and shows an offered line struck, « Offert », with the undo');
ok(frameCtx.tillKitOffer({ uid: 'c', kind: 'formula-part', price: 0, qty: 1 }) === null && frameCtx.tillKitOffer({ uid: 'd', price: 0, qty: 1 }) === null, 'a formula component or a free line has no offer button');
{ let settledFromPane = 0; Object.assign(frameCtx, { currentTotal: () => 0, settleOfferedBill: () => { settledFromPane++; } }); frameCtx.tillKitOpenPay(); ok(settledFromPane === 1, 'the 2027 pay pane settles a 0 MAD bill instead of opening a tender'); }
const offerCtx = vm.createContext({ money: (x) => Math.round((Number(x) || 0) * 100) / 100, globalThis: {}, window: {}, mode: 'vrap', selectedId: '', tableOrders: {},
  currentCashier: { id: 'cashier-1' }, renderCart: () => {}, newLineUid: () => 'u-new', asked: [], toasted: [] });
vm.runInContext(declaration(DISC, 'toggleLineOffer'), offerCtx);
Object.assign(offerCtx, {
  cart: [{ uid: 'u1', id: 'cookie', name: 'Cookie', price: 15, qty: 3 }],
  requireManager: (label, onOk) => { offerCtx.asked.push(label); onOk(); }, toast: (m) => offerCtx.toasted.push(m),
  currentOrder: () => ({ patchLine: (l, patch, drop) => { Object.assign(l, patch); for (const k of drop || []) delete l[k]; }, append: (list, l) => list.push(l) }),
});
offerCtx.toggleLineOffer('u1');
const [kept, given] = offerCtx.cart;
ok(offerCtx.asked.join() === 'Offrir un article', 'offering an item needs a manager');
ok(kept.qty === 2 && kept.price === 15 && !kept.offered && given && given.qty === 1 && given.price === 0 && given.offered === 15 && given.offeredBy === 'cashier-1' && given.uid === 'u-new', 'one cookie of three is offered on its own line, the other two stay paid');
offerCtx.toggleLineOffer('u-new');
ok(given.price === 15 && !('offered' in given) && !('offeredBy' in given) && offerCtx.asked.length === 1, 'undoing the gift restores the price without asking again');
/* What the shipped markup and the bundles carry (the sale itself runs through /api/sale in caisse-payment-upload-test). */
const app = read('assets/caisse-app.js'), acc = read('assets/caisse-accounting.js');
ok(/data-rm-pct="100">100 %/.test(read('kiwi-caisse.html')) && /if \(!\(currentTotal\(\) > 0\)\) \{ settleOfferedBill\(\); return; \}/.test(app) && /else settleOfferedBill\(\);/.test(app) && /toggleLineOffer\(offerBtn\.dataset\.offerUid\)/.test(app) && /case 'offer': if \(line\) toggleLineOffer\(line\.uid\)/.test(FRAME), 'the shipped till wires the 100 % chip, both Encaisser buttons, the gift button and the 2027 verb');
ok(/!c\.kind && !c\.offered/.test(read('assets/caisse/catalogue.js')) && /!l\.kind && !l\.offered/.test(read('assets/caisse-floor.js')) && /\+l\.total > 0 \|\| \+l\.offered > 0/.test(acc) && /\+l\.offered > 0 \? \{ offered: money\(\+l\.offered\) \}/.test(acc) && /if \(\+l\.offered > 0\) o\.of = /.test(read('assets/live-link/queue-store.js')), 'a new unit never merges into a gift, and the gift keeps its food cost and travels as `of`');

/* ── boutique : remise de ticket à 100 % ───────────────────────────────── */
const full = mzSaleDiscount({ amountCents: 0, totalCents: 0, remiseCents: 590000, actorId: 'mgr-1' });
ok(full && full.grossAmountCents === 590000 && full.discountAmountCents === 590000 && full.actorId === 'mgr-1', 'a fully offered ticket reports gross = discount');
ok(mzSaleDiscount({ amountCents: 0, totalCents: 120000, remiseCents: 10000 }) === null, 'money not received (avoir, delivery) still sends no discount');
ok(mzSaleDiscount({ amountCents: 0, totalCents: 0, remiseCents: 0 }) === null, 'nothing discounted, nothing sent');
/* ── boutique : le ticket entièrement offert ───────────────────────────── */
{
  const calls = [];
  const res = await payOffered({ onPaid: (parts, ctx2) => { calls.push(['paid', parts, ctx2]); return { sale: { id: 'T1' } }; }, onCancel: () => calls.push(['cancel']) },
    { print: (o, parts) => calls.push(['print', parts]), toast: (m) => calls.push(['toast', m]) });
  ok(res && res.sale.id === 'T1', 'payOffered returns the recorded sale');
  ok(calls[0][0] === 'paid' && calls[0][1].length === 1 && calls[0][1][0].m === OFFERED_PART && calls[0][1][0].amount === 0 && calls[0][2].paidNow === 0, 'it records through the normal onPaid with one 0 MAD « offert » part');
  ok(calls.some((c) => c[0] === 'print') && calls.some((c) => c[0] === 'toast'), 'and prints the receipt');
  const refused = []; await payOffered({ beforePaid: async () => false, onPaid: () => refused.push('paid'), onCancel: () => refused.push('cancel') }, {});
  ok(refused.join() === 'cancel', 'a refused loyalty hold cancels without recording');
}
const BQ = read('assets/pos-boutique.js'), TR = read('assets/pos-boutique/ticket-remise.js');
ok(/concat\(pcts\.filter\(\(p\) => p < 100\), \[100\]\)/.test(TR) && /r === 100 \? tr\('Offert'\)/.test(TR) && /\(t\.remiseAuth && pct < 100\)/.test(TR)
  && /\(total > 0 \|\| !\(tot\.remise > 0\) \? openPay : \(o\) => payOffered\(/.test(BQ) && /settlementKind: 'complimentary', method: 'complimentary', paymentParts: undefined, ticketAmountCents: undefined/.test(BQ) && /filter\(n => n > 0 && n < 100\)/.test(BQ),
  'the boutique has an approved « Offert » chip, skips the pay screen only for a ticket its remise brought to 0, and mirrors it as complimentary');

console.log(`✓ offered-items-test : ${n} contrôles (remise 100 %, encaisser 0 MAD, article offert, caisse et boutique)`);
