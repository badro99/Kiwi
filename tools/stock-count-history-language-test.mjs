#!/usr/bin/env node
import stockTestSource from './stock-test-source.cjs';
/* Historique des inventaires, revue propriétaire et journal des pertes ·
 * ce que le commerçant lit suit la langue de l'écran.
 *
 * 2026-10-12. Sous l'anglais et l'arabe, l'onglet « Historique des
 * inventaires » de la page Stock, sa fenêtre de revue, le journal des pertes,
 * la déclaration de perte et les deux exports CSV restaient en français :
 * « Soumis par Propriétaire le … », « Note de revue : … (par Propriétaire) »,
 * « Magasin principal », « Inconnu », « Perte enregistrée et déduite du
 * stock », des en-têtes « Ecart_Net_MAD », et « MAD » sous l'arabe.
 *
 * Ce qui est STOCKÉ ne bouge pas : « Propriétaire », « Magasin principal »,
 * « Déclaration perte · perime », « Remplacé par … » restent dans les
 * registres et dans ce qu'on envoie au serveur. La traduction se fait à
 * l'affichage. Sous FR, chaque libellé reste celui d'avant.
 *
 * Les VRAIES fonctions de assets/stock.js tournent ici en vm ; seul
 * l'environnement est feint (registre, fenêtre, téléchargement).
 *   node tools/stock-count-history-language-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = stockTestSource(ROOT);

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* Les déclarations module de stock.js sont à l'indentation 2 : la première
   ligne `  }` ou `  };` après le début ferme la déclaration. */
function block(start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `stock.js declares « ${start.trim()} »`);
  const m = /\n {2}\};?\n/.exec(src.slice(i));
  assert.ok(m, 'closing brace for ' + start);
  return src.slice(i, i + m.index + m[0].length);
}
function line(start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `stock.js declares « ${start.trim()} »`);
  return src.slice(i, src.indexOf('\n', i));
}
const fn = (name) => block(`  function ${name}(`);
const asyncFn = (name) => block(`  async function ${name}(`);

let SOURCE = null;
let sourceError = null;
try {
  SOURCE = [
    line('  const lang = () =>'),
    line('  const esc = (s) =>'),
    line('  const localeFor = () =>'),
    block('  const fmtNum = (n, dec = 0) => {'),
    block('  const fmtMad = (n) => {'),
    block('  const COUNT_STR = {'),
    ...['ct', 'ctMad', 'ctNum', 'ctWhen', 'ctWho', 'ctRole', 'ctStore', 'ctReviewNote', 'ctReason', 'ctWasteNote', 'ctUnit'].map(fn),
    ...['getWasteMovements', 'renderWasteJournal', 'exportWasteCsv', 'cancelWasteMovement', 'openDeclareWasteModal'].map(fn),
    ...['getAllCounts', 'filterCounts', 'renderCountsHistory', 'renderCountsRollup', 'exportCountsCsv'].map(fn),
    asyncFn('openCountDetailModal'),
    ...['stReviewBusyTake', 'stReviewBusyRelease', 'stReviewCountErr', 'stReviewCountPlan'].map(fn),
    asyncFn('stReviewCountSend'),
    asyncFn('reviewCount'),
  ].join('\n');
} catch (e) { sourceError = e; }

/* ── Données : noms de produit en arabe, identifiants en chiffres, pour que
   tout caractère latin lu sous l'arabe soit forcément de la copie Kiwi. ── */
const NOW = Date.UTC(2026, 9, 12, 9, 30);
const INV = [{ id: '501', name: 'طماطم', unit: 'unité', costPerUnit: 3, currentStock: 12.5 }];
const LOCAL_HISTORY = [{
  ref: '7001', ts: NOW - 3600e3, counted: 1, varMad: -12,
  gaps: [{ id: '501', name: 'طماطم', unit: 'unité', theo: 10, counted: 8.5, diff: -1.5, mad: -12, reason: '' }],
}];
const SERVER_COUNTS = () => [
  { id: '7002', status: 'submitted', storeId: '', storeName: 'Caisse Principale', employeeId: '', employeeName: 'Caissier', employeeRole: 'Caissier',
    submittedAt: NOW - 1800e3, totalLines: 1, totalVarianceCostMAD: 1234.5, absVarianceCostMAD: 1234.5,
    lines: [{ itemId: '502', productName: 'سكر', sku: '502', unit: 'unité', systemQty: 4, countedQty: 5, diff: 1, varianceCost: 1234.5, explanation: '' }] },
  { id: '7003', status: 'rejected', storeId: '', storeName: '', employeeId: '', employeeName: 'Employé', employeeRole: 'cashier',
    submittedAt: NOW - 7200e3, reviewerName: 'Propriétaire', reviewDecision: 'rejected', reviewNote: 'Remplacé par 7004',
    totalLines: 1, totalVarianceCostMAD: 0, absVarianceCostMAD: 0,
    lines: [{ itemId: '501', productName: 'طماطم', sku: '501', unit: 'unité', systemQty: 2, countedQty: 2, diff: 0, varianceCost: 0, explanation: '' }] },
  { id: '7005', status: 'applied', storeId: '', storeName: 'Principal', employeeId: '', employeeName: '', employeeRole: 'Admin',
    submittedAt: NOW - 9000e3, reviewerName: 'سلمى (Propriétaire)', reviewDecision: 'approved', reviewNote: 'تم',
    totalLines: 1, totalVarianceCostMAD: -6, absVarianceCostMAD: 6,
    lines: [{ itemId: '501', productName: 'طماطم', sku: '501', unit: 'kg', systemQty: 3, countedQty: 1, diff: -2, varianceCost: -6, explanation: '' }] },
];
const WASTE = () => [
  { id: '9001', itemId: '501', qty: -2, reason: 'waste', refType: 'waste', refId: '9001', occurredTs: NOW - 600e3, unitCost: 3,
    note: 'Déclaration perte · perime', actor: 'Propriétaire', meta: { wasteReason: 'perime', actor: 'Propriétaire', lotId: '33' } },
  { id: '9002', itemId: '501', qty: 2, reason: 'manual', refType: 'waste', reversalOf: '9001', occurredTs: NOW - 300e3, unitCost: 3,
    note: 'Annulation perte 9001', actor: 'Propriétaire', meta: {} },
];

function world(lang, over = {}) {
  const spies = { toasts: [], modals: [], modalHandles: [], openModal: [], adds: [], blobs: [], downloads: [], confirms: [], fetches: [], reverses: [] };
  const formEls = {
    'st-wf-item': { value: '501' }, 'st-wf-qty': { value: '1.5' }, 'st-wf-reason': { value: 'casse' }, 'st-wf-note': { value: '' },
  };
  let form = null;
  const win = {
    KiwiI18n: { getLang: () => lang },
    KiwiNumber: {
      locale: () => (lang === 'en' ? 'en-GB' : 'fr-FR'),
      number: (v, d = 0) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v),
    },
    Kiwi: {
      toast: (msg, o) => { spies.toasts.push({ msg, type: o && o.type }); },
      /* La fenêtre partagée (Kiwi.modal) : seul le bouton qui annule une perte
         est cliquable ici ; « Garder la perte » ferme sans rien faire, comme
         Échap, la croix ou le fond dans interactive.js. */
      modal: (o) => {
        spies.modals.push(o);
        const fns = [];
        const m = { o, closed: false, close() { m.closed = true; }, click: () => fns.forEach((f) => f()),
          el: { querySelector: (sel) => (sel === '[data-stock-loss-reverse]' ? { addEventListener: (t, f) => { if (t === 'click') fns.push(f); } } : null) } };
        spies.modalHandles.push(m);
        return m;
      },
    },
    KiwiInventory: {
      history: () => WASTE(),
      add: (m) => { spies.adds.push(m); return m; },
      sync: async () => true,
      reverse: (m, reason, note) => { spies.reverses.push({ id: m.id, note }); return over.reverseFails ? null : { id: 'r1' }; },
    },
    KiwiBoutiqueCatalog: { sync: () => {} },
  };
  win.window = win;
  const doc = {
    getElementById: (id) => {
      if (id === 'st-waste-declare-form') { form = form || {}; return form; }
      return formEls[id] || null;
    },
    createElement: () => { const a = { click: () => spies.downloads.push(a.download) }; return a; },
    body: { appendChild: () => {}, removeChild: () => {} },
    querySelector: () => null,
  };
  class Blob { constructor(parts) { spies.blobs.push(parts.join('')); } }
  const ctx = vm.createContext({
    window: win, document: doc, Blob, console,
    URL: { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} },
    setTimeout: () => 0,
    confirm: (msg) => { spies.confirms.push(msg); return true; },
    fetch: async (url, opts) => {
      spies.fetches.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    },
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, Promise, Intl, isNaN,
    svg: () => '',
    t: (k) => k,
    getInv: () => INV,
    stCountHistory: () => LOCAL_HISTORY,
    stShowReal: () => !!over.real,
    stockLocationId: () => 'principal',
    openModal: (html) => { spies.openModal.push(html); },
    closeModal: () => {}, closeTopModal: () => {}, render: () => {}, rerenderTabBody: () => {},
    fetchServerCounts: async () => {},
    topBackdrop: () => null, wireDismiss: () => {},
    moveStock: () => ({ id: 'm1' }), stSaveOverlay: () => {},
  });
  vm.runInContext([
    "let stWasteDateRange = 'tout', stWasteFilterReason = 'all', stWasteSearch = '';",
    "let stCountDateFilter = 'tout', stCountStatusFilter = 'all', stCountSearch = '', stCountSubTab = 'list';",
    'let stCountsCache = [], stCountsLastFetched = Date.now(), stPageActive = false, stItemSubView = "counts";',
    'let stReviewBusy = false;',
    SOURCE,
    'globalThis.__setCounts = (c) => { stCountsCache = c; };',
    'globalThis.__setSubTab = (v) => { stCountSubTab = v; };',
  ].join('\n'), ctx, { filename: 'stock-count-history.js' });
  ctx.__setCounts(SERVER_COUNTS());
  ctx.form = () => form;
  return { ctx, spies, run: (code) => vm.runInContext(code, ctx) };
}

/* Texte lu : contenu des balises + attributs que l'on voit ou entend. */
function readable(html) {
  const attrs = [...String(html).matchAll(/\s(?:placeholder|title|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]);
  return [String(html).replace(/<[^>]*>/g, ' '), ...attrs].join(' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}
const FRENCH = [
  'Soumis', 'Note de revue', 'Magasin', 'Propriétaire', 'Employé', 'Inconnu', 'Perte', 'perte', 'Inventaire', 'inventaire',
  'Écart', 'écart', 'Validé', 'Refusé', 'Aujourd', 'derniers jours', 'Déclin', 'Fermer', 'Examiner', 'Détails', 'Caisse',
  'Caissier', 'unité', 'Remplacé', 'Déclaration', 'Annul', 'Motif', 'Quantité', 'Chercher', 'Exporter', 'Établissement',
  'Comptages', 'Réf', ' par ', 'Principal', 'Valeur', 'Date & Heure',
];
function assertNotFrench(text, where) {
  for (const w of FRENCH) assert.ok(!text.includes(w), `${where}: French « ${w} » in « ${text.slice(Math.max(0, text.indexOf(w) - 40), text.indexOf(w) + 40)} »`);
  const acc = /[éèêàçùûôîÉÈÀ]/.exec(text);
  assert.ok(!acc, `${where}: French accent « ${acc && text.slice(Math.max(0, acc.index - 30), acc.index + 30)} »`);
}
function assertNoLatin(text, where) {
  const m = /[A-Za-zÀ-ÿ]/.exec(text);
  assert.ok(!m, `${where}: Latin « ${m && text.slice(Math.max(0, m.index - 30), m.index + 30)} »`);
}
const visibleAll = async (lang, over) => {
  const w = world(lang, over);
  const parts = {};
  parts.list = w.run('renderCountsHistory()');
  w.ctx.__setSubTab('rollup');
  parts.rollup = w.run('renderCountsHistory()');
  parts.waste = w.run('renderWasteJournal()');
  w.run('openDeclareWasteModal()');
  parts.declare = w.spies.openModal[0];
  for (const id of ['7001', '7002', '7003', '7005']) {
    await w.run(`openCountDetailModal(${JSON.stringify(id)})`);
  }
  parts.modals = w.spies.modals.map((m) => [m.title, m.desc, m.body, m.foot].join(' ')).join(' ');
  return { w, parts };
};

if (sourceError) {
  await ok('stock.js carries the count-history string table and its helpers', () => { throw sourceError; });
} else {
  await ok('FR, EN and AR carry the same keys, the same shapes, no em dash', () => {
    const w = world('fr');
    const d = w.run('COUNT_STR');
    const shape = (o) => Object.keys(o).sort().map((k) => `${k}:${Array.isArray(o[k]) ? 'array' + o[k].length : typeof o[k]}`).join(',');
    assert.equal(shape(d.en), shape(d.fr));
    assert.equal(shape(d.ar), shape(d.fr));
    assert.ok(!block('  const COUNT_STR = {').includes('\u2014'), 'no U+2014 in the copy');
  });

  await ok('English: list, rollup, review window, waste journal and declaration read no French', async () => {
    const { parts } = await visibleAll('en', { real: true });
    for (const [k, html] of Object.entries(parts)) assertNotFrench(readable(html), k);
    const list = readable(parts.list);
    assert.ok(list.includes('Count list') && list.includes('To review (1)') && list.includes('COUNTS COMPLETED'), list.slice(0, 200));
    assert.ok(list.includes('Main store') && list.includes('Owner') && list.includes('Main register') && list.includes('Cashier'), 'stored placeholders read in English');
    assert.ok(readable(parts.rollup).includes('Unknown'), 'an unnamed counter reads « Unknown »');
    const modals = readable(parts.modals);
    assert.ok(modals.includes('Submitted by Owner on '), modals.slice(0, 160));
    assert.ok(modals.includes('Review note: Replaced by 7004 (by Owner)'), 'review note and reviewer in English');
    assert.ok(modals.includes('سلمى (Owner)'), 'a named owner keeps the name, the role reads in English');
    assert.ok(readable(parts.waste).includes('Loss declared · Expired'), 'the generated loss note reads in English');
  });

  await ok('Arabic: the same surfaces carry no Latin letter, money in « درهم »', async () => {
    const { parts } = await visibleAll('ar', { real: true });
    for (const [k, html] of Object.entries(parts)) assertNoLatin(readable(html), k);
    const list = readable(parts.list);
    assert.ok(list.includes('درهم'), 'currency reads درهم');
    assert.ok(list.includes('المتجر الرئيسي') && list.includes('المالك'), 'stored placeholders read in Arabic');
    assert.ok(readable(parts.modals).includes('أرسله المالك في'), 'review window says who submitted, in Arabic');
    assert.ok(readable(parts.list).includes('+1 234,50 درهم'), 'amounts keep the KiwiNumber separators and read درهم');
  });

  await ok('French: every label reads as it did before', async () => {
    const { parts } = await visibleAll('fr', { real: true });
    const list = readable(parts.list);
    for (const s of ['Liste des inventaires', 'Écarts récurrents (Analyse)', 'À valider (1)', 'INVENTAIRES RÉALISÉS', '1 en attente de revue', 'Magasin principal', 'Propriétaire (Admin)', 'Caisse Principale', 'Date & Heure', 'Écart net MAD', '4 inventaires affichés'])
      assert.ok(list.includes(s), `FR list keeps « ${s} »`);
    const modals = readable(parts.modals);
    assert.match(modals, /Inventaire #7001 Magasin principal · Soumis par Propriétaire le \d\d\/\d\d\/\d{4} à \d\d:\d\d/);
    assert.ok(modals.includes('Note de revue : Remplacé par 7004 (par Propriétaire)'), 'FR review note unchanged');
    assert.ok(modals.includes('Valider et appliquer le stock') && modals.includes("Refuser l'inventaire"), 'FR review buttons unchanged');
    const waste = readable(parts.waste);
    assert.ok(waste.includes('Tous motifs') && waste.includes('Total : 2 lignes de pertes · Valeur cumulée :'), 'FR waste journal unchanged');
    assert.ok(readable(parts.declare).includes('Déclarer une perte de stock'), 'FR declaration window unchanged');
  });

  await ok('a reversed loss is dimmed, never set in italics', () => {
    const w = world('fr', { real: true });
    assert.ok(!/font-style:\s*italic/.test(w.run('renderWasteJournal()')), 'type is roman');
  });

  await ok('declaring a loss: the toast follows the screen, the record stays French', () => {
    const expect = { fr: 'Perte enregistrée et déduite du stock', en: 'Loss recorded and deducted from stock', ar: 'سُجّلت الخسارة وخُصمت من المخزون' };
    for (const lang of ['fr', 'en', 'ar']) {
      const w = world(lang);
      w.run('openDeclareWasteModal()');
      w.ctx.form().onsubmit({ preventDefault() {} });
      assert.equal(w.spies.adds.length, 1, lang + ': one movement');
      assert.equal(w.spies.adds[0].note, 'Déclaration perte · casse', lang + ': stored note unchanged');
      assert.equal(w.spies.adds[0].meta.actor, 'Propriétaire', lang + ': stored actor unchanged');
      assert.deepEqual(w.spies.toasts.map((t) => t.msg), [expect[lang]], lang + ': toast');
    }
  });

  await ok('cancelling a loss: the question opens in the shared modal, in the screen language, never a native confirm', () => {
    const yes = { fr: 'Annuler cette perte', en: 'Cancel this loss', ar: 'إلغاء هذه الخسارة' };
    const keep = { fr: 'Garder la perte', en: 'Keep the loss', ar: 'الإبقاء على الخسارة' };
    for (const lang of ['fr', 'en', 'ar']) {
      const w = world(lang, { real: true });
      w.run("cancelWasteMovement('9001')");
      assert.equal(w.spies.confirms.length, 0, lang + ': no native confirm');
      assert.equal(w.spies.modals.length, 1, lang + ': one shared modal');
      const o = w.spies.modals[0];
      assert.equal(o.title, yes[lang], lang + ': title');
      assert.ok(o.foot.includes(`data-dismiss data-autofocus data-stock-loss-keep>${keep[lang]}<`), lang + ': the safe choice holds the focus and closes the modal');
      assert.equal(w.spies.reverses.length, 0, lang + ': nothing written before the answer');
      const said = readable(o.title + ' ' + o.body + ' ' + o.foot);
      if (lang === 'en') assertNotFrench(said, 'cancel'); else if (lang === 'ar') assertNoLatin(said.replace(/\d|[.,]/g, ''), 'cancel');
    }
  });

  await ok('cancelling a loss: keep leaves the ledger alone, confirm writes the reversal with its stored note', () => {
    const done = { fr: 'Perte annulée · contre-mouvement enregistré', en: 'Loss cancelled · reversing movement recorded', ar: 'أُلغيت الخسارة · سُجّلت حركة عكسية' };
    for (const lang of ['fr', 'en', 'ar']) {
      const kept = world(lang, { real: true });
      kept.run("cancelWasteMovement('9001')");
      kept.spies.modalHandles[0].close();
      assert.equal(kept.spies.reverses.length, 0, lang + ': keep writes nothing');
      assert.equal(kept.spies.toasts.length, 0, lang + ': keep says nothing');
      const w = world(lang, { real: true });
      w.run("cancelWasteMovement('9001')");
      w.spies.modalHandles[0].click();
      assert.equal(w.spies.modalHandles[0].closed, true, lang + ': the modal closes');
      assert.equal(w.spies.reverses.length, 1, lang + ': one reversal');
      assert.equal(w.spies.reverses[0].note, 'Annulation perte 9001', lang + ': stored reversal note');
      assert.deepEqual(w.spies.toasts, [{ msg: done[lang], type: 'success' }], lang + ': toast');
    }
  });

  await ok('cancelling a loss: a refused reversal says so in the screen language', () => {
    const fail = { fr: 'La perte n’a pas pu être annulée. Rien n’a changé dans le registre.', en: 'The loss could not be cancelled. Nothing changed in the ledger.', ar: 'تعذّر إلغاء الخسارة. لم يتغير شيء في السجل.' };
    for (const lang of ['fr', 'en', 'ar']) {
      const w = world(lang, { real: true, reverseFails: true });
      w.run("cancelWasteMovement('9001')");
      w.spies.modalHandles[0].click();
      assert.deepEqual(w.spies.toasts, [{ msg: fail[lang], type: 'warn' }], lang + ': failure toast');
    }
  });

  await ok('stock.js no longer calls a native confirm()', () => {
    assert.ok(!/(^|[^\w.])confirm\(/m.test(src), 'a bare confirm( call remains in assets/stock.js');
    assert.ok(!/window\.confirm\(/.test(src), 'window.confirm( remains in assets/stock.js');
  });

  await ok('stored counts keep their French placeholders under EN and AR', () => {
    for (const lang of ['en', 'ar']) {
      const local = world(lang).run('getAllCounts()').find((c) => c.id === '7001');
      assert.equal(local.storeName, 'Magasin principal');
      assert.equal(local.employeeName, 'Propriétaire');
      assert.equal(local.reviewerName, 'Propriétaire');
    }
  });

  await ok('owner review: toast in the screen language, reviewer stored and sent as « Propriétaire »', async () => {
    const expect = { fr: 'Inventaire validé · stock mis à jour', en: 'Count approved · stock updated', ar: 'قُبل الجرد · تم تحديث المخزون' };
    for (const lang of ['fr', 'en', 'ar']) {
      const demo = world(lang);
      await demo.run("reviewCount('7002', 'approved', '')");
      assert.deepEqual(demo.spies.toasts.map((t) => t.msg), [expect[lang]], lang + ': approve toast');
      const real = world(lang, { real: true });
      await real.run("reviewCount('7002', 'rejected', 'x')");
      assert.equal(real.spies.fetches[0].body.reviewerName, 'Propriétaire', lang + ': reviewer sent to the server');
      assert.equal(real.run("getAllCounts().find((c) => c.id === '7002').reviewerName"), 'Propriétaire', lang + ': reviewer kept locally');
    }
    const rej = world('en', { real: true });
    await rej.run("reviewCount('7002', 'rejected', '')");
    assert.deepEqual(rej.spies.toasts.map((t) => t.msg), ['Count rejected']);
  });

  await ok('count CSV: headers in the screen language, FR export byte-stable', () => {
    const csv = (lang) => { const w = world(lang); w.run('exportCountsCsv()'); return { text: w.spies.blobs[0].replace(/^\uFEFF/, ''), file: w.spies.downloads[0] }; };
    const fr = csv('fr'), en = csv('en'), ar = csv('ar');
    assert.equal(fr.text.split('\r\n')[0], 'ID_Inventaire;Date;Magasin;Employe;Role;Statut;Nb_Lignes;Ecart_Net_MAD;Ecart_Abs_MAD;Validateur;Decision;Note_Revue');
    assert.ok(fr.file.startsWith('historique-inventaires-'));
    assert.ok(fr.text.includes('"Magasin principal";"Propriétaire";"Admin"') && fr.text.includes('"Remplacé par 7004"'), 'FR rows unchanged');
    assert.equal(en.text.split('\r\n')[0], 'Count_ID;Date;Store;Employee;Role;Status;Lines;Net_Variance_MAD;Abs_Variance_MAD;Reviewer;Decision;Review_Note');
    assert.ok(en.file.startsWith('count-history-'));
    assert.ok(en.text.includes('"Main store";"Owner";"Admin"') && en.text.includes('"Replaced by 7004"'), 'EN rows read placeholders in English');
    assertNoLatin(ar.text.split('\r\n')[0], 'AR count CSV header');
    for (const w of ['Propriétaire', 'Magasin principal', 'Caisse Principale', 'Remplacé']) assert.ok(!ar.text.includes(w), `AR rows: no « ${w} »`);
  });

  await ok('waste CSV: headers in the screen language, FR export byte-stable', () => {
    const csv = (lang) => { const w = world(lang); w.run('exportWasteCsv()'); return { text: w.spies.blobs[0].replace(/^\uFEFF/, ''), file: w.spies.downloads[0] }; };
    const fr = csv('fr'), en = csv('en'), ar = csv('ar');
    assert.equal(fr.text.split('\r\n')[0], 'Date;Article;Quantite;Unite;Motif;Valeur_MAD;Employe;Note;ID_Mouvement');
    assert.ok(fr.file.startsWith('journal-pertes-'));
    assert.ok(fr.text.includes('"unité";"Périmé";6.00;"Propriétaire"'), 'FR rows unchanged');
    assert.equal(en.text.split('\r\n')[0], 'Date;Item;Quantity;Unit;Reason;Value_MAD;Employee;Note;Movement_ID');
    assert.ok(en.text.includes('"unit";"Expired";6.00;"Owner";"Loss declared · Expired"'), 'EN rows read in English');
    assertNoLatin(ar.text.split('\r\n')[0], 'AR waste CSV header');
    for (const w of ['Propriétaire', 'unité', 'Déclaration', 'Annulation']) assert.ok(!ar.text.includes(w), `AR rows: no « ${w} »`);
  });
}

console.log(`\nstock-count-history-language: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
