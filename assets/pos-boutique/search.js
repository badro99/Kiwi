import { bqKitScanBar, bqKitSellScroll } from './kit-2027.js?v=20';
/* La recherche de la barre de vente (peau 2027). Un code se lit de gauche à
 * droite : on répond par PRÉFIXE de code-barres d'abord, puis par fragment,
 * puis par nom d'article (sans accents ni casse). Chaque code est une
 * déclinaison exacte, donc une ligne par code, avec sa taille et sa couleur.
 * Fonction pure : le catalogue arrive dans d, relu à chaque frappe. Rien ici
 * ne touche au ticket. */
export function searchArticles(raw, d, limit, opts) {
  const { P, BY_EAN, promoFor, shelf, stockOf, availableStock, colorLabel } = d;
  const q = String(raw || '').trim();
  if (!q) return [];
  /* opts.variants (barre de vente) : un nom trouvé liste CHAQUE déclinaison
     (taille × couleur) avec son propre stock, comme la fiche de la tuile. La
     barre de l'Inventaire garde une ligne par article : elle ouvre sa fiche. */
  const byVariant = !!(opts && opts.variants);
  const max = limit || (byVariant ? 30 : 8);
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const needle = fold(q);
  const cat = window.KiwiBoutiqueCatalog;
  const out = [], seen = new Set();
  const push = (pid, ean, why, variant) => {
    const p = P[pid];
    const key = ean || (variant ? 'v:' + variant.id : 'p:' + pid);
    if (!p || seen.has(key) || out.length >= max) return;
    seen.add(key);
    let hit = null;
    try { hit = ean && cat ? cat.resolveScan(ean) : null; } catch (_) {}
    if (!hit && variant) hit = { size: variant.size, colorId: variant.colorId, colorFamily: variant.colorFamily };
    const color = hit && (hit.colorFamily || hit.colorId);
    const pr = promoFor(pid);
    out.push({
      pid, ean: ean || '', why, name: p.name,
      detail: [hit && hit.size, color ? colorLabel(color) : ''].filter(Boolean).join(' · '),
      price: pr ? pr.price : shelf(p.price), was: pr ? pr.was : 0,
      stock: hit && hit.size ? availableStock(pid, hit.size, color || p.colors[0]) : stockOf(p),   // ce qui reste, ticket déduit
      art: p.art, artPicked: !!p.artPicked, colors: p.colors, photo: p.photo || '',
    });
  };
  if (/^[0-9]+$/.test(q)) {
    const codes = Object.keys(BY_EAN);
    for (const c of codes) { if (out.length >= max) break; if (c.indexOf(q) === 0) push(BY_EAN[c], c, 'ean'); }
    for (const c of codes) { if (out.length >= max) break; if (c.indexOf(q) > 0) push(BY_EAN[c], c, 'ean'); }
  }
  for (const pid of Object.keys(P)) {
    if (out.length >= max) break;
    const p = P[pid];
    if (!p || p.id !== pid) continue;           // un alias (legacyId) pointe le même article
    if (fold(p.name + ' ' + (p.marque || '') + ' ' + (p.sku || '')).indexOf(needle) >= 0) {
      let vs = [];
      try { vs = byVariant && cat && cat.listVariants ? cat.listVariants(pid) || [] : []; } catch (_) { vs = []; }
      if (!vs.length) { push(pid, p.ean || '', 'nom'); continue; }
      for (const v of vs) {
        if (out.length >= max) break;
        const code = (v.barcodes || []).length ? ((v.barcodes.find((b) => b.primary) || v.barcodes[0]).code || '') : '';
        push(pid, code, 'nom', v);
      }
    }
  }
  return out;
}

/* Monte la liste sur la barre de vente, peau allumée et kit présent
   seulement. d vient de sales.js : ses propres fonctions, rien de copié. */
export function sellSearch(bar, input, on, d) {
  if (!bar || !input || !on) return false;
  bqKitSellScroll(bar.parentNode);   // recherche + rayons défilent avec la grille
  return bqKitScanBar(bar, {
    input, commit: d.commit, open: d.open, money: d.money, esc: d.esc, icons: d.icons,
    search: (q) => searchArticles(q, d.catalog(), 0, { variants: true }),
    visual: (r) => (r.photo ? '<img class="bq-product-photo" src="' + d.esc(r.photo) + '" alt="" loading="lazy" />' : d.artOf(r)),
  });
}
