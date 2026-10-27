/* Kiwi · l'argent en centimes entiers, un seul endroit.
 *
 * Les caisses tenaient les dirhams en flottants et refaisaient chacune leur
 * Math.round(x * 100) / 100 : une dizaine de conversions dispersées, dont une
 * lecture des champs saisis qui jetait tout ce qui suit la virgule. Ce module
 * est le point de passage unique entre le dirham affiché ou saisi et le centime
 * entier que le serveur enregistre.
 *
 *   KiwiMoney.toCents(12.9)        → 1290        (nombre ou texte saisi)
 *   KiwiMoney.parseCents('1 250,5') → 125050     (null si ce n'est pas un montant)
 *   KiwiMoney.toMad(1290)          → 12.9
 *   KiwiMoney.sumCents([a, b, …])  → centimes de la somme de montants en dirhams
 *   KiwiMoney.format(12.9)         → « 12,90 » (« 12 » quand il n'y a pas de centimes)
 *
 * Script classique et module à la fois : les fichiers ES de la boutique
 * l'importent pour son effet, la librairie le charge par le répartiteur. */
(function (root) {
  'use strict';
  if (root.KiwiMoney) { if (typeof module !== 'undefined' && module.exports) module.exports = root.KiwiMoney; return; }

  /* Décale la virgule de deux rangs sur la représentation décimale la plus
     courte du nombre (4.35 → 435 et non 434.99999999999994), puis arrondit
     au centime le plus proche, la moitié s'éloignant de zéro. */
  function shift2(abs) {
    return Math.round(Number(abs.toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2))));
  }

  /* Un montant tapé : « 12,5 », « 12.50 », « 1 250,50 », « 1.250,50 », « 1,250.50 ».
     Seul séparateur présent : c'est la décimale (un champ number rend « 1.250 »
     pour 1,25) ; deux séparateurs différents : le dernier est la décimale ; le
     même séparateur répété ne peut être qu'un groupe de milliers. Au-delà du
     centime, on arrondit à la moitié supérieure, sans passer par un flottant. */
  function parseCents(text) {
    let s = String(text == null ? '' : text).replace(/[\s  ]/g, '');
    let neg = false;
    if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    if (!s || !/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    let cut = -1;
    if (lastDot >= 0 && lastComma >= 0) cut = Math.max(lastDot, lastComma);
    else if (lastDot >= 0 && s.indexOf('.') === lastDot) cut = lastDot;
    else if (lastComma >= 0 && s.indexOf(',') === lastComma) cut = lastComma;
    const rawInt = cut >= 0 ? s.slice(0, cut) : s;
    const frac = cut >= 0 ? s.slice(cut + 1) : '';
    if (/[.,]/.test(frac) || (/[.,]/.test(rawInt) && !/^[0-9]{1,3}([.,][0-9]{3})+$/.test(rawInt))) return null;
    const intPart = rawInt.replace(/[.,]/g, '');
    if (intPart.length > 13) return null;
    let cents = (intPart ? Number(intPart) : 0) * 100 + Number((frac + '00').slice(0, 2));
    if (frac.length > 2 && frac.charCodeAt(2) >= 53) cents += 1;
    return neg ? -cents : cents;
  }

  function toCents(value) {
    if (typeof value === 'string') { const c = parseCents(value); return c == null ? 0 : c; }
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return 0;
    const c = shift2(Math.abs(n));
    return n < 0 ? -c : c;
  }

  const toMad = (cents) => (Math.round(Number(cents) || 0)) / 100;
  const sumCents = (list) => (Array.isArray(list) ? list : []).reduce((sum, v) => sum + toCents(v), 0);

  let whole = null, withCents = null;
  function format(mad) {
    if (!whole) {
      const base = { useGrouping: true, maximumFractionDigits: 2 };
      whole = new Intl.NumberFormat('fr-FR', { ...base, minimumFractionDigits: 0 });
      withCents = new Intl.NumberFormat('fr-FR', { ...base, minimumFractionDigits: 2 });
    }
    const n = Number(mad);
    return (Number.isFinite(n) && toCents(n) % 100 ? withCents : whole).format(n);
  }

  const api = Object.freeze({ toCents, parseCents, toMad, sumCents, format });
  root.KiwiMoney = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
