#!/usr/bin/env node
/* Kiwi · quatre garde-fous d'encaissement qui ne doivent plus lâcher.
 *
 *  1. Restaurant : après un split, « Encaisser » du panneau de commande
 *     (Ajouter / F2) rouvrait l'encaissement de TOUTE l'addition.
 *  2. Restaurant : fusionner deux tables effaçait les parts déjà payées ;
 *     un seul split « à emporter » global écrasait celui d'une autre commande ;
 *     un pourboire négatif était accepté.
 *  3. Maison : un scan pendant le paiement ajoutait un article vendu sans être
 *     encaissé (la boutique avait déjà la garde).
 *
 * Les fonctions du caisse sont extraites de kiwi-caisse.html et exécutées. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const caisse = read('kiwi-caisse.html');
let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed++; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

/* fn(name) → le texte de `function name(...) { ... }` (accolades appariées). */
function fn(name, src = caisse) {
  const start = src.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(start >= 0, `function ${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}

/* ── pourboire : jamais négatif ──────────────────────────────────────────── */
{
  const splitState = { tipMode: '0', customTipPct: 0 };
  const ctx = vm.createContext({ splitState });
  vm.runInContext(fn('effectiveTipPct'), ctx);
  const tip = (mode, custom) => { splitState.tipMode = mode; splitState.customTipPct = custom; return ctx.effectiveTipPct(); };
  eq(tip('autre', -50), 0, 'a typed -50 % tip counts as 0');
  eq(tip('-10', 0), 0, 'a negative preset counts as 0');
  eq(tip('autre', 250), 100, 'a custom tip is capped at 100 %');
  eq(tip('autre', 12.5), 12.5, 'a normal custom tip is untouched');
  eq(tip('10', 0), 10, 'a preset tip is untouched');
  ok(/splitState\.customTipPct = Math\.min\(100, Math\.max\(0, parseFloat\(e\.target\.value\) \|\| 0\)\)/.test(caisse), 'the custom tip field clamps what is typed');
}

/* ── un split par commande à emporter ────────────────────────────────────── */
{
  const vrapSplits = new Map();
  const ctx = vm.createContext({ vrapSplits, vrapEditingNum: null });
  vm.runInContext([fn('vrapSplitKey'), fn('currentVrapSplit'), fn('savedTakeawaySplitFor')].join('\n'), ctx);
  const seven = { orderNum: 7, sourceLabel: 'À emporter #7', parts: [{ paid: true }, { paid: false }] };
  const eight = { orderNum: 8, sourceLabel: 'À emporter #8', parts: [{ paid: true }, { paid: false }] };
  vrapSplits.set(ctx.vrapSplitKey(7), seven);
  vrapSplits.set(ctx.vrapSplitKey(8), eight);
  ok(vrapSplits.size === 2, 'two takeaway orders each keep their own split');
  ctx.vrapEditingNum = 7;
  ok(ctx.currentVrapSplit() === seven, 'editing order 7 resumes order 7\'s split');
  ctx.vrapEditingNum = 8;
  ok(ctx.currentVrapSplit() === eight, 'editing order 8 resumes order 8\'s split, not 7\'s');
  ctx.vrapEditingNum = 9;
  ok(ctx.currentVrapSplit() === null, 'an order with no split resumes nothing');
  ctx.vrapEditingNum = null;
  ok(ctx.currentVrapSplit() === null, 'a new cart does not inherit an order\'s split');
  ok(ctx.savedTakeawaySplitFor({ num: 8 }) === eight && ctx.savedTakeawaySplitFor({ num: 9 }) === null, 'the takeaway board matches a split by order number');
  ok(!/let vrapSplit\b/.test(caisse), 'the single global vrapSplit slot is gone');
  ok(/vrapSplits: Array\.from\(vrapSplits\.entries\(\)\)/.test(caisse), 'every takeaway split survives a reload');
  ok(/vrapSplits\.set\(vrapSplitKey\(d\.vrapSplit\.orderNum\), d\.vrapSplit\)/.test(caisse), 'a shift saved with the old single slot still restores');
}

/* ── « Encaisser » de la commande ne rouvre pas l'addition entière ──────── */
{
  const tableSplits = new Map();
  const tables = { T1: {} };
  const ctx = vm.createContext({ tableSplits, tables, phoneSessionOf: () => '', persistShift() {} });
  vm.runInContext([fn('splitPaidCount'), fn('liveTableSplit'), fn('tableHasOpenSplit')].join('\n'), ctx);
  ok(ctx.tableHasOpenSplit('T1') === false, 'no split: the whole-bill button stays');
  tableSplits.set('T1', { parts: [{ paid: true, amount: 35 }, { paid: false, amount: 25 }] });
  ok(ctx.tableHasOpenSplit('T1') === true, 'a split with a part still due hides the whole-bill button');
  tableSplits.set('T1', { parts: [{ paid: true }, { paid: true }] });
  ok(ctx.tableHasOpenSplit('T1') === false, 'a fully paid split no longer blocks the table');

  const panel = fn('renderOrderPanel');
  ok(/showPayButtons\(true\);[\s\S]{0,700}tableHasOpenSplit\(tableId\)[\s\S]{0,400}chargeOrder\.hidden = true/.test(panel),
    'renderOrderPanel (Ajouter / F2) hides « Encaisser » while a split is open');
  const handler = caisse.slice(caisse.indexOf("$('#pay-charge-order').addEventListener('click'"));
  ok(/^\$\('#pay-charge-order'\)\.addEventListener\('click', \(\) => \{\s*if \(!selectedId\) return;\s*if \(tableHasOpenSplit\(selectedId\)\)/.test(handler),
    'the « Encaisser » handler itself also refuses while a split is open (review-modal shortcut)');
}

/* ── fusionner deux tables n'efface pas ce qui est déjà payé ─────────────── */
{
  const merge = fn('confirmCaisseMerge');
  const guard = merge.indexOf('liveTableSplit(id)');
  const clear = merge.indexOf('tableSplits.delete(source)');
  ok(guard > 0 && clear > guard, 'the merge refuses before it clears the splits');
  ok(/splitPaidCount\(sp\) > 0/.test(merge) && /Un split déjà encaissé est en cours/.test(merge), 'a split with a paid part blocks the merge, with a message');
  ok(guard < merge.indexOf('await '), 'the guard runs before the server merge is awaited');
}

/* ── maison : pas de scan pendant qu'une fenêtre (paiement) est ouverte ──── */
{
  const maison = read('assets/pos-maison.js');
  const body = fn('commitEan', maison);
  ok(/^function commitEan\(raw\) \{[\s\S]{0,700}\$\$\('\.modal-veil\.is-open', root\)\.length[\s\S]{0,200}return;/.test(body), 'maison: commitEan refuses while a modal is open');
  ok(body.indexOf('modal-veil.is-open') < body.indexOf('addToTicket'), 'maison: the guard runs before the item reaches the ticket');
  const boutique = fn('commitEan', read('assets/pos-boutique.js'));
  ok(boutique.includes("modal-veil.is-open"), 'boutique keeps the same guard');
}

console.log(`✓ caisse payment guards (${passed} controls)`);
