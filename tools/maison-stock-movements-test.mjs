#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Maison — le stock ne bouge jamais sans mouvement
 *
 *   node tools/maison-stock-movements-test.mjs
 *
 * Ce que ce banc défend.
 *
 * Le catalogue boutique (assets/boutique-catalog.js) est la vérité du stock ; le
 * registre durable (assets/inventory-ledger.js → /api/inventory/movements) est
 * la vérité de l'histoire. Entre les deux, assets/maison-stock-movements.js pose
 * un crochet sur le catalogue : TOUT changement de stock — vente, retour,
 * réception, comptage, correction, création avec stock — écrit sa ligne.
 *
 * Les contrôles :
 *   · une vente et un remboursement de la caisse écrivent les bons mouvements,
 *     avec avant/après, employé, référence de ticket et sens ;
 *   · une correction manuelle bouge le stock ET écrit la ligne, et une sortie
 *     impossible ne fait NI l'un ni l'autre ;
 *   · une saisie directe de stock (setStock) ne peut pas passer en silence ;
 *   · la variante vendue est bien celle qui bouge (taille × couleur) ;
 *   · deux caisses qui vendent en même temps gardent les deux mouvements, et
 *     rejouer un mouvement n'en crée pas un second ;
 *   · la capacité signée qui autorise un mouvement de comptoir est liée aux
 *     identifiants exacts qu'on a montrés au responsable — elle ne peut pas être
 *     rejouée sur une autre sortie, ni survivre à son expiration ;
 *   · le refus du serveur ne bloque pas la file : la ligne sort de la file,
 *     marquée, au lieu de retenter sans fin et de retenir les ventes derrière.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };

/* ── le bac à sable : un navigateur juste assez réel ─────────────────────── */
function boot() {
  const memory = new Map();
  const localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  const win = {
    localStorage,
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => 'maison-test' },
    KiwiStaff: { name: 'Nadia Belkacem', role: 'Caissier' },
    addEventListener() {},
    dispatchEvent() {},
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage, navigator: { onLine: false }, crypto: globalThis.crypto,
    console, Date, Math, JSON, Map, Set, Promise, document: { addEventListener() {} },
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    fetch: () => Promise.reject(new Error('offline')),
  });
  vm.runInContext(R('assets/inventory-ledger.js'), ctx, { filename: 'inventory-ledger.js' });
  vm.runInContext(R('assets/boutique-catalog.js'), ctx, { filename: 'boutique-catalog.js' });
  win.KiwiStoreTemplates = { currentTrade: () => 'maison' };
  vm.runInContext(R('assets/maison-stock-movements.js'), ctx, { filename: 'maison-stock-movements.js' });
  const cat = win.KiwiBoutiqueCatalog;
  cat.use('maison-test');
  win.KiwiMaisonStock.enable();
  return { win, cat, MZ: win.KiwiMaisonStock, ledger: win.KiwiInventory };
}

const { win, cat, MZ } = boot();

/* Un magasin minimal : un produit, deux variantes de la même famille. */
const cid = cat.addCategory('Linge de maison').id;
const prod = cat.addProduct({ name: 'Plaid Atlas', categoryId: cid, priceMAD: 480, cost: 190, kind: 'taille' });
const vBlue = cat.addVariant({ productId: prod.id, colorId: 'bleu', colorLabel: 'Bleu', size: 'TU', stock: 6 });
const vSand = cat.addVariant({ productId: prod.id, colorId: 'sable', colorLabel: 'Sable', size: 'TU', stock: 4 });

/* ── I · la création avec stock est déjà un mouvement ────────────────────── */
let rows = MZ.list({});
ok('créer une variante avec du stock écrit un mouvement d\'entrée',
  rows.filter((m) => m.type === 'initial').length === 2, JSON.stringify(rows.map((m) => m.type)));
ok('le mouvement initial porte l\'avant et l\'après',
  rows.some((m) => m.type === 'initial' && m.before === 0 && m.after === 6));

/* ── II · la vente et le remboursement de la caisse ──────────────────────── */
cat.adjustStock(vBlue.id, -2, 'vente', { ref: '1042', actor: 'Nadia Belkacem' });
const sale = MZ.list({ type: 'vente' })[0];
ok('une vente écrit une sortie au registre', !!sale && sale.qty === -2);
ok('la vente dit le stock avant et après', sale && sale.before === 6 && sale.after === 4,
  sale ? `${sale.before}→${sale.after}` : 'aucune');
ok('la vente porte la référence du ticket et l\'employé',
  sale && sale.ref === '1042' && sale.actor === 'Nadia Belkacem');
ok('la vente est bien rattachée au produit et à sa variante',
  sale && sale.product === 'Plaid Atlas' && sale.category === 'Linge de maison' && sale.productId === prod.id && sale.variantId === vBlue.id && sale.variant.indexOf('TU') >= 0);

cat.adjustStock(vBlue.id, 1, 'remb', { ref: '1042', actor: 'Nadia Belkacem' });
const back = MZ.list({ type: 'remboursement' })[0];
ok('un remboursement écrit une entrée', !!back && back.qty === 1 && back.dir === 1);
ok('le remboursement repart de l\'état laissé par la vente',
  back && back.before === 4 && back.after === 5);
ok('la variante vendue est celle qui remonte', cat.variantStock(prod.id, 'TU', 'bleu') === 5);

/* ── III · une réservation de paiement n'est pas de la marchandise ───────── */
const beforeReserve = MZ.list({}).length;
cat.adjustStock(vBlue.id, -1, 'reserve', { ref: 'CB-9' });
ok('une réservation de terminal n\'entre pas au registre', MZ.list({}).length === beforeReserve);
cat.adjustStock(vBlue.id, 1, 'release', { ref: 'CB-9' });
ok('sa libération non plus', MZ.list({}).length === beforeReserve);

/* ── IV · la saisie manuelle ─────────────────────────────────────────────── */
const broken = MZ.record({ productId: prod.id, variantId: vSand.id, type: 'casse', qty: 2, note: 'Tache à la vitrine', source: 'dashboard' });
ok('une casse déclarée bouge le stock', broken.ok && cat.variantStock(prod.id, 'TU', 'sable') === 2);
const brokenRow = MZ.list({ type: 'casse' })[0];
ok('la casse écrit sa ligne avec la note', brokenRow && brokenRow.qty === -2 && brokenRow.note === 'Tache à la vitrine');
ok('la casse est classée comme une perte au registre serveur', brokenRow && brokenRow.reason === 'loss');

const tooMuch = MZ.record({ productId: prod.id, variantId: vSand.id, type: 'perte', qty: 99 });
ok('une sortie supérieure au stock est refusée', !tooMuch.ok && tooMuch.reason === 'stock-insuffisant');
ok('un refus ne bouge pas le stock', cat.variantStock(prod.id, 'TU', 'sable') === 2);
ok('un refus n\'écrit aucun mouvement', MZ.list({ type: 'perte' }).length === 0);

const received = MZ.record({ productId: prod.id, variantId: vSand.id, type: 'reception', qty: 5, supplier: 'Atelier Tazi', ref: 'BL-227' });
const recRow = MZ.list({ type: 'reception' })[0];
ok('une réception entre au stock et au registre', received.ok && recRow && recRow.qty === 5);
ok('la réception garde son fournisseur et son bon de livraison',
  recRow && recRow.supplier === 'Atelier Tazi' && recRow.ref === 'BL-227');

/* ── V · aucun stock ne change en silence ────────────────────────────────── */
const beforeSet = MZ.list({}).length;
cat.setStock(vSand.id, 3, 'saisie');
const corr = MZ.list({})[0];
ok('une saisie directe de stock écrit un mouvement', MZ.list({}).length === beforeSet + 1);
ok('la saisie directe est classée en correction, jamais en vente',
  corr && corr.type.indexOf('correction') === 0, corr && corr.type);
ok('la correction dit l\'écart réellement constaté', corr && corr.before === 7 && corr.after === 3);
cat.setStock(vSand.id, 3, 'saisie');
ok('reposer le même chiffre n\'invente pas de mouvement', MZ.list({}).length === beforeSet + 1);

/* ── VI · filtres ────────────────────────────────────────────────────────── */
ok('filtrer par produit rend l\'historique de la fiche',
  MZ.productHistory(prod.id).length === MZ.list({}).length);
ok('filtrer par type ne rend que ce type', MZ.list({ type: 'vente' }).every((m) => m.type === 'vente'));
ok('filtrer par employé retrouve la vendeuse',
  MZ.list({ actor: 'Nadia Belkacem' }).length >= 2);
ok('filtrer par fournisseur retrouve la réception',
  MZ.list({ supplier: 'Atelier Tazi' }).length === 1);
ok('filtrer par catégorie suit la fiche produit',
  MZ.list({ categoryId: cid }).length === MZ.list({}).length);
ok('filtrer par date exclut ce qui est plus vieux',
  MZ.list({ from: Date.now() + 60000 }).length === 0);
const tot = MZ.totals(MZ.list({}));
ok('le total sépare les entrées des sorties', tot.entries > 0 && tot.exits > 0);

/* ── VII · deux caisses en même temps ────────────────────────────────────── */
const mine = JSON.parse(JSON.stringify(cat._doc()));
const theirs = JSON.parse(JSON.stringify(mine));
const vid = vBlue.id;
const at = Date.now() + 1000;
mine.moves.push({ id: 'mv-a', vid, d: -1, at, why: 'vente', ref: 'A' });
theirs.moves.push({ id: 'mv-b', vid, d: -1, at: at + 1, why: 'vente', ref: 'B' });
const merged = cat._merge(mine, theirs);
ok('deux ventes simultanées survivent à la fusion',
  merged.moves.filter((m) => m.id === 'mv-a' || m.id === 'mv-b').length === 2);
const mergedTwice = cat._merge(merged, theirs);
ok('rejouer la fusion ne duplique pas un mouvement',
  mergedTwice.moves.filter((m) => m.id === 'mv-b').length === 1);

/* Le même mouvement rejoué côté registre garde une seule ligne : l'id de la
   ligne de registre dérive de l'id du mouvement de catalogue. */
const beforeReplay = MZ.list({}).length;
const replayed = MZ._fromCatalog({
  id: 'mv-replay', variant: cat.listVariants(prod.id)[0], at: Date.now(),
  delta: -1, before: 5, after: 4, why: 'vente', ref: '1050',
});
const again = MZ._fromCatalog({
  id: 'mv-replay', variant: cat.listVariants(prod.id)[0], at: Date.now(),
  delta: -1, before: 5, after: 4, why: 'vente', ref: '1050',
});
ok('un mouvement rejoué n\'écrit qu\'une ligne',
  !!replayed && !!again && replayed.id === again.id && MZ.list({}).length === beforeReplay + 1);

/* ── VIII · le journal ne s'allume pas ailleurs ──────────────────────────── */
{
  const other = boot();
  other.win.KiwiStoreTemplates = { currentTrade: () => 'restaurant' };
  ok('un autre métier n\'écrit pas ce registre', other.MZ.isMaison() === false);
}

/* ── IX · la capacité signée d'un mouvement de comptoir ──────────────────── */
const lib = await import(path.join(ROOT, 'functions/auth/_lib.js'));
const SECRET = 'test-secret-1234567890';
const proof = await lib.managerStockProof(SECRET, {
  merchant: 'maison-test', staffId: 'emp-7', staffName: 'Salma Idrissi', staffRole: 'Gérante',
  movementIds: ['mz-a', 'mz-b'],
});
const read = await lib.readManagerStockProof(proof, SECRET, 'maison-test');
ok('la capacité nomme le responsable qui a autorisé', read && read.staffName === 'Salma Idrissi');
ok('la capacité couvre exactement les mouvements montrés',
  read && read.scope === lib.stockProofScope(['mz-b', 'mz-a']));
ok('elle ne couvre pas un autre mouvement',
  read && read.scope !== lib.stockProofScope(['mz-a', 'mz-c']));
ok('elle ne vaut pas pour un autre magasin',
  (await lib.readManagerStockProof(proof, SECRET, 'autre-magasin')) === null);
ok('elle ne vaut rien sous un autre secret',
  (await lib.readManagerStockProof(proof, 'un-autre-secret', 'maison-test')) === null);
ok('une capacité tronquée est refusée',
  (await lib.readManagerStockProof(proof.slice(0, proof.length - 3), SECRET, 'maison-test')) === null);
ok('une capacité sans mouvement n\'est jamais délivrée',
  (await lib.managerStockProof(SECRET, { merchant: 'maison-test', staffId: 'emp-7', movementIds: [] })) === '');

/* ── X · le serveur et la file ───────────────────────────────────────────── */
const SRV = R('functions/api/inventory/movements.js');
ok('le serveur exige encore le propriétaire ou une capacité pour un motif discrétionnaire',
  /reason-forbidden/.test(SRV) && /readManagerStockProof/.test(SRV));
ok('la capacité est comparée à la liste exacte des identifiants',
  /proof\.scope === stockProofScope\(discretionary\.map/.test(SRV));
ok('l\'auteur écrit par le client est remplacé par celui que le code a prouvé',
  /discretionary\.forEach\(\(m\) => \{ m\.actor = who; \}\)/.test(SRV));
const LEDGER_SRC = R('assets/inventory-ledger.js');
ok('un refus sort la ligne de la file au lieu de la rejouer sans fin',
  /res\.status === 403[\s\S]{0,400}reason-forbidden[\s\S]{0,300}blocked = 1/.test(LEDGER_SRC));

/* ── XI · les autres métiers gardent leur caisse ─────────────────────────── */
const MAISON_SRC = R('assets/pos-maison.js');
ok('la caisse maison passe ses ventes avec la référence du ticket',
  /persistStock\(ln\.pid, ln\.size, ln\.color, -\(ln\.units != null \? ln\.units : ln\.qty\), \{ ref:/.test(MAISON_SRC));
ok('la réception au comptoir demande une autorisation',
  /requestManual\(\{ productId: pid, variantId: v\.id, type: 'reception'/.test(MAISON_SRC));
const BOUTIQUE_SRC = R('assets/pos-boutique.js');
ok('la caisse boutique n\'est pas touchée', !/KiwiMaisonStock/.test(BOUTIQUE_SRC));

/* ── XII · la page ouvre sur tout l'historique, sans filtres redondants ───── */
const PAGES_SRC = R('assets/pages-pro.js');
const MOVEMENTS_PAGE = PAGES_SRC.slice(PAGES_SRC.indexOf('const MZS ='), PAGES_SRC.indexOf('function _mzManualModal'));
ok('la période initiale est Tout', /let _mzFilter = \{[^}]*days: 0/.test(MOVEMENTS_PAGE));
ok('Tout est la première option de période', /\[\['0', 'Tout'\], \['7', '7 jours'\]/.test(MOVEMENTS_PAGE));
ok('ouvrir la page rétablit toujours Tout', /handlers\['nav-stock-movements'\][\s\S]{0,300}_mzFilter\.days = 0/.test(MOVEMENTS_PAGE));
ok('les filtres employé et fournisseur ne sont plus proposés',
  !/data-mz="actor"/.test(MOVEMENTS_PAGE) && !/data-mz="supplier"/.test(MOVEMENTS_PAGE));
ok('la recherche décrit seulement les dimensions encore visibles',
  /placeholder="Produit, catégorie, type, référence…"/.test(MOVEMENTS_PAGE));

/* ── verdict ─────────────────────────────────────────────────────────────── */
if (fails.length) {
  console.error(`✗ mouvements de stock maison — ${fails.length} échec(s) sur ${pass + fails.length}`);
  fails.forEach((f) => console.error('   · ' + f));
  process.exit(1);
}
console.log(`✓ mouvements de stock maison — ${pass} contrôles`);
