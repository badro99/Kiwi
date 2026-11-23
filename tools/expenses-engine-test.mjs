/* Dépenses · le moteur (assets/expenses/engine.js). Pur : catégories devinées
 * depuis la note de la caisse, fusion entre appareils, retraits de caisse
 * comptés une seule fois, le mois en chiffres, l'export CSV. Les notes des
 * retraits ci-dessous sont celles que l'équipe de Pasta Corner tape vraiment
 * (sept. à nov. 2026). */
import assert from 'node:assert/strict';
import {
  parseAmount, completionId, nextStamp,
  CATEGORIES, classifyReason, isBankDeposit, notAnExpense, uncountedCashOuts, normalize, mergeDocs,
  cashOutRows, monthView, toCsv, docPrefill, docDuplicate,
} from '../assets/expenses/engine.js';

let n = 0;
const ok = (name) => { n++; console.log('✓ ' + name); };

/* classifies */
assert.deepEqual(CATEGORIES, ['meat', 'produce', 'grocery', 'drinks', 'hygiene', 'packaging', 'supplier', 'energy', 'rent', 'repairs', 'transport', 'staff', 'marketing', 'equipment', 'taxes', 'other']);
const cases = {
  'Poulet et viande': 'meat', 'Fournisseur de beef': 'meat', 'Légumes et fruits': 'produce',
  'Légumes': 'produce', 'Khadar': 'produce', 'Achat de savon': 'hygiene', 'Sachet poubelle': 'hygiene',
  'Achat de serviette papier': 'hygiene', 'Achat fournisseur': 'supplier', 'Avance personnel': 'staff',
  'Akajo': 'other', 'خضرة': 'produce', 'Bouteille de gaz': 'energy', 'Coca et eau': 'drinks',
  'Boîtes à emporter': 'packaging', 'Fromage mozzarella': 'grocery', '': 'other',
  /* Darija et noms de magasins, tels que tapés à Pasta Corner. */
  'Bayedat': 'grocery', 'Helib': 'grocery', 'Ziyet': 'grocery', '3atriya': 'grocery', 'Moutarde': 'grocery',
  'Vinaigre de pomme': 'grocery', 'Cacao': 'grocery', 'Basilic': 'produce', 'Orange 🍊': 'produce', 'Piment fort': 'produce',
  'Gas': 'energy', 'Femme de ménage': 'staff', 'Livreurs': 'transport', 'Livreure': 'transport',
  'Technicien de projecteur': 'repairs', 'Logo': 'marketing', 'Marjan': 'supplier', 'Carfour': 'supplier',
  'Duracell simply balance': 'equipment', 'Halfa selk': 'hygiene',
};
for (const [text, cat] of Object.entries(cases)) assert.equal(classifyReason(text), cat, text);
ok('classifies the till notes into categories');

/* Corrections de caisse : l'argent ne quitte pas le commerce, ce n'est pas une dépense. */
for (const t of ['Fond caisse', 'Fond caise', 'Change', 'Ereure de encaisment', "Ereure de l'encaissement", "Erreur d'encaissement", 'Releu t.p.e', 'Relevé TPE', 'Dépôt banque']) {
  assert.ok(notAnExpense(t), t);
}
for (const t of ['Achat fournisseur', 'Problème de client', 'Légumes']) assert.equal(notAnExpense(t), '', t);
assert.equal(notAnExpense('Fond caisse'), 'float');
assert.equal(notAnExpense('Dépôt banque'), 'bank');
const floatEv = { id: 'f1', event_type: 'movement', movement_kind: 'out', movement_amount_cents: 13900, movement_reason: 'Fond caisse', occurred_ts: Date.UTC(2026, 10, 3, 12), day: '2026-11-03' };
assert.deepEqual(cashOutRows([floatEv], []), []);
assert.deepEqual(uncountedCashOuts([floatEv]).map((r) => [r.id, r.kind, r.amountCents]), [['f1', 'float', 13900]]);
ok('till corrections and float moves are shown apart, never counted as spending');

/* excludesBankDeposit */
assert.equal(isBankDeposit('Dépôt banque'), true);
assert.equal(isBankDeposit('depot BANQUE'), true);
assert.equal(isBankDeposit('إيداع بنكي'), true);
assert.equal(isBankDeposit('Achat fournisseur'), false);
const deposit = { id: 'd1', event_type: 'movement', movement_kind: 'out', movement_amount_cents: 500000, movement_reason: 'Dépôt banque', occurred_ts: Date.UTC(2026, 10, 3, 12), day: '2026-11-03' };
assert.deepEqual(cashOutRows([deposit], []), []);
ok('a bank deposit is never an expense');

/* dedupesCompletedCashOut */
const ev = { id: 'e1', event_type: 'movement', movement_kind: 'out', movement_amount_cents: 5000, movement_reason: 'Légumes', actor_id: 'emp-1', occurred_ts: Date.UTC(2026, 10, 3, 10), day: '2026-11-03' };
const evIn = { ...ev, id: 'e2', movement_kind: 'in' };
const done = { id: 'x1', date: '2026-11-03', amountCents: 5000, category: 'produce', cashEventId: 'e1', updatedAt: 2 };
assert.deepEqual(cashOutRows([ev, evIn], [done]), []);
const rows = cashOutRows([ev, evIn], [{ ...done, deleted: true }]);
assert.equal(rows.length, 1);
assert.deepEqual(rows[0], { id: 'cash:e1', cashEventId: 'e1', date: '2026-11-03', amountCents: 5000, category: 'produce', guessed: true, note: 'Légumes', actorId: 'emp-1', source: 'till', method: 'cash', supplier: '' });
ok('a completed cash-out counts once, a movement in is not an expense');

/* mergeKeepsTombstones */
const merged = mergeDocs({ list: [{ id: 'a', updatedAt: 2, deleted: true, date: '2026-11-01', amountCents: 900 }] },
  { list: [{ id: 'a', updatedAt: 1, amountCents: 900, date: '2026-11-01' }, { id: 'b', updatedAt: 1, amountCents: 100, date: '2026-11-02' }] });
assert.equal(merged.list.find((r) => r.id === 'a').deleted, true);
assert.equal(merged.list.length, 2);
const tie = mergeDocs({ list: [{ id: 'a', updatedAt: 5, amountCents: 1, date: '2026-11-01' }] }, { list: [{ id: 'a', updatedAt: 5, deleted: true, amountCents: 1, date: '2026-11-01' }] });
assert.equal(tie.list[0].deleted, true);
ok('a deletion survives an older copy from another device');

/* normalize */
const norm = normalize({ list: [null, { id: 'ok', date: '2026-11-01', amountCents: 1500.7, category: 'zzz' }, { id: '', amountCents: 5 }, { id: 'neg', date: '2026-11-01', amountCents: -5 }] });
assert.equal(norm.list.length, 2);
assert.equal(norm.list[0].amountCents, 1501);
assert.equal(norm.list[0].category, 'other');
assert.equal(norm.list[1].amountCents, 0);
assert.deepEqual(normalize(null), { list: [] });
ok('normalize drops broken rows and clamps amounts');

/* monthView totals */
const month = '2026-11';
const view = monthView({
  month, today: '2026-11-17',
  salesDays: [{ day: '2026-11-03', salesCents: 10000 }, { day: '2026-11-04', salesCents: 5000 }, { day: '2026-10-31', salesCents: 99999 }],
  expenses: [
    { id: 'm1', date: '2026-11-03', amountCents: 3000, category: 'meat', updatedAt: 1 },
    { id: 'm2', date: '2026-11-04', amountCents: 7000, category: 'rent', updatedAt: 1, deleted: true },
    { id: 'm3', date: '2026-10-30', amountCents: 4000, category: 'meat', updatedAt: 1 },
  ],
  cashOuts: [{ ...ev, id: 'e9', movement_amount_cents: 2000, day: '2026-11-04' }],
});
assert.equal(view.inCents, 15000);
assert.equal(view.outCents, 5000);
assert.equal(view.leftCents, 10000);
assert.deepEqual(view.byDay.filter((d) => d.outCents).map((d) => [d.day, d.outCents]), [['2026-11-03', 3000], ['2026-11-04', 2000]]);
assert.equal(view.byDay.length, 30);
assert.deepEqual(view.byCategory.map((c) => [c.category, c.cents, c.count]), [['meat', 3000, 1], ['produce', 2000, 1]]);
assert.deepEqual(view.rows.map((r) => r.id), ['cash:e9', 'm1']);
assert.equal(view.fixed, null);
ok('the month adds up: in, out, left, by day, by category');

/* fixed pro-rated */
const fixedView = monthView({
  month: '2026-10', today: '2026-10-10', salesDays: [], cashOuts: [{ ...ev, id: 'adv', movement_reason: 'Avance personnel', movement_amount_cents: 20000, day: '2026-10-05' }],
  expenses: [{ id: 'r1', date: '2026-10-02', amountCents: 600000, category: 'rent', updatedAt: 1 }],
  charges: [{ category: 'rent', monthlyCents: 3100000 }],
  salaries: { monthlyCents: 3100000 },
});
assert.equal(fixedView.fixed.chargesCents, 400000);
assert.equal(fixedView.fixed.salariesCents, 1000000);
assert.equal(fixedView.fixed.advancesCents, 20000);
assert.equal(fixedView.outCents, 620000);
/* The advance already left in Dépensé: only the rest of the salary is still to pay. */
assert.equal(fixedView.fixed.afterFixedCents, fixedView.leftCents - 400000 - (1000000 - 20000));
const past = monthView({ month: '2026-09', today: '2026-11-17', salesDays: [], cashOuts: [], expenses: [], charges: [{ category: 'rent', monthlyCents: 300000 }] });
assert.equal(past.fixed.chargesCents, 300000);
assert.equal(past.fixed.salariesCents, 0);
ok('fixed charges and salaries are pro-rated and never counted twice');

/* csv */
const csv = toCsv([{ id: 'c', date: '2026-11-03', category: 'meat', supplier: 'Boucherie', method: 'cash', amountCents: 25000, vatCents: 0, source: 'manual' }], 'fr');
assert.equal(csv.split('\n')[0], 'date,category,supplier,method,amount,vat,source,receipt,note,id');
assert.equal(csv.split('\n')[1], '2026-11-03,meat,Boucherie,cash,250.00,0.00,manual,no,,c');
assert.equal(toCsv([{ id: 'cash:c9', date: '2026-11-04', category: 'meat', source: 'till', method: 'cash', amountCents: 9000, note: 'viande hachée' }]).split('\n')[1], '2026-11-04,meat,,cash,90.00,0.00,till,no,viande hachée,cash:c9');
assert.equal(toCsv([{ id: 'n', date: '2026-11-04', category: 'other', amountCents: 100, note: '=cmd|calc' }]).split('\n')[1], "2026-11-04,other,,cash,1.00,0.00,manual,no,'=cmd|calc,n");
assert.equal(toCsv([{ id: 'q', date: '2026-11-03', category: 'other', supplier: 'Dupont, "fils"', method: 'card', amountCents: 5, source: 'scan', receiptKey: 'k' }]).split('\n')[1],
  '2026-11-03,other,"Dupont, ""fils""",card,0.05,0.00,scan,yes,,q');
/* Le comptable ouvre le fichier dans Excel : un texte libre qui commence par
   = + - @ ou une tabulation ne doit jamais devenir une formule. */
const evil = toCsv([{ id: 'z', date: '2026-11-03', category: 'other', supplier: '=HYPERLINK("http://x","y")', method: '@SUM(1)', amountCents: 100, source: 'manual' },
  { id: 'z2', date: '2026-11-03', category: 'other', supplier: '+212 600\r', method: 'cash', amountCents: 100, source: 'manual' }]).split('\n');
assert.equal(evil[1], `2026-11-03,other,"'=HYPERLINK(""http://x"",""y"")",cash,1.00,0.00,manual,no,,z`);
assert.ok(evil[2].startsWith(`2026-11-03,other,"'+212 600\r"`), evil[2]);
ok('CSV export for the accountant, safe to open in a spreadsheet');

/* completedTwice · deux appareils complètent le même retrait : une seule ligne compte. */
{
  const ev = [{ id: 'c7', day: '2026-11-03', movement_kind: 'out', movement_amount_cents: 20000, movement_reason: 'Légumes' }];
  const a = { id: 'xp_a1b2c3', date: '2026-11-03', amountCents: 20000, category: 'produce', source: 'till', cashEventId: 'c7', updatedAt: 5 };
  const b = { ...a, id: 'xp_z9y8x7', supplier: 'Souk', updatedAt: 9 };
  const v = monthView({ month: '2026-11', today: '2026-11-17', expenses: [a, b], cashOuts: ev, salesDays: [] });
  assert.equal(v.outCents, 20000);
  assert.deepEqual(v.rows.map((r) => r.id), ['xp_z9y8x7'], 'the newest completion wins');
  assert.equal(completionId('c7'), completionId('c7'));
  assert.match(completionId('c7'), /^[A-Za-z0-9_-]{6,64}$/);
  assert.match(completionId('a/b:c d'.repeat(20)), /^[A-Za-z0-9_-]{6,64}$/);
  ok('a till withdrawal completed on two devices counts once, newest completion kept');
}

/* chargesShareCategory · plusieurs charges dans la même catégorie. */
{
  const paid = { id: 'p1', date: '2026-11-02', amountCents: 30000, category: 'other', source: 'manual', updatedAt: 1 };
  const v = monthView({ month: '2026-10', today: '2026-11-17', expenses: [{ ...paid, date: '2026-10-02' }], cashOuts: [], salesDays: [],
    charges: [{ category: 'other', monthlyCents: 30000 }, { category: 'other', monthlyCents: 50000 }] });
  assert.equal(v.fixed.chargesCents, 50000, 'planned 800 in "other", 300 already paid: 500 left');
  ok('fixed charges are totalled per category before what was paid is taken off');
}

/* parseAmountFrench · ce que le patron tape. */
{
  const cases = [['250', 25000], ['250,5', 25050], ['412.50', 41250], ['1 234,50', 123450], ['1.234,50', 123450],
    ['1,234.50', 123450], ['1.500', 150000], ['1 500', 150000], ['12,5 MAD', 1250], [' 2 000', 200000],
    ['', 0], ['0', 0], ['-50', 0], ['abc', 0], ['99999999', 0]];
  assert.deepEqual(cases.map(([t]) => parseAmount(t)), cases.map(([, c]) => c));
  ok('typed amounts: French and English separators, no negatives, nothing above the cap');
}

/* bankWords · ce que les caissiers écrivent pour un dépôt, et un TPE qui n'est pas une correction. */
{
  const bank = ['Versement', 'versement espèces', 'BMCE', 'dépôt bq', 'Depot BQ', 'Attijari', 'CIH', 'Banque Populaire', 'AWB', 'Barid'];
  assert.deepEqual(bank.filter((t) => notAnExpense(t) !== 'bank'), [], 'all read as bank deposits');
  assert.equal(notAnExpense('versement salaire Youssef'), '', 'paying a wage is spending');
  assert.equal(notAnExpense('rouleaux TPE'), '', 'buying terminal rolls is spending');
  assert.equal(notAnExpense('erreur TPE'), 'correction');
  assert.equal(notAnExpense('relevé TPE'), 'correction');
  ok('bank deposit words the team actually writes; a TPE purchase is still an expense');
}

/* skewedClock · un appareil en avance d'une heure ne gagne pas contre une modification faite après lui. */
{
  const now = Date.UTC(2026, 10, 17, 12);
  const ahead = { id: 'k1', date: '2026-11-03', amountCents: 9000, category: 'meat', updatedAt: now + 3600000 };
  const stamp = nextStamp(ahead.updatedAt, now);
  assert.ok(stamp > ahead.updatedAt);
  assert.equal(nextStamp(5, now), now, 'a normal clock keeps its own time');
  const del = { ...ahead, deleted: true, updatedAt: stamp };
  assert.equal(mergeDocs({ list: [del] }, { list: [ahead] }).list[0].deleted, true);
  assert.equal(mergeDocs({ list: [ahead] }, { list: [del] }).list[0].deleted, true);
  ok('an edit made after seeing a row always beats that row, whatever the clocks say');
}

/* fromDocument · une facture lue par l'assistant (vision-inspect) préremplit la fiche,
   et la même facture ne s'ajoute pas deux fois. Facture réelle de Pasta Corner, 6 nov. 2026. */
{
  const ent = { supplier: 'LEADER Formaggi', date: '2026-11-06', invoiceNumber: 'FA26/11-00117', totalMad: 5193.84, taxMad: 865.64, category: 'alimentation', paymentMethod: 'non_specifie' };
  const p = docPrefill(ent, '2026-11-23');
  assert.deepEqual(p, { amountCents: 519384, vatCents: 86564, supplier: 'LEADER Formaggi', date: '2026-11-06', ref: 'FA26/11-00117', category: 'alimentation', method: '' });
  assert.equal(docPrefill({ ...ent, date: '2026-12-01' }, '2026-11-23').date, '', 'a date after today is not trusted');
  assert.equal(docPrefill({ ...ent, date: '06/11/2026' }, '2026-11-23').date, '', 'only an ISO day is taken');
  assert.equal(docPrefill({ ...ent, paymentMethod: 'especes' }, '2026-11-23').method, 'cash');
  assert.equal(docPrefill({ ...ent, paymentMethod: 'virement' }, '2026-11-23').method, 'transfer');
  assert.equal(docPrefill({ totalMad: 'abc', taxMad: -3 }, '2026-11-23').amountCents, 0);
  assert.equal(docPrefill({ totalMad: 'abc', taxMad: -3 }, '2026-11-23').vatCents, 0);
  assert.equal(docPrefill(null, '2026-11-23').supplier, '');
  const saved = { id: 'xp_1', date: '2026-11-06', amountCents: 519384, supplier: 'Leader formaggi', note: 'Facture FA26/11-00117', category: 'grocery', updatedAt: 1 };
  assert.equal(docDuplicate([saved], ent), saved, 'same supplier, amount and invoice number');
  assert.equal(docDuplicate([{ ...saved, note: 'facture fa26 11 00117' }], ent)?.id, 'xp_1', 'invoice number matched without punctuation');
  assert.equal(docDuplicate([{ ...saved, deleted: true }], ent), null, 'a deleted row is not a duplicate');
  assert.equal(docDuplicate([{ ...saved, amountCents: 519300 }], ent), null, 'another amount is another expense');
  assert.equal(docDuplicate([{ ...saved, note: 'Facture FA26/11-00118' }], ent), null, 'another invoice number is another expense');
  assert.equal(docDuplicate([{ ...saved, note: '' }], { ...ent, invoiceNumber: '' })?.id, 'xp_1', 'no number: supplier, amount and day');
  assert.equal(docDuplicate([{ ...saved, note: '', date: '2026-11-07' }], { ...ent, invoiceNumber: '' }), null);
  assert.equal(docDuplicate(null, ent), null);
  ok('an invoice read by the assistant prefills the sheet and is never added twice');
}

console.log(n + ' groupes · expenses engine');
