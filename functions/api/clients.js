import { createClientEvents } from './clients/_events.js';
export { qualifyingQty, stampsFor } from './_rules-loyalty.js';
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
// Concurrence : profileBase identifies fields actually edited by a device.
// Only those fields move, atomically, in server write order. Device clocks
// never arbitrate profile conflicts. Legacy partial payloads edit supplied keys.
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

import { json, activeEmployee } from '../auth/_lib.js';
import { tenantFor, storeOperationalState } from './_private.js';
import { clientAudit, mayRecordReward } from './_client-audit.js';
import { phoneKey } from './_phone.js';
import { readsIdentityDocuments, withoutDocumentNumber, keepStoredDocument } from './_client-identity.js';
import { mayMergeClients, mergeClients } from './_client-merge.js';
import { spendCentsOf, toCents } from './_spend-cents.js';

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const int = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const money = (v, max = 1e9) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n * 100) / 100));
};
const PAGE = 500;

// Share cursor allocation and alias resolution without a circular route import.
const { applyPurchase, applyRefund, applyRedemption, voidSaleLoyalty, restoreSaleLoyalty } = createClientEvents({
  str, money, resolveClientId, clientCursorStatements, clientCursorSql,
  missingEventTable: error => /no such table/i.test(String(error && error.message || error)),
});
export { voidSaleLoyalty, restoreSaleLoyalty };

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

/* Étiquettes du carnet (« vip », « grossiste »…) : un tableau JSON de 20
 * libellés au plus, 40 caractères chacun, sans vide ni doublon. */
function tagsJson(value) {
  const out = [];
  for (const tag of Array.isArray(value) ? value : []) {
    const label = str(typeof tag === 'string' || typeof tag === 'number' ? tag : '', 40).trim();
    if (label && !out.includes(label)) out.push(label);
    if (out.length >= 20) break;
  }
  return JSON.stringify(out);
}
function tagsList(value) {
  // Stored unions can exceed one profile's input limit; never truncate reads.
  try { const tags = JSON.parse(value || '[]'); return Array.isArray(tags) ? tags.filter(tag => typeof tag === 'string') : []; } catch (_) { return []; }
}
/* La colonne `tags` arrive par migrations/0009_client_tags.sql. Tant qu'elle
 * n'est pas appliquée en production, lecture et écriture retombent sur
 * l'ancienne forme : les étiquettes restent locales, comme avant, rien ne casse. */
const missingColumn = (error) => /no such column|has no column named/i.test(String((error && error.message) || error || ''));

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
    tags: tagsJson(raw && raw.tags),
    points: int(raw && raw.points, 1e9),
    stamps: int(raw && raw.stamps, 1e6),
    visits: int(raw && raw.visits, 1e6),
    // SQLite's INTEGER affinity stores a fractional JS number as REAL when it
    // cannot represent it as an integer. Keep the legacy column for migration
    // compatibility, but never round a legitimate centime away at the edge.
    spend: money(raw && raw.spend, 1e10),
    consent: (raw && raw.consent) ? 1 : 0,
    consent_email: (raw && raw.consentEmail) ? 1 : 0,
    // « merged:<id> » est réservé aux fiches fusionnées par le serveur (voir
    // mergeIntoTwin) : un appareil ne peut pas fabriquer un alias.
    source: (str(raw && raw.source, 24).startsWith('merged:') ? '' : str(raw && raw.source, 24)) || 'caisse',
    first_seen: int(raw && raw.firstSeen, 1e15),
    last_seen: int(raw && raw.lastSeen, 1e15),
    // Device timestamps are untrusted, including future clocks.
    updated_ts: Date.now(),
  };
}

/* Prochain `srv_ts` pour ce magasin : l'horloge murale, mais jamais en arrière
 * ni deux fois la même valeur. Deux fiches écrites dans la même milliseconde
 * auraient sinon le même curseur, et la seconde serait sautée à la page
 * suivante (`srv_ts > since`) — un client perdu, silencieusement. */
export async function nextSrvTs(env, merchant) {
  const now = Date.now();
  try {
    // The sequence table is installed by migrations. The UPDATE below remains
    // the serialized write, so concurrent tills receive different cursors.
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

  let merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant && url.searchParams.has('auditClient')) {
    const employee = await activeEmployee(request, env, url.searchParams.get('merchant'));
    if (employee) merchant = employee.merchant;
  }
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);

  try {
    if (url.searchParams.has('auditClient')) return await clientAudit(request, env, merchant, await resolveClientId(env, merchant, str(url.searchParams.get('auditClient'), 64)));
    const readPage = (tags, cents = true) => env.DB.prepare(
      `SELECT id, name, phone, email, birthday, gender, city, address, notes, hospitality,${tags ? ' tags,' : ''}
              points, stamps, visits, spend,${cents ? ' spend_cents,' : ''} consent, consent_email, source,
              first_seen, last_seen, updated_ts, srv_ts, deleted
         FROM clients
        WHERE merchant = ? AND srv_ts > ?
        ORDER BY srv_ts ASC
        LIMIT ?`
    ).bind(merchant, since, PAGE).all();
    let res;
    try { res = await readPage(true); }
    catch (error) {
      if (!missingColumn(error)) throw error;
      /* spend_cents arrives with migrations/0020; until it is applied the page
         is read without it and the float column answers (spendCentsOf). */
      try { res = await readPage(true, false); }
      catch (again) { if (!missingColumn(again)) throw again; res = await readPage(false, false); }
    }

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
                 AND event.ref NOT LIKE 'refund:%' AND event.visits > 0
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

    const ledgerRows = rows.length ? await env.DB.prepare(`
      WITH page AS (SELECT json_extract(value, '$.id') AS client_id,
        CAST(json_extract(value, '$.srvTs') AS INTEGER) AS row_srv_ts FROM json_each(?))
      SELECT event.client_id, event.sale_ref,
        SUM(CASE WHEN ref NOT LIKE 'refund:%' THEN amount ELSE 0 END) AS paid,
        SUM(CASE WHEN ref NOT LIKE 'refund:%' THEN points ELSE 0 END) AS earned,
        SUM(CASE WHEN ref NOT LIKE 'refund:%' THEN stamps ELSE 0 END) AS stamped,
        SUM(CASE WHEN ref LIKE 'refund:%' THEN -amount ELSE 0 END) AS refunded,
        SUM(CASE WHEN ref LIKE 'refund:%' THEN -points ELSE 0 END) AS clawed,
        SUM(CASE WHEN ref LIKE 'refund:%' THEN -stamps ELSE 0 END) AS unstamped
      FROM client_purchase_events AS event JOIN page ON page.client_id = event.client_id
      WHERE merchant = ? AND event.srv_ts <= page.row_srv_ts
        AND sale_ref <> '' AND (visits > 0 OR ref LIKE 'refund:%')
      GROUP BY event.client_id, event.sale_ref`).bind(JSON.stringify(rows.map(row => ({ id: String(row.id), srvTs: Number(row.srv_ts) || 0 }))), merchant).all() : { results: [] };
    const ledgerByClient = new Map();
    for (const row of ledgerRows.results || []) {
      const ledger = ledgerByClient.get(row.client_id) || Object.create(null);
      ledger[row.sale_ref] = { paid: row.paid, earned: row.earned, stamped: row.stamped,
        refunded: row.refunded, clawed: row.clawed, unstamped: row.unstamped };
      ledgerByClient.set(row.client_id, ledger);
    }

    const rewardRefs = await pageEventRefs('client_reward_events');
    const seesDocuments = rows.length ? await readsIdentityDocuments(request, env, merchant) : true;
    const rewardRefsByClient = new Map();
    rewardRefs.forEach((row) => {
      const list = rewardRefsByClient.get(row.client_id) || [];
      list.push(row.ref); rewardRefsByClient.set(row.client_id, list);
    });

    return json({
      merchant,
      clients: rows.map((row) => ({ ...row,
        // Spend is read in integer centimes only; `spend` keeps its name for devices.
        spend: spendCentsOf(row) / 100, spend_cents: spendCentsOf(row),
        // ID numbers stay with hotels, the owner and operators (_client-identity.js).
        hospitality: seesDocuments ? row.hospitality : withoutDocumentNumber(row.hospitality),
        // Colonne pas encore migrée : pas de champ, l'appareil garde ses étiquettes.
        tags: Object.hasOwn(row, 'tags') ? tagsList(row.tags) : undefined,
        purchase_refs: refsByClient.get(row.id) || [],
        reward_refs: rewardRefsByClient.get(row.id) || [],
        purchase_history: historyByClient.get(row.id) || [],
        loyalty_sales: ledgerByClient.get(row.id) || {},
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

/* ── Un même téléphone, une seule fiche (CL-5) ───────────────────────────────
 * L'identité d'une fiche est son id, généré par l'appareil. Deux caisses qui
 * enregistraient la même cliente, l'une en « 0612… », l'autre en « +212 612… »,
 * créaient deux fiches au serveur : le dédoublonnage n'existait que dans le
 * carnet local de chaque appareil. Désormais, une fiche NOUVELLE dont le
 * téléphone (règle de _phone.js, la même que KiwiPhone) appartient déjà à une
 * fiche vivante du même magasin rejoint celle-ci :
 *   · les champs que la fiche existante n'avait pas sont repris ; un champ
 *     rempli n'est jamais remplacé, un vide n'efface jamais rien ; notes et
 *     étiquettes s'additionnent, consentements et dates de passage aussi ;
 *   · l'id de l'appareil devient une pierre tombale-alias (deleted = 1, aucune
 *     donnée personnelle, source « merged:<id cible> ») : l'appareil la voit au
 *     prochain tirage, retire son doublon local et reçoit la fiche fusionnée ;
 *     ses achats, retours et récompenses encore en file sous l'ancien id
 *     s'appliquent à la fiche cible au lieu de tomber en 404.
 * Jamais d'un magasin à l'autre : chaque requête est bornée à `merchant`. Deux
 * fiches qui existent déjà ne sont pas fusionnées ici (contrat de fusion, CL-2). */
const ALIAS = 'merged:';
function aliasOf(row) {
  return row && Number(row.deleted) === 1 && typeof row.source === 'string' && row.source.startsWith(ALIAS)
    ? row.source.slice(ALIAS.length) : '';
}
/* L'id auquel une écriture du registre s'applique : le sien, ou celui de la
 * fiche dans laquelle il a été fusionné. */
export async function resolveClientId(env, merchant, id) {
  if (!id) return id;
  try {
    const row = await env.DB.prepare('SELECT deleted, source FROM clients WHERE merchant = ? AND id = ?')
      .bind(merchant, id).first();
    return aliasOf(row) || id;
  } catch (_) { return id; }
}
/* Les fiches vivantes du magasin qui portent ce numéro, la plus ancienne au
 * curseur d'abord. Le SQL présélectionne sur les huit derniers chiffres,
 * séparateurs ôtés ; la règle complète tranche ensuite. */
async function phoneTwins(env, merchant, phone, exceptId) {
  const key = phoneKey(phone);
  if (!key) return [];
  const res = await env.DB.prepare(
    `SELECT id, phone, srv_ts FROM clients
      WHERE merchant = ? AND deleted = 0 AND id <> ? AND phone <> ''
        AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '.', ''), '-', ''), '(', ''), ')', '') LIKE ?
      ORDER BY srv_ts ASC, id ASC
      LIMIT 50`
  ).bind(merchant, exceptId, '%' + key.slice(-8)).all();
  return ((res && res.results) || []).filter((r) => phoneKey(r.phone) === key);
}
/* Merged profiles preserve every note and tag, including overflow. */
function mergedText(current, incoming) {
  const a = String(current || ''), b = String(incoming || '');
  if (!b || a === b || a.includes(b)) return a;
  return (a ? a + '\n' + b : b);
}
function mergedTags(current, incoming) {
  return JSON.stringify([...new Set([...tagsList(current), ...tagsList(incoming)])]);
}
function mergedHospitality(current, incoming) {
  const parse = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
  const out = JSON.parse(hospitalityJson(parse(current))), add = JSON.parse(hospitalityJson(parse(incoming)));
  for (const key of Object.keys(out)) if (!out[key] && add[key]) out[key] = add[key];
  return JSON.stringify(out);
}
/* Verse la fiche `c` (envoyée sous `selfId`) dans `targetId`, puis fait de
 * `selfId` un alias. Écriture optimiste : la fiche cible est relue et réécrite
 * seulement si personne ne l'a touchée entre-temps (même srv_ts), sinon on
 * recommence. `replaceSelf` : `selfId` vient d'être créée par cette requête
 * (deux caisses au même instant) ; elle ne devient alias que si aucun achat ne
 * l'a encore touchée. Rend null si la cible a disparu. */
async function mergeIntoTwin(env, merchant, targetId, c, selfId, replaceSelf) {
  if (!targetId || targetId === selfId || typeof env.DB.batch !== 'function') return null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const t = await env.DB.prepare('SELECT * FROM clients WHERE merchant = ? AND id = ? AND deleted = 0')
      .bind(merchant, targetId).first();
    if (!t) return null;
    const hasTags = Object.hasOwn(t, 'tags');
    const set = {};
    for (const column of ['name', 'phone', 'email', 'birthday', 'gender', 'city', 'address']) {
      if (!t[column] && c[column]) set[column] = c[column];
    }
    set.notes = mergedText(t.notes, c.notes);
    set.hospitality = mergedHospitality(t.hospitality, c.hospitality);
    if (hasTags) set.tags = mergedTags(t.tags, c.tags);
    set.consent = Math.max(Number(t.consent) || 0, c.consent);
    set.consent_email = Math.max(Number(t.consent_email) || 0, c.consent_email);
    const seen = [Number(t.first_seen) || 0, c.first_seen].filter((n) => n > 0);
    set.first_seen = seen.length ? Math.min(...seen) : 0;
    set.last_seen = Math.max(Number(t.last_seen) || 0, c.last_seen);
    const columns = Object.keys(set);          // noms tirés de la liste ci-dessus, jamais du corps
    const now = Date.now(), cursor = clientCursorSql();
    const results = await env.DB.batch([
      ...clientCursorStatements(env, merchant, now),
      env.DB.prepare(`UPDATE clients SET ${columns.map((k) => `${k} = ?`).join(', ')},
          updated_ts = ?, srv_ts = ${cursor}
        WHERE merchant = ? AND id = ? AND deleted = 0 AND srv_ts = ?`)
        .bind(...columns.map((k) => set[k]), now, merchant, merchant, targetId, t.srv_ts),
      env.DB.prepare(`INSERT INTO clients (merchant, id, deleted, source, updated_ts, srv_ts)
         SELECT ?, ?, 1, ?, ?, ${cursor} WHERE changes() > 0
         ON CONFLICT(merchant, id) DO UPDATE SET
           deleted = 1, name = '', phone = '', email = '', birthday = '', gender = '', city = '',
           address = '', notes = '', hospitality = '{}',${hasTags ? " tags = '[]'," : ''}
           source = excluded.source, updated_ts = excluded.updated_ts, srv_ts = excluded.srv_ts
         WHERE clients.deleted = 1
            OR (? = 1 AND clients.points = 0 AND clients.stamps = 0 AND clients.visits = 0 AND clients.spend = 0)`)
        .bind(merchant, selfId, ALIAS + targetId, now, merchant, replaceSelf ? 1 : 0),
    ]);
    if (Number(results[2] && results[2].meta && results[2].meta.changes)) {
      const row = await env.DB.prepare('SELECT srv_ts FROM clients WHERE merchant = ? AND id = ?')
        .bind(merchant, targetId).first();
      return { id: targetId, cursor: Number(row && row.srv_ts) || 0 };
    }
  }
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  /* Pending hotels may prepare ordinary Hospitality+ profiles before opening.
   * Financial loyalty mutations still cross the normal operational gate below;
   * this exception cannot spend points or record purchases. */
  let merchant = await tenantFor(request, env, body && body.merchant, { strict: true, allowPending: true });
  if (!merchant && body && body.merge) {
    const employee = await activeEmployee(request, env, body.merchant);
    if (employee) merchant = employee.merchant;
  }
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const state = body && body.merge ? await storeOperationalState(env, merchant) : null;
  const operational = state ? state.ok && !state.pending && !state.suspended
    : await tenantFor(request, env, merchant, { strict: true }) === merchant;

  if (body && body.merge) {
    const merge = body.merge;
    if (merge.from && merge.from === merge.to) return json({ error: 'invalid-merge' }, 400);
    if (!operational) return json({ error: 'unauthorized' }, 401);
    try {
      if (!await mayMergeClients(request, env, merchant)) return json({ error: 'manager-required' }, 403);
      return await mergeClients(env, merchant, merge, {
        prepare: sql => env.DB.prepare(sql), cursorStatements: clientCursorStatements, cursorSql: clientCursorSql,
        ensure: async () => {},
      });
    } catch (_) { return json({ error: 'merge-unavailable' }, 503); }
  }

  if (body && body.redemption) {
    if (!await mayRecordReward(request, env, merchant)) return json({ error: 'owner-or-till-required' }, 403);
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

  /* CL-5 · une fiche nouvelle dont le téléphone appartient déjà à une fiche
   * vivante du magasin la rejoint, et un id déjà fusionné y renvoie (voir
   * mergeIntoTwin). En cas d'échec, l'ancien chemin reste : rien n'est perdu. */
  let existing = null, known = false;
  try {
    existing = await env.DB.prepare('SELECT deleted, source FROM clients WHERE merchant = ? AND id = ?')
      .bind(merchant, c.id).first();
    known = true;
  } catch (_) {}
  const fresh = known && !existing && !!phoneKey(c.phone);
  if (known) {
    try {
      const twin = aliasOf(existing) || (fresh ? ((await phoneTwins(env, merchant, c.phone, c.id))[0] || {}).id : '');
      const merged = twin ? await mergeIntoTwin(env, merchant, twin, c, c.id, false) : null;
      if (merged) return json({ ok: true, merchant, id: c.id, mergedInto: merged.id, cursor: merged.cursor });
    } catch (_) {}
  }

  const srv = await nextSrvTs(env, merchant);
  const profileColumns = {
    name: 'name', phone: 'phone', email: 'email', birthday: 'birthday',
    gender: 'gender', city: 'city', address: 'address', notes: 'notes',
    hospitality: 'hospitality', tags: 'tags', consent: 'consent', consentEmail: 'consent_email',
    source: 'source', firstSeen: 'first_seen', lastSeen: 'last_seen',
  };
  const base = body.profileBase && typeof body.profileBase === 'object'
    && !Array.isArray(body.profileBase) ? sanitize(body.profileBase) : null;
  // A caller that only ever saw a blanked ID number cannot erase the real one.
  if (Object.hasOwn(body, 'hospitality') && (!base || c.hospitality !== base.hospitality)
      && !await readsIdentityDocuments(request, env, merchant)) {
    c.hospitality = await keepStoredDocument(env, merchant, c.id, c.hospitality);
  }
  // Column names come solely from this allowlist. No read/modify/write race:
  // an untouched field is absent from the SQL assignment altogether.
  const edits = Object.entries(profileColumns)
    .filter(([key, column]) => Object.hasOwn(body, key) && (!base || c[column] !== base[column]))
    .map(([, column]) => `${column} = excluded.${column},`).join('\n');
  /* Une caisse encore sur l'ancienne version n'envoie pas profileBase : elle
   * réécrit la fiche entière. Pour elle seule, l'ancienne règle tient (une
   * écriture plus vieille que la fiche en base est ignorée), sinon sa file
   * rejouée après une coupure écraserait une correction faite entre-temps.
   * Son horloge est bornée à maintenant : une horloge en avance ne gagne plus
   * pour toujours. */
  const legacy = base ? 0 : 1;
  if (legacy) {
    const now = Date.now();
    c.updated_ts = Math.min(int(body.updated || body.updated_ts, 1e15) || now, now);
  }

  const upsert = (tags, cents = true) => env.DB.prepare(
    `INSERT INTO clients (merchant, id, name, phone, email, birthday, gender, city,
                          address, notes, hospitality, points, stamps, visits, spend${cents ? ', spend_cents' : ''}, consent,
                          consent_email, source, first_seen, last_seen, updated_ts,
                          srv_ts, deleted${tags ? ', tags' : ''})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${cents ? '?, ' : ''}0${tags ? ', ?' : ''})
     ON CONFLICT(merchant, id) DO UPDATE SET
       ${tags ? edits : edits.replace('tags = excluded.tags,', '')}
       updated_ts = excluded.updated_ts, srv_ts = excluded.srv_ts
     -- Profile sync must never restore a tombstone, even with a future device clock.
     WHERE clients.deleted = 0 AND (? = 0 OR excluded.updated_ts >= clients.updated_ts)`
  ).bind(
    merchant, c.id, c.name, c.phone, c.email, c.birthday, c.gender, c.city,
    c.address, c.notes, c.hospitality, initialPoints, initialStamps, initialVisits, initialSpend, ...(cents ? [toCents(initialSpend)] : []), c.consent,
    c.consent_email, c.source, c.first_seen, c.last_seen, c.updated_ts, srv, ...(tags ? [c.tags] : []), legacy
  ).run();
  try {
    try { await upsert(true); }
    catch (error) {
      if (!missingColumn(error)) throw error;
      // Neither 0009 (tags) nor 0020 (spend_cents) may block a profile sync.
      try { await upsert(true, false); }
      catch (again) { if (!missingColumn(again)) throw again; await upsert(false, false); }
    }
  } catch (_) {
    // Table absente → 503. Le client garde la fiche dans sa file et retentera :
    // rien n'est perdu, la remontée est seulement remise à plus tard.
    return json({ error: 'unmigrated' }, 503);
  }

  /* Deux caisses ont créé la même cliente au même instant : chacune a passé le
   * contrôle avant l'écriture de l'autre. La plus récente au curseur rejoint
   * la plus ancienne ; l'ordre du curseur est le même pour les deux requêtes,
   * donc une seule fiche survit. */
  if (fresh) {
    try {
      const older = (await phoneTwins(env, merchant, c.phone, c.id))
        .find((r) => Number(r.srv_ts) < srv || (Number(r.srv_ts) === srv && r.id < c.id));
      const merged = older ? await mergeIntoTwin(env, merchant, older.id, c, c.id, true) : null;
      if (merged) return json({ ok: true, merchant, id: c.id, mergedInto: merged.id, cursor: merged.cursor });
    } catch (_) {}
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
    const erase = (tags) => env.DB.prepare(
      `UPDATE clients
          SET deleted = 1, name = '', phone = '', email = '', birthday = '',
              gender = '', city = '', address = '', notes = '', hospitality = '{}',${tags ? " tags = '[]'," : ''}
              updated_ts = CASE WHEN updated_ts >= ? THEN updated_ts + 1 ELSE ? END,
              srv_ts = ?
        WHERE merchant = ? AND id = ?`
    ).bind(Date.now(), Date.now(), srv, merchant, id).run();
    try { await erase(true); }
    catch (error) { if (!missingColumn(error)) throw error; await erase(false); }
  } catch (_) {
    return json({ error: 'unmigrated' }, 503);
  }

  return json({ ok: true, merchant, id, deleted: true, cursor: srv });
}
