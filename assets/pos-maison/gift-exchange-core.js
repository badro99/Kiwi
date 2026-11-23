/* Échange sans ticket · caisse Maison · le calcul, sans DOM.
 * docs/specs/2026-11-23-maison-echange-sans-ticket.md, tools/gift-exchange-core-test.mjs.
 *
 * Une cliente rapporte un cadeau sans ticket. Chez Vogue les articles n'ont ni
 * code-barres ni photo et portent la référence du fournisseur (« AM-58-8
 * MARRON ») : on la retrouve au clavier, tirets et espaces facultatifs. Ce qui
 * revient vaut le prix de vente du jour ; l'échange ne se règle que si ce qui
 * part vaut au moins autant (marchandise contre marchandise, jamais d'argent
 * rendu ni d'avoir sans vente d'origine). */

export function compact(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/* Rang : référence exacte, puis début de référence, puis référence contenue,
   puis tous les mots tapés présents (nom, marque, motif), dans l'ordre du catalogue. */
export function searchProducts(products, q, limit = 30) {
  const whole = compact(q);
  if (!whole) return [];
  const words = String(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
  const ranked = [];
  (products || []).forEach((p, i) => {
    const name = compact(p && p.name);
    const all = compact([p && p.name, p && p.marque, p && p.motif].join(' '));
    let rank = -1;
    if (name === whole) rank = 0;
    else if (name.startsWith(whole)) rank = 1;
    else if (name.includes(whole)) rank = 2;
    else if (words.every((w) => all.includes(w))) rank = 3;
    if (rank >= 0) ranked.push({ p, rank, i });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, limit).map((r) => r.p);
}

const sum = (rows) => (rows || []).reduce((s, r) => s + Math.round(Number(r.unitCents) || 0) * Math.max(0, Math.floor(Number(r.qty) || 0)), 0);

export function exchangeTotals(back, out) {
  const backCents = sum(back);
  const outCents = sum(out);
  const diffCents = outCents - backCents;
  return {
    backCents, outCents, diffCents,
    remainingCents: Math.max(0, -diffCents),
    ready: backCents > 0 && outCents > 0 && diffCents >= 0,
  };
}

/* La différence encaissée se répartit sur les articles emportés, au prorata de
   leur valeur, reste au plus grand reliquat : le classement des produits du
   tableau de bord voit ce qui est vraiment parti, et la somme tombe au centime. */
export function allocateCents(totalCents, weights) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const w = (weights || []).map((x) => Math.max(0, Number(x) || 0));
  if (!w.length) return [];
  const base = w.reduce((s, x) => s + x, 0);
  const share = base > 0 ? w.map((x) => (total * x) / base) : w.map(() => total / w.length);
  const out = share.map(Math.floor);
  let rest = total - out.reduce((s, x) => s + x, 0);
  share.map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => { if (rest > 0) { out[i] += 1; rest -= 1; } });
  return out;
}

/* Les phrases de la feuille, en français (la clé), anglais et arabe. Elles
   vivent ici et non dans assets/caisse-lang.js : ce fichier est gelé par le
   cliquet de taille (tools/file-size-baseline.json). */
export const PHRASES = {
  'Échange sans ticket': ['Exchange without receipt', 'استبدال بدون تذكرة'],
  'Un cadeau rapporté sans ticket : ce qui revient en stock, ce qui part, et la différence.': ['A gift brought back without a receipt: what goes back into stock, what leaves, and the difference.', 'هدية رجعت بدون تذكرة: ما يعود إلى المخزون، وما يخرج، والفرق.'],
  'Référence ou nom de l’article': ['Item reference or name', 'مرجع السلعة أو اسمها'],
  'Tapez la référence lue sur l’article ou sa boîte, ou son nom.': ['Type the reference written on the item or its box, or its name.', 'اكتب المرجع المكتوب على السلعة أو علبتها، أو اسمها.'],
  'Aucune référence ne correspond.': ['No reference matches.', 'لا يوجد مرجع مطابق.'],
  'Revient': ['Back', 'يرجع'],
  'Part': ['Out', 'يخرج'],
  'Revient en stock': ['Back into stock', 'يرجع إلى المخزون'],
  'Part avec la cliente': ['Leaves with the customer', 'يخرج مع الزبونة'],
  'Rien pour l’instant.': ['Nothing yet.', 'لا شيء بعد.'],
  'en stock': ['in stock', 'في المخزون'],
  'Plus de stock pour cet article': ['No stock left for this item', 'لم يبق مخزون لهذه السلعة'],
  'Retirer': ['Remove', 'إزالة'],
  'Ajoutez l’article rapporté, puis ce que la cliente emporte.': ['Add the item brought back, then what the customer takes.', 'أضف السلعة المرجعة، ثم ما ستأخذه الزبونة.'],
  'Il reste {x} à choisir': ['{x} left to choose', 'بقي {x} للاختيار'],
  'Différence à encaisser': ['Difference to collect', 'الفرق المطلوب دفعه'],
  'Même valeur, échange direct': ['Same value, direct exchange', 'نفس القيمة، استبدال مباشر'],
  'Encaisser {x}': ['Collect {x}', 'تحصيل {x}'],
  'Confirmer l’échange': ['Confirm the exchange', 'تأكيد الاستبدال'],
  'Fermer': ['Close', 'إغلاق'],
  'Échange enregistré': ['Exchange saved', 'تم تسجيل الاستبدال'],
  'Échange sans ticket réglé, différence {x}': ['Exchange without receipt settled, difference {x}', 'تمت تسوية الاستبدال بدون تذكرة، الفرق {x}'],
  'Différence encaissée, échange à régulariser': ['Difference collected, exchange to settle', 'تم تحصيل الفرق، الاستبدال بانتظار التسوية'],
  'Numéro de ticket indisponible': ['Receipt number unavailable', 'رقم التذكرة غير متاح'],
};

/* La langue choisie au comptoir (assets/caisse-lang.js), français à défaut. */
export function tillLang() {
  try { const L = globalThis.window && globalThis.window.KiwiCaisseLang; return (L && L.get && L.get()) || 'fr'; } catch (_) { return 'fr'; }
}

export function phrase(fr, lang, vars) {
  const row = PHRASES[fr];
  let s = lang === 'en' && row ? row[0] : lang === 'ar' && row ? row[1] : fr;
  if (vars) Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}
