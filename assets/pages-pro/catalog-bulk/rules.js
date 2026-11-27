/* Kiwi · catalogue bulk rules (globalThis.KiwiBulkRules)
 *
 * The arithmetic and the validation behind the catalogue spreadsheet, the bulk
 * re-price and the Excel import. Pure: no DOM, no store, no network. One copy,
 * read by three readers:
 *   · the dashboard grid (assets/pages-pro/catalog-bulk/*.js, lazy loaded);
 *   · the batch route, functions/api/catalog/batch.js, which imports this file
 *     for its side effect and validates every patch again with the SAME rules;
 *   · tools/catalog-bulk-test.mjs.
 *
 * Money is handled in integer centimes inside every computation and handed
 * back as MAD with two decimals, the unit the catalogue documents store
 * (`priceMAD`, `price`). A float never decides a rounding.
 *
 * Field names are the grid's canonical ones. Where they land in storage:
 *   boutique  name, sku, barcode (single-variant primary code), price → priceMAD,
 *             cost, lowStock → reorderLevel, category → categoryId,
 *             sellable → !archived
 *   menu      name, price, category → catId, sellable → avail
 */
(function (root) {
  'use strict';

  /* Field limits, the same as the server sanitizers (functions/api/catalog.js,
     functions/api/menu.js): a value the server would cut is refused here. */
  const LIMITS = Object.freeze({ name: 120, sku: 48, barcode: 40, price: 1e7, cost: 1e7, lowStock: 1e6 });
  const FIELDS = Object.freeze({
    boutique: ['name', 'sku', 'barcode', 'price', 'cost', 'lowStock', 'category', 'sellable'],
    menu: ['name', 'price', 'category', 'sellable'],
  });
  const NUMERIC = { price: 1, cost: 1, lowStock: 1 };
  const MAX_ROWS = 5000;

  const cents = (n) => Math.round(Number(n) * 100);
  const fromCents = (c) => Math.round(c) / 100;
  /* True when n holds no more than two decimals (spreadsheet float noise such
     as 19.990000000000002 still counts as two). */
  const centsExact = (n) => Math.abs(Number(n) * 100 - Math.round(Number(n) * 100)) < 1e-6;

  /* A number as people type it in Morocco: "1 234,50", "1.234,50", "12.5",
     "89 MAD", "٨٩". '' and null mean "empty" (null); anything else that does
     not read as a number is NaN. */
  function parseNumber(v) {
    if (v == null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    let t = String(v).trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
      .replace(/\s*(mad|dh|dhs|درهم)\.?$/i, '').replace(/[\s  ']/g, '');
    if (t === '') return null;
    if (t.indexOf(',') !== -1 && t.indexOf('.') !== -1) {
      // The later separator is the decimal one: "1.234,50" or "1,234.50".
      t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (t.indexOf(',') !== -1) {
      /* One comma is the French decimal ("12,5"); several in groups of three
         are thousands ("1,234,567"). */
      t = /^-?\d{1,3}(,\d{3}){2,}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    }
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Number(t);
  }

  /* Yes / no in the three languages and the forms spreadsheets write. */
  function parseBool(v) {
    if (typeof v === 'boolean') return v;
    if (v == null) return null;
    const t = String(v).trim().toLowerCase();
    if (t === '') return null;
    if (['1', 'oui', 'o', 'yes', 'y', 'true', 'vrai', 'x', 'نعم', 'اه', 'إيه', 'ايه', 'on'].includes(t)) return true;
    if (['0', 'non', 'n', 'no', 'false', 'faux', 'لا', 'off', '-'].includes(t)) return false;
    return undefined;
  }

  /* Round a MAD amount to a step (0.5, 1, 5 …) up, down or to the nearest.
     A step of 0 keeps the centime. Half goes up, as a shelf price does. */
  function roundTo(value, step, mode) {
    const c = cents(value);
    const s = Math.max(0, Math.round(Number(step || 0) * 100));
    if (!s) return fromCents(c);
    let q;
    if (mode === 'up') q = Math.ceil(c / s);
    else if (mode === 'down') q = Math.floor(c / s);
    else q = Math.floor((c + s / 2) / s);
    return fromCents(q * s);
  }

  /* Shelf price endings: ,90 and ,99 on the dirham, or a price ending in 9
     (19, 29 … 129). Chosen up, down or to the nearest like a step. */
  const ENDINGS = { '90': { unit: 100, off: 90 }, '99': { unit: 100, off: 99 }, '9': { unit: 1000, off: 900 } };
  function endTo(value, ending, mode) {
    const e = ENDINGS[ending];
    if (!e) return fromCents(cents(value));
    const c = cents(value);
    let q = mode === 'up' ? Math.ceil((c - e.off) / e.unit) : mode === 'down' ? Math.floor((c - e.off) / e.unit) : Math.floor((c - e.off + e.unit / 2) / e.unit);
    if (q < 0) q = 0;
    return fromCents(q * e.unit + e.off);
  }
  const shape = (value, rule, mode) => (rule && ENDINGS[rule.ending] ? endTo(value, rule.ending, mode) : roundTo(value, rule && rule.step, mode));

  /* Below this margin a row is flagged in the preview, as the grid colours it. */
  const LOW_MARGIN = 15;

  /* One item through a re-price rule.
     rule = { basis: 'price'|'cost', op: 'pct'|'amt'|'set', value, step, mode,
              ending: ''|'90'|'99'|'9', minMargin: percent | 0 }
     Rounding never works against the operation: an increase never rounds to
     below the old price, a decrease never above it. « Au plus proche » that
     would cross back picks the step on the requested side; an explicit up or
     down that would cross back skips the row ('against'). An ending coarser
     than the price itself (« finir par 9 » on a 4 MAD water) falls back to
     ,90, or skips the row ('too-small') under 1 MAD. A row whose real change
     is more than twice the one asked is flagged 'over-rounded', and the
     dialog asks about it before saving.
     With a minimum margin, a price that would fall under it is lifted to the
     lowest price that keeps it (rounded up), and the row says so. Without one,
     a price at or under cost, or under LOW_MARGIN, is flagged, never hidden. */
  function repriceOne(item, rule) {
    const old = Number(item && item.price) || 0;
    const cost = Number(item && item.cost) || 0;
    const op = rule && rule.op;
    const v = Number(rule && rule.value);
    if (!Number.isFinite(v)) return { old, next: old, skip: 'bad-value' };
    let raw;
    if (op === 'set') raw = cents(v);
    else {
      const base = rule.basis === 'cost' ? cost : old;
      if (!(base > 0)) return { old, next: old, skip: 'no-basis' };
      const b = cents(base);
      raw = op === 'amt' ? b + cents(v) : Math.round(b * (100 + v) / 100);
    }
    if (!(raw > 0)) return { old, next: old, skip: 'zero' };
    /* « Fixer à 12 MAD » means 12,00: no ending, no shelf step on a typed price. */
    const fixed = op === 'set';
    let ending = !fixed && ENDINGS[rule && rule.ending] ? rule.ending : '';
    if (ending && raw < ENDINGS[ending].unit) {
      ending = raw >= ENDINGS['90'].unit ? '90' : '';
      if (!ending) return { old, next: old, skip: 'too-small' };
    }
    const r = Object.assign({}, rule, { ending }, fixed ? { step: 0 } : {});
    const oc = cents(old);
    const dir = Math.sign(raw - oc);
    const mode = (rule && rule.mode) || 'nearest';
    let next = shape(fromCents(raw), r, mode);
    if (dir && Math.sign(cents(next) - oc) === -dir) {
      if (mode !== 'nearest') return { old, next: old, skip: 'against' };
      next = shape(fromCents(raw), r, dir > 0 ? 'up' : 'down');
    }
    let lifted = false;
    const mm = Number(rule && rule.minMargin) || 0;
    if (mm > 0 && mm < 100 && cost > 0) {
      const floor = fromCents(Math.ceil(cents(cost) * 100 / (100 - mm)));
      if (cents(next) < cents(floor)) { next = shape(floor, r, 'up'); lifted = true; }
    }
    if (!(next > 0)) return { old, next: old, skip: 'zero' };
    if (next > LIMITS.price) return { old, next: old, skip: 'too-high' };
    if (cents(next) === oc) return { old, next, skip: 'same' };
    const asked = raw - oc, got = cents(next) - oc;
    const over = !lifted && asked !== 0 && Math.abs(got) > 2 * Math.abs(asked);
    const m = margin(next, cost);
    const flag = cost > 0 && cents(next) <= cents(cost) ? 'below-cost' : over ? 'over-rounded' : m != null && m < LOW_MARGIN ? 'low-margin' : '';
    return { old, next, margin: m, flag, lifted, requested: fromCents(asked), rounded: cents(next) !== raw };
  }

  function reprice(items, rule) {
    const rows = [];
    const skipped = { 'no-basis': 0, zero: 0, same: 0, 'too-high': 0, 'bad-value': 0, against: 0, 'too-small': 0 };
    const flagged = { 'below-cost': 0, 'over-rounded': 0, 'low-margin': 0, lifted: 0 };
    (items || []).forEach((it) => {
      const r = repriceOne(it, rule);
      if (r.skip) { skipped[r.skip] = (skipped[r.skip] || 0) + 1; return; }
      if (r.flag) flagged[r.flag]++;
      if (r.lifted) flagged.lifted++;
      rows.push({ id: it.id, name: it.name, old: r.old, next: r.next, delta: fromCents(cents(r.next) - cents(r.old)), cost: Number(it.cost) || 0,
        margin: r.margin, flag: r.flag, lifted: r.lifted, requested: r.requested, rounded: r.rounded });
    });
    return { rows, skipped, flagged };
  }

  /* Changes worth a second look before they are saved: a price moved by 90 %
     or more (a typo such as 1,234 for 1 234 is the usual cause), and a price
     at or under its cost. [{ id, code: 'big-change'|'below-cost', old, next, cost }] */
  function riskyChanges(patches, rows) {
    const byId = new Map((rows || []).map((r) => [r.id, r]));
    const out = [];
    (patches || []).forEach((p) => {
      const r = byId.get(p.id) || {};
      const set = p.set || {};
      if (!('price' in set) && !('cost' in set)) return;
      const old = Number(r.price) || 0;
      const next = parseNumber('price' in set ? set.price : r.price);
      const cost = parseNumber('cost' in set ? set.cost : r.cost);
      if (!(typeof next === 'number' && Number.isFinite(next))) return;
      if ('price' in set && old > 0 && Math.abs(next - old) / old >= 0.9) out.push({ id: p.id, code: 'big-change', old, next, cost: cost || 0 });
      else if (cost > 0 && cents(next) <= cents(cost)) out.push({ id: p.id, code: 'below-cost', old, next, cost });
    });
    return out;
  }

  /* The re-price warnings a merchant sent back with « Revoir les prix »
     (held: id → warning) still apply to a plain save, for every cell that
     still holds the price the rounding gave it. A cell typed over since is
     judged like any other edit, and one riskyChanges already names is not
     named twice. */
  function heldRisky(patches, rows, held) {
    if (!held || !held.size) return [];
    const seen = new Set(riskyChanges(patches, rows).map((x) => x.id));
    return (patches || []).filter((p) => {
      const x = held.get(p.id);
      if (!x || seen.has(p.id) || !p.set || !('price' in p.set)) return false;
      const v = parseNumber(p.set.price);
      return typeof v === 'number' && Number.isFinite(v) && cents(v) === cents(x.next);
    }).map((p) => held.get(p.id));
  }

  /* Gross margin on the selling price, in percent, one decimal. */
  function margin(price, cost) {
    const p = Number(price), c = Number(cost);
    if (!(p > 0) || !Number.isFinite(c) || c <= 0) return null;
    return Math.round((p - c) / p * 1000) / 10;
  }

  /* Two cell values are the same if they would store the same thing. */
  function sameValue(field, a, b) {
    if (NUMERIC[field]) {
      const x = parseNumber(a), y = parseNumber(b);
      if (x == null || y == null) return x == null && y == null;
      if (Number.isNaN(x) || Number.isNaN(y)) return String(a).trim() === String(b).trim();
      return cents(x) === cents(y);
    }
    if (field === 'sellable') return !!a === !!b;
    return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
  }

  /* Changed rows only: [{ id, set: {field: new}, was: {field: old} }]. */
  function diff(originals, edits, fields) {
    const out = [];
    const byId = new Map((originals || []).map((r) => [r.id, r]));
    Object.keys(edits || {}).forEach((id) => {
      const o = byId.get(id);
      if (!o) return;
      const e = edits[id] || {};
      const set = {}, was = {};
      (fields || Object.keys(e)).forEach((f) => {
        if (!(f in e)) return;
        if (!sameValue(f, o[f], e[f])) { set[f] = e[f]; was[f] = o[f] == null ? null : o[f]; }
      });
      if (Object.keys(set).length) out.push({ id, set, was });
    });
    return out;
  }

  /* One value checked for one field. ctx = { categories: Set(ids) | null }.
     Returns { value } normalised for storage, or { error }. */
  function checkValue(kind, field, raw, ctx) {
    if (!FIELDS[kind] || FIELDS[kind].indexOf(field) === -1) return { error: 'unknown-field' };
    if (field === 'name') {
      const s = String(raw == null ? '' : raw).trim();
      if (!s) return { error: 'required' };
      if (s.length > LIMITS.name) return { error: 'too-long' };
      return { value: s };
    }
    if (field === 'sku' || field === 'barcode') {
      const s = String(raw == null ? '' : raw).trim();
      if (s.length > LIMITS[field]) return { error: 'too-long' };
      if (field === 'barcode' && /\s/.test(s)) return { error: 'bad-barcode' };
      /* « 6,11123E+12 » : Excel a arrondi le code en notation scientifique. */
      if (field === 'barcode' && /^\d+(?:[.,]\d+)?e\+?\d+$/i.test(s)) return { error: 'excel-barcode' };
      return { value: s };
    }
    if (field === 'price' || field === 'cost') {
      const n = parseNumber(raw);
      if (n == null) return field === 'price' ? { error: 'required' } : { value: 0 };
      if (Number.isNaN(n)) return { error: 'not-a-number' };
      if (n < 0) return { error: 'negative' };
      if (n > LIMITS[field]) return { error: 'too-high' };
      /* Never rounded in silence: « 1,234 » typed for 1 234 MAD used to be
         stored as 1,23. A third decimal is refused, and the cell says why. */
      if (!centsExact(n)) return { error: 'too-many-decimals' };
      return { value: fromCents(cents(n)) };
    }
    if (field === 'lowStock') {
      const n = parseNumber(raw);
      if (n == null) return { value: 0 };
      if (Number.isNaN(n)) return { error: 'not-a-number' };
      if (n < 0) return { error: 'negative' };
      if (!Number.isInteger(n)) return { error: 'not-whole' };
      if (n > LIMITS.lowStock) return { error: 'too-high' };
      return { value: n };
    }
    if (field === 'category') {
      const s = String(raw == null ? '' : raw).trim();
      if (!s) return { value: null };
      if (ctx && ctx.categories && !ctx.categories.has(s)) return { error: 'unknown-category' };
      return { value: s };
    }
    if (field === 'sellable') {
      const b = parseBool(raw);
      if (b === undefined || b === null) return { error: 'yes-no' };
      return { value: b };
    }
    return { error: 'unknown-field' };
  }

  /* Excel / Google Sheets put a block of cells on the clipboard as TSV: tabs
     between cells, CRLF between rows, and a cell holding a tab, a newline or a
     quote wrapped in double quotes. */
  function parseDelimited(text, delim) {
    const rows = []; let row = [], cell = '', q = false;
    const s = String(text == null ? '' : text);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function parseTsv(text) {
    const rows = parseDelimited(String(text || '').replace(/^\uFEFF/, ''), '\t');
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
    return rows;
  }
  function toTsv(rows) {
    return (rows || []).map((r) => r.map((c) => {
      const s = String(c == null ? '' : c);
      return /[\t\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join('\t')).join('\r\n');
  }
  function parseCsv(text) {
    const t = String(text || '').replace(/^\uFEFF/, '');
    let best = null;
    [',', ';', '\t'].forEach((d) => {
      const rows = parseDelimited(t, d).filter((r) => r.some((c) => String(c).trim() !== ''));
      if (rows.length && (!best || rows[0].length > best[0].length)) best = rows;
    });
    return best || [];
  }

  /* ── Export safety ──────────────────────────────────────────────────────
   * A text cell that starts with = + - @ (or a tab / return) is run as a
   * formula by Excel and LibreOffice when a CSV is opened: an article named
   * « =HYPERLINK(…) » would become a live link in the owner's spreadsheet.
   * Such a cell leaves with a leading apostrophe, which spreadsheets show as
   * text, and the importer takes the apostrophe off again (restoreCell).
   * Plain numbers, negative ones included, are left alone. */
  const FORMULA = /^[=+\-@\t\r]/;
  const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)?$/;
  function safeCell(v) {
    if (v == null) return '';
    if (typeof v !== 'string') return String(v);
    return FORMULA.test(v) && !PLAIN_NUMBER.test(v.trim()) ? "'" + v : v;
  }
  function restoreCell(v) {
    return typeof v === 'string' && /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v;
  }
  /* The same, over a CSV someone else wrote (the boutique's own export): read
     with its own delimiter, neutralised, written back with that delimiter. */
  function safeCsv(text) {
    const t = String(text || '').replace(/^\uFEFF/, '');
    let d = ',', width = -1;
    [',', ';', '\t'].forEach((x) => { const r = parseDelimited(t, x)[0] || []; if (r.length > width) { width = r.length; d = x; } });
    const quote = (c) => (c.indexOf(d) !== -1 || /["\r\n]/.test(c) || c !== c.trim() ? '"' + c.replace(/"/g, '""') + '"' : c);
    return parseDelimited(t, d).map((r) => r.map((c) => quote(safeCell(c))).join(d)).join('\r\n');
  }

  /* ── Import ─────────────────────────────────────────────────────────────
   * Header matching: accents, case and punctuation out, then aliases in the
   * three languages and the words old tills print. */
  function normKey(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9؀-ۿ]+/g, '_').replace(/^_+|_+$/g, '');
  }
  const ALIASES = {
    id: ['id_kiwi', 'kiwi_id', 'id', 'identifiant', 'المعرف'],
    name: ['nom', 'name', 'produit', 'article', 'designation', 'libelle', 'item', 'plat', 'الاسم', 'المنتج'],
    sku: ['sku', 'reference', 'ref', 'reference_commune', 'المرجع'],
    barcode: ['code_barres', 'codebarres', 'code_barre', 'barcode', 'ean', 'ean13', 'gencod', 'الباركود', 'رمز_الباركود'],
    price: ['prix_de_vente', 'prix_vente', 'prix', 'price', 'selling_price', 'pv', 'prix_mad', 'prix_ttc', 'tarif', 'ثمن_البيع', 'الثمن'],
    cost: ['prix_d_achat', 'prix_achat', 'cout', 'cost', 'purchase_cost', 'purchase_price', 'pa', 'ثمن_الشراء'],
    lowStock: ['alerte_stock_bas', 'alerte_stock', 'seuil', 'low_stock_alert', 'low_stock', 'reorder_level', 'تنبيه_المخزون', 'تنبيه_نقص_المخزون'],
    category: ['categorie', 'category', 'rayon', 'famille', 'الفئة', 'الصنف'],
    sellable: ['en_vente', 'en_vente_oui_non', 'disponible', 'sellable', 'for_sale', 'available', 'available_for_sale', 'معروض_للبيع', 'للبيع'],
  };
  /* Three passes, so a real export's header still lands (27 nov. 2026):
     the exact name, then the name without its unit (« Prix (DH) », « Prix
     TTC (MAD) »), then a known name followed by more words (« Désignation
     article », « Prix de vente unitaire »), the longest known name winning.
     A purchase, promo or HT column is never read as the selling price. */
  const UNIT_TAIL = /_(mad|dh|dhs|dirhams?|ttc|eur|unitaire|u)$/;
  const stripUnit = (k) => { let prev; do { prev = k; k = k.replace(UNIT_TAIL, ''); } while (k !== prev && k); return k; };
  const NOT_PRICE = /achat|revient|fournisseur|promo|solde|remise|barre|ancien|cout|(^|_)ht$/;
  function mapHeader(header, kind) {
    const keys = (header || []).map(normKey);
    const idx = {};
    const fields = ['id'].concat(FIELDS[kind] || []);
    const taken = (i) => Object.values(idx).indexOf(i) !== -1;
    const allowed = (f, k) => !(f === 'price' && NOT_PRICE.test(k));
    fields.forEach((f) => {
      for (let i = 0; i < keys.length; i++) if (idx[f] == null && !taken(i) && allowed(f, keys[i]) && ALIASES[f].indexOf(keys[i]) !== -1) idx[f] = i;
    });
    fields.forEach((f) => {
      for (let i = 0; i < keys.length; i++) if (idx[f] == null && !taken(i) && allowed(f, keys[i]) && ALIASES[f].indexOf(stripUnit(keys[i])) !== -1) idx[f] = i;
    });
    fields.forEach((f) => {
      if (f === 'id' || idx[f] != null) return;
      let best = -1, bestLen = 0;
      for (let i = 0; i < keys.length; i++) {
        if (taken(i) || !allowed(f, keys[i])) continue;
        ALIASES[f].forEach((a) => { if (a.length >= 3 && a.length > bestLen && keys[i].indexOf(a + '_') === 0) { best = i; bestLen = a.length; } });
      }
      if (best !== -1) idx[f] = best;
    });
    return idx;
  }
  /* The header is the first of the ten top rows that names a product column:
     a shop's export often opens with a title line or a blank row. */
  function headerRow(table, kind) {
    for (let h = 0; h < Math.min(10, table.length); h++) if (mapHeader(table[h], kind).name != null) return h;
    return 0;
  }

  /* Rows of an import sheet → records, every cell validated.
     ctx = { kind, categories: [{id, name}], existing: [{id, name, sku, barcode, …}] }
     Returns { rows: [{ line, values, errors: {field: code}, match, status }], counts } */
  function analyseImport(table, ctx) {
    const kind = ctx.kind;
    const fields = FIELDS[kind];
    const h = headerRow(table, kind);
    const header = table[h] || [];
    const idx = mapHeader(header, kind);
    if (idx.name == null) return { error: 'no-name-column', header };
    const catByName = new Map((ctx.categories || []).map((c) => [normKey(c.name), c.id]));
    const catIds = new Set((ctx.categories || []).map((c) => c.id));
    const existing = ctx.existing || [];
    const byId = new Map(existing.map((e) => [String(e.id), e]));
    const bySku = new Map(), byCode = new Map(), byName = new Map();
    existing.forEach((e) => {
      if (e.sku) bySku.set(normKey(e.sku), e);
      if (e.barcode) byCode.set(String(e.barcode), e);
      if (!byName.has(normKey(e.name))) byName.set(normKey(e.name), e);
    });
    const rows = [];
    table.slice(h + 1).forEach((r, i) => {
      if (!r || r.every((c) => String(c == null ? '' : c).trim() === '')) return;
      const raw = {};
      fields.forEach((f) => { if (idx[f] != null) raw[f] = r[idx[f]] == null ? '' : String(r[idx[f]]); });
      rows.push({ line: i + h + 2, idRaw: idx.id != null ? String(r[idx.id] == null ? '' : r[idx.id]).trim() : '', raw, present: fields.filter((f) => idx[f] != null) });
    });
    rows.forEach((row) => revalidate(row, ctx, { catByName, catIds, byId, bySku, byCode, byName }));
    checkDuplicates(rows);
    const plan = rows.map((row) => row.status);
    return { rows, columns: fields.filter((f) => idx[f] != null), counts: countStatus(plan), lookup: { catByName, catIds, byId, bySku, byCode, byName } };
  }

  /* One row checked again, e.g. after an in-place fix in the review table. */
  function revalidate(row, ctx, L) {
    const kind = ctx.kind;
    row.errors = {}; row.values = {};
    row.present.forEach((f) => {
      let raw = row.raw[f];
      if (f === 'category') {
        const s = String(raw || '').trim();
        if (s) {
          const id = L.catByName.get(normKey(s)) || (L.catIds.has(s) ? s : null);
          if (!id) { row.errors.category = 'unknown-category'; return; }
          raw = id;
        }
      }
      if (f === 'sellable' && String(raw || '').trim() === '') { row.values.sellable = true; return; }
      if (f === 'cost' && String(raw || '').trim() === '') return;
      if (f === 'barcode' && String(raw || '').trim() === '') return;
      if (f === 'sku' && String(raw || '').trim() === '') return;
      const c = checkValue(kind, f, raw, null);
      if (c.error) row.errors[f] = c.error; else row.values[f] = c.value;
    });
    const match = (row.idRaw && L.byId.get(row.idRaw))
      || (row.values.sku && L.bySku.get(normKey(row.values.sku)))
      || (row.values.barcode && L.byCode.get(String(row.values.barcode)))
      || (row.values.name && L.byName.get(normKey(row.values.name))) || null;
    row.match = match ? match.id : null;
    if (match && row.values.barcode && match.multi) row.errors.barcode = 'multi-variant';
    if (!match && kind === 'boutique' && row.values.barcode) {
      const owner = L.byCode.get(String(row.values.barcode));
      if (owner) row.errors.barcode = 'duplicate';
    }
    if (Object.keys(row.errors).length) row.status = 'error';
    else if (!match) row.status = 'new';
    else {
      const changed = row.present.some((f) => f in row.values && !sameValue(f, match[f], row.values[f]));
      row.status = changed ? 'updated' : 'unchanged';
    }
    return row;
  }

  /* The same SKU or barcode twice in one file, or two lines landing on the
     same article, is refused on every line involved. */
  function checkDuplicates(rows) {
    ['sku', 'barcode'].forEach((f) => {
      const seen = new Map();
      rows.forEach((r) => {
        const v = r.values && r.values[f];
        if (!v) return;
        const k = f === 'sku' ? normKey(v) : String(v);
        if (!seen.has(k)) seen.set(k, []);
        seen.get(k).push(r);
      });
      seen.forEach((list) => { if (list.length > 1) list.forEach((r) => { r.errors[f] = 'duplicate'; r.status = 'error'; }); });
    });
    const target = new Map();
    rows.forEach((r) => { if (r.match) { if (!target.has(r.match)) target.set(r.match, []); target.get(r.match).push(r); } });
    target.forEach((list) => { if (list.length > 1) list.forEach((r) => { r.errors.name = 'duplicate'; r.status = 'error'; }); });
  }
  function countStatus(list) {
    const c = { new: 0, updated: 0, unchanged: 0, error: 0 };
    list.forEach((s) => { c[s] = (c[s] || 0) + 1; });
    return c;
  }

  const api = {
    LIMITS, FIELDS, MAX_ROWS,
    parseNumber, parseBool, roundTo, endTo, ENDINGS, LOW_MARGIN, centsExact, repriceOne, reprice, riskyChanges, heldRisky, margin, sameValue, diff, checkValue,
    parseTsv, toTsv, parseCsv, safeCell, restoreCell, safeCsv, normKey, mapHeader, analyseImport, revalidate, checkDuplicates, countStatus,
  };
  root.KiwiBulkRules = api;
})(/** @type {any} */ (globalThis));
