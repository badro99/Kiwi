// L'ICE (Identifiant Commun de l'Entreprise) : 15 chiffres, 9 pour
// l'entreprise, 4 pour l'établissement, 2 de contrôle, et le nombre entier est
// un multiple de 97 (ISO 7064 mod 97-10, la règle de python-stdnum ›
// stdnum/ma/ice.py, vérifiée sur les exemples publiés par ice.gov.ma).
// Le même calcul vit côté navigateur dans assets/account.js (window.KiwiICE).
// Le contrôle prouve la forme, pas l'immatriculation : seul l'OMPIC le dit.

export const iceCompact = (raw) => String(raw == null ? '' : raw).replace(/[\s.\-]/g, '');

// null si l'ICE est vide ou valide, sinon 'digits' | 'length' | 'checksum'.
export function iceProblem(raw) {
  const n = iceCompact(raw);
  if (!n) return null;
  if (!/^\d+$/.test(n)) return 'digits';
  if (n.length !== 15) return 'length';
  let r = 0;
  for (const d of n) r = (r * 10 + (d.charCodeAt(0) - 48)) % 97;
  return r === 0 ? null : 'checksum';
}

export const ICE_DETAIL = {
  digits: "L'ICE ne contient que des chiffres.",
  length: "L'ICE doit comporter exactement 15 chiffres.",
  checksum: "Cet ICE ne passe pas le contrôle de ses deux derniers chiffres. Vérifiez chaque chiffre.",
};
