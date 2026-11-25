/* Accords du patron (Browse, 25 nov. 2026).
 *
 * Une sortie d'espèces ou une annulation devient une DEMANDE : la caisse la
 * dépose, le téléphone du patron la reçoit, il accepte ou refuse. Tant qu'il
 * n'a pas accepté, rien n'est écrit et aucun argent ne sort. Un refus ne fait
 * rien, mais il reste au journal.
 *
 * Ce que l'accord donne à la caisse, une fois lu (grantFor) :
 *  · une sortie d'espèces : la preuve du GESTE (_act-proof.js), signée au nom
 *    du patron, pour CE montant et ce sens ; cash-sessions.js la consomme une
 *    fois, comme celle d'un code ;
 *  · une ligne déjà envoyée en cuisine : la preuve de la personne
 *    (tillActorProof), que order/queue.js lit pour l'annulation immédiate ;
 *  · une vente : rien de signé, l'identifiant suffit, sale/cancel.js relit la
 *    ligne ici (approvedFor) et la marque utilisée.
 *
 * Les tables se créent à la première utilisation : la base de production
 * retarde sur schema.sql (migrations/0038_owner_approvals.sql).
 */
import { tillActorProof } from '../auth/_lib.js';
import { tillActProof } from './_act-proof.js';

export const KINDS = new Set(['cash-out', 'void-sent', 'cancel-sale']);
/* L'identifiant que portent les preuves d'un accord du patron. Aucun code
   d'équipe ne le porte (staff_pins) : _permissions.js › flagUnauthorized le
   reconnaît et n'inscrit pas une sortie acceptée comme « auteur non prouvé ». */
export const OWNER_ACTOR_ID = 'owner-approval';
/* Une sortie d'espèces peut attendre (la caisse continue de vendre) ; une
   annulation attend une minute à la caisse, la demande vit un peu plus. */
const PENDING_LIFE = { 'cash-out': 30 * 60000, 'void-sent': 10 * 60000, 'cancel-sale': 10 * 60000 };
/* Accepté, la caisse a ce temps pour le lire. Une réponse perdue se relit. */
export const GRANT_LIFE_MS = 30 * 60000;
const REMINT_MS = 2 * 60000;
export const MAX_PENDING = 20;
export const MAX_PER_MINUTE = 10;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS owner_approvals (
    id TEXT PRIMARY KEY,
    merchant TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL DEFAULT '',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    requested_by TEXT NOT NULL DEFAULT '',
    requested_by_id TEXT NOT NULL DEFAULT '',
    terminal TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_ts INTEGER NOT NULL,
    decided_ts INTEGER,
    decided_by TEXT NOT NULL DEFAULT '',
    granted_ts INTEGER,
    used_ts INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS idx_owner_approvals_merchant ON owner_approvals (merchant, created_ts)',
  `CREATE TABLE IF NOT EXISTS owner_approval_settings (
    merchant TEXT PRIMARY KEY,
    cash_out INTEGER NOT NULL DEFAULT 0,
    cancel INTEGER NOT NULL DEFAULT 0,
    manager_fallback INTEGER NOT NULL DEFAULT 1,
    min_cents INTEGER NOT NULL DEFAULT 0,
    updated_ts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS owner_approval_devices (
    merchant TEXT NOT NULL,
    token TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT '',
    created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, token)
  )`,
];

const ready = new WeakMap();
export async function ensureApprovalTables(db) {
  if (!db) throw new Error('db-unavailable');
  if (ready.get(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  ready.set(db, true);
}

export const DEFAULT_SETTINGS = Object.freeze({ cashOut: false, cancel: false, managerFallback: true, minCents: 0 });

export function settingsFromRow(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  return { cashOut: Number(row.cash_out) === 1, cancel: Number(row.cancel) === 1,
    managerFallback: Number(row.manager_fallback) !== 0, minCents: Math.max(0, Number(row.min_cents) || 0) };
}

export async function readSettings(env, merchant) {
  await ensureApprovalTables(env.DB);
  const row = await env.DB.prepare('SELECT cash_out, cancel, manager_fallback, min_cents FROM owner_approval_settings WHERE merchant = ?')
    .bind(merchant).first();
  return settingsFromRow(row);
}

export function cleanSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const cents = Number(s.minCents);
  return { cashOut: s.cashOut === true, cancel: s.cancel === true, managerFallback: s.managerFallback !== false,
    minCents: Number.isInteger(cents) && cents > 0 && cents <= 1e9 ? cents : 0 };
}

/* La règle, la même des deux côtés (assets/owner-approval.js la recopie). */
export function needsApproval(settings, kind, amountCents) {
  if (!settings || !KINDS.has(kind)) return false;
  const on = kind === 'cash-out' ? settings.cashOut : settings.cancel;
  if (!on) return false;
  return !(settings.minCents > 0 && Number(amountCents) > 0 && Number(amountCents) < settings.minCents);
}

export function cleanRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const kind = String(b.kind || '');
  if (!KINDS.has(kind)) return null;
  const cents = Number(b.amountCents);
  return {
    kind,
    ref: String(b.ref || '').slice(0, 96),
    label: String(b.label || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    amountCents: Number.isInteger(cents) && cents > 0 && cents <= 1e9 ? cents : 0,
    requestedBy: String(b.requestedBy || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    requestedById: String(b.requestedById || '').slice(0, 96),
    terminal: String(b.terminalId || '').slice(0, 96),
  };
}

/* Ce que le patron lit sur son téléphone vient du serveur, jamais de la
   caisse : le montant et le libellé d'une vente ou d'une ligne en cuisine se
   relisent ici (revue de sécurité : une caisse pouvait annoncer « 5 MAD » pour
   une vente de 2 000). Une sortie d'espèces garde le montant demandé, c'est
   celui que la preuve signera et que cash-sessions.js exigera. */
const REF_RE = /^[A-Za-z0-9_.:-]{1,96}$/;
/* L'accord d'une ligne en cuisine couvre CETTE ligne de CETTE commande. */
export const voidRef = (orderId, lineId) => String(orderId) + '|' + String(lineId);
const METHOD = { cash: 'Espèces', card: 'Carte', transfer: 'Virement', cheque: 'Chèque', split: 'Paiement partagé', tap: 'Sans contact', qr: 'QR', wallet: 'Portefeuille' };
export async function trustedRequest(env, merchant, req) {
  if (req.kind === 'cash-out') return req;
  if (!REF_RE.test(req.ref)) return { error: 'bad-ref' };
  if (req.kind === 'cancel-sale') {
    const sale = await env.DB.prepare('SELECT amount, amount_cents, method, label, ref, void_ts FROM sales WHERE id = ? AND merchant = ? LIMIT 1')
      .bind(req.ref, merchant).first();
    if (!sale) return { error: 'sale-not-found' };
    if (sale.void_ts != null) return { error: 'already-void' };
    const cents = sale.amount_cents != null ? Number(sale.amount_cents) : Math.round(Number(sale.amount) * 100);
    const label = [String(sale.label || sale.ref || 'Ticket'), METHOD[sale.method] || String(sale.method || '')].filter(Boolean).join(' · ');
    return { ...req, amountCents: Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 0, label: label.replace(/\s+/g, ' ').slice(0, 120) };
  }
  /* void-sent : la ligne d'une commande ouverte, trouvée comme _queue-quantities.js
     la trouvera (uid d'abord, identifiant produit seulement s'il est unique).
     Un uid vient de la caisse : présent dans deux commandes ouvertes, la demande
     est refusée, et l'accord retient la commande (ref « commande|ligne ») que
     voidLine exigera (revue : un bon récent à 5 MAD réutilisait l'uid d'un plat cher). */
  const rs = await env.DB.prepare(
    "SELECT id, lines FROM orders WHERE merchant = ? AND paid_ts IS NULL AND status <> 'rejected' AND instr(lines, ?) > 0 ORDER BY created_ts DESC LIMIT 50"
  ).bind(merchant, req.ref).all();
  let line = null, orderId = '', hits = 0;
  for (const order of (rs && rs.results) || []) {
    let lines = [];
    try { lines = JSON.parse(order.lines) || []; } catch (_) { lines = []; }
    const byUid = lines.find((l) => l && String(l.uid || '') === req.ref);
    const legacy = byUid ? [] : lines.filter((l) => l && !l.uid && String(l.id || '') === req.ref);
    const hit = byUid || (legacy.length === 1 ? legacy[0] : null);
    if (byUid || legacy.length) hits++;
    if (hit && !line) { line = hit; orderId = String(order.id); }
  }
  if (hits > 1) return { error: 'ambiguous-line' };
  if (!line) return { error: 'line-not-found' };
  const qty = Math.max(1, Math.round(Number(line.qty) || 1));
  const price = Number(line.unitPrice ?? line.price) || 0;
  const cents = Math.round(price * qty * 100);
  return { ...req, ref: voidRef(orderId, req.ref), amountCents: cents > 0 && cents <= 1e9 ? cents : 0,
    label: (qty + ' × ' + String(line.name || req.ref)).replace(/\s+/g, ' ').trim().slice(0, 120) };
}

export function newApprovalId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'apr-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export const APPROVAL_ID_RE = /^apr-[0-9a-f]{24}$/;

/* L'état vu maintenant : une demande trop vieille est expirée, un accord que
   la caisse n'a pas lu à temps aussi. Écrit la première fois qu'on le voit. */
export function effectiveStatus(row, now = Date.now()) {
  if (!row) return '';
  const life = PENDING_LIFE[row.kind] || PENDING_LIFE['cancel-sale'];
  if (row.status === 'pending' && now - Number(row.created_ts) > life) return 'expired';
  if (row.status === 'approved' && now - Number(row.decided_ts || 0) > GRANT_LIFE_MS) return 'expired';
  return row.status;
}

export async function loadApproval(env, merchant, id) {
  await ensureApprovalTables(env.DB);
  const row = await env.DB.prepare('SELECT * FROM owner_approvals WHERE id = ? AND merchant = ?').bind(id, merchant).first();
  if (!row) return null;
  const status = effectiveStatus(row);
  if (status !== row.status) {
    await env.DB.prepare('UPDATE owner_approvals SET status = ? WHERE id = ? AND merchant = ? AND status = ?')
      .bind(status, id, merchant, row.status).run();
    row.status = status;
  }
  return row;
}

export function publicRow(row) {
  return { id: row.id, kind: row.kind, ref: row.ref, label: row.label, amountCents: Number(row.amount_cents) || 0,
    requestedBy: row.requested_by, status: row.status, createdTs: Number(row.created_ts) || 0,
    decidedTs: row.decided_ts == null ? null : Number(row.decided_ts), decidedBy: row.decided_by || '',
    usedTs: row.used_ts == null ? null : Number(row.used_ts) };
}

/* Ce que la caisse reçoit d'un accord. Le premier passage le marque
   « granted » ; une réponse perdue se relit pendant deux minutes. */
export async function grantFor(env, merchant, row, now = Date.now()) {
  if (!row || !env.AUTH_SECRET) return null;
  const fresh = row.status === 'approved';
  const retry = row.status === 'granted' && now - Number(row.granted_ts || 0) < REMINT_MS;
  if (!fresh && !retry) return null;
  if (fresh) {
    const res = await env.DB.prepare(
      "UPDATE owner_approvals SET status = 'granted', granted_ts = ? WHERE id = ? AND merchant = ? AND status = 'approved'"
    ).bind(now, row.id, merchant).run();
    if (!res || !res.meta || res.meta.changes !== 1) {
      const again = await env.DB.prepare('SELECT status, granted_ts FROM owner_approvals WHERE id = ? AND merchant = ?').bind(row.id, merchant).first();
      if (!again || again.status !== 'granted' || now - Number(again.granted_ts || 0) >= REMINT_MS) return null;
    }
  }
  const actor = { id: OWNER_ACTOR_ID, name: String(row.decided_by || 'Propriétaire').slice(0, 60), role: 'owner' };
  const grant = { id: row.id, kind: row.kind, actor: { ...actor } };
  if (row.kind === 'cash-out') {
    grant.actProof = await tillActProof(env.AUTH_SECRET, merchant, actor, { kind: 'cash', amountCents: Number(row.amount_cents) || 0, move: 'out' }, now, row.id);
    grant.actor.actProof = grant.actProof;
  } else if (row.kind === 'void-sent') {
    grant.actorProof = await tillActorProof(env.AUTH_SECRET, merchant, actor);
    grant.actor.actorProof = grant.actorProof;
  }
  return grant;
}

/* sale/cancel.js : l'accord couvre CETTE vente, il est récent et pas encore
   consommé par une annulation réussie. */
export async function approvedFor(env, merchant, id, kind, ref, now = Date.now()) {
  if (!APPROVAL_ID_RE.test(String(id || ''))) return null;
  let row;
  try { row = await loadApproval(env, merchant, id); } catch (_) { return null; }
  if (!row || row.kind !== kind || row.ref !== String(ref || '')) return null;
  if (row.status !== 'approved' && row.status !== 'granted') return null;
  if (now - Number(row.decided_ts || 0) > GRANT_LIFE_MS) return null;
  return row;
}

export async function markUsed(env, merchant, id, now = Date.now()) {
  try {
    await env.DB.prepare("UPDATE owner_approvals SET status = 'used', used_ts = ? WHERE id = ? AND merchant = ? AND status IN ('approved','granted')")
      .bind(now, id, merchant).run();
  } catch (_) { /* l'annulation est faite ; le journal dira « accepté » au lieu de « utilisé » */ }
}

const WORDS = {
  fr: { 'cash-out': 'Sortie de caisse', 'void-sent': 'Annulation en cuisine', 'cancel-sale': 'Annulation de vente', asks: 'demande votre accord', till: 'La caisse' },
  en: { 'cash-out': 'Cash out', 'void-sent': 'Kitchen cancellation', 'cancel-sale': 'Sale cancellation', asks: 'asks for your approval', till: 'The till' },
  ar: { 'cash-out': 'سحب نقدي', 'void-sent': 'إلغاء في المطبخ', 'cancel-sale': 'إلغاء بيع', asks: 'يطلب موافقتك', till: 'الصندوق' },
};
export function mad(cents) {
  const v = (Number(cents) || 0) / 100;
  const text = Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' MAD';
}
export function pushMessage(row, lang) {
  const w = WORDS[lang] || WORDS.fr;
  const amount = Number(row.amount_cents) > 0 ? ' · ' + mad(row.amount_cents) : '';
  const who = row.requested_by || w.till;
  return {
    title: w[row.kind] + amount,
    body: who + ' ' + w.asks + (row.label ? ' · ' + row.label : ''),
    category: 'KIWI_APPROVAL',
    data: { kiwiApproval: { id: row.id, merchant: row.merchant } },
  };
}
