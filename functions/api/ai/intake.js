// /api/ai/intake — registre du guichet unique documentaire (« dépose un papier,
// il se range tout seul »). Slice 1 : factures fournisseur PDF via le scan stock.
//
// Ce que cette route fait : constater un dépôt (empreinte = identifiant),
// conserver l'original comme pièce comptable (R2 privé), refuser les pièces
// d'identité, et suivre le statut du brouillon jusqu'à la confirmation humaine.
//
// Ce qu'elle ne fait PAS : aucune extraction (les spécialistes existants —
// invoice.js, expense-ocr.js, tpe-reconcile.js — restent les seuls lecteurs),
// AUCUNE écriture en stock, dépenses, chiffre d'affaires ou prix fournisseur.
// La confirmation réutilise les chemins d'écriture existants côté client.
// Proposer, jamais comptabiliser : il n'y a pas de chemin auto-classe.
//
// Protocole (idempotent par conception, l'empreinte est l'identifiant) :
//   POST { action:'commit', sha256, mime, size, docType, source }
//     → { duplicate:false, docId } ou { duplicate:true, doc } (déjà déposé :
//       date + statut, jamais de doublon silencieux)
//   PUT ?merchant=&docId= (corps = octets bruts, Content-Type: application/pdf)
//     → { ok:true, docId } (l'objet R2 ; réinscriptible, même clé)
//   POST { action:'mark', docId, status:'confirmed' }
//     → { ok:true, doc } (seule sortie du brouillon en slice 1)
//   POST { action:'prepare', docId, postingHash, lineCount }
//     → { ok:true, prepared:true } (fige l'empreinte du brouillon relu avant
//       la première écriture ; une reprise différente est refusée)
//   GET ?merchant=&docId= → { ok:true, doc } (reprise après échec)
//
// Sécurité : tenantFor strict partout ; AUCUN log du contenu ; quota 'intake'.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, DAILY_CAPS } from './_quota.js';

export const DAILY_CAP = DAILY_CAPS.intake;
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // comme annoncé dans le scan stock (« max 10 Mo »)
export const DOC_TYPES_V1 = ['supplier_invoice'];
export const DOC_STATUSES_V1 = ['received', 'confirmed'];
const SHA256_RE = /^[0-9a-f]{64}$/;

/* ── Pré-filtre pièces d'identité (§7 du design) ──────────────────────────
 * Limites honnêtes de ce contrôle, lues avant de s'y fier :
 *   · le client Kiwi normal filtre le texte pdf.js EXTRAIT avant tout envoi ;
 *   · le serveur ne refait que le MÊME contrôle sur le textSample FOURNI —
 *     il n'extrait ni n'inspecte le PDF lui-même ;
 *   · un client modifié peut donc omettre ou falsifier textSample et passer
 *     ce contrôle : c'est une protection contre l'envoi accidentel (mauvais
 *     fichier glissé dans le dépôt), PAS une détection d'identité vérifiée
 *     côté serveur — aucune affirmation de ce type n'est autorisée ;
 *   · l'entrée photo reste fermée (commit n'accepte que application/pdf),
 *     donc aucun chemin actuel ne contourne le filtre par l'image.
 * Sens fail-safe conservé : un faux positif bloque un dépôt légitime (le
 * commerçant saisit manuellement) sans jamais écrire quoi que ce soit. */
export function containsIdentityHints(text) {
  const t = String(text || '');
  if (!t) return false;
  return /passeport|passport|carte\s+(nationale|d['’]identit)|c\.?\s*n\.?\s*i\.?\s*e\.?\b|\bcin\b|fiche\s+de\s+police|acte\s+de\s+naissance|جواز\s*السفر|بطاقة\s*(التعريف|الوطنية)| الحالة\s*المدنية/i.test(t);
}

/* Zone MRZ (ICAO 9303) : passeports, CNIE et titres de voyage portent 2-3
 * lignes de 30-44 signes sur l'alphabet [A-Z0-9<], bourrées de chevrons de
 * remplissage. Un texte comptable ne contient quasiment jamais '<', et
 * jamais 10+ sur une même ligne de 30 signes : le test est quasi sans
 * faux positif, et il tourne sur place (texte pdf.js déjà extrait), sans
 * modèle ni réseau. Sens fail-safe comme le filtre mots-clés. */
export function containsMrzZone(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, '').toUpperCase();
    if (line.length < 30) continue;
    if (!/^[A-Z0-9<]+$/.test(line)) continue;
    let fillers = 0;
    for (const ch of line) if (ch === '<') fillers++;
    if (fillers >= 10) return true;
  }
  return false;
}

/* Corps de commit acceptés en slice 1 : PDF uniquement, types V1 uniquement.
 * Renvoie la forme normalisée ou null. Fonction pure, testée. */
export function validateCommitBody(b) {
  if (!b || typeof b !== 'object') return null;
  const sha256 = String(b.sha256 || '').toLowerCase().trim();
  if (!SHA256_RE.test(sha256)) return null;
  const mime = String(b.mime || '').toLowerCase().trim();
  if (mime !== 'application/pdf') return null;
  const size = Math.floor(Number(b.size) || 0);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_PDF_BYTES) return null;
  const docType = String(b.docType || '').trim();
  if (!DOC_TYPES_V1.includes(docType)) return null;
  const source = String(b.source || '').slice(0, 40).trim() || 'unknown';
  return { sha256, mime, size, docType, source };
}

export function isPdfBytes(buffer) {
  if (!buffer || !buffer.byteLength || buffer.byteLength < 5) return false;
  const b = new Uint8Array(buffer, 0, 5);
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d; // %PDF-
}

/* L'empreinte est l'identifiant : le serveur la recalcule sur les octets
 * reçus AVANT d'écrire en R2. Un client qui annoncerait un sha256 puis
 * enverrait d'autres octets verrait son dépôt rattaché au mauvais brouillon
 * (et un doublon passerait à travers) — d'où le refus sec ici. */
export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

let ensured = false;
export async function ensureIntakeSchema(db) {
  if (!db || typeof db.prepare !== 'function') return;
  if (ensured) return;
  try {
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS intake_docs (' +
      'merchant TEXT NOT NULL, ' +
      'doc_id TEXT NOT NULL, ' +
      'mime TEXT NOT NULL DEFAULT \'\', ' +
      'size INTEGER NOT NULL DEFAULT 0, ' +
      'r2_key TEXT NOT NULL DEFAULT \'\', ' +
      'has_object INTEGER NOT NULL DEFAULT 0, ' +
      'status TEXT NOT NULL DEFAULT \'received\', ' +
      'doc_type TEXT NOT NULL DEFAULT \'\', ' +
      'source TEXT NOT NULL DEFAULT \'\', ' +
      'posting_hash TEXT NOT NULL DEFAULT \'\', ' +
      'posting_count INTEGER NOT NULL DEFAULT 0, ' +
      'created_ts INTEGER NOT NULL DEFAULT 0, ' +
      'updated_ts INTEGER NOT NULL DEFAULT 0, ' +
      'PRIMARY KEY (merchant, doc_id)' +
      ')'
    ).run();
    ensured = true;
  } catch (_) {}
}

/* Projection publique d'une ligne : jamais de contenu documentaire (nous
 * n'en stockons aucun en D1 de toute façon — seul R2 détient les octets). */
export function publicDoc(row) {
  if (!row) return null;
  return {
    docId: String(row.doc_id || ''),
    status: String(row.status || 'received'),
    docType: String(row.doc_type || ''),
    source: String(row.source || ''),
    mime: String(row.mime || ''),
    size: Number(row.size || 0),
    hasObject: Number(row.has_object || 0) === 1,
    createdTs: Number(row.created_ts || 0),
    updatedTs: Number(row.updated_ts || 0),
  };
}

function r2KeyFor(merchant, docId) {
  return 'intake/' + merchant + '/' + docId + '.pdf';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant, { strict: true });
  if (!who) return json({ error: 'unauthorized' }, 401);
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);

  const action = String(b?.action || '').trim();

  if (action === 'commit') {
    const v = validateCommitBody(b);
    if (!v) return json({ error: 'bad-commit' }, 400);
    if (typeof b?.textSample === 'string') {
      const sample = b.textSample.slice(0, 4000);
      if (containsIdentityHints(sample) || containsMrzZone(sample)) {
        return json({ error: 'identity-rejected' }, 422);
      }
    }
    if (!(await quotaOk(env, who, 'intake', DAILY_CAP))) {
      return json({ error: 'daily-quota-exceeded' }, 429);
    }
    try { await ensureIntakeSchema(env.DB); } catch (_) { return json({ error: 'db' }, 503); }
    /* INSERT OR IGNORE puis lecture de la ligne canonique : deux dépôts
     * concurrents du même papier convergent vers la même réponse, le perdant
     * reçoit `duplicate:true` (200), jamais une 503. Le sens fail-safe si
     * `meta.changes` était absent : se déclarer doublon (le chemin reprise
     * re-téléverse et continue). */
    let row = null;
    let isNew = false;
    try {
      const ins = await env.DB.prepare(
        'INSERT OR IGNORE INTO intake_docs (merchant, doc_id, mime, size, r2_key, has_object, status, doc_type, source, created_ts, updated_ts) ' +
        'VALUES (?, ?, ?, ?, ?, 0, \'received\', ?, ?, ?, ?)'
      ).bind(who, v.sha256, v.mime, v.size, r2KeyFor(who, v.sha256), v.docType, v.source, Date.now(), Date.now()).run();
      isNew = !!(ins && ins.meta && ins.meta.changes === 1);
      row = await env.DB.prepare(
        'SELECT * FROM intake_docs WHERE merchant = ? AND doc_id = ?'
      ).bind(who, v.sha256).first();
    } catch (_) { return json({ error: 'db' }, 503); }
    if (!row) return json({ error: 'db' }, 503);
    if (!isNew) return json({ ok: true, duplicate: true, doc: publicDoc(row) });
    return json({ ok: true, duplicate: false, docId: v.sha256 });
  }

  if (action === 'prepare') {
    const docId = String(b?.docId || '').toLowerCase().trim();
    const postingHash = String(b?.postingHash || '').toLowerCase().trim();
    const lineCount = Math.floor(Number(b?.lineCount) || 0);
    if (!SHA256_RE.test(docId) || !SHA256_RE.test(postingHash)
      || lineCount < 1 || lineCount > 200) {
      return json({ error: 'bad-prepare' }, 400);
    }
    try { await ensureIntakeSchema(env.DB); } catch (_) { return json({ error: 'db' }, 503); }
    try {
      /* Le premier appareil fige uniquement une empreinte SHA-256, jamais le
       * contenu relu. L'UPDATE conditionnel est le point d'arbitrage atomique :
       * deux appareils avec le même brouillon convergent ; deux corrections
       * différentes ne peuvent pas mélanger leurs lignes sous les mêmes ids. */
      await env.DB.prepare(
        'UPDATE intake_docs SET posting_hash = CASE WHEN posting_hash = \'\' THEN ? ELSE posting_hash END, ' +
        'posting_count = CASE WHEN posting_hash = \'\' THEN ? ELSE posting_count END, updated_ts = ? ' +
        'WHERE merchant = ? AND doc_id = ? AND has_object = 1 AND status = \'received\' ' +
        'AND (posting_hash = \'\' OR (posting_hash = ? AND posting_count = ?))'
      ).bind(postingHash, lineCount, Date.now(), who, docId, postingHash, lineCount).run();
      const row = await env.DB.prepare(
        'SELECT * FROM intake_docs WHERE merchant = ? AND doc_id = ?'
      ).bind(who, docId).first();
      if (!row) return json({ error: 'doc-not-found' }, 404);
      if (String(row.status) === 'confirmed') return json({ error: 'already-confirmed' }, 409);
      if (Number(row.has_object || 0) !== 1) return json({ error: 'not-archived' }, 409);
      if (String(row.posting_hash || '') !== postingHash || Number(row.posting_count || 0) !== lineCount) {
        return json({ error: 'posting-conflict' }, 409);
      }
      return json({ ok: true, prepared: true });
    } catch (_) { return json({ error: 'db' }, 503); }
  }

  if (action === 'mark') {
    const docId = String(b?.docId || '').toLowerCase().trim();
    if (!SHA256_RE.test(docId)) return json({ error: 'bad-doc' }, 400);
    const status = String(b?.status || '').trim();
    if (!DOC_STATUSES_V1.includes(status) || status === 'received') {
      return json({ error: 'bad-status' }, 400);
    }
    try { await ensureIntakeSchema(env.DB); } catch (_) { return json({ error: 'db' }, 503); }
    try {
      const row = await env.DB.prepare(
        'SELECT * FROM intake_docs WHERE merchant = ? AND doc_id = ?'
      ).bind(who, docId).first();
      if (!row) return json({ error: 'doc-not-found' }, 404);
      /* Vérité du marquage : `confirmed` exige l'objet archivé. Sans cela,
       * un brouillon dont l'upload a échoué pourrait être marqué confirmé
       * alors que l'UI n'aurait rien à montrer comme pièce comptable. */
      if (status === 'confirmed' && Number(row.has_object || 0) !== 1) {
        return json({ error: 'not-archived' }, 409);
      }
      /* Une confirmation sans empreinte préparée contournerait l'arbitrage
       * de reprise et permettrait de sceller un lot partiellement écrit. */
      if (status === 'confirmed' && !SHA256_RE.test(String(row.posting_hash || ''))) {
        return json({ error: 'not-prepared' }, 409);
      }
      if (status === 'confirmed') {
        const expected = Number(row.posting_count || 0);
        if (!Number.isInteger(expected) || expected < 1 || expected > 200) {
          return json({ error: 'not-prepared' }, 409);
        }
        /* Le registre local n'est pas une preuve de durabilité. On ne scelle
         * qu'après présence, dans D1, de toutes les lignes de cette réception. */
        const posted = await env.DB.prepare(
          'SELECT COUNT(*) AS n FROM inventory_movements ' +
          'WHERE merchant = ? AND ref_id = ? AND reason = \'receipt\' AND id LIKE \'mov-intake-%\''
        ).bind(who, 'grn-intake-' + docId.slice(0, 16)).first();
        if (Number((posted && posted.n) || 0) !== expected) {
          return json({ error: 'not-posted' }, 409);
        }
      }
      await env.DB.prepare(
        'UPDATE intake_docs SET status = ?, updated_ts = ? WHERE merchant = ? AND doc_id = ?'
      ).bind(status, Date.now(), who, docId).run();
      const fresh = await env.DB.prepare(
        'SELECT * FROM intake_docs WHERE merchant = ? AND doc_id = ?'
      ).bind(who, docId).first();
      return json({ ok: true, doc: publicDoc(fresh || row) });
    } catch (_) { return json({ error: 'db' }, 503); }
  }

  return json({ error: 'bad-action' }, 400);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!env || !env.DB || !env.MEDIA) return json({ error: 'no-media' }, 503);
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'), { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const docId = String(url.searchParams.get('docId') || '').toLowerCase().trim();
  if (!SHA256_RE.test(docId)) return json({ error: 'bad-doc' }, 400);

  try { await ensureIntakeSchema(env.DB); } catch (_) { return json({ error: 'db' }, 503); }
  let row = null;
  try {
    row = await env.DB.prepare(
      'SELECT * FROM intake_docs WHERE merchant = ? AND doc_id = ?'
    ).bind(merchant, docId).first();
  } catch (_) { return json({ error: 'db' }, 503); }
  if (!row) return json({ error: 'doc-not-found' }, 404);
  if (String(row.status) === 'confirmed') return json({ error: 'already-confirmed' }, 409);

  const ctype = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (ctype !== 'application/pdf') return json({ error: 'bad-type' }, 415);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared && declared > MAX_PDF_BYTES) return json({ error: 'too-large', max: MAX_PDF_BYTES }, 413);

  let bytes = null;
  try { bytes = await request.arrayBuffer(); } catch (_) { return json({ error: 'empty' }, 400); }
  if (!bytes || !bytes.byteLength) return json({ error: 'empty' }, 400);
  if (bytes.byteLength > MAX_PDF_BYTES) return json({ error: 'too-large', max: MAX_PDF_BYTES }, 413);
  if (Number(row.size) !== bytes.byteLength) return json({ error: 'size-mismatch' }, 400);
  if (!isPdfBytes(bytes)) return json({ error: 'content-mismatch' }, 415);
  let hex = '';
  try { hex = await sha256Hex(bytes); } catch (_) { return json({ error: 'upload-failed' }, 500); }
  if (hex !== docId) return json({ error: 'hash-mismatch' }, 400);

  const key = r2KeyFor(merchant, docId);
  try {
    await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
    });
  } catch (_) {
    return json({ error: 'upload-failed' }, 500);
  }
  try {
    await env.DB.prepare(
      'UPDATE intake_docs SET r2_key = ?, has_object = 1, updated_ts = ? WHERE merchant = ? AND doc_id = ?'
    ).bind(key, Date.now(), merchant, docId).run();
  } catch (_) {
    try { await env.MEDIA.delete(key); } catch (_) {}
    return json({ error: 'db' }, 503);
  }
  return json({ ok: true, docId });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'), { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const docId = String(url.searchParams.get('docId') || '').toLowerCase().trim();
  if (!SHA256_RE.test(docId)) return json({ error: 'bad-doc' }, 400);
  try { await ensureIntakeSchema(env.DB); } catch (_) { return json({ error: 'db' }, 503); }
  try {
    const row = await env.DB.prepare(
      'SELECT * FROM intake_docs WHERE merchant = ? AND doc_id = ?'
    ).bind(merchant, docId).first();
    if (!row) return json({ error: 'doc-not-found' }, 404);
    return json({ ok: true, doc: publicDoc(row) });
  } catch (_) { return json({ error: 'db' }, 503); }
}
