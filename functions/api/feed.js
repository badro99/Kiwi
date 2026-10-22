// GET /api/feed?merchant=<id>&since=<cursor> — real sales after a cursor.
//
// The dashboard polls this every few seconds; `since` is the last rowid it saw,
// so each poll returns only new sales. SQLite's implicit rowid is a monotonic
// cursor — cheap and reliable. Behind the passcode gate like /api/sale.
//
// ── TENANT SCOPING (why ?merchant= is not trusted) ───────────────────────────
// The site gate admits every signed-in merchant AND the shared staff passcode,
// so "past the gate" is not "entitled to this store's data". Honouring a
// client-supplied ?merchant= therefore let ANY account read ANY other account's
// full sales feed just by knowing its slug (slugs are derived from the business
// name, so they are guessable). It also meant a dashboard whose identity had not
// resolved yet — falling back to a stale kiwiLiveMerchant a previous account left
// in the same browser — silently ingested the PREVIOUS merchant's sales into the
// new merchant's KPIs. Both are fixed the same way: the server decides.
//
//   · account session  → the store it asked for when the registry confirms the
//     account owns it, otherwise that account's own slug. It used to be ALWAYS
//     the account slug, which is what leaked the boutique's sales into the
//     restaurant's Commandes — see entitledMerchant() in auth/_lib.js, which now
//     holds this rule for every endpoint that touches money.
//   · operator (God mode, kiwi_op) → ?merchant= is honoured, that is the point.
//   · neither (pitch demo on the staff passcode) → only the demo tenant.
//
// An empty/unknown merchant returns an empty feed. It must NEVER fall back to a
// shared literal bucket ('default'), which two different unresolved stores would
// both read and write — a cross-tenant channel by construction.

import {
  json, entitledMerchant,
} from '../auth/_lib.js';
import { legacyBucketFor } from './_sales-scope.js';
import { reserveTicketRange } from './ticket-sequence.js';

/* Repair the exact legacy split-brain that can exist when God Mode voided a
 * positive test receipt but an already-linked refund counter-entry remained
 * live. That orphan negative row would reduce revenue and the expected cash
 * drawer even though the whole test operation should net to zero. New God Mode
 * writes move both rows atomically; this scoped reconciliation heals existing
 * stores (including an open till) on their next normal feed poll.
 *
 * This never deletes or rewrites an amount. It only applies the same reversible
 * void marker already carried by the original, and only where sale_audit proves
 * the refund relationship inside the same merchant. */
async function reconcileLinkedTestRefunds(env, merchant, legacy) {
  const ts = Date.now();
  await env.DB.prepare(
    `UPDATE sales AS refund
        SET void_ts = ?, void_reason = 'linked-test-sale',
            void_note = 'Réconciliation automatique du remboursement lié',
            void_actor = 'Kiwi · réconciliation'
      WHERE refund.merchant IN (?, ?) AND refund.void_ts IS NULL
        AND COALESCE(refund.amount_cents, refund.amount * 100) < 0
        AND EXISTS (
          SELECT 1
            FROM sale_audit a
            JOIN sales original
              ON original.merchant = a.merchant AND original.id = a.sale_id
           WHERE a.merchant = refund.merchant AND a.action = 'refund'
             AND a.note = refund.id AND original.void_ts IS NOT NULL
        )`
  ).bind(ts, merchant, legacy || merchant).run();
}

/* Signed, scoped routing state. Entitlement is still checked on every page. */
const encode64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode64 = raw => Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function cursorKey(env) {
  if (!env.AUTH_SECRET) throw new Error('cursor-config');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signCursor(env, data) {
  const body = encode64(new TextEncoder().encode(JSON.stringify(data)));
  const signature = await crypto.subtle.sign('HMAC', await cursorKey(env), new TextEncoder().encode('kiwi-feed:' + body));
  return body + '.' + encode64(new Uint8Array(signature));
}
async function readCursor(env, raw) {
  const key = await cursorKey(env);
  try {
    if (raw.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) throw new Error('format');
    const [body, signature] = raw.split('.');
    if (!await crypto.subtle.verify('HMAC', key, decode64(signature), new TextEncoder().encode('kiwi-feed:' + body))) throw new Error('signature');
    return JSON.parse(new TextDecoder().decode(decode64(body)));
  } catch (_) { throw new RangeError('cursor'); }
}
function fenceParam(raw) {
  if (!/^(0|[1-9][0-9]*)$/.test(raw || '') || !Number.isSafeInteger(Number(raw))) throw new RangeError('fence');
  return Number(raw);
}
async function replayBounds(env, merchant, legacy) {
  // One statement snapshot captures the insert and mutation high-water marks together.
  const row = await env.DB.prepare(
    'SELECT (SELECT COALESCE(MAX(rowid), 0) FROM sales WHERE merchant IN (?, ?)) AS fence,' +
    ' (SELECT COALESCE(MAX(seq), 0) FROM sale_changes WHERE merchant IN (?, ?)) AS changeFence,' +
    " (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN ('sales_change_log','sales_change_insert','sales_change_delete')) AS triggers"
  ).bind(merchant, legacy || merchant, merchant, legacy || merchant).first();
  if (Number(row?.triggers) !== 3 || !Number.isSafeInteger(row?.fence) || row.fence < 0 ||
      !Number.isSafeInteger(row?.changeFence) || row.changeFence < 0) throw new Error('change-schema');
  return row;
}
async function windowState(env, params, merchant, legacy, from, to) {
  const raw = params.get('after');
  const supplied = params.has('fence') ? fenceParam(params.get('fence')) : null;
  const suppliedChange = params.has('changeFence') ? fenceParam(params.get('changeFence')) : null;
  const current = await replayBounds(env, merchant, legacy);
  if (raw) {
    const a = await readCursor(env, raw);
    if (!Array.isArray(a) || a.length !== 10 || a[0] !== 3 || a[1] !== 'window' || a[2] !== merchant || a[3] !== legacy || a[4] !== from || a[5] !== to ||
        !Number.isSafeInteger(a[6]) || a[6] < 0 || (supplied !== null && supplied !== a[6]) ||
        !Number.isSafeInteger(a[7]) || a[7] < 0 || a[7] > current.changeFence || (suppliedChange !== null && suppliedChange !== a[7]) ||
        !Number.isFinite(a[8]) || a[8] < from || a[8] >= to || !Number.isSafeInteger(a[9]) || a[9] <= 0 || a[9] > a[6]) throw new RangeError('after');
    return { fence: a[6], changeFence: a[7], after: a.slice(8) };
  }
  if (supplied !== null && supplied > current.fence || suppliedChange !== null && suppliedChange > current.changeFence) throw new RangeError('fence');
  return { fence: supplied ?? current.fence, changeFence: suppliedChange ?? current.changeFence, after: [from, 0] };
}
async function changePage(env, params, merchant, legacy, limit) {
  const maximum = (await replayBounds(env, merchant, legacy)).changeFence;
  const raw = params.get('afterChange');
  let after = 0;
  if (raw && /^[0-9]+$/.test(raw)) after = fenceParam(raw);
  else if (raw) {
    const a = await readCursor(env, raw);
    if (!Array.isArray(a) || a.length !== 5 || a[0] !== 1 || a[1] !== 'changes' || a[2] !== merchant || a[3] !== legacy || !Number.isSafeInteger(a[4]) || a[4] < 0) throw new RangeError('afterChange');
    after = a[4];
  }
  if (after > maximum) throw new RangeError('afterChange');
  const rs = await env.DB.prepare(
    'SELECT c.seq, c.sale_rowid AS changedCursor, c.sale_id AS changedId, s.rowid AS cursor,' +
    ' s.id, s.amount, s.amount_cents, s.gross_amount_cents, s.discount_amount_cents, s.discount_reason, s.discount_actor_id,' +
    ' s.method, s.label, s.ref, s.ts, s.lines, s.channel, s.void_ts AS changeVoidTs' +
    ' FROM (SELECT seq, sale_rowid, sale_id FROM sale_changes WHERE merchant IN (?, ?) AND seq > ? ORDER BY seq ASC' +
    ` LIMIT ${limit + 1}) c LEFT JOIN sales s ON s.rowid = c.sale_rowid AND s.id IS c.sale_id AND s.merchant IN (?, ?)` +
    ' ORDER BY c.seq ASC'
  ).bind(merchant, legacy || merchant, after, merchant, legacy || merchant).all();
  const entries = rs.results || [], more = entries.length > limit, consumed = entries.slice(0, limit);
  const latest = new Map();
  for (const row of consumed) latest.set(JSON.stringify([row.changedCursor, row.changedId]), row);
  const position = consumed.length ? consumed[consumed.length - 1].seq : after;
  const checkpoint = await signCursor(env, [1, 'changes', merchant, legacy, position]);
  return { entries: [...latest.values()].sort((a, b) => a.seq - b.seq), next: more ? checkpoint : null, complete: !more, checkpoint };
}
async function voidPage(env, params, merchant, legacy, limit) {
  const raw = params.get('afterVoid');
  let after = [null, 0];
  if (raw) {
    const a = await readCursor(env, raw);
    if (!Array.isArray(a) || a.length !== 6 || a[0] !== 1 || a[1] !== 'void' || a[2] !== merchant || a[3] !== legacy ||
        (a[4] !== null && !Number.isFinite(a[4])) || !Number.isSafeInteger(a[5]) || a[5] < 0 || (a[4] === null && a[5] !== 0)) throw new RangeError('afterVoid');
    after = a.slice(4);
  }
  const columns = 'SELECT rowid AS c, id AS i, ref AS r, ts, void_ts AS vts FROM sales WHERE merchant IN (?, ?)';
  let all = [];
  if (after[0] === null || after[0] < 0) {
    // Include old/corrupt negative markers too; the optional index covers the
    // normal nonnegative stream without changing the legacy latest-500 plan.
    const predicate = after[0] === null ? '' : ' AND (void_ts > ? OR (void_ts = ? AND rowid > ?))';
    const args = after[0] === null ? [] : [after[0], after[0], after[1]];
    const rs = await env.DB.prepare(columns + ' AND void_ts < 0' + predicate + ` ORDER BY void_ts ASC, rowid ASC LIMIT ${limit + 1}`)
      .bind(merchant, legacy || merchant, ...args).all();
    all = rs.results || [];
  }
  if (all.length <= limit) {
    const start = after[0] === null || after[0] < 0 ? [0, 0] : after;
    const rs = await env.DB.prepare(columns + ' AND void_ts IS NOT NULL AND void_ts >= 0' +
      ' AND (void_ts > ? OR (void_ts = ? AND rowid > ?))' + ` ORDER BY void_ts ASC, rowid ASC LIMIT ${limit + 1 - all.length}`)
      .bind(merchant, legacy || merchant, start[0], start[0], start[1]).all();
    all = all.concat(rs.results || []);
  }
  const more = all.length > limit;
  const voided = all.slice(0, limit).map(r => ({ c: r.c, i: r.i || '', r: r.r || '', ts: r.ts, vts: r.vts }));
  // Retain a signed checkpoint at EOF so a later poll can resume after the tail.
  const last = voided[voided.length - 1];
  const checkpoint = await signCursor(env, [1, 'void', merchant, legacy, last ? last.vts : after[0], last ? last.c : after[1]]);
  return { merchant, voided, next: more ? checkpoint : null, complete: !more, checkpoint };
}
async function windowRows(env, merchant, legacy, from, to, after, fence, limit) {
  const optional = ['amount_cents', 'gross_amount_cents', 'discount_amount_cents', 'discount_reason', 'discount_actor_id', 'lines', 'channel'];
  for (let attempt = 0; attempt <= 7; attempt++) {
    const cols = optional.join(', ');
    try {
      const rs = await env.DB.prepare(
        'SELECT rowid AS cursor, id, amount, method, label, ref, ts' + (cols ? ', ' + cols : '') +
        ' FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL AND rowid <= ?' +
        ' AND (ts > ? OR (ts = ? AND rowid > ?))' +
        ` ORDER BY ts ASC, rowid ASC LIMIT ${limit + 1}`
      ).bind(merchant, legacy || merchant, from, to, fence, after[0], after[0], after[1]).all();
      return rs.results || [];
    } catch (e) {
      // Unlike legacy modes, never claim completeness without void exclusion.
      const missing = /no such column: ([a-z_]+)\b/.exec(String(e?.message || e));
      const index = missing ? optional.indexOf(missing[1]) : -1;
      if (index < 0) throw e;
      optional.splice(index, 1);
    }
  }
  throw new Error('window-schema');
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const changeRead = url.searchParams.has('afterChange') || url.searchParams.get('changes') === '1';
  const voidRead = !changeRead && url.searchParams.get('voids') === '1' && url.searchParams.has('afterVoid');
  const windowRead = !changeRead && !voidRead && url.searchParams.get('window') === '1' && url.searchParams.has('from') && url.searchParams.has('to');
  const windowFrom = Number(url.searchParams.get('from')), windowTo = Number(url.searchParams.get('to'));
  if (windowRead && (!Number.isSafeInteger(windowFrom) || !Number.isSafeInteger(windowTo) || windowFrom <= 0 ||
      windowTo <= windowFrom || windowTo - windowFrom > 400 * 86400000 + 2 * 3600000)) return json({ error: 'range' }, 400);
  if (!env || !env.DB) return windowRead || voidRead || changeRead ? json({ error: 'db' }, 503) : json({ sales: [], cursor: 0 });
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const since = Number(url.searchParams.get('since')) || 0;

  /* `allowTill` — une caisse appairée lit les ventes de SA boutique.
   *
   * Elle avait déjà le droit de les ÉCRIRE (functions/api/sale.js passe la même
   * option) ; il lui manquait celui de les relire, et ce manque avait un coût
   * concret au comptoir : « Réimprimer » ne connaît que le journal de CET
   * appareil. Une boutique à deux caisses vendait 28 tickets sur l'une et 2 sur
   * l'autre, et aucune des deux ne pouvait ressortir le reçu de sa voisine —
   * pendant que le tableau de bord, lui, affichait bien les trente.
   *
   * Ce n'est pas un élargissement : isTillFor() vérifie que cet appareil est
   * appairé À CE COMMERÇANT-LÀ, exactement le contrôle qui autorise déjà
   * l'écriture. Une caisse ne peut toujours lire que la boutique où elle est
   * posée. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return windowRead || voidRead || changeRead ? json({ error: 'unauthorized' }, 403) : json({ sales: [], cursor: since, merchant: '' });

  /* Which buckets this store reads: its own, plus the account's pre-split one
   * when that is unambiguous. Binding `merchant` twice when there is no second
   * bucket keeps ONE query shape — an IN (?, ?) with a duplicate is exactly the
   * same result set as an equality test. */
  const legacy = await legacyBucketFor(request, env, merchant); // pre-split bucket, see _sales-scope.js

  try {
    await reconcileLinkedTestRefunds(env, merchant, legacy);
  } catch (_) {
    /* Old schemas may lack centimes, audit or void columns. Their existing feed
       fallback remains available; reconciliation will start after migration. */
  }

  /* ── LES VENTES DE TEST NE SORTENT PAS D'ICI ──────────────────────────────
   * Une vente qu'un opérateur a sortie des livres (functions/api/admin/sales.js)
   * porte void_ts. Ce point-ci est le seul endroit à filtrer : tout ce qui
   * compte l'argent d'un commerçant — chiffre d'affaires, nombre de ventes,
   * panier moyen, classement produits, répartition des encaissements, rapport
   * journalier d'une journée ouverte, exports, réponses de Kiwi AI — recalcule
   * depuis ce flux via window.KiwiSales. Filtrer là, c'est les corriger tous ;
   * filtrer ailleurs, c'était les corriger un par un et en oublier.
   *
   * ── ET CELLES DÉJÀ RECOPIÉES CHEZ LE CLIENT ? ─────────────────────────────
   * Le flux est un curseur : `rowid > since`. Une vente annulée APRÈS que le
   * tableau de bord l'a ingérée ne repassera donc jamais par ici — elle
   * resterait dans le stockage local du navigateur, et dans les totaux, pour
   * toujours. D'où `voided` : la liste des lignes retirées, renvoyée à CHAQUE
   * sondage quel que soit le curseur. Le client s'en sert pour retirer ce qu'il
   * a déjà. C'est idempotent, ça se répare tout seul sur un appareil neuf, et
   * ça coûte une requête indexée.
   *
   * Chaque entrée porte le curseur ET la référence de ticket : le tableau de
   * bord range ses ventes par curseur, la caisse ne connaît que la référence
   * imprimée sur le reçu. Une seule liste sert les deux. */
  /* `voids=1` — le sondage de la CAISSE. Elle ne lit pas le flux (elle n'a pas
   * de magasin de ventes à remplir) mais elle tient son propre compteur du jour,
   * et une vente d'essai retirée doit en sortir aussi. Elle ne demande donc que
   * la liste des retraits, sans rejouer la journée entière toutes les minutes. */
  const voidsOnly = url.searchParams.get('voids') === '1';

  /* `from=<ms>` — la lecture PAR JOURNÉE, pour le comptoir.
   *
   * Le flux normal est un curseur croissant : on le remonte depuis le début des
   * temps. C'est ce qu'il faut au tableau de bord, qui ingère une fois puis
   * suit. Ça ne convient pas à « Réimprimer », qui veut les ventes d'AUJOURD'HUI
   * et rien d'autre : sur une boutique qui tourne depuis un an, il faudrait
   * paginer des milliers de lignes pour arriver à ce matin.
   *
   * La borne vient du CLIENT et pas d'ici : c'est l'appareil qui sait où
   * commence sa journée. Le serveur ne connaît ni le fuseau du commerce ni
   * l'heure à laquelle il considère qu'une journée bascule, et deviner l'un ou
   * l'autre produirait un rapport juste onze mois sur douze. */
  const from = Number(url.searchParams.get('from')) || 0;
  const byDay = from > 0;
  const DAY_LIMIT = 2000;
  const requestedLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isInteger(requestedLimit) ? Math.max(50, Math.min(500, requestedLimit)) : 50;
  let replay, changeResult;
  if (windowRead || voidRead || changeRead) {
    try {
      if (voidRead) return json(await voidPage(env, url.searchParams, merchant, legacy, limit));
      if (changeRead) changeResult = await changePage(env, url.searchParams, merchant, legacy, limit);
      else replay = await windowState(env, url.searchParams, merchant, legacy, windowFrom, windowTo);
    } catch (error) { return json({ error: error instanceof RangeError ? 'cursor' : 'db' }, error instanceof RangeError ? 400 : 500); }
  }

  /* Compatibility for tills that still have the previous service-worker bundle
   * open during deployment. That client asks for a maximum then uses `seq + 1`;
   * reserve a real range and describe its first value in the old protocol. New
   * clients call /api/ticket-sequence directly. This can be removed after v206
   * has aged out. */
  if (!windowRead && !changeRead && url.searchParams.get('seq') === '1') {
    try {
      const lease = await reserveTicketRange(env, merchant, 500, 1000, new Date().getUTCFullYear());
      return json({ seq: lease.start - 1, merchant, legacyLeaseEnd: lease.end });
    } catch (e) {
      return json({ error: 'ticket-sequence', detail: String((e && e.message) || e) }, 500);
    }
  }

  /* Repère des modifications EN PLACE (pourboire ou détail du paiement posés
   * après la vente). Le curseur rowid ne repasse jamais sur une vente déjà
   * servie : sans ce repère, un navigateur qui la connaît ne saurait pas qu'elle
   * a changé. Lu AVANT les lignes : une modification arrivée entre les deux se
   * retrouve au sondage suivant, jamais perdue. Absent sur une base sans le
   * journal des modifications : le flux reste celui d'avant. Rendu seulement à
   * qui le demande (`cf=1`) : la réponse des autres clients ne change pas d'un octet. */
  let changeFence = null;
  if (!windowRead && !changeRead && url.searchParams.get('cf') === '1') {
    try {
      const mark = await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS f FROM sale_changes WHERE merchant IN (?, ?)')
        .bind(merchant, legacy || merchant).first();
      if (Number.isSafeInteger(mark && mark.f) && mark.f >= 0) changeFence = mark.f;
    } catch (_) { changeFence = null; }
  }

  let rows = [];
  let next = null;
  let voided = [];
  /* Une seule tentative par forme de schéma, de la plus récente à la plus
   * ancienne. Chaque `catch` ne rattrape QUE la colonne qui manque et retombe
   * d'un cran ; tout le reste remonte en 500, parce qu'un flux vide servi en
   * silence est le pire des messages d'erreur. */
  try {
    if (changeRead) {
      rows = changeResult.entries.filter(row => row.cursor !== null);
    } else if (windowRead) {
      rows = await windowRows(env, merchant, legacy, windowFrom, windowTo, replay.after, replay.fence, limit);
      if (rows.length > limit) {
        rows = rows.slice(0, limit);
        const last = rows[rows.length - 1];
        next = await signCursor(env, [3, 'window', merchant, legacy, windowFrom, windowTo, replay.fence, replay.changeFence, last.ts, last.cursor]);
      }
    } else if (!voidsOnly) {
      const rs = byDay
        ? await env.DB.prepare(
          'SELECT rowid AS cursor, id, amount, amount_cents, gross_amount_cents, discount_amount_cents, discount_reason, discount_actor_id, method, label, ref, ts, lines, channel ' +
          'FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND void_ts IS NULL ' +
          `ORDER BY ts DESC LIMIT ${DAY_LIMIT}`
        ).bind(merchant, legacy || merchant, from).all()
        : await env.DB.prepare(
          'SELECT rowid AS cursor, id, amount, amount_cents, gross_amount_cents, discount_amount_cents, discount_reason, discount_actor_id, method, label, ref, ts, lines, channel ' +
          `FROM sales WHERE merchant IN (?, ?) AND rowid > ? AND void_ts IS NULL ORDER BY rowid ASC LIMIT ${limit}`
        ).bind(merchant, legacy || merchant, since).all();
      rows = (rs && rs.results) || [];
    }
    if (!windowRead && !changeRead) {
      const vs = await env.DB.prepare(
        'SELECT rowid AS cursor, id, ref, ts, void_ts FROM sales WHERE merchant IN (?, ?) AND void_ts IS NOT NULL ' +
        'ORDER BY void_ts DESC LIMIT 500'
      ).bind(merchant, legacy || merchant).all();
      voided = ((vs && vs.results) || []).map((r) => Object.assign({ c: r.cursor, i: r.id || '', r: r.ref || '' }, {
        vts: r.void_ts != null ? Number(r.void_ts) : null,
        ts: r.ts != null ? Number(r.ts) : null,
      }));
    }
  } catch (e) {
    if (windowRead || changeRead) return json({ error: 'db' }, 500);
    const msg = String((e && e.message) || e);
    const noVoid = msg.includes('void_ts');
    const noLines = msg.includes('lines');
    const noChannel = msg.includes('channel');
    const noAmountCents = msg.includes('amount_cents');
    const noDiscount = /gross_amount_cents|discount_amount_cents|discount_reason|discount_actor_id/.test(msg);
    if (!noVoid && !noLines && !noChannel && !noAmountCents && !noDiscount) {
      return json({ sales: [], cursor: since, error: 'db', detail: msg }, 500);
    }
    if (voidsOnly) return json({ sales: [], cursor: since, merchant, voided: [], ...(!byDay ? { limit } : {}) });
    const cols = 'rowid AS cursor, id, amount'
      + (noAmountCents ? '' : ', amount_cents')
      + (noDiscount ? '' : ', gross_amount_cents, discount_amount_cents, discount_reason, discount_actor_id')
      + ', method, label, ref, ts'
      + (noLines ? '' : ', lines') + (noChannel ? '' : ', channel');
    const where = byDay ? 'ts >= ?' : 'rowid > ?';
    const order = byDay ? `ts DESC LIMIT ${DAY_LIMIT}` : `rowid ASC LIMIT ${limit}`;
    const bound = byDay ? from : since;
    try {
      const rs = await env.DB.prepare(
        `SELECT ${cols} FROM sales WHERE merchant IN (?, ?) AND ${where} ORDER BY ${order}`
      ).bind(merchant, legacy || merchant, bound).all();
      rows = (rs && rs.results) || [];
    } catch (e2) {
      try {
        const rs = await env.DB.prepare(
          'SELECT rowid AS cursor, id, amount, method, label, ref, ts ' +
          `FROM sales WHERE merchant IN (?, ?) AND ${where} ORDER BY ${order}`
        ).bind(merchant, legacy || merchant, bound).all();
        rows = (rs && rs.results) || [];
      } catch (_) {
        return json({ sales: [], cursor: since, error: 'db', detail: msg }, 500);
      }
    }
  }
  /* Hand the basket back as an array, in the shape the till sent it and the
   * dashboard's own journal already uses ({name, qty, total}). Parsing here
   * means no consumer has to know the column is JSON, and a corrupt row costs
   * that one basket instead of throwing the whole poll. */
  rows = rows.map((r) => {
    if (!r || r.lines == null) return r;
    try {
      const arr = JSON.parse(r.lines);
      /* `cat` n'est présent que sur les ventes écrites depuis que /api/sale
       * accepte la catégorie. Absent = inconnu, et le rapport journalier
       * repêche alors dans le catalogue actuel — jamais 'Divers' par défaut
       * ici, ce qui reviendrait à affirmer une classification qu'on n'a pas. */
      r.lines = Array.isArray(arr)
        ? arr.map((l) => ({
            name: l && l.n, baseName: (l && l.bn) || '', qty: l && l.q, total: l && l.t,
            cat: (l && l.c) || '', itemId: (l && l.i) || '',
            variantId: (l && l.v) || '', unit: (l && l.u) || '',
            kind: (l && l.kd) || '', unitCost: (l && l.k),
            recipeVersionId: (l && l.r) || '',
            formulaChoices: Array.isArray(l && l.fc)
              ? l.fc.map((choice) => ({
                  name: (choice && choice.n) || 'Choix', qty: (choice && choice.q) || 1,
                  total: Math.max(0, Number(choice && choice.t) || 0),
                }))
              : [],
            options: Array.isArray(l && l.o)
              ? l.o.map((x) => ({ id: (x && x.i) || '', qty: x && x.q })).filter((x) => x.id)
              : [],
          }))
        : null;
    } catch (_) { r.lines = null; }
    return r;
  });

  // The receipt cursor remains one sale. Tender detail lives on that row and
  // can be absent on old deployments/receipts without hiding the money feed.
  // Batch optional receipt details within D1's bound-parameter budget.
  for (let offset = 0; offset < rows.length; offset += 75) {
    const detailRows = rows.slice(offset, offset + 75);
    try {
      const ids = detailRows.map(row => String(row.id || '')).filter(Boolean);
      const marks = ids.map(() => '?').join(',');
      const details = await env.DB.prepare(
        `SELECT id, payment_parts FROM sales WHERE merchant IN (?, ?) AND id IN (${marks})`
      ).bind(merchant, legacy || merchant, ...ids).all();
      const byId = new Map((details.results || []).map(row => [String(row.id), row.payment_parts]));
      detailRows.forEach(row => {
        try {
          const parts = JSON.parse(byId.get(String(row.id)) || 'null');
          if (Array.isArray(parts)) row.paymentParts = parts;
        } catch (_) { /* Corrupt attribution cannot hide a receipt. */ }
      });
    } catch (_) { /* Old schema without payment_parts keeps its legacy feed. */ }
    /* Le pourboire saisi à l'encaissement (sale.js › tip_cents). Colonne absente
       sur une base pas encore guérie : le flux reste, sans pourboire. */
    try {
      const ids = detailRows.map(row => String(row.id || '')).filter(Boolean);
      const marks = ids.map(() => '?').join(',');
      const tips = await env.DB.prepare(
        `SELECT id, tip_cents FROM sales WHERE merchant IN (?, ?) AND id IN (${marks}) AND tip_cents > 0`
      ).bind(merchant, legacy || merchant, ...ids).all();
      const byId = new Map((tips.results || []).map(row => [String(row.id), Math.round(Number(row.tip_cents))]));
      detailRows.forEach(row => { const t = byId.get(String(row.id)); if (Number.isSafeInteger(t) && t > 0) row.tipCents = t; });
    } catch (_) { /* Old schema without tip_cents. */ }
  }

  /* Restaurant sales use the visit id as their durable payment identity. Join
   * that identity back to the canonical order queue so the owner sees the same
   * reference as caisse, plus who took the order and through which surface. No
   * extra sales columns or migration are needed: old rows become richer too. */
  /* Une addition partagée a une ligne financière par part :
     visit-<session>-split-<index>-emp. Pour l'attribution serveur/canal, toutes
     rejoignent pourtant la même visite et le même bon canonique. */
  const visitFromSaleId = (value) => {
    const id = String(value || '');
    if (!id.startsWith('visit-') || (!id.endsWith('-emp') && !id.endsWith('-caisse'))) return '';
    const core = id.endsWith('-emp') ? id.slice(6, -4) : id.slice(6, -7);
    return core.replace(/-split-\d+$/, '');
  };
  const visitIds = Array.from(new Set(rows.map((r) => visitFromSaleId(r && r.id)).filter(Boolean)));
  const orderByVisit = new Map();
  for (let offset = 0; offset < visitIds.length; offset += 75) {
    const batch = visitIds.slice(offset, offset + 75);
    try {
      const marks = batch.map(() => '?').join(',');
      const rs = await env.DB.prepare(
        `SELECT session_id, number, channel, server_name, created_ts FROM orders
          WHERE merchant IN (?, ?) AND session_id IN (${marks})
          ORDER BY created_ts ASC`
      ).bind(merchant, legacy || merchant, ...batch).all();
      (rs.results || []).forEach((order) => {
        if (order && order.session_id && !orderByVisit.has(String(order.session_id))) {
          orderByVisit.set(String(order.session_id), order);
        }
      });
    } catch (_) { /* Optional order metadata never hides the financial feed. */ }
  }
  rows.forEach((sale) => {
    if (!sale) return;
    const cents = sale.amount_cents != null
      ? Number(sale.amount_cents)
      : Math.round(Number(sale.amount || 0) * 100);
    sale.amountCents = cents;
    sale.amount = cents / 100;
    sale.grossAmountCents = sale.gross_amount_cents == null ? null : Number(sale.gross_amount_cents);
    sale.discountAmountCents = sale.discount_amount_cents == null ? null : Number(sale.discount_amount_cents);
    sale.discountReason = String(sale.discount_reason || '');
    sale.actorId = String(sale.discount_actor_id || '');
    const id = String(sale.id || '');
    const visit = visitFromSaleId(id);
    const order = visit ? orderByVisit.get(visit) : null;
    const isSplit = /·\s*part\b/i.test(String(sale.label || '')) || /-split-\d+/i.test(id);
    sale.orderRef = String(
      (isSplit ? sale.label : '')
      || (visit ? sale.label : sale.ref)
      || sale.label
      || sale.ref
      || (order && order.number != null ? order.number : '')
    ).slice(0, 80);
    sale.receiptRef = String(sale.ref || '').slice(0, 80);
    sale.server = String(order && order.server_name || '').slice(0, 80);
    sale.origin = sale.server ? 'employee' : (order && order.channel === 'kiwi' ? 'orderpro' : 'caisse');
    /* Channel truth for ledgers created before sales.channel existed. A visit
     * is a table sale; OrderPro and explicit external order channels retain
     * their source. Takeaway receipts are self-identifying in their frozen
     * label. This enriches old rows without rewriting financial history. */
    const storedChannel = String(sale.channel || '').toLowerCase();
    const orderChannel = String(order && order.channel || '').toLowerCase();
    const saleLabel = String(sale.label || '').toLowerCase();
    sale.channel = storedChannel || (visit
      ? (orderChannel === 'terrace' ? 'terrace' : 'dining')
      : (/à emporter|a emporter|takeaway/.test(saleLabel) ? 'takeaway'
        : (orderChannel === 'kiwi' ? 'orderpro' : (orderChannel || ''))));
  });

  /* `merchant` is the tenant actually SERVED, which is not always the one asked
   * for — an unclaimed store still snaps back to the account slug. Reporting it
   * makes a mis-scoped feed visible from the outside instead of something you
   * have to infer from whose sales showed up. */
  /* Une lecture par journée ne fait pas avancer le curseur : elle est triée à
     l'envers, si bien que sa dernière ligne est la PLUS ANCIENNE. La rendre
     comme curseur ferait reculer un tableau de bord qui appellerait les deux. */
  if (changeRead) {
    const full = new Map(rows.map(row => [row.seq, row]));
    const changes = changeResult.entries.map(entry => {
      if (entry.cursor === null) return { seq: entry.seq, cursor: entry.changedCursor, id: entry.changedId, deleted: true };
      const row = full.get(entry.seq);
      row.voided = row.changeVoidTs !== null; row.voidTs = row.changeVoidTs;
      delete row.changedCursor; delete row.changedId; delete row.changeVoidTs;
      return row;
    });
    return json({ merchant, changes, next: changeResult.next, complete: changeResult.complete, checkpoint: changeResult.checkpoint });
  }
  if (windowRead) return json({ merchant, from: windowFrom, to: windowTo, sales: rows, next, complete: next === null, fence: replay.fence, changeFence: replay.changeFence });
  const cursor = (!byDay && rows.length) ? rows[rows.length - 1].cursor : since;
  /* The till's heartbeat (order_desk, stamped by its authenticated queue poll
     every few seconds; kitchen and service screens excluded). The dashboard
     already polls this route, so its "Caisse connectée" chip can say whether a
     till is actually ON instead of whether one was once paired in this
     browser. 0 = never seen, or a base without the table. */
  let tillSeen = 0;
  try {
    const desk = await env.DB.prepare('SELECT seen_ts FROM order_desk WHERE merchant = ?').bind(merchant).first();
    tillSeen = Math.max(0, Number(desk && desk.seen_ts) || 0);
  } catch (_) {}
  return json({ sales: rows, cursor, merchant, voided, tillSeen, now: Date.now(), ...(changeFence !== null ? { changeFence } : {}), ...(!byDay ? { limit } : {}) });
}
