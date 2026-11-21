/* Les fournisseurs, en D1 (table `suppliers`, migration 0028).
 *
 * Avant : chaque écran rangeait ses fournisseurs dans le document `procurement`
 * du navigateur, les bons de commande D1 portaient un nom libre, les dépenses
 * aussi. Trois orthographes de « Distrib Frais » faisaient trois fournisseurs
 * et aucun solde. Désormais la table est la source de vérité, et :
 *
 *   · syncProcurement() importe l'IDENTITÉ des fournisseurs du document
 *     `procurement` avec LEUR id (les bons, réceptions et fiches article qui
 *     les citent restent justes), une seule fois par fiche : une fiche D1 n'est
 *     jamais réécrite depuis le document, et le document n'écrit JAMAIS dans
 *     le grand livre. Il est modifiable par un gérant ou une caisse appairée :
 *     un montant qui en viendrait serait une dette que n'importe qui peut
 *     inventer. Les montants ne viennent que des bons de commande D1 et des
 *     saisies du patron. Les horodatages du document (ceux du client) ne
 *     servent à rien ici : la fiche prend l'heure du serveur.
 *   · resolvePoSupplier() relie un bon de commande à sa fiche (id donné, sinon
 *     nom connu, sinon fiche créée, mais seulement pour le patron ou un
 *     opérateur : un employé ne relie qu'à une fiche existante).
 *   · purchaseMovementPlan() prépare la ligne du grand livre d'une réception
 *     ou d'un retour, pour le MÊME DB.batch que le stock (tout ou rien). Un
 *     bon sans fiche reçu par un employé n'est jamais perdu : sa ligne attend,
 *     sous le tiers provisoire « po:<n° du bon> », que le patron la rattache
 *     à une fiche (attachUnlinked : bon relié et lignes approuvées ensemble).
 *   · supplierScorecard() agrège en SQL ce qu'Inyad appelle le tableau du
 *     fournisseur : commandé, % reçu, % payé, reste dû, taux de retour, panier.
 */
import { readDoc, mutateDoc } from './_doc-cas.js';
import { ledgerEntryStatement, ledgerReady, relinkStatements, partyBalance, LIVE } from './_ledger.js';

const ID = /^[A-Za-z0-9_-]{3,80}$/;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const nameKey = (s) => clean(s, 120).toLowerCase().replace(/\s+/g, ' ');

function randomId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'sup-' + Date.now().toString(36) + '-' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Les champs d'une fiche, nettoyés. `partial` : seuls les champs présents. */
export function cleanSupplier(input, partial) {
  const i = input || {};
  const out = {};
  const put = (key, col, n) => { if (!partial || i[key] !== undefined) out[col] = clean(i[key], n); };
  put('name', 'name', 120);
  put('phone', 'phone', 40);
  put('email', 'email', 120);
  put('ice', 'ice', 30);
  put('rib', 'rib', 40);
  put('bank', 'bank', 80);
  put('address', 'address', 240);
  put('notes', 'notes', 500);
  if (!partial || i.termsDays !== undefined) out.terms_days = Math.max(0, Math.min(365, Math.round(Number(i.termsDays) || 0)));
  if (out.rib !== undefined) out.rib = out.rib.replace(/[^0-9A-Za-z ]/g, '');
  if (out.ice !== undefined) out.ice = out.ice.replace(/[^0-9]/g, '');
  return out;
}

export function supplierView(row) {
  if (!row) return null;
  return {
    id: String(row.id), name: String(row.name || ''), phone: String(row.phone || ''), email: String(row.email || ''),
    ice: String(row.ice || ''), rib: String(row.rib || ''), bank: String(row.bank || ''), address: String(row.address || ''),
    notes: String(row.notes || ''), termsDays: Number(row.terms_days) || 0, archived: Number(row.archived) === 1,
    source: String(row.source || ''), createdAt: Number(row.created_ts) || 0, updatedAt: Number(row.updated_ts) || 0,
  };
}

export async function getSupplier(env, merchant, id) {
  if (!ID.test(String(id || ''))) return null;
  try {
    return await env.DB.prepare('SELECT * FROM suppliers WHERE merchant = ? AND id = ?').bind(merchant, String(id)).first();
  } catch (_) { return null; }
}

export async function listSuppliers(env, merchant, opts) {
  const all = !!(opts && opts.includeArchived);
  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM suppliers WHERE merchant = ?${all ? '' : ' AND archived = 0'} ORDER BY name COLLATE NOCASE LIMIT 2000`
    ).bind(merchant).all();
    return (rows && rows.results) || [];
  } catch (_) { return []; }
}

export async function findSupplierByName(env, merchant, name) {
  const key = nameKey(name);
  if (!key) return null;
  try {
    const rows = await env.DB.prepare('SELECT * FROM suppliers WHERE merchant = ? AND archived = 0 AND lower(name) = ? LIMIT 1')
      .bind(merchant, key).all();
    const hit = ((rows && rows.results) || [])[0];
    if (hit) return hit;
    /* lower() de SQLite ne plie que l'ASCII : « Épices » se compare ici. */
    const list = await listSuppliers(env, merchant);
    return list.find((r) => nameKey(r.name) === key) || null;
  } catch (_) { return null; }
}

/* Écrit aussi la fiche dans le document `procurement`, pour les écrans qui le
 * lisent encore (réception, catalogue, économat). Au mieux : un échec ne
 * coûte rien à la fiche D1, qui fait foi. */
async function mirror(env, merchant, row) {
  try {
    await mutateDoc(env, merchant, 'procurement', { suppliers: [], orders: [], receipts: [], returns: [], invoices: [], seq: 0 }, (doc) => {
      const d = doc && typeof doc === 'object' ? doc : {};
      if (!Array.isArray(d.suppliers)) d.suppliers = [];
      const at = d.suppliers.findIndex((s) => s && s.id === row.id);
      const prev = at >= 0 ? d.suppliers[at] : {};
      const next = { ...prev, id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address,
        taxId: row.ice || prev.taxId || '', notes: row.notes, active: Number(row.archived) !== 1,
        createdAt: prev.createdAt || row.created_ts, updatedAt: row.updated_ts };
      if (at >= 0) d.suppliers[at] = next; else d.suppliers.unshift(next);
      return d;
    });
  } catch (_) { /* le document suivra au prochain enregistrement */ }
}

export async function createSupplier(env, merchant, input, opts) {
  const fields = cleanSupplier(input, false);
  if (!fields.name) return { ok: false, error: 'name-required' };
  const wanted = clean(input && input.id, 80);
  const id = wanted && ID.test(wanted) ? wanted : randomId();
  const at = Date.now();
  try {
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO suppliers (merchant, id, name, phone, email, ice, rib, bank, address, notes, terms_days, archived, source, created_ts, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).bind(merchant, id, fields.name, fields.phone, fields.email, fields.ice, fields.rib, fields.bank, fields.address,
      fields.notes, fields.terms_days, clean(opts && opts.source, 20) || 'dashboard', at, at).run();
    if (!(Number(res && res.meta && res.meta.changes) > 0)) {
      const existing = await getSupplier(env, merchant, id);
      return existing ? { ok: true, duplicate: true, supplier: existing } : { ok: false, error: 'unmigrated' };
    }
    const row = await getSupplier(env, merchant, id);
    if (!(opts && opts.noMirror)) await mirror(env, merchant, row);
    return { ok: true, duplicate: false, supplier: row };
  } catch (_) { return { ok: false, error: 'unmigrated' }; }
}

export async function updateSupplier(env, merchant, id, patch) {
  const row = await getSupplier(env, merchant, id);
  if (!row) return { ok: false, error: 'not-found' };
  const fields = cleanSupplier(patch, true);
  if (fields.name === '') return { ok: false, error: 'name-required' };
  if (patch && patch.archived !== undefined) fields.archived = patch.archived ? 1 : 0;
  const cols = Object.keys(fields);
  if (!cols.length) return { ok: true, supplier: row };
  const at = Math.max(Date.now(), Number(row.updated_ts || 0) + 1);
  try {
    await env.DB.prepare(`UPDATE suppliers SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_ts = ? WHERE merchant = ? AND id = ?`)
      .bind(...cols.map((c) => fields[c]), at, merchant, row.id).run();
    const next = await getSupplier(env, merchant, row.id);
    await mirror(env, merchant, next);
    return { ok: true, supplier: next };
  } catch (_) { return { ok: false, error: 'unmigrated' }; }
}

/* ── Import du document `procurement` (identité seulement) ──────────── */
export async function syncProcurement(env, merchant, opts) {
  const out = { imported: 0, posted: 0, skipped: true };
  if (!env || !env.DB) return out;
  let state;
  try {
    const at = Date.now();
    await env.DB.prepare('INSERT OR IGNORE INTO supplier_ledger_state (merchant, started_ts, procurement_rev, updated_ts) VALUES (?, ?, 0, ?)')
      .bind(merchant, at, at).run();
    state = await env.DB.prepare('SELECT procurement_rev FROM supplier_ledger_state WHERE merchant = ?').bind(merchant).first();
  } catch (_) { return out; }
  if (!state) return out;
  const doc = await readDoc(env, merchant, 'procurement', null);
  if (!doc.data || (!(opts && opts.force) && doc.rev <= Number(state.procurement_rev || 0))) return out;
  out.skipped = false;
  const at = Date.now();
  const suppliers = (Array.isArray(doc.data.suppliers) ? doc.data.suppliers : [])
    .filter((s) => s && ID.test(String(s.id || '')) && clean(s.name, 120)).slice(0, 1000);
  /* INSERT OR IGNORE : une fiche déjà connue en D1 ne bouge pas, quoi que
     dise le document. Une fiche nouvelle arrive active, à l'heure du serveur. */
  const statements = suppliers.map((s) => {
    const f = cleanSupplier({ name: s.name, phone: s.phone, email: s.email, address: s.address, notes: s.notes, ice: s.taxId }, false);
    return env.DB.prepare(
      `INSERT OR IGNORE INTO suppliers (merchant, id, name, phone, email, ice, rib, bank, address, notes, terms_days, archived, source, created_ts, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, 0, 0, 'procurement', ?, ?)`
    ).bind(merchant, String(s.id), f.name, f.phone, f.email, f.ice, f.address, f.notes, at, at);
  });
  try {
    if (statements.length) {
      const res = await env.DB.batch(statements);
      out.imported = (res || []).reduce((sum, r) => sum + (Number(r && r.meta && r.meta.changes) || 0), 0);
    }
  } catch (_) { return out; }
  try {
    await env.DB.prepare('UPDATE supplier_ledger_state SET procurement_rev = ?, updated_ts = ? WHERE merchant = ? AND procurement_rev < ?')
      .bind(doc.rev, at, merchant, doc.rev).run();
  } catch (_) { /* relu à la prochaine révision, sans effet : INSERT OR IGNORE */ }
  return out;
}

/* ── Bons de commande ─────────────────────────────────────────────────── */
/* La fiche d'un bon : l'id donné, sinon le nom déjà connu, sinon une fiche
 * créée à ce nom (patron ou opérateur seulement). Un id inconnu, venu du
 * classement (ids du document procurement pas encore importés), devient une
 * fiche à cet id pour le patron ; pour un employé, c'est une erreur.
 * Rend { id, name } ou { error }. */
export async function resolvePoSupplier(env, merchant, payload, opts) {
  const p = payload || {};
  const mayCreate = !!(opts && opts.mayCreate);
  const wanted = clean(p.supplierId, 80);
  const name = clean(p.supplier, 120);
  try {
    if (wanted) {
      const row = await getSupplier(env, merchant, wanted);
      if (row && Number(row.archived) === 1) return { error: 'supplier-archived' };
      if (row) return { id: row.id, name: row.name };
      if (!mayCreate || !name || !ID.test(wanted)) return { error: 'supplier-not-found' };
      const made = await createSupplier(env, merchant, { id: wanted, name }, { source: 'purchase-order' });
      return made.ok ? { id: made.supplier.id, name: made.supplier.name } : { error: 'supplier-not-found' };
    }
    if (!name) return { error: 'supplier-required' };
    const hit = await findSupplierByName(env, merchant, name);
    if (hit) return { id: hit.id, name: hit.name };
    if (!mayCreate) return { id: '', name };
    const made = await createSupplier(env, merchant, { name }, { source: 'purchase-order' });
    return made.ok ? { id: made.supplier.id, name: made.supplier.name } : { id: '', name };
  } catch (_) {
    /* Table absente (migration pas passée) : le bon garde son nom libre. */
    return { id: '', name: clean(p.supplier, 160) };
  }
}

/* Le tiers provisoire d'un bon sans fiche. */
export const unlinkedParty = (number) => 'po:' + clean(number, 60);

/* Ce qu'un mouvement de bon change à la dette, PRÉPARÉ pour le lot du stock :
 * une réception = ce que nous devons (in), un retour = ce qu'il nous reprend
 * (out). La clé est l'id de la commande opérationnelle, unique par geste.
 *   → { status: 'posted'|'pending'|'unlinked', partyId, statements: [..] }
 *   → { status: 'unmigrated' } (base d'avant 0028 : le stock passe seul)
 *   → { status: 'none' } (rien à écrire)
 * Un bon d'avant les fiches se relie à la volée par son nom ; sinon le patron
 * crée la fiche (`trusted`), et un employé laisse la ligne sous « po:<n°> ». */
export async function purchaseMovementPlan(env, merchant, order, move) {
  if (!order || !move || !(Number(move.cents) > 0)) return { status: 'none', statements: [] };
  if (!(await ledgerReady(env))) return { status: 'unmigrated', statements: [] };
  const statements = [];
  let partyId = clean(order.supplier_id, 80);
  let unlinked = false;
  if (!partyId) {
    let hit = await findSupplierByName(env, merchant, order.supplier);
    if (!hit && move.trusted && clean(order.supplier, 120)) {
      const made = await createSupplier(env, merchant, { name: order.supplier }, { source: 'purchase-order' });
      hit = made.ok ? made.supplier : null;
    }
    if (hit) {
      partyId = hit.id;
      statements.push(env.DB.prepare("UPDATE purchase_orders SET supplier_id = ? WHERE merchant = ? AND id = ? AND supplier_id = ''")
        .bind(partyId, merchant, order.id));
    } else {
      partyId = unlinkedParty(order.number);
      unlinked = true;
    }
  }
  const receive = move.kind === 'receive';
  const pending = unlinked || !move.trusted;
  const built = ledgerEntryStatement(env, merchant, {
    idemKey: `po-${receive ? 'receive' : 'return'}:${clean(move.commandId, 110)}`,
    amountCents: Number(move.cents), direction: receive ? 'in' : 'out', partyType: 'supplier', partyId,
    kind: receive ? 'purchase' : 'return', method: 'other', purchaseOrderId: order.id, ref: clean(order.number, 40),
    createdBy: clean(move.by, 100), pending,
  });
  if (!built.ok) return { status: 'unmigrated', statements: [] };
  statements.push(built.statement);
  return { status: unlinked ? 'unlinked' : pending ? 'pending' : 'posted', partyId, entryId: built.row.id, statements };
}

/* Les réceptions sans fiche, par bon : ce qui attend d'être rattaché. */
export async function unlinkedReceipts(env, merchant) {
  try {
    const rows = await env.DB.prepare(
      `SELECT m.party_id AS party, MIN(m.entry_date) AS first_date, COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN m.direction = 'in' THEN m.amount_cents ELSE -m.amount_cents END), 0) AS net,
              MAX(o.number) AS number, MAX(o.supplier) AS supplier, MAX(m.created_by) AS by
         FROM money_ledger m LEFT JOIN purchase_orders o ON o.merchant = m.merchant AND o.id = m.purchase_order_id
        WHERE m.merchant = ? AND m.party_type = 'supplier' AND m.party_id LIKE 'po:%' AND m.archived = 0 AND m.deleted_ts IS NULL
        GROUP BY m.party_id ORDER BY first_date LIMIT 200`
    ).bind(merchant).all();
    return ((rows && rows.results) || []).map((r) => ({
      party: String(r.party), number: String(r.number || String(r.party).slice(3)), supplierName: String(r.supplier || ''),
      netCents: Number(r.net) || 0, count: Number(r.n) || 0, firstDate: String(r.first_date || ''), by: String(r.by || ''),
    }));
  } catch (_) { return []; }
}

/* Le patron rattache un bon sans fiche à une fiche : le bon prend la fiche,
 * ses lignes passent sur elle et entrent dans le solde, dans un seul lot. */
export async function attachUnlinked(env, merchant, number, supplierId, by) {
  const sup = await getSupplier(env, merchant, supplierId);
  if (!sup) return { ok: false, error: 'supplier-not-found' };
  if (Number(sup.archived) === 1) return { ok: false, error: 'supplier-archived' };
  const num = clean(number, 60);
  let order = null;
  try { order = await env.DB.prepare('SELECT id, supplier_id FROM purchase_orders WHERE merchant = ? AND number = ?').bind(merchant, num).first(); } catch (_) { order = null; }
  if (!order) return { ok: false, error: 'po-not-found' };
  if (order.supplier_id && order.supplier_id !== sup.id) return { ok: false, error: 'po-linked' };
  try {
    const res = await env.DB.batch([
      env.DB.prepare('UPDATE purchase_orders SET supplier_id = ?, supplier = ?, updated_ts = ? WHERE merchant = ? AND id = ?')
        .bind(sup.id, sup.name, Date.now(), merchant, order.id),
      ...relinkStatements(env, merchant, 'supplier', unlinkedParty(num), sup.id, { approve: true, by }),
    ]);
    return { ok: true, supplierId: sup.id, moved: Number(res && res[1] && res[1].meta && res[1].meta.changes) || 0 };
  } catch (_) { return { ok: false, error: 'unmigrated' }; }
}

/* Par bon d'un fournisseur : reçu (net des retours), payé, reste, avec la
 * règle de l'ancienneté (ageBuckets) : un paiement rattaché à un bon le
 * règle d'abord ; tout le reste (paiement général, avance, surplus) solde les
 * dettes les plus anciennes en premier, bons et factures confondus. Ainsi la
 * somme des « reste » des bons et des factures est le solde du fournisseur.
 * Une réception d'employé pas encore approuvée n'est pas due : `pending`. */
export async function orderBalances(env, merchant, supplierId) {
  let rows = [];
  try {
    const got = await env.DB.prepare(
      `SELECT o.id, o.number, o.status, o.total_cents, o.created_ts, o.expected_date,
              COALESCE((SELECT SUM(l.received_qty * l.unit_cents) FROM purchase_order_lines l WHERE l.merchant = o.merchant AND l.number = o.number), 0) AS received,
              COALESCE((SELECT SUM(l.returned_qty * l.unit_cents) FROM purchase_order_lines l WHERE l.merchant = o.merchant AND l.number = o.number), 0) AS returned
         FROM purchase_orders o WHERE o.merchant = ? AND o.supplier_id = ? ORDER BY o.created_ts DESC LIMIT 20`
    ).bind(merchant, supplierId).all();
    rows = (got && got.results) || [];
  } catch (_) { return []; /* base d'avant 0028 : pas de lien bon ↔ fiche */ }
  let lines = [];
  try {
    const got = await env.DB.prepare(
      `SELECT direction, kind, amount_cents, purchase_order_id, status FROM money_ledger
        WHERE merchant = ? AND party_type = 'supplier' AND party_id = ? AND archived = 0 AND deleted_ts IS NULL AND internal = 0
        ORDER BY entry_date, created_at, rowid LIMIT 20000`
    ).bind(merchant, supplierId).all();
    lines = (got && got.results) || [];
  } catch (_) { lines = []; }
  const debts = [], byPo = new Map(), paid = new Map(), pendingIn = new Map();
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);
  for (const r of lines) {
    const po = String(r.purchase_order_id || ''), cents = Number(r.amount_cents) || 0;
    if (r.status === 'pending') { if (po && r.direction === 'in') add(pendingIn, po, cents); continue; }
    if (r.status !== 'posted' || r.direction !== 'in') continue;
    const d = { po, left: cents };
    debts.push(d);
    if (po) { if (!byPo.has(po)) byPo.set(po, []); byPo.get(po).push(d); }
  }
  let pool = 0;
  for (const r of lines) {
    if (r.status !== 'posted' || r.direction !== 'out') continue;
    const po = String(r.purchase_order_id || '');
    let rest = Number(r.amount_cents) || 0;
    for (const d of (po && byPo.get(po)) || []) { const u = Math.min(d.left, rest); d.left -= u; rest -= u; }
    if (r.kind !== 'return') add(paid, po, (Number(r.amount_cents) || 0) - rest);
    pool += rest;
  }
  for (const d of debts) {
    if (!pool) break;
    const u = Math.min(d.left, pool);
    d.left -= u; pool -= u;
    if (d.po) add(paid, d.po, u);
  }
  return rows.map((r) => {
    const id = String(r.id);
    const received = Math.max(0, (Number(r.received) || 0) - (Number(r.returned) || 0));
    const owed = (byPo.get(id) || []).length;
    const due = (byPo.get(id) || []).reduce((sum, d) => sum + d.left, 0);
    const paidCents = paid.get(id) || 0, pendingCents = pendingIn.get(id) || 0;
    return { id, number: String(r.number), status: String(r.status), totalCents: Number(r.total_cents) || 0,
      receivedCents: received, paidCents, dueCents: due, pendingCents,
      payState: !received ? 'none' : !owed && pendingCents ? 'pending' : due === 0 ? 'paid' : paidCents > 0 ? 'partial' : 'unpaid',
      createdAt: Number(r.created_ts) || 0, expectedDate: String(r.expected_date || '') };
  });
}

/* ── Tableau du fournisseur ───────────────────────────────────────────── */
export async function supplierScorecard(env, merchant, supplierId) {
  const empty = { orderCount: 0, orderedCents: 0, averageOrderCents: 0, receivedCents: 0, receivedPct: null,
    notReceivedCents: 0, returnedCents: 0, returnRatePct: null, purchasedCents: 0, paidCents: 0, paidPct: null,
    unpaidCents: 0, balanceCents: 0, lastOrderTs: 0 };
  if (!env || !env.DB) return empty;
  let po = null;
  try {
    po = await env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(o.total_cents), 0) AS ordered, MAX(o.created_ts) AS last_ts,
              COALESCE(SUM((SELECT SUM(l.received_qty * l.unit_cents) FROM purchase_order_lines l WHERE l.merchant = o.merchant AND l.number = o.number)), 0) AS received,
              COALESCE(SUM((SELECT SUM(l.returned_qty * l.unit_cents) FROM purchase_order_lines l WHERE l.merchant = o.merchant AND l.number = o.number)), 0) AS returned
         FROM purchase_orders o WHERE o.merchant = ? AND o.supplier_id = ? AND o.status <> 'cancelled'`
    ).bind(merchant, supplierId).first();
  } catch (_) { po = null; }
  let led = null;
  try {
    led = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' AND kind IN ('purchase', 'bill', 'expense', 'opening') THEN amount_cents ELSE 0 END), 0) AS purchased,
              COALESCE(SUM(CASE WHEN direction = 'out' AND kind IN ('payment', 'expense-payment') THEN amount_cents ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN direction = 'out' AND kind = 'return' THEN amount_cents ELSE 0 END), 0) AS returned
         FROM money_ledger WHERE merchant = ? AND party_type = 'supplier' AND party_id = ? AND ${LIVE}`
    ).bind(merchant, supplierId).first();
  } catch (_) { led = null; }
  const bal = await partyBalance(env, merchant, 'supplier', supplierId);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const n = Number(po && po.n) || 0, ordered = Number(po && po.ordered) || 0;
  const received = Number(po && po.received) || 0, returnedPo = Number(po && po.returned) || 0;
  const purchased = Number(led && led.purchased) || 0, paid = Number(led && led.paid) || 0;
  const returned = Math.max(returnedPo, Number(led && led.returned) || 0);
  const owedBasis = Math.max(0, purchased - returned);
  return {
    orderCount: n, orderedCents: ordered, averageOrderCents: n ? Math.round(ordered / n) : 0,
    receivedCents: received, receivedPct: pct(received, ordered), notReceivedCents: Math.max(0, ordered - received),
    returnedCents: returned, returnRatePct: pct(returned, Math.max(received, purchased)),
    purchasedCents: purchased, paidCents: paid, paidPct: owedBasis ? Math.min(100, pct(paid, owedBasis)) : null,
    unpaidCents: Math.max(0, bal.balanceCents), balanceCents: bal.balanceCents, lastOrderTs: Number(po && po.last_ts) || 0,
  };
}
