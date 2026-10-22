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
const purchaseSchemaReady = new WeakSet();
const rewardSchemaReady = new WeakSet();

async function ensurePurchaseEvents(env) {
  if (purchaseSchemaReady.has(env.DB)) return;
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
  try { await env.DB.prepare("ALTER TABLE client_purchase_events ADD COLUMN method TEXT NOT NULL DEFAULT ''").run(); } catch (_) {}
  try { await env.DB.prepare("ALTER TABLE client_purchase_events ADD COLUMN items TEXT NOT NULL DEFAULT '[]'").run(); } catch (_) {}
  try { await env.DB.prepare("ALTER TABLE client_purchase_events ADD COLUMN sale_ref TEXT NOT NULL DEFAULT ''").run(); } catch (_) {}
  purchaseSchemaReady.add(env.DB);
}

async function ensureRewardEvents(env) {
  if (rewardSchemaReady.has(env.DB)) return;
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
  rewardSchemaReady.add(env.DB);
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
    await ensurePurchaseEvents(env);
    await ensureRewardEvents(env);
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
    await ensurePurchaseEvents(env);
    await ensureRewardEvents(env);
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

    const page = JSON.stringify(rows.map((row) => ({ id: String(row.id) })));
    const historyRows = rows.length ? await env.DB.prepare(
      `WITH page AS (SELECT json_extract(value, '$.id') AS client_id FROM json_each(?)),
            ranked AS (
              SELECT event.client_id, event.ref, event.amount, event.method, event.items,
                     event.sale_ref, event.created_ts,
                     ROW_NUMBER() OVER (PARTITION BY event.client_id ORDER BY event.created_ts DESC) AS rn
                FROM client_purchase_events AS event
                JOIN page ON page.client_id = event.client_id
               WHERE event.merchant = ?
                 AND event.ref NOT LIKE 'refund:%'
            )
       SELECT client_id, ref, amount, method, items, sale_ref, created_ts
         FROM ranked WHERE rn <= 50 ORDER BY created_ts DESC`
    ).bind(page, merchant).all() : { results: [] };
    const historyByClient = new Map();
    ((historyRows && historyRows.results) || []).forEach((row) => {
      const list = historyByClient.get(row.client_id) || [];
      let items = []; try { items = JSON.parse(row.items || '[]'); } catch (_) {}
      list.push({ ref: row.ref, saleRef: row.sale_ref || '', amount: Number(row.amount || 0), method: row.method || '', items, createdAt: Number(row.created_ts || 0) });
      historyByClient.set(row.client_id, list);
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
        purchase_history: historyByClient.get(row.id) || [],
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

/* Le programme est-il ouvert ? Un modèle choisi par le commerçant, pas le
 * défaut que la caisse déduit du métier (`auto`). */
const loyaltyOn = (cfg) => !!(cfg && cfg.model && !cfg.auto);

/* Les points ne s'arrondissent jamais vers le haut : 99,50 MAD à un point par
 * dirham donnent 99 points, pas les 100 d'un seuil de récompense. */
const pointsFor = (amount, cfg) => Math.max(0,
  Math.floor(amount * Math.max(0, Number(cfg && cfg.amount && cfg.amount.perMad) || 1) + 1e-6));

/* « 10 cafés = 1 offert » : le tampon se gagne sur l'article nommé, pas sur
 * chaque passage. Le nom est saisi en clair par le commerçant (« Café ») ; il
 * vaut pour toute ligne qui le contient comme mot, accents et casse ignorés
 * (« Café noir », « CAFE CREME » oui ; « Décaféiné » non). */
const foldName = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
export function qualifyingQty(cfg, items) {
  const want = foldName(cfg && cfg.product && cfg.product.item);
  if (!want) return 0;
  return (Array.isArray(items) ? items : []).reduce((n, item) => {
    const name = ' ' + foldName(item && item.name) + ' ';
    return name.includes(' ' + want + ' ') ? n + Math.max(0, Math.round(Number(item && item.qty) || 0)) : n;
  }, 0);
}
/* Tampons d'un achat. Sans lignes (passage saisi à la main au tableau de bord,
 * ancienne caisse), un passage reste un tampon ; avec des lignes, la carte
 * produit ne compte que l'article choisi. */
export function stampsFor(cfg, items) {
  if (!loyaltyOn(cfg)) return 0;
  if (cfg.model === 'visit') return 1;
  if (cfg.model !== 'product') return 0;
  return Array.isArray(items) && items.length ? qualifyingQty(cfg, items) : 1;
}

async function applyPurchase(env, merchant, raw) {
  const purchase = raw && typeof raw === 'object' ? raw : {};
  const clientId = str(purchase.clientId || purchase.client_id, 64);
  const ref = str(purchase.ref, 120).replace(/[^A-Za-z0-9:_-]/g, '');
  const amount = money(purchase.amount, 1e9);
  const method = str(purchase.method, 32);
  const saleRef = str(purchase.saleRef || purchase.sale_ref, 80);
  const items = JSON.stringify((Array.isArray(purchase.items) ? purchase.items : []).slice(0, 100).map((item) => ({
    name: str(item && item.name, 120), qty: int(item && item.qty, 100000), total: money(item && item.total, 1e9),
  })));
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
  /* Pas de programme enregistré = pas de programme. « Aucun modèle » valait
   * « un point par dirham » : chaque passage d'un commerce qui n'avait jamais
   * réglé de fidélité accumulait des points, et la caisse finissait par
   * annoncer une récompense que personne n'avait promise. Le passage et la
   * dépense comptent toujours ; les points et tampons, seulement si le
   * commerçant a choisi un programme (un défaut déduit, `auto`, n'en est pas un). */
  const on = loyaltyOn(cfg);
  const points = on && cfg.model === 'amount' ? pointsFor(amount, cfg) : 0;
  const stamps = stampsFor(cfg, purchase.items);
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
      (merchant, ref, client_id, amount, points, stamps, visits, created_ts, srv_ts, method, items, sale_ref)
      SELECT ?, ?, ?, ?, ?, ?, 1, ?, ${cursor}, ?, ?, ? WHERE changes() > 0`)
      .bind(merchant, ref, clientId, amount, points, stamps, now, merchant, method, items, saleRef),
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

/* Un retour contre avoir rend l'argent à la cliente sous une autre forme : sans
 * contre-écriture, sa dépense et ses points comptaient l'achat, puis une seconde
 * fois l'avoir dépensé (250 MAD payés, 500 au carnet). Le retour est un événement
 * du même registre, avec sa propre clé : rejoué, il ne s'applique qu'une fois.
 * Il ne reprend jamais plus que l'achat de CE ticket pour CETTE cliente, moins
 * les retours déjà passés, et ses points au prorata de ceux réellement gagnés
 * (le programme a pu changer depuis). Un ticket que le registre ne connaît pas
 * est acquitté sans effet : rien n'avait été compté, rien n'est repris. */
async function applyRefund(env, merchant, raw, attempt = 0) {
  const refund = raw && typeof raw === 'object' ? raw : {};
  const clientId = str(refund.clientId || refund.client_id, 64);
  const ref = str(refund.ref, 120).replace(/[^A-Za-z0-9:_-]/g, '');
  const amount = money(refund.amount, 1e9);
  const saleRef = str(refund.saleRef || refund.sale_ref, 80);
  const items = JSON.stringify((Array.isArray(refund.items) ? refund.items : []).slice(0, 100).map((item) => ({
    name: str(item && item.name, 120), qty: int(item && item.qty, 100000), total: money(item && item.total, 1e9),
  })));
  if (!clientId || !ref.startsWith('refund:') || !saleRef || !(amount > 0)) return json({ error: 'refund-fields-required' }, 400);
  await ensurePurchaseEvents(env);
  const previous = await env.DB.prepare(
    'SELECT client_id, amount, points FROM client_purchase_events WHERE merchant = ? AND ref = ?'
  ).bind(merchant, ref).first();
  if (previous) {
    if (previous.client_id !== clientId) return json({ error: 'ref-conflict' }, 409);
    return json({ ok: true, replayed: true, spend: Number(previous.amount || 0), points: Number(previous.points || 0) });
  }
  const client = await env.DB.prepare(
    'SELECT id, points, stamps FROM clients WHERE merchant = ? AND id = ? AND deleted = 0'
  ).bind(merchant, clientId).first();
  if (!client) return json({ error: 'client-not-found' }, 404);
  const sale = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN ref NOT LIKE 'refund:%' THEN amount ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN ref NOT LIKE 'refund:%' THEN points ELSE 0 END), 0) AS earned,
            COALESCE(SUM(CASE WHEN ref NOT LIKE 'refund:%' THEN stamps ELSE 0 END), 0) AS stamped,
            COALESCE(SUM(CASE WHEN ref LIKE 'refund:%' THEN -stamps ELSE 0 END), 0) AS unstamped,
            COALESCE(SUM(CASE WHEN ref LIKE 'refund:%' THEN -amount ELSE 0 END), 0) AS refunded,
            COALESCE(SUM(CASE WHEN ref LIKE 'refund:%' THEN -points ELSE 0 END), 0) AS clawed
       FROM client_purchase_events WHERE merchant = ? AND client_id = ? AND sale_ref = ?`
  ).bind(merchant, clientId, saleRef).first();
  const paid = Number(sale && sale.paid || 0), earned = Number(sale && sale.earned || 0);
  const take = Math.max(0, Math.min(amount, Math.round((paid - Number(sale && sale.refunded || 0)) * 100) / 100));
  // Le prorata cumulé récupère aussi le dernier point après plusieurs petits retours.
  const claw = paid > 0 && earned > 0
    ? Math.max(0, Math.min(Math.round(earned * (Number(sale && sale.refunded || 0) + take) / paid) - Number(sale && sale.clawed || 0), earned - Number(sale && sale.clawed || 0))) : 0;
  /* Les tampons de CE ticket suivent le retour : sur une carte produit, autant
   * que d'articles choisis rendus ; sinon (carte passages, retour sans lignes),
   * seulement quand le ticket est rendu en entier. Jamais plus que gagné. */
  const stampsLeft = Math.max(0, Number(sale && sale.stamped || 0) - Number(sale && sale.unstamped || 0));
  let unstamp = 0;
  if (stampsLeft > 0) {
    const cfgRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'fidelity'")
      .bind(merchant).first();
    const cfg = (() => { try { return JSON.parse(cfgRow && cfgRow.data || '{}') || {}; } catch (_) { return {}; } })();
    const lines = Array.isArray(refund.items) ? refund.items : [];
    const whole = paid > 0 && take >= Math.round((paid - Number(sale && sale.refunded || 0)) * 100) / 100 - 0.004;
    unstamp = cfg.model === 'product' && lines.length
      ? Math.min(stampsLeft, qualifyingQty(cfg, lines))
      : (whole ? stampsLeft : 0);
  }
  /* Never take back more than the card still holds. A customer who earned
   * 300 points, spent 100 on a reward, then returned the ticket has 200 left:
   * the return takes 200, and the event says 200. The balance used to be
   * floored at 0 while the event recorded the full 300, so the history summed
   * below the balance forever after. The guard on the UPDATE keeps the two
   * equal if the balance moved since the read: nothing is written, and the
   * till retries against the new balance. */
  const pointsTake = Math.min(claw, Math.max(0, Number(client.points) || 0));
  const stampsTake = Math.min(unstamp, Math.max(0, Number(client.stamps) || 0));
  const now = Date.now();
  if (!env.DB || typeof env.DB.batch !== 'function') return json({ error: 'atomic-write-required' }, 503);
  try { await ensureClientSyncSequence(env); } catch (_) { return json({ error: 'atomic-write-required' }, 503); }
  const cursor = clientCursorSql();
  const results = await env.DB.batch([
    ...clientCursorStatements(env, merchant, now),
    env.DB.prepare(`UPDATE clients SET points = points - ?, stamps = stamps - ?,
      spend = MAX(0, spend - ?), updated_ts = ?, srv_ts = ${cursor}
      WHERE merchant = ? AND id = ? AND deleted = 0 AND points >= ? AND stamps >= ?
        AND NOT EXISTS (SELECT 1 FROM client_purchase_events WHERE merchant = ? AND ref = ?)
        AND ROUND(COALESCE((SELECT -SUM(amount) FROM client_purchase_events
          WHERE merchant = ? AND client_id = ? AND sale_ref = ? AND ref LIKE 'refund:%'), 0) * 100) = ?`)
      .bind(pointsTake, stampsTake, take, now, merchant, merchant, clientId, pointsTake, stampsTake, merchant, ref,
        merchant, clientId, saleRef, Math.round(Number(sale && sale.refunded || 0) * 100)),
    env.DB.prepare(`INSERT OR IGNORE INTO client_purchase_events
      (merchant, ref, client_id, amount, points, stamps, visits, created_ts, srv_ts, method, items, sale_ref)
      SELECT ?, ?, ?, ?, ?, ?, 0, ?, ${cursor}, 'retour', ?, ? WHERE changes() > 0`)
      .bind(merchant, ref, clientId, -take, -pointsTake, -stampsTake, now, merchant, items, saleRef),
  ]);
  if (!Number(results[2] && results[2].meta && results[2].meta.changes)) {
    const replay = await env.DB.prepare('SELECT client_id FROM client_purchase_events WHERE merchant = ? AND ref = ?')
      .bind(merchant, ref).first();
    if (replay && replay.client_id === clientId) return json({ ok: true, replayed: true });
    // Relire après une concurrence : ne jamais reprendre le plafond périmé.
    if (attempt < 3) return applyRefund(env, merchant, raw, attempt + 1);
    return json({ error: 'refund-write-failed' }, 503);
  }
  if (!Number(results[3] && results[3].meta && results[3].meta.changes)) return json({ error: 'refund-write-failed' }, 503);
  return json({ ok: true, spend: -take, points: -pointsTake, stamps: -stampsTake });
}

/* Une vente sortie des livres (console « void », annulation gérant, réouverture
 * de table) ne laisse pas ses points sur la carte. Chaque achat fidélité de CE
 * ticket est repris par un retour « refund:void:… » qui passe par applyRefund :
 * même plafond (jamais plus que gagné, jamais plus que la carte ne tient),
 * même idempotence, même registre. Remettre la vente aux livres rend
 * exactement ce retour (« refund:unvoid:… »), donc le registre se somme
 * toujours au solde, et un retour réel posé plus tard voit le ticket entier.
 * Best effort : la vente est déjà sortie, un échec ici ne la remet pas. */
/* SHA-256 of client and sale: fixed length, no separator ambiguity, no
 * practical collision, so one sale's take-back can never replay another's. */
async function voidTail(clientId, saleId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${clientId}\u0000${saleId}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/* Void number n of a sale follows its n-th restore, so void n and restore n
 * share one key without relying on the clock, and a retried void replays. */
async function voidRound(env, merchant, clientId, tail) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM client_purchase_events
      WHERE merchant = ? AND client_id = ? AND substr(ref, 1, 14) = 'refund:unvoid:' AND substr(ref, -65) = ?`
  ).bind(merchant, clientId, ':' + tail).first();
  return Number(row && row.n || 0);
}
async function saleLoyaltyGroups(env, merchant, sale) {
  const id = String(sale && sale.id || ''), ref = String(sale && sale.ref || '');
  if (!env || !env.DB || !merchant || !id) return [];
  await ensurePurchaseEvents(env);
  // The event named after this sale first: split payments of one receipt
  // share its number, and voiding one part must not take back the others.
  // Exact matches only: no LIKE pattern built from an id.
  const own = await env.DB.prepare(
    `SELECT client_id, sale_ref, COALESCE(SUM(amount), 0) AS paid FROM client_purchase_events
      WHERE merchant = ? AND substr(ref, 1, 7) <> 'refund:' AND sale_ref <> ''
        AND (ref = ? OR (substr(ref, 1, 9) = 'purchase:' AND substr(ref, -length(?)) = ?))
      GROUP BY client_id, sale_ref`
  ).bind(merchant, id, ':' + id, ':' + id).all();
  if (own && own.results && own.results.length) return own.results;
  /* Older tills named the event after the receipt only. Use the receipt
   * number just when no other sale of this store carries it. */
  if (ref && ref !== id) {
    const holders = await env.DB.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant = ? AND ref = ?')
      .bind(merchant, ref).first();
    if (Number(holders && holders.n || 0) > 1) return [];
  }
  const rows = await env.DB.prepare(
    `SELECT client_id, sale_ref, COALESCE(SUM(amount), 0) AS paid FROM client_purchase_events
      WHERE merchant = ? AND substr(ref, 1, 7) <> 'refund:' AND (sale_ref = ? OR (? <> '' AND sale_ref = ?))
      GROUP BY client_id, sale_ref`
  ).bind(merchant, id, ref, ref).all();
  return (rows && rows.results) || [];
}
export async function voidSaleLoyalty(env, merchant, sale) {
  let taken = 0;
  try {
    for (const group of await saleLoyaltyGroups(env, merchant, sale)) {
      if (!(Number(group.paid) > 0)) continue;
      const tail = await voidTail(group.client_id, sale.id);
      const n = await voidRound(env, merchant, group.client_id, tail);
      const res = await applyRefund(env, merchant, {
        clientId: group.client_id, ref: `refund:void:${n}:${tail}`,
        amount: Number(group.paid), saleRef: group.sale_ref,
      });
      if (res && res.ok) taken++;
    }
  } catch (_) { /* the void itself is already committed */ }
  return taken;
}
export async function restoreSaleLoyalty(env, merchant, sale) {
  let given = 0;
  try {
    if (typeof env.DB.batch !== 'function') return 0;
    await ensureClientSyncSequence(env);
    const cursor = clientCursorSql();
    for (const group of await saleLoyaltyGroups(env, merchant, sale)) {
      const tail = await voidTail(group.client_id, sale.id);
      const n = await voidRound(env, merchant, group.client_id, tail);
      const ref = `refund:void:${n}:${tail}`, back = `refund:unvoid:${n}:${tail}`;
      const ev = await env.DB.prepare(
        'SELECT amount, points, stamps FROM client_purchase_events WHERE merchant = ? AND ref = ? AND client_id = ?'
      ).bind(merchant, ref, group.client_id).first();
      if (!ev) continue;
      const amount = -Number(ev.amount || 0), points = -Number(ev.points || 0), stamps = -Number(ev.stamps || 0);
      const now = Date.now();
      const results = await env.DB.batch([
        ...clientCursorStatements(env, merchant, now),
        env.DB.prepare(`UPDATE clients SET points = points + ?, stamps = stamps + ?, spend = spend + ?,
          updated_ts = ?, srv_ts = ${cursor}
          WHERE merchant = ? AND id = ? AND deleted = 0
            AND NOT EXISTS (SELECT 1 FROM client_purchase_events WHERE merchant = ? AND ref = ?)`)
          .bind(points, stamps, amount, now, merchant, merchant, group.client_id, merchant, back),
        env.DB.prepare(`INSERT OR IGNORE INTO client_purchase_events
          (merchant, ref, client_id, amount, points, stamps, visits, created_ts, srv_ts, method, items, sale_ref)
          SELECT ?, ?, ?, ?, ?, ?, 0, ?, ${cursor}, 'retour', '[]', ? WHERE changes() > 0`)
          .bind(merchant, back, group.client_id, amount, points, stamps, now, merchant, group.sale_ref),
      ]);
      if (Number(results[3] && results[3].meta && results[3].meta.changes)) given++;
    }
  } catch (_) { /* the restore itself is already committed */ }
  return given;
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
  /* Sans programme ouvert, il n'y a rien à remettre : la caisse le refusait
   * déjà, l'API acceptait encore 100 points comme si un seuil existait. */
  if (!loyaltyOn(cfg)) return json({ error: 'loyalty-off' }, 409);
  let pointsDelta = 0;
  let stampsDelta = 0;
  if (cfg.model === 'amount') {
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
    return json({ error: 'reward-not-ready' }, 409);
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

  /* Pending hotels may prepare ordinary Hospitality+ profiles before opening.
   * Financial loyalty mutations still cross the normal operational gate below;
   * this exception cannot spend points or record purchases. */
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true, allowPending: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const operational = await tenantFor(request, env, merchant, { strict: true }) === merchant;

  if (body && body.redemption) {
    if (!operational) return json({ error: 'unauthorized' }, 401);
    try { return await applyRedemption(env, merchant, body.redemption); }
    catch (_) { return json({ error: 'reward-write-failed' }, 503); }
  }
  if (body && body.refund) {
    if (!operational) return json({ error: 'unauthorized' }, 401);
    try { return await applyRefund(env, merchant, body.refund); }
    catch (_) { return json({ error: 'refund-write-failed' }, 503); }
  }
  if (body && body.purchase) {
    if (!operational) return json({ error: 'unauthorized' }, 401);
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
  const preserveImportedTotals = operational && (body && body.financialImport === true || c.source === 'import');
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
       -- Profile sync must never restore a tombstone, even with a future device clock.
       WHERE clients.deleted = 0 AND excluded.updated_ts >= clients.updated_ts`
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
