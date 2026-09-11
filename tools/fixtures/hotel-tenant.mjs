/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LOCATAIRE HÔTELIER DE TEST — le socle des douze phases de l'économat
 *
 * `docs/specs/HOTEL_ECONOMAT_PLAN.md` fait reposer l'acceptation de CHAQUE
 * phase sur « un locataire hôtelier ensemencé, de forme réelle ». Le voici.
 *
 * « De forme réelle » n'est pas une figure de style : cette fixture charge le
 * VRAI `assets/inventory-ledger.js` dans un navigateur en carton, avec le vrai
 * chemin d'identité (`KiwiEnv.isReal()` + `KiwiCloudDoc.currentSlug()`), et
 * écrit de vrais mouvements. Une fixture qui simulerait le registre validerait
 * la simulation, pas le produit — et c'est précisément le registre qui porte
 * l'argent des marchands.
 *
 * POURQUOI ELLE EXISTE PLUTÔT QU'UN MARCHAND PAYANT : le plan interdit de
 * muter un marchand qui paie pour prouver une migration. Sans ce socle, la
 * seule façon de vérifier la phase 2 aurait été les livres de Santos Store.
 *
 * CE QU'ELLE ENSEMENCE, ET POURQUOI CHAQUE PIÈCE EST LÀ :
 *   · un seul locataire, plusieurs unités cloisonnées (spec §2.2) ;
 *   · des lots MULTIPLES au même article, à des coûts différents et des
 *     péremptions différentes — sans quoi le taux mélangé FEFO de §3.4 n'est
 *     qu'une moyenne d'un seul nombre et ne prouve rien ;
 *   · le même article stocké dans DEUX unités à des coûts différents, qui est
 *     le cas où l'allocateur actuel se trompe (voir hotel-seed-test) ;
 *   · un article SANS coût connu, pour que le refus de §3.4.1 soit testable.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAY = 86400000;

/* Identités d'unités. Le `locationId` est immuable et n'est JAMAIS réutilisé
   (spec §2.2) : c'est la clé qui finira sur chaque mouvement du registre, donc
   la renommer réécrirait l'histoire du stock. */
export const UNITS = [
  { id: 'economat',    name: 'Économat',        kind: 'economat',   storeType: 'stock',      locationId: 'u-economat',    active: true },
  { id: 'bar-lobby',   name: 'Bar du lobby',    kind: 'outlet',     storeType: 'bar',        locationId: 'u-bar-lobby',   active: true },
  { id: 'bar-rooftop', name: 'Bar rooftop',     kind: 'outlet',     storeType: 'bar',        locationId: 'u-bar-rooftop', active: true },
  { id: 'restaurant',  name: 'Restaurant',      kind: 'outlet',     storeType: 'restaurant', locationId: 'u-restaurant',  active: true },
  { id: 'housekeeping',name: 'Housekeeping',    kind: 'department', storeType: '',           locationId: 'u-housekeeping',active: true },
];

/* Un navigateur en carton : juste assez pour que les vrais modules se
   chargent. Aucun DOM n'est exercé ici — le registre n'en touche pas. */
function browser() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i],
    get length() { return store.size; },
  };
  const el = () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
  const document = { addEventListener() {}, removeEventListener() {}, createElement: el,
    getElementById: () => null, head: { appendChild() {} },
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    querySelector: () => null, querySelectorAll: () => [], visibilityState: 'visible' };
  const window = {
    localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    location: { href: 'https://kiwi-os.com/kiwi-caisse.html', search: '' },
    navigator: { onLine: false },   /* hors ligne : aucune synchro réseau en test */
  };
  window.window = window; window.document = document;
  /* MINUTERIES INERTES — et ce n'est pas un détail de confort.
   * `inventory-ledger.js` appelle `setTimeout(sync, 0)` à chaque `add()` et
   * arme un `setInterval` de synchronisation en fond. Avec les vraies
   * minuteries, la suite ne rend jamais la main (mesuré : le processus pend
   * indéfiniment) et, pire, elle tenterait de POSTer les mouvements semés vers
   * /api/inventory/movements. Une fixture ne parle pas au réseau et ne
   * survit pas à son test. On enregistre les rappels sans jamais les
   * programmer : le registre reste purement local et déterministe. */
  const pending = [];
  const noopTimer = (fn) => { pending.push(fn); return 0; };
  const g = { window, document, localStorage,
    setTimeout: noopTimer, clearTimeout() {}, setInterval: noopTimer, clearInterval() {},
    console, JSON, Math, Date, Number, String, Object, Array, Set, Map,
    Promise, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent };
  g.__pendingTimers = pending;
  g.globalThis = g; g.self = window;
  /* Pas de fetch : une fixture ne doit jamais pouvoir toucher le réseau. */
  window.fetch = () => Promise.reject(new Error('fixture: réseau interdit'));
  return { g, window, localStorage };
}

function load(ctx, rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(src, ctx, { filename: rel });
}

/**
 * Monte un hôtel ensemencé.
 * @param {{merchant?: string, now?: number}} opts
 */
export function createHotelTenant(opts = {}) {
  const merchant = opts.merchant || 'hotel-atlas-temoin';
  /* Horodatage injecté : une fixture qui appelle Date.now() n'est pas
     reproductible d'une exécution à l'autre. */
  const now = opts.now || 1756000000000;

  const { g, window } = browser();
  const ctx = vm.createContext(g);

  /* L'identité par le VRAI chemin : isReal() puis currentSlug(), exactement
     l'ordre que `merchant()` interroge dans inventory-ledger.js. */
  window.KiwiEnv = { isReal: () => true };
  window.KiwiCloudDoc = { currentSlug: () => merchant };

  load(ctx, 'assets/inventory-ledger.js');
  load(ctx, 'assets/inventory-consumption.js');

  const I = window.KiwiInventory;
  if (!I) throw new Error('fixture: KiwiInventory ne s\'est pas chargé');
  if (!I.isReal()) throw new Error('fixture: le registre ne se croit pas réel');
  if (I.merchant() !== merchant) throw new Error('fixture: mauvais locataire résolu');

  let seq = 0;
  const put = (m) => I.add(Object.assign({ id: `seed-${++seq}`, currency: 'MAD',
    refType: 'seed', refId: 'seed', actor: 'fixture' }, m));

  /* ── stock d'ouverture ──────────────────────────────────────────────────
   * whisky : DEUX lots à l'économat, coûts et péremptions différents.
   *   6 × 120 MAD, périme dans 30 j   ← FEFO le sert en premier
   *   6 × 150 MAD, périme dans 90 j
   *   ⇒ 12 unités mélangées = 135,00 · 6 unités = 120,00
   * Le rooftop détient le MÊME article à 300 MAD : c'est le piège de coût
   * inter-lieux que hotel-seed-test met en évidence. */
  put({ itemId: 'whisky', locationId: 'u-economat', qty: 6, reason: 'opening',
        unitCost: 120, occurredTs: now - 10 * DAY, meta: { expiresAt: now + 30 * DAY } });
  put({ itemId: 'whisky', locationId: 'u-economat', qty: 6, reason: 'opening',
        unitCost: 150, occurredTs: now - 9 * DAY, meta: { expiresAt: now + 90 * DAY } });
  put({ itemId: 'whisky', locationId: 'u-bar-rooftop', qty: 6, reason: 'opening',
        unitCost: 300, occurredTs: now - 8 * DAY, meta: { expiresAt: now + 60 * DAY } });

  /* cola : un seul lot, le cas simple auquel comparer. */
  put({ itemId: 'cola', locationId: 'u-economat', qty: 24, reason: 'opening',
        unitCost: 4, occurredTs: now - 7 * DAY, meta: { expiresAt: now + 200 * DAY } });

  /* savon : la fourniture d'un département qui ne vend rien. */
  put({ itemId: 'savon', locationId: 'u-economat', qty: 100, reason: 'opening',
        unitCost: 2, occurredTs: now - 7 * DAY });

  /* SANS COÛT CONNU — la marchandise existe, sa valeur non. C'est le cas que
     §3.4.1 fait refuser à la confirmation, et il doit être ensemencé sinon
     personne ne peut écrire ce test. */
  put({ itemId: 'verrerie', locationId: 'u-economat', qty: 40, reason: 'opening',
        unitCost: null, occurredTs: now - 6 * DAY });

  const unitById = new Map(UNITS.map((u) => [u.id, u]));
  const locOf = (unitId) => {
    const u = unitById.get(unitId);
    if (!u) throw new Error(`fixture: unité inconnue « ${unitId} »`);
    return u.locationId;
  };

  return {
    merchant, now, window, units: UNITS,
    unit: (id) => unitById.get(id),
    ledger: I,
    consumption: window.KiwiInventoryConsumption,
    /** Solde d'un article DANS une unité — jamais le cumul de l'hôtel. */
    balanceAt: (unitId, itemId) => I.balance(itemId, { locationId: locOf(unitId) }),
    /** Cumul hôtel, toutes unités confondues. */
    balanceHotel: (itemId) => I.balance(itemId),
    movements: (itemId) => I.history(itemId),
    count: () => I.history().length,
    /** Écrire un mouvement supplémentaire depuis un test. */
    put: (m) => put(m),
    locationOf: locOf,
  };
}
