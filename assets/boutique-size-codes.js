/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · DES CODES-BARRES QUI SE LISENT · couleur, article, taille
 * ---------------------------------------------------------------------------
 * Un code fabriqué par le magasin, à la création d'une déclinaison depuis
 * l'écran des tailles (boutique-sizes.js), se lit à l'œil :
 *
 *     2   10   4821377   04   6
 *     │   │       │      │    └ clé de contrôle (le scanner la vérifie)
 *     │   │       │      └───── la taille   (04 = M, 38 = 38)
 *     │   │       └──────────── l'article, le même pour toutes ses déclinaisons
 *     │   └──────────────────── la couleur  (10 = noir)
 *     └──────────────────────── « 2 » : code interne au magasin (GS1 20-29)
 *
 * Deux chiffres par couleur, un par famille, aucune n'en partage :
 *   0x clairs : 00 blanc · 01 beige
 *   1x sombres : 10 noir · 11 gris · 12 marron
 *   2x chauds : 20 rouge · 21 rose · 22 orange · 23 jaune
 *   3x froids : 30 vert · 31 bleu · 32 violet
 *   8x : 80 multicolore · 88 sans couleur
 * Deux chiffres par taille : 00 taille unique, 01 XXS → 09 4XL ; une taille
 * en nombre (36, 42) s'écrit telle quelle. Une taille hors de ces deux
 * familles (« 2 ans », 104, S/M) reçoit, pour cet article, un code libre pris
 * en partant de 99 : jamais celui d'une autre de ses tailles.
 *
 * Le « 2 » de tête n'est pas un choix : un code qui commence par 0 ou 1 est
 * celui d'un vrai fabricant (plage UPC). Et le dernier chiffre est la clé
 * EAN-13, que le scanner recalcule.
 *
 * L'article : sept chiffres, le premier jamais 0 (les codes du compteur du
 * magasin, « 2000000… », ne lui ressemblent donc jamais). Tiré de
 * l'identifiant du produit ; s'il est déjà pris par un autre article du
 * catalogue, on en tire un autre. Une fois le premier code posé, les
 * déclinaisons suivantes reprennent son numéro et ses codes de taille.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Les anciens articles gardent leurs codes, et leurs nouvelles déclinaisons
   aussi : seuls les articles créés après la mise en service (29 octobre 2026,
   22 h 15 UTC) et dont aucune déclinaison ne porte déjà un code du compteur
   reçoivent des codes qui se lisent. Une étiquette déjà collée ne change jamais. */
export const READABLE_SINCE = 1793312100000;

export const COLOR_CODE = {
  blanc: '00', beige: '01',
  noir: '10', gris: '11', marron: '12',
  rouge: '20', rose: '21', orange: '22', jaune: '23',
  vert: '30', bleu: '31', violet: '32',
  multi: '80', unique: '88',
};
const COLOR_SET = new Set(Object.values(COLOR_CODE));
const LETTER = { TU: '00', XXS: '01', XS: '02', S: '03', M: '04', L: '05', XL: '06', XXL: '07', '2XL': '07', XXXL: '08', '3XL': '08', XXXXL: '09', '4XL': '09' };

export function colorCode(family) {
  return COLOR_CODE[String(family || '').toLowerCase()] || COLOR_CODE.unique;
}
/* La taille qui s'écrit d'elle-même ; sinon null (à attribuer pour l'article). */
export function naturalSize(size) {
  const s = String(size == null ? '' : size).trim().toUpperCase();
  if (s in LETTER) return LETTER[s];
  if (/^[1-9]\d$/.test(s)) return s;
  return null;
}
export function itemNumber(pid, salt) {
  let h = 0x811c9dc5;
  const s = String(pid == null ? '' : pid) + (salt ? '#' + salt : '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return String(1000000 + (h % 9000000));
}
export function checkDigit(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
export function compose(cc, item, ss) {
  const body = '2' + cc + item + ss;
  return body + checkDigit(body);
}
/* Le code découpé : [« 2 », couleur, article, taille, clé] ; null si ce
   n'est pas un code qui se lit (compteur, fournisseur, ancien code). */
export function parts(code) {
  const s = String(code || '');
  if (!/^2\d{12}$/.test(s) || checkDigit(s) !== +s[12]) return null;
  const cc = s.slice(1, 3), item = s.slice(3, 10);
  if (!COLOR_SET.has(cc) || item[0] === '0') return null;
  return ['2', cc, item, s.slice(10, 12), s[12]];
}

/* Le plan d'un article : son numéro (repris de ses codes s'il en a déjà, sinon
   tiré et libre dans le catalogue) et le code de chacune de ses tailles.
   `sizes` : toutes les tailles de l'article (grille comprise), pour qu'une
   taille hors famille ne prenne jamais le code naturel d'une autre. */
const NONE = { item: '', sizeOf: () => '', code: () => '' };
export function eligible(d) {
  if (!d || !d.product || !(+d.product.createdAt >= READABLE_SINCE)) return false;
  return !d.variants.some((v) => (v.barcodes || []).some((b) => b && b.type === 'ean13' && !parts(b.code)));
}
export function planner(cat, pid, sizes) {
  if (!eligible(cat.getProduct(pid))) return NONE;
  const others = new Set();
  const sizeCode = {};
  let own = '';
  const listed = (cat.listProducts ? cat.listProducts({ includeArchived: true }) : []) || [];
  listed.forEach((p) => {
    const d = cat.getProduct(p.id);
    if (!d) return;
    d.variants.forEach((v) => (v.barcodes || []).forEach((b) => {
      const x = parts(b.code);
      if (!x) return;
      if (p.id === pid) { own = own || x[2]; if (!sizeCode[String(v.size)]) sizeCode[String(v.size)] = x[3]; }
      else others.add(x[2]);
    }));
  });
  let item = own;
  for (let salt = 0; !item && salt < 1000; salt++) { const c = itemNumber(pid, salt); if (!others.has(c)) item = c; }
  const all = Array.from(new Set((sizes || []).map(String).concat(Object.keys(sizeCode))));
  const reserved = new Set(Object.values(sizeCode));
  all.forEach((s) => { const n = naturalSize(s); if (n) reserved.add(n); });
  const sizeOf = (size) => {
    const k = String(size);
    if (sizeCode[k]) return sizeCode[k];
    let c = naturalSize(k);
    if (!c || Object.keys(sizeCode).some((o) => sizeCode[o] === c)) {
      for (let n = 99; n >= 0; n--) { const t = String(n).padStart(2, '0'); if (!reserved.has(t)) { c = t; break; } }
    }
    sizeCode[k] = c; reserved.add(c);
    return c;
  };
  return {
    item,
    sizeOf,
    code: (family, size) => (item ? compose(colorCode(family), item, sizeOf(size)) : ''),
  };
}
