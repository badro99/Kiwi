/* Les fournisseurs, en D1 (table `suppliers`, migration 0028).
 *
 * Avant : chaque écran rangeait ses fournisseurs dans le document `procurement`
 * du navigateur, les bons de commande D1 portaient un nom libre, les dépenses
 * aussi. Trois orthographes de « Distrib Frais » faisaient trois fournisseurs
 * et aucun solde. Désormais la table est la source de vérité, et :
 *
 *   · syncProcurement() importe les fournisseurs du document `procurement`
 *     avec LEUR id (les bons, réceptions et fiches article qui les citent
 *     restent justes), à chaque nouvelle révision du document, sans écraser
 *     une fiche D1 plus récente. Les bons de réception (BR-) et retours (RF-)
 *     écrits APRÈS le démarrage du grand livre deviennent des lignes : la
 *     réception = ce que nous devons (in), le retour = ce qu'il nous reprend
 *     (out). Les plus anciens ne deviennent pas des dettes rétroactives : ils
 *     ont presque toujours été payés hors de Kiwi.
 *   · resolvePoSupplier() relie un bon de commande à sa fiche (id donné, sinon
 *     nom connu, sinon fiche créée) : le texte libre s'arrête là.
 *   · supplierScorecard() agrège en SQL ce qu'Inyad appelle le tableau du
 *     fournisseur : commandé, % reçu, % payé, reste dû, taux de retour, panier.
 */
import { readDoc, mutateDoc } from './_doc-cas.js';
import { postLedgerEntry, partyBalance, todayYmd } from './_ledger.js';

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

/* ── Import du document `procurement` ─────────────────────────────────── */
async function ledgerState(env, merchant) {
  const at = Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO supplier_ledger_state (merchant, started_ts, procurement_rev, updated_ts) VALUES (?, ?, 0, ?)')
    .bind(merchant, at, at).run();
  return env.DB.prepare('SELECT started_ts, procurement_rev FROM supplier_ledger_state WHERE merchant = ?').bind(merchant).first();
}

export function receiptCents(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((sum, l) => {
    const qty = Number(l && l.qty), cost = Number(l && l.unitCost);
    return sum + (qty > 0 && cost > 0 ? Math.round(qty * cost * 100) : 0);
  }, 0);
}

function ymdOf(ts) {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString().slice(0, 10) : todayYmd();
}

export async function syncProcurement(env, merchant, opts) {
  const out = { imported: 0, posted: 0, skipped: true };
  if (!env || !env.DB) return out;
  let state;
  try { state = await ledgerState(env, merchant); } catch (_) { return out; }
  if (!state) return out;
  const doc = await readDoc(env, merchant, 'procurement', null);
  if (!doc.data || (!(opts && opts.force) && doc.rev <= Number(state.procurement_rev || 0))) return out;
  out.skipped = false;
  const d = doc.data;
  const suppliers = (Array.isArray(d.suppliers) ? d.suppliers : []).filter((s) => s && ID.test(String(s.id || '')) && clean(s.name, 120));
  const statements = suppliers.slice(0, 1000).map((s) => {
    const updated = Number(s.updatedAt || s.createdAt) || Date.now();
    const f = cleanSupplier({ name: s.name, phone: s.phone, email: s.email, address: s.address, notes: s.notes, ice: s.taxId }, false);
    /* Une fiche D1 plus récente que la copie du document ne recule pas. */
    return env.DB.prepare(
      `INSERT INTO suppliers (merchant, id, name, phone, email, ice, rib, bank, address, notes, terms_days, archived, source, created_ts, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, 0, ?, 'procurement', ?, ?)
       ON CONFLICT (merchant, id) DO UPDATE SET name = excluded.name, phone = excluded.phone, email = excluded.email,
         ice = CASE WHEN excluded.ice = '' THEN suppliers.ice ELSE excluded.ice END, address = excluded.address,
         notes = excluded.notes, archived = excluded.archived, updated_ts = excluded.updated_ts
       WHERE excluded.updated_ts > suppliers.updated_ts`
    ).bind(merchant, String(s.id), f.name, f.phone, f.email, f.ice, f.address, f.notes, s.active === false ? 1 : 0,
      Number(s.createdAt) || updated, updated);
  });
  try { if (statements.length) await env.DB.batch(statements); out.imported = statements.length; } catch (_) { return out; }

  const known = new Set(suppliers.map((s) => String(s.id)));
  const started = Number(state.started_ts) || Date.now();
  const fresh = (r) => r && known.has(String(r.supplierId || '')) && Number(r.createdAt) >= started;
  for (const r of (Array.isArray(d.receipts) ? d.receipts : []).filter(fresh).slice(0, 500)) {
    const cents = receiptCents(r.lines);
    if (!cents) continue;
    const res = await postLedgerEntry(env, merchant, {
      idemKey: 'proc-receipt:' + String(r.id).slice(0, 100), amountCents: cents, direction: 'in', partyType: 'supplier',
      partyId: String(r.supplierId), date: ymdOf(r.receivedAt || r.createdAt), kind: 'purchase', method: 'other',
      note: ['Réception', r.number, r.externalRef].filter(Boolean).join(' · '), createdBy: clean(r.receivedBy, 100),
    });
    if (res.ok && !res.duplicate) out.posted++;
  }
  for (const r of (Array.isArray(d.returns) ? d.returns : []).filter(fresh).slice(0, 500)) {
    const cents = receiptCents(r.lines);
    if (!cents) continue;
    const res = await postLedgerEntry(env, merchant, {
      idemKey: 'proc-return:' + String(r.id).slice(0, 100), amountCents: cents, direction: 'out', partyType: 'supplier',
      partyId: String(r.supplierId), date: ymdOf(r.returnedAt || r.createdAt), kind: 'return', method: 'other',
      note: ['Retour', r.number, r.externalRef].filter(Boolean).join(' · '),
    });
    if (res.ok && !res.duplicate) out.posted++;
  }
  try {
    await env.DB.prepare('UPDATE supplier_ledger_state SET procurement_rev = ?, updated_ts = ? WHERE merchant = ? AND procurement_rev < ?')
      .bind(doc.rev, Date.now(), merchant, doc.rev).run();
  } catch (_) { /* on relira la même révision, sans doublon : les clés sont idempotentes */ }
  return out;
}

/* ── Bons de commande ─────────────────────────────────────────────────── */
/* La fiche d'un bon : l'id donné (doit exister), sinon le nom déjà connu,
 * sinon une fiche créée à ce nom. Rend { id, name } ou { error }. */
export async function resolvePoSupplier(env, merchant, payload) {
  const p = payload || {};
  const wanted = clean(p.supplierId, 80);
  try {
    if (wanted) {
      const row = await getSupplier(env, merchant, wanted);
      if (!row || Number(row.archived) === 1) return { error: 'supplier-not-found' };
      return { id: row.id, name: row.name };
    }
    const name = clean(p.supplier, 120);
    if (!name) return { error: 'supplier-required' };
    const hit = await findSupplierByName(env, merchant, name);
    if (hit) return { id: hit.id, name: hit.name };
    const made = await createSupplier(env, merchant, { name }, { source: 'purchase-order' });
    return made.ok ? { id: made.supplier.id, name: made.supplier.name } : { id: '', name };
  } catch (_) {
    /* Table absente (migration pas passée) : le bon garde son nom libre. */
    return { id: '', name: clean(p.supplier, 160) };
  }
}

/* Écrit dans le grand livre ce qu'un mouvement de bon change à la dette :
 * une réception = ce que nous devons (in), un retour = ce qu'il nous reprend
 * (out). La clé est l'id de la commande opérationnelle, unique par geste. Un
 * bon d'avant les fiches est relié à la volée par son nom. */
export async function postPurchaseMovement(env, merchant, order, move) {
  if (!order || !move || !(Number(move.cents) > 0)) return { ok: false, error: 'nothing' };
  let supplierId = clean(order.supplier_id, 80);
  try {
    if (!supplierId) {
      const hit = await findSupplierByName(env, merchant, order.supplier);
      if (!hit) return { ok: false, error: 'no-supplier' };
      supplierId = hit.id;
      await env.DB.prepare("UPDATE purchase_orders SET supplier_id = ? WHERE merchant = ? AND id = ? AND supplier_id = ''")
        .bind(supplierId, merchant, order.id).run();
    }
  } catch (_) { return { ok: false, error: 'unmigrated' }; }
  const receive = move.kind === 'receive';
  return postLedgerEntry(env, merchant, {
    idemKey: `po-${receive ? 'receive' : 'return'}:${clean(move.commandId, 110)}`,
    amountCents: Number(move.cents), direction: receive ? 'in' : 'out', partyType: 'supplier', partyId: supplierId,
    kind: receive ? 'purchase' : 'return', method: 'other', purchaseOrderId: order.id,
    note: `${receive ? 'Réception' : 'Retour'} ${clean(order.number, 40)}`, createdBy: clean(move.by, 100),
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
         FROM money_ledger WHERE merchant = ? AND party_type = 'supplier' AND party_id = ? AND archived = 0 AND deleted_ts IS NULL AND internal = 0`
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
