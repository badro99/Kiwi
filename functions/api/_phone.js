// Règle téléphonique côté serveur : la même que assets/phone.js (KiwiPhone),
// que le navigateur charge comme script et qu'un module Pages ne peut pas
// importer. Un numéro marocain garde son affichage familier « 06 12 34 56 78 » ;
// un numéro étranger n'est accepté qu'avec son indicatif explicite (+ ou 00),
// pour que deux pays ne se confondent jamais sur leurs derniers chiffres.
// tools/clients-properties-test.mjs vérifie que phoneKey() rend exactement
// KiwiPhone.digits() : si l'une change, l'autre doit suivre.

export function normalizePhone(value) {
  let s = String(value == null ? '' : value).trim().slice(0, 32);
  if (!s) return '';
  if (/[A-Za-z]/.test(s)) return '';
  s = s.replace(/^(\+|00)(\d{1,3})\s*\(0\)/, '$1$2');
  if ((s.match(/\+/g) || []).length > 1 || s.indexOf('+') > 0) return '';
  s = s.replace(/[\s().-]/g, '');
  const explicit = s.startsWith('+') || s.startsWith('00');
  let digits = s.replace(/^\+|^00/, '');
  if (/^212[567]\d{8}$/.test(digits)) digits = '0' + digits.slice(3);
  else if (/^[567]\d{8}$/.test(digits)) digits = '0' + digits;
  if (/^0[567]\d{8}$/.test(digits)) return digits.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
  return explicit && /^[1-9]\d{6,14}$/.test(digits) ? '+' + digits : '';
}

/* Clé d'identité : « 212612345678 » pour 0612345678, +212 6 12 34 56 78 ou
 * 00212612345678 ; les chiffres avec indicatif pour un numéro étranger ; vide
 * pour ce qui n'est pas un numéro. */
export function phoneKey(value) {
  const phone = normalizePhone(value), digits = phone.replace(/\D/g, '');
  return /^0[567]\d{8}$/.test(digits) ? '212' + digits.slice(1) : digits;
}
