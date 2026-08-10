/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CATALOG IMPORT — window.KiwiCatalogImport
 * ---------------------------------------------------------------------------
 * The path OUT of a merchant's old till and INTO Kiwi. Until this file existed
 * there was none: exportCsv could get data out, nothing could bring data in,
 * and a shop switching to Kiwi retyped every article by hand. That is the
 * longest step of an onboarding and the one most likely to lose the client —
 * a boutique with 300 références will not sit and type for two days.
 *
 * Two catalogues, one parser:
 *   · BOUTIQUE (KiwiBoutiqueCatalog) — produit × couleur × taille, code-barres
 *   · CARTE    (KiwiMenuStore)       — article × catégorie × sous-catégorie
 *
 * Round-trip by design: the boutique columns are exactly the ones exportCsv
 * writes, so "exporter → corriger dans Excel → réimporter" is a supported loop,
 * and re-importing an untouched export changes nothing (every product, variant
 * and code-barres already resolves to itself).
 *
 * NOTHING is written before the merchant confirms. parse() → analyse() builds a
 * plan and counts every create / update / skip without touching the catalogue;
 * the modal shows that plan; only apply() writes. A merchant who mis-clicks
 * sees a summary, not a wrecked inventory.
 *
 * Depends on: KiwiBoutiqueCatalog (boutique) · KiwiMenuStore (carte) · Kiwi.modal
 * for the UI, with a fail-soft path if interactive.js has not loaded.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────── small helpers ───────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function toast(msg, opts) {
    try { if (window.Kiwi && Kiwi.toast) Kiwi.toast(msg, opts); } catch (_) {}
  }
  /* Normalise a header cell or a name for MATCHING only — never for display.
     Accents out, case out, punctuation to underscore: "Prix (MAD)" → prix_mad,
     "Code-barres" → code_barres, "Couleur " → couleur. */
  function normKey(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  const keyName = (s) => normKey(s);

  /* A number as a French spreadsheet writes it: "1 234,50" · "1.234,50" · "89".
     Excel FR uses the comma as the decimal separator and a non-breaking space
     as the thousands separator, so a naive parseFloat("1 234,50") returns 1. */
  function num(s) {
    if (s == null) return NaN;
    let t = String(s).replace(/[\s  ]/g, '').replace(/[^\d,.\-]/g, '');
    if (!t) return NaN;
    // If both separators appear, the LAST one is the decimal mark.
    const lastComma = t.lastIndexOf(',');
    const lastDot = t.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      const dec = Math.max(lastComma, lastDot);
      t = t.slice(0, dec).replace(/[,.]/g, '') + '.' + t.slice(dec + 1);
    } else if (lastComma > -1) {
      // A single comma: decimal mark ("12,50") unless it groups ("1,234" → 1234).
      t = /,\d{3}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    }
    const n = parseFloat(t);
    return isFinite(n) ? n : NaN;
  }
  const intOr = (s, d) => { const n = num(s); return isFinite(n) ? Math.max(0, Math.round(n)) : d; };

  /* Prices go BACK to the merchant in the format they typed them in: 340,50 —
     not the 340.5 a raw JS number stringifies to. Whole dirhams stay whole. */
  function mad(n) {
    if (!isFinite(n)) return '—';
    const dec = Math.round(n * 100) % 100 === 0 ? 0 : 2;
    return n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' MAD';
  }

  /* oui / non as every till and spreadsheet writes it. */
  function bool(s, dflt) {
    const t = normKey(s);
    if (!t) return dflt;
    if (['oui', 'o', 'yes', 'y', '1', 'true', 'vrai', 'dispo', 'disponible', 'actif', 'x'].includes(t)) return true;
    if (['non', 'n', 'no', '0', 'false', 'faux', 'indispo', 'indisponible', 'inactif', 'rupture'].includes(t)) return false;
    return dflt;
  }

  /* ───────────────── decoding ─────────────────────────────────────────────
   * Excel on a French Windows still writes CSV in windows-1252 by default, not
   * UTF-8: "Djellaba brodée" arrives as bytes UTF-8 cannot decode. Decoding it
   * as UTF-8 anyway yields "brod?e" or throws. So: try UTF-8 strictly, and on
   * failure fall back to windows-1252 rather than importing mojibake into a
   * merchant's product names — those names get printed on labels and receipts. */
  function decodeBytes(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (_) {}
    try { return new TextDecoder('windows-1252').decode(buf); }
    catch (_) {}
    try { return new TextDecoder().decode(buf); } catch (_) { return ''; }
  }

  /* ───────────────── CSV parsing ──────────────────────────────────────────
   * RFC 4180 shape: quoted fields, "" as an escaped quote, newlines inside
   * quotes, CRLF or LF. The delimiter is SNIFFED rather than assumed — Excel FR
   * writes semicolons, Excel EN and every export in this repo write commas, and
   * a tab-separated paste is common too. We parse with each candidate and keep
   * the one that yields the widest header row, which is the shape a real file
   * has under exactly one of them. */
  function parseWith(text, delim) {
    const rows = []; let row = []; let field = ''; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
        continue;
      }
      if (c === '"') { quoted = true; continue; }
      if (c === delim) { row.push(field); field = ''; continue; }
      if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; continue; }
      if (c === '\r') continue;
      field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function parse(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // Excel's UTF-8 BOM
    if (!text.trim()) return { ok: false, error: 'vide' };

    let best = null;
    [',', ';', '\t'].forEach((d) => {
      const rows = parseWith(text, d)
        .map((r) => r.map((c) => String(c).trim()))
        .filter((r) => r.some((c) => c !== ''));
      if (!rows.length) return;
      if (!best || rows[0].length > best.rows[0].length) best = { rows, delim: d };
    });
    if (!best) return { ok: false, error: 'vide' };
    if (best.rows.length < 2) return { ok: false, error: 'une-seule-ligne' };

    return {
      ok: true,
      delimiter: best.delim,
      headerRaw: best.rows[0],
      header: best.rows[0].map(normKey),
      rows: best.rows.slice(1),
    };
  }

  /* ───────────────── column mapping ───────────────────────────────────────
   * Real files never use our exact header names. Each canonical column carries
   * the aliases a Moroccan merchant's export actually uses — French, English,
   * and the abbreviations old tills print (qte, pv, gencod, designation). */
  const BOUTIQUE_COLS = {
    produit:     ['produit', 'article', 'articles', 'nom', 'name', 'designation', 'libelle', 'product', 'description_article'],
    categorie:   ['categorie', 'category', 'rayon', 'famille', 'collection', 'type_produit'],
    couleur:     ['couleur', 'color', 'coloris', 'couleur_famille'],
    // La nuance telle qu'elle a été SAISIE ou importée à l'origine ("Bleu nuit"),
    // que exportCsv écrit à côté de la famille affichée ("Bleu"). Elle sert à
    // retrouver la variante d'origine à la relecture — voir plus bas.
    couleur_saisie: ['couleur_saisie', 'couleur_origine', 'nuance', 'shade', 'color_source'],
    taille:      ['taille', 'size', 'pointure', 'tailles'],
    /* La correspondance est EXACTE (voir mapColumns), donc chaque orthographe
       doit figurer. « Prix de vente » — sans doute l'en-tête le plus courant
       d'un tableur français — manquait : la colonne n'était pas reconnue et
       tous les articles entraient à 0 MAD.
       « Prix HT » reste volontairement absent : si un fichier ne porte que le
       hors-taxe, mieux vaut un prix vide et visible qu'un prix silencieusement
       20 % trop bas, que personne ne remarque avant la comptabilité. */
    prix_mad:    ['prix_mad', 'prix', 'price', 'pv', 'p_v', 'prix_vente', 'prix_de_vente',
                  'prix_vente_ttc', 'prix_de_vente_ttc', 'prix_ttc', 'prix_unitaire',
                  'prix_unitaire_ttc', 'prix_public', 'prix_detail', 'prix_de_detail',
                  'tarif', 'selling_price', 'sale_price', 'retail_price'],
    /* Le prix d'ACHAT — la colonne d'un tarif fournisseur ou d'un bon de
       livraison. C'est ce qui manquait pour qu'un tel fichier serve vraiment :
       sans coût, stats() valorise le stock au prix de vente et la marge reste
       inconnue. Beaucoup d'orthographes, parce qu'aucun fournisseur n'écrit la
       même — normKey() a déjà ôté les accents avant la comparaison. */
    cout:        ['cout', 'couts', 'prix_achat', 'prix_d_achat', 'cout_achat', 'cout_unitaire',
                  'cost', 'cost_price', 'pa', 'p_a', 'prix_fournisseur', 'tarif_achat', 'achat',
                  'prix_revient', 'prix_de_revient', 'revient', 'buy_price', 'purchase_price'],
    stock:       ['stock', 'quantite', 'qte', 'qty', 'quantity', 'stock_actuel', 'dispo'],
    code_barres: ['code_barres', 'codebarres', 'code_barre', 'barcode', 'ean', 'ean13', 'gencod', 'gencode', 'code', 'upc', 'sku'],
    type:        ['type', 'type_code', 'type_code_barres'],
  };
  const MENU_COLS = {
    article:         ['article', 'produit', 'nom', 'name', 'plat', 'designation', 'libelle', 'item'],
    categorie:       ['categorie', 'category', 'famille', 'section', 'carte', 'menu'],
    sous_categorie:  ['sous_categorie', 'souscategorie', 'sous_famille', 'subcategory', 'sub_category', 'sous_section', 'sous_menu'],
    prix_mad:        ['prix_mad', 'prix', 'price', 'pv', 'prix_vente', 'prix_ttc', 'tarif'],
    description:     ['description', 'desc', 'details', 'detail', 'ingredients', 'composition'],
    disponible:      ['disponible', 'dispo', 'available', 'actif', 'en_vente', 'statut'],
  };

  function mapColumns(header, spec) {
    const idx = {};
    Object.keys(spec).forEach((canon) => {
      for (let i = 0; i < header.length; i++) {
        if (idx[canon] != null) break;
        if (spec[canon].includes(header[i])) idx[canon] = i;
      }
    });
    return idx;
  }
  const cell = (row, i) => (i == null ? '' : String(row[i] == null ? '' : row[i]).trim());

  /* ───────────────── BOUTIQUE: analyse (read-only) ────────────────────────
   * One CSV row describes one (produit, variante, code-barres) triple, exactly
   * as exportCsv writes it — so a product with 2 couleurs × 2 tailles and a code
   * on each occupies 4 lines. Rows are grouped back into products by name. */
  function analyseBoutique(parsed) {
    const CAT = window.KiwiBoutiqueCatalog;
    if (!CAT) return { ok: false, error: 'catalogue-absent' };

    const idx = mapColumns(parsed.header, BOUTIQUE_COLS);
    if (idx.produit == null) {
      return { ok: false, error: 'colonne-produit', headerRaw: parsed.headerRaw };
    }

    const existing = CAT.listProducts({ includeArchived: true });
    const prodByName = new Map(existing.map((p) => [keyName(p.name), p]));
    const catByName = new Map(CAT.listCategories().map((c) => [keyName(c.name), c]));
    const palette = CAT.colors();
    const colorByLabel = new Map(palette.map((c) => [keyName(c.label), c]));

    const issues = [];
    const groups = new Map();     // keyName(produit) → group
    const newCategories = [];
    const seenCodes = new Map();  // code → { line, product }

    parsed.rows.forEach((row, i) => {
      const line = i + 2;         // 1-based, header is line 1
      const name = cell(row, idx.produit);
      if (!name) { issues.push({ line, level: 'skip', msg: 'ligne sans nom d\'article' }); return; }

      const gk = keyName(name);
      let g = groups.get(gk);
      if (!g) {
        g = {
          name, existing: prodByName.get(gk) || null,
          categoryName: '', priceMAD: NaN, cost: NaN, variants: [], lines: [],
        };
        groups.set(gk, g);
      }
      g.lines.push(line);

      /* Product-level fields: first non-empty value wins, so repeating the
         price on every line of a product (what most exports do) is fine, and
         leaving it blank on continuation lines is fine too. */
      const catName = cell(row, idx.categorie);
      if (catName && !g.categoryName) {
        g.categoryName = catName;
        if (!catByName.has(keyName(catName)) && !newCategories.some((n) => keyName(n) === keyName(catName))) {
          newCategories.push(catName);
        }
      }
      const rawPrice = cell(row, idx.prix_mad);
      if (rawPrice && !isFinite(g.priceMAD)) {
        const p = num(rawPrice);
        if (isFinite(p)) g.priceMAD = p;
        else issues.push({ line, level: 'warn', msg: 'prix illisible (« ' + rawPrice + ' ») — ignoré' });
      }
      const rawCost = cell(row, idx.cout);
      if (rawCost && !isFinite(g.cost)) {
        const c = num(rawCost);
        if (isFinite(c)) g.cost = c;
        else issues.push({ line, level: 'warn', msg: 'coût d\'achat illisible (« ' + rawCost + ' ») — ignoré' });
      }

      /* Variant: couleur × taille. A shop with no colours or no sizes still
         works — the variant collapses to a single "TU" line. */
      const colorLabel = cell(row, idx.couleur) || 'Sans couleur';
      const hit = colorByLabel.get(keyName(colorLabel));
      const size = cell(row, idx.taille) || 'TU';

      /* IDENTITY, not appearance. The colour column now carries the general
         FAMILY a merchant reads ("Bleu"), while the variant it came from may be
         stored under a finer id ("nuit", "navy"). Matching on the family alone
         would make a re-imported export create a second Bleu variant beside the
         one it was exported from — the catalogue would double on every
         export → corriger dans Excel → réimporter loop.
         So identity is resolved from the most precise thing the row carries:
           1. its code-barres, which names exactly one variant and cannot be
              confused with another;
           2. failing that, the nuance originally saisie, matched against the
              variants of this product at this size;
         and only then the colour family. Each rule demands an exact prior
         match, so two genuinely different variants are never merged. */
      const rowCode = cell(row, idx.code_barres);
      const rowShade = cell(row, idx.couleur_saisie);
      let colorId = hit ? hit.id : (normKey(colorLabel) || 'sans_couleur');
      const priorVariants = g.existing ? CAT.listVariants(g.existing.id) : [];
      const sameSize = priorVariants.filter((x) => keyName(x.size) === keyName(size));
      let owned = null;
      if (rowCode) {
        const byCode = CAT.findByBarcode(rowCode);
        if (byCode && byCode.product && keyName(byCode.product.name) === gk) owned = byCode.variant;
      }
      if (!owned && rowShade) {
        owned = sameSize.find((x) => keyName(x.colorSource || '') === keyName(rowShade)) || null;
      }
      if (owned) colorId = owned.colorId;
      const rawStock = cell(row, idx.stock);
      const stockGiven = rawStock !== '';
      const stock = stockGiven ? intOr(rawStock, 0) : null;
      if (stockGiven && !isFinite(num(rawStock))) {
        issues.push({ line, level: 'warn', msg: 'stock illisible (« ' + rawStock + ' ») — compté 0' });
      }

      const vk = colorId + '\u0000' + keyName(size);
      let v = g.variants.find((x) => x.key === vk);
      if (!v) {
        v = { key: vk, colorId, colorLabel: hit ? hit.label : colorLabel, size, stock, stockGiven, barcodes: [], line };
        g.variants.push(v);
      } else if (stockGiven && !v.stockGiven) {
        v.stock = stock; v.stockGiven = true;
      }

      /* Code-barres. Conflicts are reported and skipped, never reassigned: a
         code already printed on another article's labels must not silently
         start resolving to this one. */
      const code = rowCode;
      if (code) {
        /* The key must name the PRODUCT as well as the variant: two different
           articles both in "Noir · TU" share a variant key, and comparing on
           that alone made a code repeated across them look like the same
           variant twice — dropped without a word to the merchant. */
        const vkFull = gk + '|' + vk;
        const dupInFile = seenCodes.get(code);
        if (dupInFile && dupInFile.vk !== vkFull) {
          issues.push({ line, level: 'warn', msg: 'code-barres ' + code + ' déjà utilisé ligne ' + dupInFile.line + ' — ignoré ici' });
        } else if (!dupInFile) {
          seenCodes.set(code, { line, vk: vkFull });
          const owner = CAT.findByBarcode(code);
          if (owner) {
            const sameArticle = keyName(owner.product && owner.product.name) === gk
              && owner.variant.colorId === colorId && keyName(owner.variant.size) === keyName(size);
            if (sameArticle) v.barcodes.push({ code, type: cell(row, idx.type), already: true });
            else issues.push({ line, level: 'warn', msg: 'code-barres ' + code + ' appartient déjà à « ' + ((owner.product && owner.product.name) || '?') + ' » — ignoré' });
          } else {
            v.barcodes.push({ code, type: cell(row, idx.type), already: false });
          }
        }
      }
    });

    /* Counts, computed against the real catalogue so the numbers on the
       confirmation screen are the numbers that will actually happen. */
    const products = [...groups.values()];
    let newVariants = 0, updatedVariants = 0, newCodes = 0, missingCodes = 0;
    products.forEach((g) => {
      const have = g.existing ? CAT.listVariants(g.existing.id) : [];
      g.variants.forEach((v) => {
        const found = have.find((x) => x.colorId === v.colorId && keyName(x.size) === keyName(v.size));
        v.isNew = !found;
        if (found) updatedVariants++; else newVariants++;
        v.barcodes.forEach((b) => { if (!b.already) newCodes++; });
        const willHaveCode = v.barcodes.length || (found && found.barcodes && found.barcodes.length);
        if (!willHaveCode) missingCodes++;
      });
      /* Infer the size family so the variant matrix offers the right presets:
         all-numeric 35-48 reads as pointures, a lone TU as an accessory. */
      const sizes = g.variants.map((v) => String(v.size).toUpperCase());
      g.kind = sizes.every((s) => /^\d{2}$/.test(s) && +s >= 35 && +s <= 48) ? 'pointure'
        : (sizes.every((s) => s === 'TU') ? 'tu' : 'taille');
    });

    return {
      ok: true, kind: 'boutique', idx, delimiter: parsed.delimiter,
      headerRaw: parsed.headerRaw, products, newCategories, issues,
      counts: {
        rows: parsed.rows.length,
        newProducts: products.filter((g) => !g.existing).length,
        updatedProducts: products.filter((g) => g.existing).length,
        newVariants, updatedVariants, newCodes, missingCodes,
        newCategories: newCategories.length,
        skipped: issues.filter((x) => x.level === 'skip').length,
      },
    };
  }

  /* ───────────────── BOUTIQUE: apply (writes) ───────────────── */
  function applyBoutique(plan, opts) {
    opts = opts || {};
    const CAT = window.KiwiBoutiqueCatalog;
    const res = { products: 0, variants: 0, codes: 0, generated: 0, failed: [] };
    if (!CAT || !plan || !plan.ok) return res;

    // Categories first, so every product can point at a real one.
    const catId = new Map(CAT.listCategories().map((c) => [keyName(c.name), c.id]));
    plan.newCategories.forEach((name) => {
      try { const c = CAT.addCategory(name); if (c) catId.set(keyName(name), c.id); }
      catch (_) { res.failed.push('catégorie ' + name); }
    });

    plan.products.forEach((g) => {
      try {
        const wantCat = g.categoryName ? catId.get(keyName(g.categoryName)) : null;
        let prod = g.existing;
        if (prod) {
          const patch = {};
          if (isFinite(g.priceMAD) && +prod.priceMAD !== g.priceMAD) patch.priceMAD = g.priceMAD;
          /* Même discipline que le stock : on n'écrit le coût que si le fichier
             en porte un, sinon un tarif sans colonne de coût remettrait à zéro
             celui que la boutique a déjà saisi. */
          if (isFinite(g.cost) && +prod.cost !== g.cost) patch.cost = g.cost;
          if (wantCat && prod.categoryId !== wantCat) patch.categoryId = wantCat;
          if (Object.keys(patch).length) CAT.updateProduct(prod.id, patch);
        } else {
          prod = CAT.addProduct({
            name: g.name,
            categoryId: wantCat || null,
            priceMAD: isFinite(g.priceMAD) ? g.priceMAD : 0,
            cost: isFinite(g.cost) ? g.cost : 0,
            kind: g.kind || 'taille',
          });
          res.products++;
        }
        if (!prod) { res.failed.push(g.name); return; }

        g.variants.forEach((v) => {
          /* addVariant de-dupes on couleur+taille and only touches the stock
             when we pass one — a file with no stock column must never zero the
             stock the merchant has already counted in Kiwi. */
          const data = { productId: prod.id, colorId: v.colorId, colorLabel: v.colorLabel, size: v.size };
          if (v.stockGiven) data.stock = v.stock;
          const variant = CAT.addVariant(data);
          if (!variant) { res.failed.push(g.name + ' · ' + v.colorLabel + ' ' + v.size); return; }
          if (v.isNew) res.variants++;

          v.barcodes.forEach((b) => {
            if (b.already) return;
            const r = CAT.attachBarcode(variant.id, b.code, { type: b.type || 'imported' });
            if (r && r.ok) res.codes++;
          });
          if (opts.generateMissing && !(variant.barcodes && variant.barcodes.length)) {
            if (CAT.generateBarcode(variant.id)) res.generated++;
          }
        });
      } catch (e) { res.failed.push(g.name); }
    });
    return res;
  }

  /* ───────────────── CARTE: analyse + apply ─────────────────
   * The restaurant carte is flatter than a boutique inventory: no variants, no
   * code-barres. Items are keyed by name within a category, so re-importing a
   * corrected file updates prices instead of duplicating the menu. */
  function analyseMenu(parsed) {
    const MS = window.KiwiMenuStore;
    if (!MS) return { ok: false, error: 'carte-absente' };

    const idx = mapColumns(parsed.header, MENU_COLS);
    if (idx.article == null) return { ok: false, error: 'colonne-article', headerRaw: parsed.headerRaw };

    const cats = MS.categories() || [];
    const catByName = new Map(cats.map((c) => [keyName(c.name), c]));
    const items = MS.items() || [];
    const itemKey = (name, catName) => keyName(name) + '\u0000' + keyName(catName);
    const itemIndex = new Map();
    items.forEach((it) => {
      const c = cats.find((x) => x.id === it.catId);
      itemIndex.set(itemKey(it.name, c ? c.name : ''), it);
    });

    const issues = [];
    const rows = [];
    const newCategories = [];
    const newSubs = [];

    parsed.rows.forEach((row, i) => {
      const line = i + 2;
      const name = cell(row, idx.article);
      if (!name) { issues.push({ line, level: 'skip', msg: 'ligne sans nom d\'article' }); return; }

      const catName = cell(row, idx.categorie);
      const subName = cell(row, idx.sous_categorie);
      const rawPrice = cell(row, idx.prix_mad);
      const price = num(rawPrice);
      if (rawPrice && !isFinite(price)) {
        issues.push({ line, level: 'warn', msg: 'prix illisible (« ' + rawPrice + ' ») — compté 0' });
      }
      if (catName && !catByName.has(keyName(catName)) && !newCategories.some((n) => keyName(n) === keyName(catName))) {
        newCategories.push(catName);
      }
      if (catName && subName) {
        const c = catByName.get(keyName(catName));
        const has = c && (c.sub || []).some((s) => keyName(s.name) === keyName(subName));
        const key = keyName(catName) + '\u0000' + keyName(subName);
        if (!has && !newSubs.some((s) => s.key === key)) newSubs.push({ key, catName, subName });
      }

      const existing = itemIndex.get(itemKey(name, catName)) || null;
      rows.push({
        line, name, catName, subName,
        price: isFinite(price) ? Math.max(0, price) : 0,
        priceGiven: !!rawPrice,
        desc: cell(row, idx.description),
        avail: bool(cell(row, idx.disponible), true),
        existing,
      });
    });

    return {
      ok: true, kind: 'menu', idx, delimiter: parsed.delimiter,
      headerRaw: parsed.headerRaw, rows, newCategories, newSubs, issues,
      counts: {
        rows: parsed.rows.length,
        newItems: rows.filter((r) => !r.existing).length,
        updatedItems: rows.filter((r) => r.existing).length,
        newCategories: newCategories.length,
        newSubs: newSubs.length,
        skipped: issues.filter((x) => x.level === 'skip').length,
      },
    };
  }

  function applyMenu(plan) {
    const MS = window.KiwiMenuStore;
    const res = { items: 0, updated: 0, cats: 0, subs: 0, failed: [] };
    if (!MS || !plan || !plan.ok) return res;

    /* addCategory / addSubcategory return the whole store document rather than
       the row they created, so the id is read back by name afterwards. */
    plan.newCategories.forEach((name) => {
      try { MS.addCategory(name); res.cats++; } catch (_) { res.failed.push('catégorie ' + name); }
    });
    const catId = () => new Map((MS.categories() || []).map((c) => [keyName(c.name), c]));

    plan.newSubs.forEach((s) => {
      try {
        const c = catId().get(keyName(s.catName));
        if (c) { MS.addSubcategory(c.id, s.subName); res.subs++; }
      } catch (_) { res.failed.push('sous-catégorie ' + s.subName); }
    });

    const cmap = catId();
    plan.rows.forEach((r) => {
      try {
        const c = r.catName ? cmap.get(keyName(r.catName)) : null;
        const sub = c && r.subName ? (c.sub || []).find((s) => keyName(s.name) === keyName(r.subName)) : null;
        if (r.existing) {
          const patch = {};
          if (r.priceGiven && +r.existing.price !== r.price) patch.price = r.price;
          if (r.desc && r.existing.desc !== r.desc) patch.desc = r.desc;
          if (r.existing.avail !== r.avail) patch.avail = r.avail;
          if (sub && r.existing.subId !== sub.id) patch.subId = sub.id;
          if (Object.keys(patch).length) { MS.updateItem(r.existing.id, patch); res.updated++; }
        } else {
          MS.addItem({
            name: r.name, price: r.price, desc: r.desc, avail: r.avail,
            catId: c ? c.id : null, subId: sub ? sub.id : null,
          });
          res.items++;
        }
      } catch (_) { res.failed.push(r.name); }
    });
    return res;
  }

  /* ───────────────── CSV templates ─────────────────
   * Handing the merchant a file with the right headers and one filled line is
   * faster than any documentation, and it removes the commonest failure: a file
   * whose columns we cannot recognise. */
  const TEMPLATES = {
    boutique: 'produit,categorie,couleur,taille,prix_mad,stock,code_barres,type\n'
      + 'Chemise en lin,Chemises,Ivoire,M,320,4,,\n'
      + 'Chemise en lin,Chemises,Ivoire,L,320,2,,\n'
      + 'Chemise en lin,Chemises,Noir,M,320,6,3210000001234,imported\n'
      + 'Babouches brodées,Chaussures,Camel,42,180,3,,\n',
    menu: 'article,categorie,sous_categorie,prix_mad,description,disponible\n'
      + 'Thé à la menthe,Boissons,Chaudes,12,Gunpowder et menthe fraîche,oui\n'
      + 'Orange pressée,Boissons,Froides,18,Pressée minute,oui\n'
      + 'Msemen miel,Petit-déjeuner,,14,Crêpe feuilletée beurre et miel,oui\n',
  };
  function downloadTemplate(kind) {
    const csv = TEMPLATES[kind] || TEMPLATES.boutique;
    // The BOM makes Excel open a UTF-8 CSV with the accents intact.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modele-import-' + (kind === 'menu' ? 'carte' : 'inventaire') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ───────────────── styles ───────────────── */
  let cssDone = false;
  function ensureCss() {
    if (cssDone) return; cssDone = true;
    const s = document.createElement('style');
    s.id = 'kiwi-catalog-import-css';
    s.textContent = [
      '.kci-drop{border:1.5px dashed var(--n-300,#d7d3ca);border-radius:14px;padding:26px 18px;text-align:center;background:var(--surface,#fff);transition:border-color .18s,background .18s;cursor:pointer;}',
      '.kci-drop:hover,.kci-drop.over{border-color:var(--atlas,#0B6E4F);background:color-mix(in srgb,var(--atlas,#0B6E4F) 4%,transparent);}',
      '.kci-drop h4{margin:0 0 4px;font-size:15px;font-weight:600;color:var(--ink,#0A0F0D);}',
      '.kci-drop p{margin:0;font-size:12.5px;color:var(--n-600,#6f6c65);line-height:1.5;}',
      '.kci-hint{margin:14px 0 0;font-size:12px;color:var(--n-600,#6f6c65);line-height:1.6;}',
      '.kci-hint code{font-family:var(--mono,ui-monospace,monospace);font-size:11.5px;background:var(--n-100,#f2efe9);padding:1px 5px;border-radius:5px;}',
      '.kci-link{background:none;border:0;padding:0;color:var(--atlas,#0B6E4F);font-weight:600;text-decoration:underline;cursor:pointer;font-size:12px;font-family:inherit;}',
      '.kci-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin:0 0 14px;}',
      '.kci-kpi{background:var(--n-100,#f2efe9);border-radius:11px;padding:10px 12px;}',
      '.kci-kpi b{display:block;font-size:20px;font-weight:600;color:var(--ink,#0A0F0D);line-height:1.15;}',
      '.kci-kpi span{font-size:11px;color:var(--n-600,#6f6c65);}',
      '.kci-kpi.new b{color:var(--atlas,#0B6E4F);}',
      '.kci-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}',
      '.kci-tbl th{text-align:left;font-weight:600;color:var(--n-600,#6f6c65);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:0 8px 6px 0;}',
      '.kci-tbl td{padding:5px 8px 5px 0;border-top:1px solid var(--n-200,#e7e3db);color:var(--ink,#0A0F0D);vertical-align:top;}',
      '.kci-tag{display:inline-block;font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:5px;background:var(--n-200,#e7e3db);color:var(--n-700,#544f48);}',
      '.kci-tag.new{background:color-mix(in srgb,var(--atlas,#0B6E4F) 14%,transparent);color:var(--atlas,#0B6E4F);}',
      '.kci-scroll{max-height:210px;overflow:auto;margin:0 0 4px;}',
      '.kci-iss{margin:14px 0 0;padding:11px 13px;border-radius:11px;background:color-mix(in srgb,#B0613F 8%,transparent);font-size:12.5px;color:var(--ink,#0A0F0D);line-height:1.6;}',
      '.kci-iss b{font-weight:600;}',
      '.kci-iss ul{margin:6px 0 0;padding-left:17px;}',
      '.kci-check{display:flex;align-items:flex-start;gap:9px;margin:14px 0 0;font-size:12.5px;color:var(--ink,#0A0F0D);cursor:pointer;line-height:1.5;}',
      '.kci-check input{margin-top:2px;accent-color:var(--atlas,#0B6E4F);}',
      '.kci-where{font-size:11.5px;color:var(--n-600,#6f6c65);margin:0 0 12px;}',
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ───────────────── the modal ───────────────── */
  const LABELS = {
    boutique: {
      tag: 'INVENTAIRE', title: 'Importer un inventaire',
      cols: 'produit, categorie, couleur, taille, prix_mad, stock, code_barres',
      required: 'produit',
    },
    menu: {
      tag: 'CARTE', title: 'Importer une carte',
      cols: 'article, categorie, sous_categorie, prix_mad, description, disponible',
      required: 'article',
    },
  };

  function venueLine() {
    try {
      const v = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (v && v.name) return 'Destination : <b>' + esc(v.name) + '</b>';
    } catch (_) {}
    return '';
  }

  function open(kind, opts) {
    opts = opts || {};
    kind = kind === 'menu' ? 'menu' : 'boutique';
    const L = LABELS[kind];
    ensureCss();

    if (!window.Kiwi || !Kiwi.modal) {
      toast('Import indisponible', { type: 'warn', desc: 'Rechargez la page.' });
      return;
    }

    const m = Kiwi.modal({
      tag: L.tag, title: L.title, width: 620,
      body: '<div data-kci-body></div>',
      foot: '<button class="kb atlas" data-kci-go type="button" disabled style="width:100%;justify-content:center;padding:12px;font-size:15px;opacity:.5;">Choisir un fichier</button>',
    });
    const body = m.el.querySelector('[data-kci-body]');
    const go = m.el.querySelector('[data-kci-go]');
    let plan = null;

    /* ── step 1 · pick a file ── */
    function renderPick(err) {
      const where = venueLine();
      body.innerHTML = [
        where ? '<p class="kci-where">' + where + '</p>' : '',
        '<div class="kci-drop" data-kci-drop tabindex="0" role="button">',
        '  <h4>Déposez votre fichier CSV</h4>',
        '  <p>ou cliquez pour le choisir · colonnes reconnues :<br><code>' + esc(L.cols) + '</code></p>',
        '</div>',
        '<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden data-kci-file />',
        err ? '<div class="kci-iss"><b>' + esc(err) + '</b></div>' : '',
        '<p class="kci-hint">Seule la colonne <code>' + esc(L.required) + '</code> est obligatoire. ',
        'Les noms de colonnes sont reconnus en français comme en anglais (<code>prix</code>, <code>price</code>, <code>qte</code>…), ',
        'le séparateur virgule ou point-virgule, et les accents dans les deux encodages qu\'Excel produit.<br>',
        '<button class="kci-link" data-kci-tpl type="button">Télécharger un modèle CSV</button></p>',
      ].join('');
      go.disabled = true; go.style.opacity = '.5'; go.textContent = 'Choisir un fichier';
    }

    /* ── step 2 · the plan, before anything is written ── */
    function renderPlan(p) {
      const c = p.counts;
      const kpis = kind === 'boutique' ? [
        ['new', c.newProducts, c.newProducts === 1 ? 'article créé' : 'articles créés'],
        ['', c.updatedProducts, c.updatedProducts === 1 ? 'article mis à jour' : 'articles mis à jour'],
        ['new', c.newVariants, c.newVariants === 1 ? 'variante' : 'variantes'],
        ['', c.newCodes, c.newCodes === 1 ? 'code-barres' : 'codes-barres'],
        ['', c.newCategories, c.newCategories === 1 ? 'catégorie' : 'catégories'],
      ] : [
        ['new', c.newItems, c.newItems === 1 ? 'article créé' : 'articles créés'],
        ['', c.updatedItems, c.updatedItems === 1 ? 'article mis à jour' : 'articles mis à jour'],
        ['', c.newCategories, c.newCategories === 1 ? 'catégorie' : 'catégories'],
        ['', c.newSubs, c.newSubs === 1 ? 'sous-catégorie' : 'sous-catégories'],
      ];

      const rowsHtml = kind === 'boutique'
        ? p.products.slice(0, 60).map((g) => '<tr><td>' + esc(g.name)
            + (g.existing ? '' : ' <span class="kci-tag new">nouveau</span>') + '</td><td>'
            + esc(g.categoryName || '—') + '</td><td>' + esc(mad(g.priceMAD))
            + '</td><td>' + g.variants.length + '</td></tr>').join('')
        : p.rows.slice(0, 60).map((r) => '<tr><td>' + esc(r.name)
            + (r.existing ? '' : ' <span class="kci-tag new">nouveau</span>') + '</td><td>'
            + esc(r.catName || '—') + (r.subName ? ' · ' + esc(r.subName) : '') + '</td><td>'
            + esc(mad(r.price)) + '</td><td>' + (r.avail ? 'oui' : 'non') + '</td></tr>').join('');

      const head = kind === 'boutique'
        ? '<tr><th>Article</th><th>Catégorie</th><th>Prix</th><th>Var.</th></tr>'
        : '<tr><th>Article</th><th>Catégorie</th><th>Prix</th><th>Dispo</th></tr>';
      const total = kind === 'boutique' ? p.products.length : p.rows.length;

      const issues = p.issues.slice(0, 12);
      body.innerHTML = [
        venueLine() ? '<p class="kci-where">' + venueLine() + '</p>' : '',
        '<div class="kci-sum">',
        kpis.map(([k, n, lbl]) => '<div class="kci-kpi ' + k + '"><b>' + n + '</b><span>' + esc(lbl) + '</span></div>').join(''),
        '</div>',
        '<div class="kci-scroll"><table class="kci-tbl"><thead>' + head + '</thead><tbody>' + rowsHtml + '</tbody></table></div>',
        total > 60 ? '<p class="kci-hint">' + (total - 60) + ' autres articles non affichés ici, tous seront importés.</p>' : '',
        issues.length ? '<div class="kci-iss"><b>' + p.issues.length + (p.issues.length === 1 ? ' ligne à signaler' : ' lignes à signaler')
          + '</b><ul>' + issues.map((x) => '<li>Ligne ' + x.line + ' · ' + esc(x.msg) + '</li>').join('')
          + '</ul>' + (p.issues.length > issues.length ? '<p style="margin:6px 0 0;">et ' + (p.issues.length - issues.length) + ' autres.</p>' : '') + '</div>' : '',
        kind === 'boutique' && c.missingCodes
          ? '<label class="kci-check"><input type="checkbox" data-kci-gen /><span>Générer un code-barres Kiwi pour les '
            + c.missingCodes + ' variantes qui n\'en ont pas, pour pouvoir imprimer leurs étiquettes tout de suite.</span></label>'
          : '',
        '<p class="kci-hint">Rien n\'est encore enregistré. Les articles déjà présents sont mis à jour, jamais dupliqués.</p>',
      ].join('');

      go.disabled = false; go.style.opacity = '1';
      go.textContent = 'Importer ' + total + (total === 1 ? ' article' : ' articles');
    }

    const ERRORS = {
      'vide': 'Ce fichier est vide.',
      'une-seule-ligne': 'Ce fichier ne contient qu\'une ligne d\'en-tête, aucun article.',
      'colonne-produit': 'Aucune colonne « produit » (ou article, nom, désignation) n\'a été trouvée.',
      'colonne-article': 'Aucune colonne « article » (ou produit, nom, plat) n\'a été trouvée.',
      'catalogue-absent': 'Le module inventaire n\'est pas chargé.',
      'carte-absente': 'Le module carte n\'est pas chargé.',
    };

    function handleFile(file) {
      if (!file) return;
      if (/\.(xlsx|xls|numbers|ods)$/i.test(file.name)) {
        renderPick('Kiwi lit le CSV, pas le .xlsx directement. Dans Excel : Fichier → Enregistrer sous → CSV UTF-8, puis redéposez le fichier.');
        return;
      }
      const fr = new FileReader();
      fr.onerror = () => renderPick('Ce fichier n\'a pas pu être lu.');
      fr.onload = () => {
        const parsed = parse(decodeBytes(fr.result));
        if (!parsed.ok) { plan = null; renderPick(ERRORS[parsed.error] || 'Fichier illisible.'); return; }
        const p = kind === 'boutique' ? analyseBoutique(parsed) : analyseMenu(parsed);
        if (!p.ok) {
          plan = null;
          renderPick((ERRORS[p.error] || 'Fichier illisible.')
            + (p.headerRaw ? ' Colonnes lues : ' + p.headerRaw.join(' · ') : ''));
          return;
        }
        if (!(kind === 'boutique' ? p.products.length : p.rows.length)) {
          plan = null; renderPick('Aucun article exploitable dans ce fichier.'); return;
        }
        plan = p;
        renderPlan(p);
      };
      fr.readAsArrayBuffer(file);
    }

    /* Delegated so the two steps can re-render the body freely. */
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-kci-tpl]')) { downloadTemplate(kind); return; }
      if (e.target.closest('[data-kci-drop]')) { m.el.querySelector('[data-kci-file]').click(); return; }
      if (e.target.closest('[data-kci-go]')) {
        if (!plan) { m.el.querySelector('[data-kci-file]').click(); return; }
        const genEl = m.el.querySelector('[data-kci-gen]');
        const r = kind === 'boutique'
          ? applyBoutique(plan, { generateMissing: !!(genEl && genEl.checked) })
          : applyMenu(plan);
        m.close();
        const desc = kind === 'boutique'
          ? [r.products + ' articles créés', r.variants + ' variantes', r.codes + ' codes-barres',
             r.generated ? r.generated + ' codes générés' : ''].filter(Boolean).join(' · ')
          : [r.items + ' articles créés', r.updated + ' mis à jour',
             r.cats ? r.cats + ' catégories' : ''].filter(Boolean).join(' · ');
        toast('Import terminé', { type: 'success', desc });
        if (r.failed.length) {
          setTimeout(() => toast(r.failed.length + ' articles non importés', {
            type: 'warn', desc: r.failed.slice(0, 3).join(' · '),
          }), 400);
        }
        try { if (typeof opts.onDone === 'function') opts.onDone(r); } catch (_) {}
      }
    });
    m.el.addEventListener('change', (e) => {
      if (e.target.matches('[data-kci-file]')) handleFile(e.target.files && e.target.files[0]);
    });
    m.el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-kci-drop]')) {
        e.preventDefault(); m.el.querySelector('[data-kci-file]').click();
      }
    });
    ['dragenter', 'dragover'].forEach((n) => m.el.addEventListener(n, (e) => {
      const d = e.target.closest('[data-kci-drop]'); if (!d) return;
      e.preventDefault(); d.classList.add('over');
    }));
    m.el.addEventListener('dragleave', (e) => {
      const d = e.target.closest('[data-kci-drop]'); if (d) d.classList.remove('over');
    });
    m.el.addEventListener('drop', (e) => {
      const d = e.target.closest('[data-kci-drop]'); if (!d) return;
      e.preventDefault(); d.classList.remove('over');
      handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    renderPick('');
    return m;
  }

  /* ───────────────── public API ───────────────── */
  window.KiwiCatalogImport = {
    // parsing / planning — usable headless (and from tools/check.js)
    parse, analyseBoutique, analyseMenu, applyBoutique, applyMenu,
    // UI
    open, openBoutique: (o) => open('boutique', o), openMenu: (o) => open('menu', o),
    downloadTemplate, templates: () => Object.assign({}, TEMPLATES),
    // exposed for tests
    _num: num, _normKey: normKey, _bool: bool, _decode: decodeBytes,
  };
})();
