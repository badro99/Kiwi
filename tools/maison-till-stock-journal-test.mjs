#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Maison — les sorties de la CAISSE arrivent aux mouvements de stock
 *
 *   node tools/maison-till-stock-journal-test.mjs
 *
 * La page « Mouvements de stock » du tableau de bord ne montrait que des
 * entrées (stock initial, corrections) : aucune vente, aucune casse du
 * comptoir. Trois trous, tous côté tablette :
 *
 *   · le journal (assets/maison-stock-movements.js) ne s'allume que s'il
 *     reconnaît le métier « maison », et une caisse appairée n'a ni la fiche du
 *     magasin ni le métier d'onboarding : il restait éteint, et chaque vente
 *     bougeait le stock sans écrire sa ligne. pos-maison.js l'allume désormais ;
 *   · la casse du comptoir partait sans code responsable : le serveur la
 *     refusait et elle restait sur la tablette. Elle passe par requestManual ;
 *   · un refus du serveur sortait de la file TOUT le lot — les ventes qui y
 *     voyageaient avec une ligne discrétionnaire ne partaient jamais.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };

const SERVER_AUTOMATIC = (() => {
  const m = /const AUTOMATIC_REASONS = new Set\(\[([\s\S]*?)\]\)/.exec(R('functions/api/inventory/movements.js'));
  return m ? m[1].match(/'[^']+'/g).map((s) => s.slice(1, -1)).sort() : [];
})();

/* Une caisse APPAIRÉE, telle que la tablette du comptoir la voit : pas de
 * KiwiStoreTemplates, pas de KiwiVenue, pas de kiwiBizType — seulement
 * l'appairage. Le serveur est simulé avec sa vraie règle : un lot qui contient
 * un motif discrétionnaire sans capacité est refusé EN ENTIER. */
function bootTill() {
  const memory = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'maison-vogue', type: 'maison', subtype: 'maison', name: 'Maison Vogue' })]]);
  const localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  const posted = [];
  let cursor = 0;
  const fetch = async (url, opts) => {
    if (!opts || opts.method !== 'POST') {
      return { ok: true, status: 200, json: async () => ({ movements: [], cursor, more: false }) };
    }
    const body = JSON.parse(opts.body);
    posted.push(body);
    const discretionary = body.movements.filter((m) => SERVER_AUTOMATIC.indexOf(m.reason) < 0);
    if (discretionary.length && !body.approval) {
      return { ok: false, status: 403, json: async () => ({ error: 'reason-forbidden' }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, accepted: body.movements.map((m) => ({ id: m.id, cursor: ++cursor })) }) };
  };
  const win = {
    localStorage,
    KiwiCloudDoc: { currentSlug: () => 'maison-vogue' },
    KiwiStaff: { name: 'Salma', role: 'Caissier' },
    addEventListener() {}, dispatchEvent() {},
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage, navigator: { onLine: true }, crypto: globalThis.crypto,
    console, Date, Math, JSON, Map, Set, Promise, document: { addEventListener() {} },
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    fetch,
  });
  vm.runInContext(R('assets/inventory-ledger.js'), ctx, { filename: 'inventory-ledger.js' });
  vm.runInContext(R('assets/boutique-catalog.js'), ctx, { filename: 'boutique-catalog.js' });
  vm.runInContext(R('assets/maison-stock-movements.js'), ctx, { filename: 'maison-stock-movements.js' });
  const cat = win.KiwiBoutiqueCatalog;
  cat.use('maison-vogue');
  return { win, cat, MZ: win.KiwiMaisonStock, L: win.KiwiInventory, posted };
}

/* ── I · pourquoi la caisse doit allumer le journal elle-même ────────────── */
const t = bootTill();
ok('une caisse appairée ne reconnaît pas seule le métier maison (précondition)',
  t.MZ.isMaison() === false && !t.win.KiwiStockJournal);

const MAISON = R('assets/pos-maison.js');
const ensure = /function ensureStockJournal\(\) \{[\s\S]{0,160}KiwiMaisonStock\.enable\(\)/.test(MAISON);
ok('pos-maison.js sait allumer le journal', ensure);
ok('la caisse maison l\'allume à l\'ouverture',
  /function mount\(rootEl\) \{\s*root = rootEl;\s*ensureStockJournal\(\);/.test(MAISON));
ok('et avant chaque mouvement de vente ou de retour',
  /function persistStock\([^)]*\) \{\s*if \(!delta \|\| !pvReal\(\)\) return;\s*ensureStockJournal\(\);/.test(MAISON));

/* Ce que fait ensureStockJournal() sur la tablette. */
t.MZ.enable();
const cid = t.cat.addCategory('Linge').id;
const prod = t.cat.addProduct({ name: 'Voile gm', categoryId: cid, priceMAD: 120, cost: 50, kind: 'taille' });
const v = t.cat.addVariant({ productId: prod.id, colorId: 'transparent', colorLabel: 'Transparent', size: 'TU', stock: 5 });

/* ── II · une vente au comptoir écrit sa sortie ──────────────────────────── */
t.cat.adjustStock(v.id, -2, 'vente', { ref: 'T-0412', actor: 'Salma' });
const sale = t.MZ.list({ type: 'vente' })[0];
ok('une vente à la caisse écrit une sortie', !!sale && sale.qty === -2);
ok('la sortie dit avant → après', sale && sale.before === 5 && sale.after === 3);
ok('elle porte le ticket, l\'employée et la source caisse',
  sale && sale.ref === 'T-0412' && sale.actor === 'Salma' && sale.source === 'caisse');
t.cat.adjustStock(v.id, 1, 'retour', { ref: 'T-0412' });
ok('un retour au comptoir écrit son entrée', t.MZ.list({ type: 'retour-client' }).length === 1);

/* ── III · un refus ne retient plus les ventes du même lot ───────────────── */
t.MZ.record({ productId: prod.id, variantId: v.id, type: 'casse', qty: 1, source: 'caisse' });   // sans code
t.cat.adjustStock(v.id, -1, 'vente', { ref: 'T-0413' });
const AUTO = (r) => SERVER_AUTOMATIC.indexOf(r.reason) >= 0;
const queuedAuto = t.L.history().filter(AUTO).length;
ok('le lot en attente mêle ventes et lignes discrétionnaires (stock initial, casse sans code)',
  queuedAuto === 3 && t.L.pending() === 5, 'file: ' + t.L.pending());
await t.L.sync();
ok('le serveur a bien refusé le lot mixte', t.posted.length === 1);
const rows = t.L.history();
ok('les lignes discrétionnaires sont mises de côté, marquées',
  rows.filter((r) => !AUTO(r)).every((r) => r.blocked === 1 && !(r.cursor > 0)));
ok('les ventes et le retour restent dans la file', t.L.pending() === 3, 'file: ' + t.L.pending());
ok('aucune vente n\'est marquée refusée', rows.filter(AUTO).every((r) => !r.blocked));
await t.L.sync();
ok('au passage suivant elles partent sans les lignes refusées',
  t.posted.length === 2 && t.posted[1].movements.length === 3 && t.posted[1].movements.every(AUTO));
ok('et le serveur les accepte', t.L.pending() === 0 && t.L.history().filter(AUTO).every((r) => r.cursor > 0));

const LEDGER = R('assets/inventory-ledger.js');
const client = (() => {
  const m = /var AUTOMATIC = \{([^}]*)\}/.exec(LEDGER);
  return m ? m[1].match(/'[^']+'/g).map((s) => s.slice(1, -1)).sort() : [];
})();
ok('la file et le serveur ont la même liste de motifs automatiques',
  SERVER_AUTOMATIC.length > 0 && JSON.stringify(client) === JSON.stringify(SERVER_AUTOMATIC),
  JSON.stringify({ client, server: SERVER_AUTOMATIC }));

/* ── IV · un mouvement déclaré au comptoir demande le code et part autorisé ─
 * record() rendait `row: null` (la ligne écrite n'était jamais retenue) :
 * requestManual concluait qu'il n'y avait rien à faire autoriser, ne montrait
 * jamais le pavé du responsable, et la ligne partait sans capacité → refusée. */
const t2 = bootTill();
t2.MZ.enable();
const p2 = t2.cat.addProduct({ name: 'Vase Atlas', priceMAD: 300, cost: 120, kind: 'taille' });
const v2 = t2.cat.addVariant({ productId: p2.id, colorId: 'ocre', colorLabel: 'Ocre', size: 'TU', stock: 4 });
let asked = '';
t2.win.KiwiCaissePairing = { lastManager: () => ({ name: 'Responsable', approval: 'cap-ok' }) };
t2.win.requireManager = (label, onApprove) => { asked = label; onApprove(); };
const casse2 = await t2.MZ.requestManual({ productId: p2.id, variantId: v2.id, type: 'casse', qty: 1, note: 'Vitrine', source: 'caisse' });
ok('le comptoir demande le code du responsable pour une casse', /^Article abîmé · 1 pièce/.test(asked), asked || 'jamais demandé');
ok('la casse autorisée est acceptée, au nom du responsable', casse2.ok && casse2.approvedBy === 'Responsable', JSON.stringify(casse2));
ok('elle part avec la capacité signée',
  t2.posted.some((b) => b.approval === 'cap-ok' && b.movements.length === 1 && b.movements[0].reason === 'loss'));
const loss2 = t2.L.history().find((r) => r.reason === 'loss');
ok('et le serveur l\'acquitte : elle arrive au tableau de bord', loss2 && loss2.cursor > 0);
ok('le stock a bien perdu la pièce', t2.cat.variantStock(p2.id, 'TU', 'ocre') === 3);
const rec2 = t2.MZ.record({ productId: p2.id, variantId: v2.id, type: 'perte', qty: 1, source: 'dashboard' });
ok('record() rend la ligne qu\'il vient d\'écrire', !!(rec2.row && rec2.row.reason === 'loss' && rec2.row.qty === -1));

/* ── V · la casse du comptoir passe par le code responsable ─────────────── */
ok('« Déclarer Casse » passe par requestManual',
  /function recordCasse[\s\S]{0,1600}MZ\.requestManual\(\{\s*productId: pid, variantId: vid, type: 'casse'/.test(MAISON));
ok('et l\'écran attend la réponse avant de se redessiner',
  /Promise\.resolve\(recordCasse\([\s\S]{0,120}\)\)\s*\.then\(/.test(MAISON));

/* ── verdict ─────────────────────────────────────────────────────────────── */
if (fails.length) {
  console.error(`✗ sorties de caisse maison — ${fails.length} échec(s) sur ${pass + fails.length}`);
  fails.forEach((f) => console.error('   · ' + f));
  process.exit(1);
}
console.log(`✓ sorties de caisse maison — ${pass} contrôles`);
