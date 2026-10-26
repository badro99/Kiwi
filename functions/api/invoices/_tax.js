import { iceCompact } from '../_ice.js';
import { fail, str, validDay, VAT_RATES, PAYMENT_METHODS, MAX_LINES, MAX_QTY, MAX_UNIT_CENTS, MAX_DOC_CENTS } from './_shared.js';
// Contrat interne : lit uniquement les valeurs à normaliser ; retourne les champs bornés et totaux en centimes, ou lève Fail. Aucun accès DB ni authentification.

/* ─────────────────────────── montants ─────────────────────────── */

/* Total HT d'une ligne, en centimes entiers, arrondi à la demi-unité supérieure :
 *   round(qté × PU × (1 − remise %)).
 * En BigInt : quantité en millièmes, remise en centièmes de pour cent, aucun
 * flottant ne décide d'un centime. */
function lineHT(line) {
  const qtyMilli = BigInt(Math.round(line.qty * 1000));
  const discount = BigInt(Math.round(line.discountPct * 100));
  const num = qtyMilli * BigInt(line.unitHT) * (10000n - discount);
  const den = 10000000n; // 1000 (millièmes) × 10000 (centièmes de %)
  return Number((num * 2n + den) / (2n * den));
}

/* Les totaux d'un document : HT, TVA par taux, TTC. La TVA se calcule sur la BASE
 * de chaque taux (somme des lignes), pas ligne par ligne : c'est ce que la
 * facture imprime et ce que la déclaration reprend. */
export function computeTotals(lines) {
  const groups = new Map();
  let ht = 0;
  for (const line of lines) {
    const v = lineHT(line);
    ht += v;
    groups.set(line.vatRate, (groups.get(line.vatRate) || 0) + v);
  }
  if (ht > MAX_DOC_CENTS) throw fail(400, 'invalid-lines', 'Montant trop élevé.');
  const byRate = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, baseCents]) => ({ rate, baseCents, vatCents: Math.floor((baseCents * rate + 50) / 100) }));
  const vat = byRate.reduce((s, g) => s + g.vatCents, 0);
  return { htCents: ht, vatCents: vat, ttcCents: ht + vat, byRate };
}

/* ─────────────────────────── normalisation ─────────────────────────── */

function normCustomer(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    name: str(c.name, 120),
    address: str(c.address, 300),
    ice: iceCompact(str(c.ice, 40)).slice(0, 20),
    if: str(c.if != null ? c.if : c.ifNum, 30),
    email: str(c.email, 120),
    phone: str(c.phone, 30),
    clientId: str(c.clientId, 64),
  };
}

function normLines(raw) {
  if (!Array.isArray(raw)) throw fail(400, 'invalid-lines', 'Lignes attendues.');
  if (raw.length > MAX_LINES) throw fail(400, 'invalid-lines', 'Trop de lignes.');
  const out = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') throw fail(400, 'invalid-lines', 'Ligne invalide.');
    const qty = Number(l.qty);
    const unit = Number(l.unitHT);
    const disc = l.discountPct == null || l.discountPct === '' ? 0 : Number(l.discountPct);
    const rate = l.vatRate == null || l.vatRate === '' ? 20 : Number(l.vatRate);
    if (!Number.isFinite(qty) || qty < 0 || qty > MAX_QTY) throw fail(400, 'invalid-lines', 'Quantité invalide.');
    if (!Number.isFinite(unit) || unit < 0 || unit > MAX_UNIT_CENTS) throw fail(400, 'invalid-lines', 'Prix unitaire invalide.');
    if (!Number.isFinite(disc) || disc < 0 || disc > 100) throw fail(400, 'invalid-lines', 'Remise invalide.');
    if (!VAT_RATES.includes(rate)) throw fail(400, 'invalid-lines', 'Taux de TVA invalide.');
    const line = {
      description: str(l.description, 300),
      qty: Math.round(qty * 1000) / 1000,
      unitHT: Math.round(unit),
      discountPct: Math.round(disc * 100) / 100,
      vatRate: rate,
    };
    // Une ligne vide (la rangée blanche du formulaire) n'est pas une ligne.
    if (!line.description && line.unitHT === 0) continue;
    out.push(line);
  }
  return out;
}

function normDay(v, code) {
  if (v == null || v === '') return null;
  if (!validDay(v)) throw fail(400, code, 'Date invalide (AAAA-MM-JJ).');
  return v;
}
function normTerms(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 365) throw fail(400, 'invalid-termsDays', 'Délai de paiement invalide.');
  return n;
}
function normMethod(v) {
  if (v == null || v === '') return null;
  const m = String(v);
  if (!PAYMENT_METHODS.includes(m)) throw fail(400, 'invalid-paymentMethod', 'Mode de paiement invalide.');
  return m;
}


export { normCustomer, normLines, normDay, normTerms, normMethod };
