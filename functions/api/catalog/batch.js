// POST /api/catalog/batch — the catalogue spreadsheet's save: only the changed
// rows, in one call, for a boutique catalogue or a restaurant carte.
//
// Body: { kind: 'boutique'|'menu', merchant, opId, rows: [{ id, set: {field: value},
//         was: {field: value} }] }
// Fields (assets/pages-pro/catalog-bulk/rules.js, the same rules the grid ran):
//   boutique  name, sku, barcode, price, cost, lowStock, category, sellable
//   menu      name, price, category, sellable
//
// Rules, in order:
//   · WHO. The merchant is resolved server-side: the owner's own session for
//     that store, or a named operator. A paired till cannot bulk re-price: the
//     cookie that sells at the counter does not rewrite the price list.
//   · ALL OR NOTHING. Every row is validated before anything is written. One
//     unknown id, one bad number, one duplicate barcode or SKU, one unknown
//     category: 422 with the list, nothing stored.
//   · IDEMPOTENT. Values are absolute. A field already holding the asked value
//     counts as unchanged, so a retried request (lost response, double click)
//     writes nothing the second time. If nothing changes, nothing is written.
//   · NO SILENT OVERWRITE. `was` is the value the grid loaded. A field that
//     moved elsewhere since (the till, another tab) and is not already the asked
//     value is a conflict: 409 with the current values, nothing stored. The grid
//     reloads, keeps the merchant's edits and offers to save again.
//   · Compare-and-swap on the stored revision (catalogs.rev / menus.updated_ts),
//     retried a few times against a concurrent sale.
//
// A boutique write stamps each touched record with a clock past its stored one
// (metaAt), so every device's merge (assets/boutique-catalog-parts.js) takes the
// new values, and the shared-catalogue family (_catalog-family.js) follows.

import '../../../assets/pages-pro/catalog-bulk/rules.js';
import { json, isOperator } from '../../auth/_lib.js';
import { tenantFor, ownerMerchant } from '../_private.js';
import { sanitizeCatalog, __test as catalogInternals } from '../catalog.js';
import { sanitizeMenu } from '../menu.js';
import { loadParts, packCatalog, runCatalogWrite } from '../_catalog-parts.js';
import { syncFamily } from '../_catalog-family.js';
import { keepHistory } from '../_tenant-guard.js';

const R = () => globalThis.KiwiBulkRules;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

/* The caller's store, or '' (refused). */
async function batchMerchant(request, env, asked) {
  const owner = await ownerMerchant(request, env, asked, { strict: true });
  if (owner) return owner;
  try {
    if (await isOperator(request, env)) return await tenantFor(request, env, asked, { strict: true });
  } catch (_) {}
  return '';
}

/* Read a request into checked rows: [{ id, set, was }] or { error }. */
function readRows(kind, body) {
  const fields = R().FIELDS[kind];
  const raw = Array.isArray(body && body.rows) ? body.rows : null;
  if (!raw || !raw.length) return { error: 'no-rows', status: 400 };
  if (raw.length > R().MAX_ROWS) return { error: 'too-many-rows', status: 413, max: R().MAX_ROWS };
  const seen = new Set(), rows = [];
  for (const r of raw) {
    const id = str(r && r.id, 40);
    if (!id || seen.has(id)) return { error: id ? 'duplicate-row' : 'bad-row', status: 400, id };
    seen.add(id);
    const set = r && r.set && typeof r.set === 'object' ? r.set : null;
    if (!set || !Object.keys(set).length) return { error: 'bad-row', status: 400, id };
    for (const f of Object.keys(set)) if (!fields.includes(f)) return { error: 'unknown-field', status: 400, id, field: f };
    rows.push({ id, set, was: r && r.was && typeof r.was === 'object' ? r.was : {} });
  }
  return { rows };
}

/* ── boutique ─────────────────────────────────────────────────────────── */
function boutiqueView(doc) {
  const variantsOf = new Map();
  for (const v of doc.variants || []) {
    if (!variantsOf.has(v.productId)) variantsOf.set(v.productId, []);
    variantsOf.get(v.productId).push(v);
  }
  const primary = (v) => { const b = (v.barcodes || []).find((x) => x.primary) || (v.barcodes || [])[0]; return b ? b.code : ''; };
  const view = (p) => {
    const vs = variantsOf.get(p.id) || [];
    return {
      name: p.name, sku: p.sku || '', price: Number(p.priceMAD) || 0, cost: Number(p.cost) || 0,
      lowStock: Number(p.reorderLevel) || 0, category: p.categoryId || null, sellable: !p.archived,
      barcode: vs.length === 1 ? primary(vs[0]) : '', variants: vs,
    };
  };
  return { view, variantsOf };
}
const skuKey = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* Validate and apply to `doc` in place. Returns { issues, conflicts, changed, unchanged }. */
export function applyBoutique(doc, rows, now) {
  const rules = R();
  const products = new Map((doc.products || []).map((p) => [p.id, p]));
  const cats = new Set((doc.categories || []).map((c) => c.id));
  const { view } = boutiqueView(doc);
  const issues = [], conflicts = [], plan = [];
  for (const row of rows) {
    const p = products.get(row.id);
    if (!p) { issues.push({ id: row.id, field: '', code: 'not-found' }); continue; }
    const cur = view(p), next = {};
    for (const f of Object.keys(row.set)) {
      const c = rules.checkValue('boutique', f, row.set[f], { categories: cats });
      if (c.error) { issues.push({ id: row.id, field: f, code: c.error }); continue; }
      if (f === 'barcode' && cur.variants.length !== 1) { issues.push({ id: row.id, field: f, code: 'multi-variant' }); continue; }
      if (rules.sameValue(f, cur[f], c.value)) continue;                          // already there: idempotent
      if (f in row.was && !rules.sameValue(f, cur[f], row.was[f])) {
        conflicts.push({ id: row.id, field: f, current: cur[f] }); continue;
      }
      next[f] = c.value;
    }
    plan.push({ p, cur, next });
  }
  /* Uniqueness, judged on the catalogue as it WILL be. */
  const finalSku = new Map(), finalCode = new Map();
  const touched = new Map(plan.map((x) => [x.p.id, x]));
  for (const p of doc.products || []) {
    const t = touched.get(p.id);
    const sku = t && 'sku' in t.next ? t.next.sku : p.sku;
    if (sku && !p.archived) { const k = skuKey(sku); if (k) { if (!finalSku.has(k)) finalSku.set(k, []); finalSku.get(k).push(p.id); } }
  }
  for (const v of doc.variants || []) {
    const t = touched.get(v.productId);
    const codes = (v.barcodes || []).map((b) => b.code);
    if (t && 'barcode' in t.next) codes.push(t.next.barcode);
    for (const c of new Set(codes.filter(Boolean))) { if (!finalCode.has(c)) finalCode.set(c, new Set()); finalCode.get(c).add(v.productId); }
  }
  for (const { p, next } of plan) {
    if (next.sku && (finalSku.get(skuKey(next.sku)) || []).length > 1) issues.push({ id: p.id, field: 'sku', code: 'duplicate' });
    if (next.barcode && (finalCode.get(next.barcode) || new Set()).size > 1) issues.push({ id: p.id, field: 'barcode', code: 'duplicate' });
  }
  if (issues.length || conflicts.length) return { issues, conflicts, changed: 0, unchanged: 0 };

  let changed = 0, unchanged = 0;
  for (const { p, cur, next } of plan) {
    if (!Object.keys(next).length) { unchanged++; continue; }
    changed++;
    const t = Math.max(now, (Number(p.metaAt) || 0) + 1);
    if ('name' in next) p.name = next.name;
    if ('sku' in next) p.sku = next.sku;
    if ('price' in next) p.priceMAD = next.price;
    if ('cost' in next) p.cost = next.cost;
    if ('lowStock' in next) p.reorderLevel = next.lowStock;
    if ('category' in next) p.categoryId = next.category;
    if ('sellable' in next) p.archived = !next.sellable;
    p.metaAt = t;
    if ('barcode' in next) setPrimaryCode(cur.variants[0], next.barcode, now);
  }
  return { issues, conflicts, changed, unchanged };
}

/* The grid's barcode cell is the variant's label code. A new code becomes the
 * primary one. The code it replaces stays attached when Kiwi generated it (the
 * label may already be stuck on goods) and is retired otherwise: a typed code
 * corrected in the grid was a typo, not a second label. Clearing the cell
 * retires the primary code. Every entry touched takes a fresh `at`, the clock
 * the device merge reads code by code. */
function setPrimaryCode(v, code, now) {
  const t = Math.max(now, (Number(v.metaAt) || 0) + 1);
  v.barcodes = Array.isArray(v.barcodes) ? v.barcodes : [];
  v.barcodeRemoved = v.barcodeRemoved && typeof v.barcodeRemoved === 'object' ? v.barcodeRemoved : {};
  const old = v.barcodes.find((b) => b.primary) || v.barcodes[0] || null;
  if (old && (!code || old.type !== 'ean13')) {
    v.barcodes = v.barcodes.filter((b) => b !== old);
    v.barcodeRemoved[old.code] = t;
  } else if (old) { old.primary = false; old.at = t; }
  if (code) {
    const have = v.barcodes.find((b) => b.code === code);
    v.barcodes.forEach((b) => { if (b.primary) { b.primary = false; b.at = t; } });
    if (have) { have.primary = true; have.at = t; }
    else v.barcodes.unshift({ code, type: 'imported', sym: '', primary: true, at: t });
    delete v.barcodeRemoved[code];
  } else if (v.barcodes.length && !v.barcodes.some((b) => b.primary)) { v.barcodes[0].primary = true; v.barcodes[0].at = t; }
  v.metaAt = t;
}

async function saveBoutique(env, merchant, rows, waitUntil) {
  const { materialize } = catalogInternals;
  for (let attempt = 0; attempt < 4; attempt++) {
    let row;
    try {
      row = await loadParts(env.DB, merchant, await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first());
    } catch (_) { return json({ error: 'unmigrated' }, 503); }
    if (!row || !row.data) return json({ error: 'catalog-missing' }, 409);
    let doc;
    try { doc = sanitizeCatalog(JSON.parse(row.data)); } catch (_) { return json({ error: 'catalog-invalid' }, 409); }
    const out = applyBoutique(doc, rows, Date.now());
    const rev = Number(row.rev) || 0;
    if (out.issues.length) return json({ error: 'invalid', issues: out.issues.slice(0, 200), count: out.issues.length }, 422);
    if (out.conflicts.length) return json({ error: 'conflict', conflicts: out.conflicts.slice(0, 500), rev }, 409);
    if (!out.changed) return json({ ok: true, merchant, rev, updated: 0, unchanged: out.unchanged });
    const data = sanitizeCatalog(materialize(doc));
    const next = rev + 1;
    let write;
    try {
      const packed = packCatalog(data);
      write = await runCatalogWrite(env.DB, merchant, packed, env.DB.prepare(
        'UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?'
      ).bind(packed.head, next, Date.now(), merchant, rev), row.split);
    } catch (_) { return json({ error: 'write-failed' }, 500); }
    if (write && write.meta && Number(write.meta.changes) === 1) {
      const fam = syncFamily(env, merchant, data, sanitizeCatalog).catch(() => null);
      if (typeof waitUntil === 'function') waitUntil(fam); else await fam;
      return json({ ok: true, merchant, rev: next, updated: out.changed, unchanged: out.unchanged });
    }
  }
  return json({ error: 'busy' }, 409);
}

/* ── menu ─────────────────────────────────────────────────────────────── */
export function applyMenu(menu, rows) {
  const rules = R();
  const items = new Map((menu.items || []).filter((it) => !it.archived).map((it) => [it.id, it]));
  const cats = new Set((menu.cats || []).map((c) => c.id));
  const issues = [], conflicts = [], plan = [];
  for (const row of rows) {
    const it = items.get(row.id);
    if (!it) { issues.push({ id: row.id, field: '', code: 'not-found' }); continue; }
    const cur = { name: it.name, price: Number(it.price) || 0, category: it.catId || null, sellable: it.avail !== false };
    const next = {};
    for (const f of Object.keys(row.set)) {
      const c = rules.checkValue('menu', f, row.set[f], { categories: cats });
      if (c.error) { issues.push({ id: row.id, field: f, code: c.error }); continue; }
      if (rules.sameValue(f, cur[f], c.value)) continue;
      if (f in row.was && !rules.sameValue(f, cur[f], row.was[f])) { conflicts.push({ id: row.id, field: f, current: cur[f] }); continue; }
      next[f] = c.value;
    }
    plan.push({ it, next });
  }
  if (issues.length || conflicts.length) return { issues, conflicts, changed: 0, unchanged: 0 };
  let changed = 0, unchanged = 0;
  for (const { it, next } of plan) {
    if (!Object.keys(next).length) { unchanged++; continue; }
    changed++;
    if ('name' in next) it.name = next.name;
    if ('price' in next) it.price = next.price;
    if ('category' in next) { if (it.catId !== next.category) it.subId = null; it.catId = next.category; }
    if ('sellable' in next) { it.avail = next.sellable; delete it.availUntil; }
  }
  return { issues, conflicts, changed, unchanged };
}

async function saveMenu(env, merchant, rows) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let row;
    try { row = await env.DB.prepare('SELECT name, type, data, updated_ts FROM menus WHERE merchant = ?').bind(merchant).first(); }
    catch (_) { return json({ error: 'unmigrated' }, 503); }
    if (!row || !row.data) return json({ error: 'menu-missing' }, 409);
    if (String(row.type || '').toLowerCase() === 'boutique') return json({ error: 'not-a-menu' }, 409);
    let menu;
    try { menu = sanitizeMenu(JSON.parse(row.data)); } catch (_) { return json({ error: 'menu-invalid' }, 409); }
    const ts = Number(row.updated_ts) || 0;
    const out = applyMenu(menu, rows);
    if (out.issues.length) return json({ error: 'invalid', issues: out.issues.slice(0, 200), count: out.issues.length }, 422);
    if (out.conflicts.length) return json({ error: 'conflict', conflicts: out.conflicts.slice(0, 500), updatedTs: ts }, 409);
    /* The carte goes back with its revision: the dashboard adopts it as its
       new base instead of republishing from the old one (one save, one write). */
    if (!out.changed) return json({ ok: true, merchant, updatedTs: ts, updated: 0, unchanged: out.unchanged, menu });
    const saved = sanitizeMenu(menu);
    const text = JSON.stringify(saved);
    await keepHistory(env, 'menu', merchant, 'menu');
    const updatedTs = Math.max(Date.now(), ts + 1);
    let result;
    try {
      result = await env.DB.prepare('UPDATE menus SET data = ?, updated_ts = ? WHERE merchant = ? AND updated_ts = ?')
        .bind(text, updatedTs, merchant, ts).run();
    } catch (_) { return json({ error: 'write-failed' }, 500); }
    if (result && result.meta && Number(result.meta.changes) === 1) {
      return json({ ok: true, merchant, updatedTs, updated: out.changed, unchanged: out.unchanged, menu: saved });
    }
  }
  return json({ error: 'busy' }, 409);
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const kind = body && body.kind === 'menu' ? 'menu' : body && body.kind === 'boutique' ? 'boutique' : '';
  if (!kind) return json({ error: 'bad-kind' }, 400);
  const merchant = await batchMerchant(request, env, str(body && body.merchant, 64).trim());
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const read = readRows(kind, body);
  if (read.error) return json({ error: read.error, id: read.id, field: read.field, max: read.max }, read.status);
  const res = kind === 'menu' ? await saveMenu(env, merchant, read.rows) : await saveBoutique(env, merchant, read.rows, waitUntil);
  return res;
}
