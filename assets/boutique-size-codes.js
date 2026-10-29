/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · DES CODES-BARRES QUI SE LISENT · couleur, article, taille
 * ---------------------------------------------------------------------------
 * Un code fabriqué par le magasin, à la création d'une déclinaison depuis
 * l'écran des tailles (boutique-sizes.js), se lit à l'œil :
 *
 *     2   1   048213775   4   6
 *     │   │       │       │   └ clé de contrôle (le scanner la vérifie)
 *     │   │       │       └──── la taille  (4 = M)
 *     │   │       └──────────── l'article, le même pour toutes ses déclinaisons
 *     │   └──────────────────── la couleur (1 = noir)
 *     └──────────────────────── « 2 » : code interne au magasin (GS1 20-29)
 *
 * Le « 2 » de tête n'est pas un choix : un code qui commence par 0 ou 1 est
 * celui d'un vrai fabricant (plage UPC), il pourrait tomber sur l'étiquette
 * d'un fournisseur. Et le dernier chiffre est la clé EAN-13, que le scanner
 * recalcule : la taille se lit donc juste avant.
 *
 * L'article : neuf chiffres tirés de l'identifiant du produit (FNV-1a), les
 * mêmes sur chaque appareil, sans compteur à partager. Treize familles de
 * couleur pour dix chiffres : beige et marron, rose et violet, orange et
 * jaune partagent le leur. Quand deux déclinaisons tombent sur le même code
 * (beige et marron du même article, même taille), la seconde reçoit un code
 * du compteur du magasin : un code ne désigne jamais deux articles.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const COLOR_DIGIT = {
  blanc: 0, noir: 1, gris: 2, beige: 3, marron: 3, rouge: 4, rose: 5, violet: 5,
  orange: 6, jaune: 6, vert: 7, bleu: 8, multi: 9, unique: 9,
};
const SIZE_DIGIT = { TU: 0, XXS: 1, XS: 2, S: 3, M: 4, L: 5, XL: 6, XXL: 7, '2XL': 7, XXXL: 8, '3XL': 8 };

export function colorDigit(family) {
  const d = COLOR_DIGIT[String(family || '').toLowerCase()];
  return d == null ? 9 : d;
}
/* Lettres : l'échelle XXS → 3XL ; chiffres (38, 42, 6 ans) : le dernier chiffre. */
export function sizeDigit(size) {
  const s = String(size == null ? '' : size).trim().toUpperCase();
  if (s in SIZE_DIGIT) return SIZE_DIGIT[s];
  const m = s.match(/(\d)\D*$/);
  return m ? +m[1] : 9;
}
export function productNumber(pid) {
  let h = 0x811c9dc5;
  const s = String(pid == null ? '' : pid);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return String(h % 1000000000).padStart(9, '0');
}
export function checkDigit(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
export function smartCode(pid, family, size) {
  const body = '2' + colorDigit(family) + productNumber(pid) + sizeDigit(size);
  return body + checkDigit(body);
}
/* Le code découpé pour l'affichage : [préfixe, couleur, article, taille, clé]. */
export function parts(code) {
  const s = String(code || '');
  if (!/^2\d{12}$/.test(s)) return null;
  return [s[0], s[1], s.slice(2, 11), s[11], s[12]];
}
