/* Catalogue merge and compaction. Server thresholds and reservation boundaries are authoritative. */
export const MOVE_MAX = 11000;
function baseOf(v) { return v && v.base != null ? (+v.base || 0) : Math.max(0, +(v && v.stock) || 0); }
function baseAtOf(v) { return +(v && (v.baseAt || v.stockAt)) || 0; }
function pruneTombs(map, time) {
  const out = Object.create(null);
  for (const id of Object.keys(map || {})) if ((+map[id] || 0) > time - 180 * 86400000) out[id] = +map[id];
  return out;
}
export function materialize(data) {
  const by = new Map();
  for (const v of data.variants || []) {
    by.set(v.id, { v, n: Number(v.base != null ? v.base : v.stock) || 0, at: Number(v.baseAt || v.stockAt) || 0 });
  }
  for (const m of data.moves || []) {
    const slot = m && by.get(m.vid);
    if (slot && Number(m.at) > slot.at) slot.n += Number(m.d) || 0;
  }
  for (const { v, n } of by.values()) v.stock = Math.max(0, Math.round(n));
  return data;
}

export function compactForWrite(data) {
  const moves = Array.isArray(data.moves) ? data.moves.slice() : [];
  if (moves.length <= MOVE_MAX) return data;
  const by = new Map((data.variants || []).map((v) => [v.id, v]));
  const foldable = moves.filter((m) => m && m.why !== 'reserve')
    .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  const foldIds = new Set(foldable.slice(0, Math.max(0, moves.length - 10000)).map((m) => m.id));
  /* Le socle replié prend l'instant du plus récent mouvement replié, et tout
   * mouvement de même date ou plus ancien cesse alors de compter. Un mouvement
   * GARDÉ plus ancien (une réservation en ligne, jamais repliée, ou un ex aequo
   * à la milliseconde) serait donc effacé du stock : jusqu'au 22 octobre 2026 la
   * pièce réservée revenait en vente, puis une seconde fois à la libération. On
   * ne replie, par déclinaison, que ce qui précède strictement son plus ancien
   * mouvement gardé. */
  const keptFrom = new Map();
  for (const m of moves) {
    if (!m || foldIds.has(m.id)) continue;
    const at = Number(m.at || 0);
    if (!keptFrom.has(m.vid) || at < keptFrom.get(m.vid)) keptFrom.set(m.vid, at);
  }
  for (const m of foldable) {
    if (foldIds.has(m.id) && keptFrom.has(m.vid) && Number(m.at || 0) >= keptFrom.get(m.vid)) foldIds.delete(m.id);
  }
  const folded = new Map();
  for (const m of moves) {
    if (!foldIds.has(m.id)) continue;
    const v = by.get(m.vid);
    if (!v || Number(m.at || 0) <= Number(v.baseAt || v.stockAt || 0)) continue;
    const f = folded.get(v.id) || { d: 0, at: Number(v.baseAt || v.stockAt || 0) };
    f.d += Number(m.d) || 0; f.at = Math.max(f.at, Number(m.at) || 0); folded.set(v.id, f);
  }
  for (const [id, f] of folded) {
    const v = by.get(id); v.base = Number(v.base != null ? v.base : v.stock) + f.d; v.baseAt = f.at;
  }
  data.moves = moves.filter((m) => !foldIds.has(m.id));
  return materialize(data);
}

/* ── Per-field clocks ────────────────────────────────────────────────────────
 * The catalogue used to keep a whole record from the device with the newer
 * metaAt: a price changed offline on one till was lost when another device
 * renamed the same product later. A record edited through touchFields now
 * carries one clock per field:
 *   fieldRest  the clock of every field not listed in fieldAt
 *   fieldAt    fields edited after fieldRest, each with its own clock
 *   fieldBase  for each field in fieldAt, the clock of the value that edit replaced
 *   fieldMeta  equal to metaAt while the map is current
 * A device still running older code rewrites metaAt without the map; fieldMeta
 * then differs and the record counts as edited whole at metaAt, exactly as
 * before. Two devices that change DIFFERENT fields both keep their edit. Two
 * devices that change the SAME field without having seen each other's edit
 * keep the later value, and the other value is filed on the record under
 * `conflicts` for the merchant to review. A later edit of that field resolves
 * it, on every device. */
export const CATEGORY_FIELDS = ['name', 'color', 'order'];
export const PRODUCT_FIELDS = ['legacyId', 'name', 'categoryId', 'priceMAD', 'cost', 'art', 'kind', 'flag', 'grad',
  'marque', 'format', 'servicePieces', 'piecePriceMAD', 'motif', 'fragile', 'ownership', 'consignor',
  'supplierId', 'parLevel', 'reorderLevel', 'sku', 'createdAt', 'archived'];
export const VARIANT_FIELDS = ['productId', 'colorId', 'colorFamily', 'colorSource', 'colorSourceHex', 'colorWas',
  'colorLabel', 'colorHex', 'size', 'sku', 'note'];
/* Fields a merchant reviews when two devices disagree. The others follow
   them (a colour's label and hex move with its colorId) or are bookkeeping. */
export const REVIEWED_FIELDS = {
  categories: ['name', 'color'],
  products: ['name', 'categoryId', 'priceMAD', 'cost', 'piecePriceMAD', 'sku', 'archived', 'parLevel', 'reorderLevel', 'supplierId', 'marque'],
  variants: ['colorId', 'size', 'sku', 'note'],
};
const CONFLICTS_MAX = 20;
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
function current(rec) {
  return !!rec && rec.fieldMeta != null && +rec.fieldMeta === (+rec.metaAt || 0) && rec.fieldAt && typeof rec.fieldAt === 'object';
}
/* The clock and base of one field. */
export function fieldClock(rec, f) {
  const meta = +(rec && rec.metaAt) || 0;
  if (!current(rec)) return { at: meta, base: null };
  const at = rec.fieldAt[f];
  if (at == null) return { at: +rec.fieldRest || 0, base: null };
  const base = rec.fieldBase && rec.fieldBase[f] != null ? +rec.fieldBase[f] : null;
  return { at: +at, base };
}
/* Stamp an edit: every field whose value differs from `before` gets clock t. */
export function touchFields(rec, before, fields, t, force) {
  const clocks = {};
  for (const f of fields) clocks[f] = fieldClock(before, f);
  const changed = fields.filter((f) => !same(rec[f], before[f]) || (force && force.includes(f)));
  const at = {}, base = {};
  for (const f of fields) {
    const c = clocks[f];
    if (changed.includes(f)) { at[f] = t; base[f] = c.at; } else { at[f] = c.at; if (c.base != null) base[f] = c.base; }
  }
  writeClocks(rec, fields, at, base, t);
  /* An edit of a field settles any disagreement filed about it. */
  if (rec.conflicts) for (const f of changed) delete rec.conflicts[f];
  if (rec.conflicts && !Object.keys(rec.conflicts).length) delete rec.conflicts;
}
/* "Keep this value": the merchant confirms the field as it stands, which is an
   edit of it at t and settles its review on every device. */
export function settleField(rec, f, fields, t) {
  touchFields(rec, JSON.parse(JSON.stringify(rec)), fields, t, [f]);
}
function writeClocks(rec, fields, at, base, meta) {
  let rest = Infinity;
  for (const f of fields) rest = Math.min(rest, at[f]);
  if (!isFinite(rest)) rest = meta;
  const fieldAt = {}, fieldBase = {};
  for (const f of fields) {
    if (at[f] > rest) { fieldAt[f] = at[f]; if (base[f] != null) fieldBase[f] = base[f]; }
  }
  rec.metaAt = meta;
  rec.fieldRest = rest;
  rec.fieldAt = fieldAt;
  rec.fieldBase = fieldBase;
  rec.fieldMeta = meta;
}
/* Merge their copy of one record into ours, field by field. Returns which side
   holds something the other lacks. */
export function mergeRecord(kept, e, fields, reviewed) {
  const r = { mine: false, theirs: false };
  const legacy = !current(kept) && !current(e);
  const mineMeta = +kept.metaAt || 0, theirMeta = +e.metaAt || 0;
  if (legacy) {
    /* Neither side knows per-field clocks: the record is one edit, as before. */
    if (theirMeta > mineMeta) {
      fields.forEach((f) => { if (e[f] === undefined) delete kept[f]; else kept[f] = e[f]; });
      kept.metaAt = e.metaAt;
      r.theirs = true;
    } else if (mineMeta > theirMeta) r.mine = true;
    return r;
  }
  const at = {}, base = {};
  /* One filed value per field, chosen the same way on every device: the
     latest kept edit, then the latest other edit, then the value itself. */
  const filed = {};
  const file = (f, c) => {
    const b = filed[f];
    const order = (x) => [+x.keptAt || 0, +x.otherAt || 0, JSON.stringify(x.other === undefined ? null : x.other)];
    if (!b) { filed[f] = c; return; }
    const [ka, oa, va] = order(c), [kb, ob, vb] = order(b);
    if (ka > kb || (ka === kb && (oa > ob || (oa === ob && va > vb)))) filed[f] = c;
  };
  for (const side of [e.conflicts || {}, kept.conflicts || {}]) for (const f of Object.keys(side)) file(f, side[f]);
  for (const f of fields) {
    const m = fieldClock(kept, f), t = fieldClock(e, f);
    const differ = !same(kept[f], e[f]);
    if (t.at > m.at) {
      /* Theirs is later. Ours was a concurrent edit if theirs started from a
         value older than ours. */
      if (differ && reviewed.includes(f) && t.base != null && m.base != null && t.base < m.at) {
        file(f, { other: kept[f] === undefined ? null : kept[f], otherAt: m.at, keptAt: t.at });
      }
      if (e[f] === undefined) delete kept[f]; else kept[f] = e[f];
      at[f] = t.at; if (t.base != null) base[f] = t.base;
      r.theirs = true;
    } else {
      if (m.at > t.at) {
        if (differ && reviewed.includes(f) && m.base != null && t.base != null && m.base < t.at) {
          file(f, { other: e[f] === undefined ? null : e[f], otherAt: t.at, keptAt: m.at });
        }
        r.mine = true;
      }
      at[f] = m.at; if (m.base != null) base[f] = m.base;
    }
  }
  writeClocks(kept, fields, at, base, Math.max(mineMeta, theirMeta));
  /* A disagreement stays filed until the field is edited after it. */
  const conflicts = {};
  Object.keys(filed).filter((f) => fields.includes(f) && fieldClock(kept, f).at <= (+filed[f].keptAt || 0))
    .sort((a, b) => (+filed[b].keptAt || 0) - (+filed[a].keptAt || 0)).slice(0, CONFLICTS_MAX)
    .forEach((f) => { conflicts[f] = filed[f]; });
  const before = JSON.stringify(kept.conflicts || {});
  if (Object.keys(conflicts).length) kept.conflicts = conflicts; else delete kept.conflicts;
  if (before !== JSON.stringify(kept.conflicts || {})) {
    if (!same(kept.conflicts || {}, e.conflicts || {})) r.mine = true;
    if (!same(kept.conflicts || {}, JSON.parse(before))) r.theirs = true;
  }
  return r;
}

export function mergeDocs(mine, theirs, time) {
  const ahead = { mine: false, theirs: false };
  /* Tout ce que l'autre côté porte a été VU, y compris ce que la fusion va
     écarter : le prochain geste d'ici se datera au-dessus. */

  /* Les suppressions des deux côtés, réunies : celle que l'autre appareil a
     faite compte autant que la nôtre. */
  const gone = pruneTombs(Object.assign(
    Object.create(null), (theirs && theirs.removed) || {}, (mine && mine.removed) || {}
  ), time);
  /* Une suppression que nous portons et qu'ils n'ont pas est exactement ce
     qu'il faut leur transmettre — sans ce test, un pull « propre » la garderait
     pour lui et l'article resterait vivant sur l'autre comptoir. */
  Object.keys(gone).forEach((id) => {
    if (!((theirs && theirs.removed) || {})[id]) ahead.mine = true;
  });
  const out = {
    v: 1, categories: [], products: [], variants: [],
    seq: Math.max(+(mine && mine.seq) || 0, +(theirs && theirs.seq) || 0),
    removed: gone,
  };
  ['categories', 'products', 'variants'].forEach((k) => {
    const seen = Object.create(null);
    const list = [];
    /* Ce que l'autre côté connaît déjà. Sert uniquement à savoir si NOUS
       portons du neuf — sans quoi pull() ne peut pas décider s'il a quelque
       chose à remonter. */
    const theirIds = Object.create(null);
    ((theirs && theirs[k]) || []).forEach((e) => { if (e && e.id) theirIds[e.id] = 1; });
    const take = (e) => {
      if (!e || !e.id) return;
      if (gone[e.id]) return;                     // supprimé ici ou là-bas
      if (!seen[e.id]) { seen[e.id] = 1; list.push(e); ahead.theirs = true; return; }
      /* Connu des deux côtés. L'enregistrement local est gardé — le nom, le
         prix, la couleur, les codes-barres sont de l'ÉDITION, et la dernière
         main qui a tapé est devant l'écran.
         Le SOCLE, lui, n'est pas de l'édition : c'est un comptage. Le plus
         récent des deux gagne, parce qu'un inventaire physique fait ce matin
         n'a pas à céder devant un chiffre d'hier. Les MOUVEMENTS ne sont
         arbitrés nulle part ici : ils sont réunis plus bas, tous. */
      const kept = seen[e.id];
      const note = (r) => { if (r.theirs) ahead.theirs = true; if (r.mine) ahead.mine = true; };
      if (k === 'categories') {
        note(mergeRecord(kept, e, CATEGORY_FIELDS, REVIEWED_FIELDS.categories));
        return;
      }
      if (k === 'products') {
        /* Product media is edited on the dashboard but consumed on caisse.
           A caisse that already knew the product used to keep its older blank
           `photo` forever because local metadata always won the merge. Keep a
           small media clock so upload, replacement and removal all propagate.
           Legacy documents have no clock: in that one migration case, a real
           URL beats a blank value. */
        const mineAt = +kept.mediaAt || 0;
        const theirAt = +e.mediaAt || 0;
        const mineMedia = !!(kept.photo || kept.video);
        const theirMedia = !!(e.photo || e.video);
        const differs = String(kept.photo || '') !== String(e.photo || '')
          || String(kept.video || '') !== String(e.video || '');
        note(mergeRecord(kept, e, PRODUCT_FIELDS, REVIEWED_FIELDS.products));
        if (theirAt > mineAt || (!mineAt && !theirAt && !mineMedia && theirMedia)) {
          kept.photo = String(e.photo || '');
          kept.video = String(e.video || '');
          if (theirAt) kept.mediaAt = theirAt;
          ahead.theirs = true;
        } else if (differs && (mineAt > theirAt || mineMedia)) {
          ahead.mine = true;
        }
        return;
      }
      if (k !== 'variants') return;
      note(mergeRecord(kept, e, VARIANT_FIELDS, REVIEWED_FIELDS.variants));

      /* Barcode additions are a union. Timestamped removals cross devices and
         beat older additions, so scanning a label on one till cannot be undone
         by a stale copy from another. */
      const removed = Object.assign({}, kept.barcodeRemoved || {});
      Object.keys(e.barcodeRemoved || {}).forEach((code) => {
        removed[code] = Math.max(+removed[code] || 0, +e.barcodeRemoved[code] || 0);
      });
      const codes = Object.create(null);
      ;(kept.barcodes || []).concat(e.barcodes || []).forEach((b) => {
        if (!b || !b.code) return;
        const prior = codes[b.code];
        if (!prior || (+b.at || 0) > (+prior.at || 0)) codes[b.code] = Object.assign({}, b);
      });
      const mergedCodes = Object.keys(codes).map((code) => codes[code])
        .filter((b) => (+removed[b.code] || 0) < (+b.at || 0) || (!(+removed[b.code] || 0) && !b.at));
      if (JSON.stringify(mergedCodes) !== JSON.stringify(kept.barcodes || [])) ahead.theirs = true;
      kept.barcodes = mergedCodes;
      kept.barcodeRemoved = removed;

      if (baseAtOf(e) > baseAtOf(kept)) {
        kept.base = baseOf(e);
        kept.baseAt = baseAtOf(e);
        ahead.theirs = true;
      } else if (baseAtOf(kept) > baseAtOf(e)) { ahead.mine = true; }
    };
    /* Deux passes, pour que la seconde puisse RETROUVER l'enregistrement gardé
       et non seulement savoir qu'il existe. */
    ((mine && mine[k]) || []).forEach((e) => {
      if (!e || !e.id || gone[e.id] || seen[e.id]) return;
      seen[e.id] = e;
      list.push(e);
      if (!theirIds[e.id]) ahead.mine = true;   // créé ici, inconnu là-bas
    });
    ((theirs && theirs[k]) || []).forEach(take);
    out[k] = list;
  });

  /* ── LES MOUVEMENTS : UNE UNION, PAS UN ARBITRAGE ────────────────────────
     C'est ici que deux ventes simultanées s'additionnent enfin. Chaque
     mouvement porte un id unique par appareil ; réunir les deux journaux par
     id garde donc les deux ventes, et recevoir deux fois le même mouvement ne
     le compte qu'une fois. Rien à départager : un événement qui a eu lieu a
     eu lieu. */
  const byMove = Object.create(null);
  const theirMove = Object.create(null);
  ((theirs && theirs.moves) || []).forEach((m) => { if (m && m.id) theirMove[m.id] = m; });
  ((mine && mine.moves) || []).forEach((m) => {
    if (!m || !m.id) return;
    byMove[m.id] = m;
    if (!theirMove[m.id]) ahead.mine = true;   // une vente d'ici qu'ils ignorent
  });
  Object.keys(theirMove).forEach((id) => {
    if (!byMove[id]) { byMove[id] = theirMove[id]; ahead.theirs = true; }
    else if (byMove[id].why === 'reserve' && theirMove[id].why === 'vente') {
      byMove[id] = theirMove[id]; ahead.theirs = true;
    }
  });
  out.moves = Object.keys(byMove).map((id) => byMove[id])
    .filter((m) => !gone[m.vid]);   // les mouvements d'un article supprimé s'en vont avec lui

  // Une déclinaison dont le produit a été supprimé des deux côtés n'a plus de
  // parent : elle deviendrait un article fantôme, invendable et invisible.
  const alive = Object.create(null);
  out.products.forEach((p) => { alive[p.id] = 1; });
  out.variants = out.variants.filter((v) => alive[v.productId]);

  /* Replier le vieux, puis recalculer : le stock affiché est TOUJOURS le socle
     plus les mouvements postérieurs, jamais un nombre qu'on se serait
     transmis. C'est ce qui rend la fusion reproductible — deux appareils
     partis des mêmes deux journaux arrivent au même stock. */
  compactForWrite(out);
  for (const v of out.variants) {
    if (v.base == null) { v.base = baseOf(v); v.baseAt = baseAtOf(v); }
  }
  materialize(out);
  return { doc: out, ahead };
}
