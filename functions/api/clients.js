// /api/clients — le carnet clients d'un magasin, ligne par ligne.
//
// assets/clients-store.js appelait cet endpoint depuis le jour où la fidélité a
// été livrée : un POST à chaque client ajouté ou récompensé, un DELETE à chaque
// suppression, un GET toutes les 15 secondes. Il n'a jamais existé. Les trois
// appels tombaient sur un 404, avalé en silence par un `.catch()` — le carnet
// était donc, en pratique, aussi local que le reste : une caisse sur tablette et
// un tableau de bord sur portable tenaient deux carnets différents, et le
// programme de fidélité comptait deux fois les mêmes points.
//
// Pourquoi une table de LIGNES et pas un document JSON comme /api/store :
//
//   · un carnet grossit sans plafond naturel (des milliers de clients sur
//     plusieurs années), là où une carte ou un planning restent petits ;
//   · deux appareils ne modifient presque jamais le MÊME client, mais écrivent
//     sans arrêt dans le même carnet. Au document, chaque encaissement ferait
//     repartir le document entier et déclencherait une fusion ; à la ligne, deux
//     caisses qui servent deux clients différents ne se croisent jamais ;
//   · le client sait déjà parler ce protocole (`since` + `cursor`), il n'y avait
//     qu'à l'implémenter.
//
// Tenancy : la règle unique de _private.js. Jamais public — un carnet, c'est des
// noms, des téléphones, des dates de naissance et des habitudes d'achat.
//
// Concurrence : dernier écrivain gagne, PAR CLIENT, sur l'horloge de la fiche
// (`updated`). Une écriture plus ancienne que ce qui est en base est ignorée
// plutôt qu'appliquée (le WHERE de l'upsert), donc une caisse qui rejoue sa file
// d'attente après une coupure ne rétrograde pas une fiche corrigée entre-temps.
//
// Curseur : `srv_ts`, une horloge SERVEUR strictement croissante par magasin —
// pas l'horloge de la fiche. Une tablette mal réglée de trois jours écrirait
// sinon dans le passé du curseur et sa cliente n'apparaîtrait jamais ailleurs.
//
// Suppression : une pierre tombale (`deleted = 1`), jamais un DELETE sec. Sans
// elle, l'appareil qui n'a pas vu la suppression repousse la fiche au prochain
// encaissement et le client supprimé ressuscite en boucle.
//
// Toujours « fail-soft » : pas de D1, pas de table (migration pas passée) → 200
// neutre en lecture, 503 en écriture. Le carnet local reste la vérité de travail
// et la caisse continue d'encaisser.

import { json } from '../auth/_lib.js';
import { tenantFor } from './_private.js';

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const int = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const money = (v, max = 1e9) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n * 100) / 100));
};
const PAGE = 500;

async function ensurePurchaseEvents(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS client_purchase_events (
    merchant TEXT NOT NULL,
    ref TEXT NOT NULL,
    client_id TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    stamps INTEGER NOT NULL DEFAULT 0,
    visits INTEGER NOT NULL DEFAULT 1,
    created_ts INTEGER NOT NULL,
    srv_ts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (merchant, ref)
  )`).run();
  try { await env.DB.prepare('ALTER TABLE client_purchase_events ADD COLUMN srv_ts INTEGER NOT NULL DEFAULT 0').run(); }
  catch (_) {}
}

async function ensureRewardEvents(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS client_reward_events (
    merchant TEXT NOT NULL,
    ref TEXT NOT NULL,
    client_id TEXT NOT NULL,
    points_delta INTEGER NOT NULL DEFAULT 0,
    stamps_delta INTEGER NOT NULL DEFAULT 0,
    created_ts INTEGER NOT NULL,
    srv_ts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (merchant, ref)
  )`).run();
  try { await env.DB.prepare('ALTER TABLE client_reward_events ADD COLUMN srv_ts INTEGER NOT NULL DEFAULT 0').run(); }
  catch (_) {}
}

function hospitalityJson(value) {
  const h = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return JSON.stringify({
    documentType: str(h.documentType, 24),
    documentNumber: str(h.documentNumber, 80),
    nationality: str(h.nationality, 80),
    preferredLanguage: str(h.preferredLanguage, 40),
    roomPreferences: str(h.roomPreferences, 500),
    foodPreferences: str(h.foodPreferences, 500),
    allergies: str(h.allergies, 500),
    accessibilityNeeds: str(h.accessibilityNeeds, 500),
  });
}

/* Bornage d'une fiche. Le carnet appartient au commerçant : on ne juge pas le
 * contenu, on borne la taille. Les champs sont énumérés parce que ce sont des
 * COLONNES — ici, contrairement à /api/store, en oublier un ne le fait pas
 * disparaître en silence, ça ne compile pas. */
function sanitize(raw) {
  return {
    id: str(raw && raw.id, 64),
    name: str(raw && raw.name, 120),
    phone: str(raw && raw.phone, 32),
    email: str(raw && raw.email, 160),
    birthday: str(raw && raw.birthday, 10),
    gender: str(raw && raw.gender, 16),
    city: str(raw && raw.city, 80),
    address: str(raw && raw.address, 240),
    notes: str(raw && raw.notes, 1000),
    hospitality: hospitalityJson(raw && raw.hospitality),
    points: int(raw && raw.points, 1e9),
    stamps: int(raw && raw.stamps, 1e6),
    visits: int(raw && raw.visits, 1e6),
    // SQLite's INTEGER affinity stores a fractional JS number as REAL when it
    // cannot represent it as an integer. Keep the legacy column for migration
    // compatibility, but never round a legitimate centime away at the edge.
    spend: money(raw && raw.spend, 1e10),
    consent: (raw && raw.consent) ? 1 : 0,
    consent_email: (raw && raw.consentEmail) ? 1 : 0,
    source: str(raw && raw.source, 24) || 'caisse',
    first_seen: int(raw && raw.firstSeen, 1e15),
    last_seen: int(raw && raw.lastSeen, 1e15),
    // L'horloge de la FICHE, celle qui arbitre le dernier-écrivain-gagne. Une
    // fiche sans horloge serait toujours perdante et ne s'écrirait jamais.
    updated_ts: int(raw && (raw.updated || raw.updated_ts), 1e15) || Date.now(),
  };
}

/* Prochain `srv_ts` pour ce magasin : l'horloge murale, mais jamais en arrière
 * ni deux fois la même valeur. Deux fiches écrites dans la même milliseconde
 * auraient sinon le même curseur, et la seconde serait sautée à la page
 * suivante (`srv_ts > since`) — un client perdu, silencieusement. */
export async function nextSrvTs(env, merchant) {
  const now = Date.now();
  try {
    // Kept here as well as schema.sql so an existing deployment heals before
    // its next explicit migration. The UPDATE is the serialized write: unlike
    // SELECT MAX() + Date.now(), concurrent tills cannot receive the same value.
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS client_sync_sequences (merchant TEXT PRIMARY KEY, last_ts INTEGER NOT NULL)'
    ).run();
    const row = await env.DB.prepare('SELECT MAX(srv_ts) AS m FROM clients WHERE merchant = ?')
      .bind(merchant).first();
    const last = (row && row.m) || 0;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO client_sync_sequences (merchant, last_ts) VALUES (?, ?)'
    ).bind(merchant, last).run();
    const allocated = await env.DB.prepare(
      `UPDATE client_sync_sequences
          SET last_ts = CASE WHEN last_ts >= ? THEN last_ts + 1 ELSE ? END
        WHERE merchant = ?
        RETURNING last_ts AS value`
    ).bind(now, now, merchant).first();
    if (allocated && Number(allocated.value) > 0) return Number(allocated.value);
  } catch (_) { return now; }
  return now;
}

async function ensureClientSyncSequence(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS client_sync_sequences (merchant TEXT PRIMARY KEY, last_ts INTEGER NOT NULL)'
  ).run();
}

/* Event writes must allocate the cursor INSIDE their balance/event batch. A
 * cursor reserved before that batch can be overtaken by another till, then an
 * older delayed write can move the client row backwards. The two statements
 * below are deliberately first in the batch; later statements read their
 * committed-in-batch value through a scalar subquery. */
function clientCursorStatements(env, merchant, now) {
  return [
    env.DB.prepare(
      `INSERT OR IGNORE INTO client_sync_sequences (merchant, last_ts)
       SELECT ?, COALESCE(MAX(srv_ts), 0) FROM clients WHERE merchant = ?`
    ).bind(merchant, merchant),
    env.DB.prepare(
      `UPDATE client_sync_sequences
          SET last_ts = CASE
            WHEN last_ts >= MAX(?, COALESCE((SELECT MAX(srv_ts) FROM clients WHERE merchant = ?), 0))
              THEN last_ts + 1
            ELSE MAX(?, COALESCE((SELECT MAX(srv_ts) FROM clients WHERE merchant = ?), 0)) + 1
          END
        WHERE merchant = ?`
    ).bind(now, merchant, now, merchant, merchant),
  ];
}

function clientCursorSql() {
  return '(SELECT last_ts FROM client_sync_sequences WHERE merchant = ?)';
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Pas de backend (hébergement statique, préview sans secrets) → neutre.
  if (!env.DB) return json({ merchant: '', clients: [], cursor: 0 });

  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);

  try {
    const res = await env.DB.prepare(
      `SELECT id, name, phone, email, birthday, gender, city, address, notes, hospitality,
              points, stamps, visits, spend, consent, consent_email, source,
              first_seen, last_seen, updated_ts, srv_ts, deleted
         FROM clients
        WHERE merchant = ? AND srv_ts > ?
        ORDER BY srv_ts ASC
        LIMIT ?`
    ).bind(merchant, since, PAGE).all();

    const rows = (res && res.results) || [];
    let cursor = since;
    rows.forEach((r) => { if (r.srv_ts > cursor) cursor = r.srv_ts; });

    const pageEventRefs = async (table) => {
      if (!rows.length) return [];
      /* D1 caps bound parameters at 100. Bind the whole page map once as JSON
       * and join against it, so a 500-row page cannot turn a read failure into
       * an empty acknowledgement set. The upper bound is the row cursor that
       * was actually returned, not the moving merchant-wide event stream. */
      const page = JSON.stringify(rows.map((row) => ({
        id: String(row.id), srvTs: Number(row.srv_ts) || 0,
      })));
      const eventRows = await env.DB.prepare(
        `WITH page AS (
           SELECT json_extract(value, '$.id') AS client_id,
                  CAST(json_extract(value, '$.srvTs') AS INTEGER) AS row_srv_ts
             FROM json_each(?)
         )
         SELECT event.client_id, event.ref
           FROM ${table} AS event
           JOIN page ON page.client_id = event.client_id
          WHERE event.merchant = ?
            AND event.srv_ts > ?
            AND event.srv_ts <= page.row_srv_ts`
      ).bind(page, merchant, since).all();
      return (eventRows && eventRows.results) || [];
    };

    const refs = await pageEventRefs('client_purchase_events');
    const refsByClient = new Map();
    refs.forEach((row) => {
      const list = refsByClient.get(row.client_id) || [];
      list.push(row.ref); refsByClient.set(row.client_id, list);
    });

    const rewardRefs = await pageEventRefs('client_reward_events');
    const rewardRefsByClient = new Map();
    rewardRefs.forEach((row) => {
      const list = rewardRefsByClient.get(row.client_id) || [];
      list.push(row.ref); rewardRefsByClient.set(row.client_id, list);
    });

    return json({
      merchant,
      clients: rows.map((row) => ({ ...row,
        purchase_refs: refsByClient.get(row.id) || [],
        reward_refs: rewardRefsByClient.get(row.id) || [],
      })),
      cursor,
      // Le client rappelle tant que `more` est vrai : un carnet de 2 000 fiches
      // sur un navigateur neuf ne doit pas s'arrêter à la première page.
      more: rows.length === PAGE,
    });
  } catch (_) {
    /* A row page without its event acknowledgements is not a valid sync
     * response: advancing the client cursor would strand pending purchases or
     * redemptions. Missing legacy tables and reference-query failures therefore
     * stay explicit and retryable; the client must not merge a partial page. */
    return json({ error: 'sync-unavailable', merchant, cursor: since }, 503);
  }
}

async function applyPurchase(env, merchant, raw) {
  const purchase = raw && typeof raw === 'object' ? raw : {};
  const clientId = str(purchase.clientId || purchase.client_id, 64);
  const ref = str(purchase.ref, 120).replace(/[^A-Za-z0-9:_-]/g, '');
  const amount = money(purchase.amount, 1e9);
  if (!clientId || !ref) return json({ error: 'client-and-ref-required' }, 400);
  await ensurePurchaseEvents(env);
  const previous = await env.DB.prepare(
    'SELECT client_id, points, stamps, amount FROM client_purchase_events WHERE merchant = ? AND ref = ?'
  ).bind(merchant, ref).first();
  if (previous) {
    if (previous.client_id !== clientId) return json({ error: 'ref-conflict' }, 409);
    if (Math.round(Number(previous.amount || 0) * 100) !== Math.round(amount * 100)) {
      return json({ error: 'ref-conflict' }, 409);
    }
    return json({ ok: true, replayed: true, points: Number(previous.points || 0), stamps: Number(previous.stamps || 0) });
  }
  const client = await env.DB.prepare(
    'SELECT id FROM clients WHERE merchant = ? AND id = ? AND deleted = 0'
  ).bind(merchant, clientId).first();
  if (!client) return json({ error: 'client-not-found' }, 404);
  const cfgRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'fidelity'")
    .bind(merchant).first();
  const cfg = (() => { try { return JSON.parse(cfgRow && cfgRow.data || '{}') || {}; } catch (_) { return {}; } })();
  const points = cfg.model === 'amount' || !cfg.model
    ? Math.round(amount * Math.max(0, Number(cfg.amount && cfg.amount.perMad) || 1)) : 0;
  const stamps = cfg.model === 'visit' || cfg.model === 'product' ? 1 : 0;
  const now = Date.now();
  if (!env.DB || typeof env.DB.batch !== 'function') return json({ error: 'atomic-write-required' }, 503);
  try { await ensureClientSyncSequence(env); } catch (_) { return json({ error: 'atomic-write-required' }, 503); }
  const cursor = clientCursorSql();
  const results = await env.DB.batch([
    ...clientCursorStatements(env, merchant, now),
    env.DB.prepare(`UPDATE clients SET points = points + ?, stamps = stamps + ?,
      visits = visits + 1, spend = spend + ?, first_seen = CASE WHEN first_seen > 0 THEN first_seen ELSE ? END,
      last_seen = ?, updated_ts = ?, srv_ts = ${cursor}
      WHERE merchant = ? AND id = ? AND deleted = 0
        AND NOT EXISTS (SELECT 1 FROM client_purchase_events WHERE merchant = ? AND ref = ?)`)
      .bind(points, stamps, amount, now, now, now, merchant, merchant, clientId, merchant, ref),
    env.DB.prepare(`INSERT OR IGNORE INTO client_purchase_events
      (merchant, ref, client_id, amount, points, stamps, visits, created_ts, srv_ts)
      SELECT ?, ?, ?, ?, ?, ?, 1, ?, ${cursor} WHERE changes() > 0`)
      .bind(merchant, ref, clientId, amount, points, stamps, now, merchant),
  ]);
  if (!Number(results[2] && results[2].meta && results[2].meta.changes)) {
    const replay = await env.DB.prepare(
      'SELECT client_id, points, stamps FROM client_purchase_events WHERE merchant = ? AND ref = ?'
    ).bind(merchant, ref).first();
    if (replay && replay.client_id === clientId) {
      return json({ ok: true, replayed: true, points: Number(replay.points || 0), stamps: Number(replay.stamps || 0) });
    }
    return json({ error: 'purchase-write-failed' }, 503);
  }
  if (!Number(results[3] && results[3].meta && results[3].meta.changes)) {
    return json({ error: 'purchase-write-failed' }, 503);
  }
  return json({ ok: true, points, stamps, visits: 1, spend: amount });
}

async function applyRedemption(env, merchant, raw) {
  const redemption = raw && typeof raw === 'object' ? raw : {};
  const clientId = str(redemption.clientId || redemption.client_id, 64);
  const ref = str(redemption.ref, 120).replace(/[^A-Za-z0-9:_-]/g, '');
  if (!clientId || !ref) return json({ error: 'client-and-ref-required' }, 400);
  await ensureRewardEvents(env);
  const previous = await env.DB.prepare(
    'SELECT client_id, points_delta, stamps_delta FROM client_reward_events WHERE merchant = ? AND ref = ?'
  ).bind(merchant, ref).first();
  if (previous) {
    if (previous.client_id !== clientId) return json({ error: 'ref-conflict' }, 409);
    return json({ ok: true, replayed: true, pointsDelta: Number(previous.points_delta || 0), stampsDelta: Number(previous.stamps_delta || 0) });
  }
  const client = await env.DB.prepare(
    'SELECT points, stamps FROM clients WHERE merchant = ? AND id = ? AND deleted = 0'
  ).bind(merchant, clientId).first();
  if (!client) return json({ error: 'client-not-found' }, 404);
  const cfgRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'fidelity'")
    .bind(merchant).first();
  const cfg = (() => { try { return JSON.parse(cfgRow && cfgRow.data || '{}') || {}; } catch (_) { return {}; } })();
  let pointsDelta = 0;
  let stampsDelta = 0;
  if (cfg.model === 'amount' || !cfg.model) {
    pointsDelta = Math.max(1, Math.round(Number(cfg.amount && cfg.amount.threshold) || 100));
  } else {
    stampsDelta = Math.max(1, Math.round(Number(
      cfg.model === 'product' ? cfg.product && cfg.product.target : cfg.visit && cfg.visit.target
    ) || 10));
  }
  if (Number(client.points || 0) < pointsDelta || Number(client.stamps || 0) < stampsDelta) {
    return json({ error: 'reward-not-ready' }, 409);
  }
  const now = Date.now();
  if (!env.DB || typeof env.DB.batch !== 'function') return json({ error: 'atomic-write-required' }, 503);
  try { await ensureClientSyncSequence(env); } catch (_) { return json({ error: 'atomic-write-required' }, 503); }
  const cursor = clientCursorSql();
  const results = await env.DB.batch([
    ...clientCursorStatements(env, merchant, now),
    env.DB.prepare(`UPDATE clients SET points = points - ?, stamps = stamps - ?, updated_ts = ?, srv_ts = ${cursor}
      WHERE merchant = ? AND id = ? AND deleted = 0
        AND points >= ? AND stamps >= ?
        AND NOT EXISTS (SELECT 1 FROM client_reward_events WHERE merchant = ? AND ref = ?)`)
      .bind(pointsDelta, stampsDelta, now, merchant, merchant, clientId, pointsDelta, stampsDelta, merchant, ref),
    env.DB.prepare(`INSERT OR IGNORE INTO client_reward_events
      (merchant, ref, client_id, points_delta, stamps_delta, created_ts, srv_ts)
      SELECT ?, ?, ?, ?, ?, ?, ${cursor} WHERE changes() > 0`)
      .bind(merchant, ref, clientId, pointsDelta, stampsDelta, now, merchant),
  ]);
  if (!Number(results[2] && results[2].meta && results[2].meta.changes)) {
    const replay = await env.DB.prepare(
      'SELECT client_id, points_delta, stamps_delta FROM client_reward_events WHERE merchant = ? AND ref = ?'
    ).bind(merchant, ref).first();
    if (replay && replay.client_id === clientId) {
      return json({ ok: true, replayed: true, pointsDelta: Number(replay.points_delta || 0), stampsDelta: Number(replay.stamps_delta || 0) });
    }
    return json({ error: 'reward-write-failed' }, 503);
  }
  if (!Number(results[3] && results[3].meta && results[3].meta.changes)) {
    return json({ error: 'reward-write-failed' }, 503);
  }
  return json({ ok: true, pointsDelta, stampsDelta });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  if (body && body.redemption) {
    try { return await applyRedemption(env, merchant, body.redemption); }
    catch (_) { return json({ error: 'reward-write-failed' }, 503); }
  }
  if (body && body.purchase) {
    try { return await applyPurchase(env, merchant, body.purchase); }
    catch (_) { return json({ error: 'purchase-write-failed' }, 503); }
  }

  const c = sanitize(body);
  if (!c.id) return json({ error: 'no-id' }, 400);

  /* A normal caisse snapshot is a profile transport, not a loyalty write.
   * An offline browser can have already applied a purchase locally before its
   * initial client-create request reaches D1; accepting those optimistic
   * totals and then applying the additive purchase event would count it twice.
   * Deliberate data imports retain their supplied opening totals through the
   * explicit `financialImport` flag (or the existing `source: 'import'` label),
   * while every ordinary sync-created row starts from ledger-derived zeroes. */
  const preserveImportedTotals = body && body.financialImport === true || c.source === 'import';
  const initialPoints = preserveImportedTotals ? c.points : 0;
  const initialStamps = preserveImportedTotals ? c.stamps : 0;
  const initialVisits = preserveImportedTotals ? c.visits : 0;
  const initialSpend = preserveImportedTotals ? c.spend : 0;

  const srv = await nextSrvTs(env, merchant);

  try {
    await env.DB.prepare(
      `INSERT INTO clients (merchant, id, name, phone, email, birthday, gender, city,
                            address, notes, hospitality, points, stamps, visits, spend, consent,
                            consent_email, source, first_seen, last_seen, updated_ts,
                            srv_ts, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(merchant, id) DO UPDATE SET
         name = excluded.name, phone = excluded.phone, email = excluded.email,
         birthday = excluded.birthday, gender = excluded.gender, city = excluded.city,
         address = excluded.address, notes = excluded.notes, hospitality = excluded.hospitality,
         consent = excluded.consent, consent_email = excluded.consent_email,
         source = excluded.source, first_seen = excluded.first_seen,
         last_seen = excluded.last_seen, updated_ts = excluded.updated_ts,
         srv_ts = excluded.srv_ts, deleted = 0
       WHERE excluded.updated_ts >= clients.updated_ts`
    ).bind(
      merchant, c.id, c.name, c.phone, c.email, c.birthday, c.gender, c.city,
      c.address, c.notes, c.hospitality, initialPoints, initialStamps, initialVisits, initialSpend, c.consent,
      c.consent_email, c.source, c.first_seen, c.last_seen, c.updated_ts, srv
    ).run();
  } catch (_) {
    // Table absente → 503. Le client garde la fiche dans sa file et retentera :
    // rien n'est perdu, la remontée est seulement remise à plus tard.
    return json({ error: 'unmigrated' }, 503);
  }

  return json({ ok: true, merchant, id: c.id, cursor: srv });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  const url = new URL(request.url);
  // Une suppression est une écriture : un slug inconnu ne doit surtout pas
  // retomber sur le magasin du compte — on effacerait la fiche d'un client chez
  // le voisin de palier. Voir tenantFor › strict.
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'), { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  const id = str(url.searchParams.get('id'), 64);
  if (!id) return json({ error: 'no-id' }, 400);

  const srv = await nextSrvTs(env, merchant);

  try {
    // Pierre tombale. On efface aussi les données personnelles au passage : garder
    // le nom et le téléphone d'un client supprimé « pour la synchro » serait
    // exactement ce que la suppression était censée empêcher. Il ne reste que
    // l'identifiant, le temps que les autres appareils apprennent.
    await env.DB.prepare(
      `UPDATE clients
          SET deleted = 1, name = '', phone = '', email = '', birthday = '',
              gender = '', city = '', address = '', notes = '', hospitality = '{}',
              updated_ts = CASE WHEN updated_ts >= ? THEN updated_ts + 1 ELSE ? END,
              srv_ts = ?
        WHERE merchant = ? AND id = ?`
    ).bind(Date.now(), Date.now(), srv, merchant, id).run();
  } catch (_) {
    return json({ error: 'unmigrated' }, 503);
  }

  return json({ ok: true, merchant, id, deleted: true, cursor: srv });
}
