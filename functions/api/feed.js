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
  json, readSession, readCookie, SESS_COOKIE, slugMerchant, entitledMerchant,
} from '../auth/_lib.js';

/* ── THE PRE-SPLIT BUCKET ─────────────────────────────────────────────────────
 * Before stores had their own tenant, every sale an account rang up landed under
 * slugMerchant(accounts.business) whichever shop it came from. Scoping per store
 * is right going forward, but on its own it would open an empty history for the
 * merchant whose ONE shop is simply named differently from the business ("Cafe
 * Amira" the account, "Cafe Amira · Tanger" the store) — their whole till roll
 * would vanish from the dashboard the day this deploys.
 *
 * So a store ALSO reads the old account bucket when the account has exactly one
 * registered store: there is nowhere else those sales could have come from, so
 * nothing is being guessed. An account with SEVERAL stores gets the clean split
 * and its pre-split rows stay parked under the account slug — which shop rang
 * them up is genuinely unknowable, and inventing an answer would just recreate
 * the leak this fixes. Fails closed (no union) on any error. */
async function preSplitBucket(env, aid, merchant, accSlug) {
  if (!aid || !accSlug || merchant === accSlug) return '';
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM merchant_config WHERE account_id = ?'
    ).bind(aid).first();
    return (row && Number(row.n) === 1) ? accSlug : '';
  } catch (_) { return ''; }
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ sales: [], cursor: 0 });

  const url = new URL(request.url);
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
  if (!merchant) return json({ sales: [], cursor: since, merchant: '' });

  /* Which buckets this store reads: its own, plus the account's pre-split one
   * when that is unambiguous. Binding `merchant` twice when there is no second
   * bucket keeps ONE query shape — an IN (?, ?) with a duplicate is exactly the
   * same result set as an equality test. */
  let legacy = '';
  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (sess && sess.aid) {
      const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
      if (acc && acc.business) {
        legacy = await preSplitBucket(env, sess.aid, merchant, slugMerchant(acc.business));
      }
    }
  } catch (_) { /* no session (operator / demo) → own bucket only */ }

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
  const DAY_LIMIT = 300;

  let rows = [];
  let voided = [];
  /* Une seule tentative par forme de schéma, de la plus récente à la plus
   * ancienne. Chaque `catch` ne rattrape QUE la colonne qui manque et retombe
   * d'un cran ; tout le reste remonte en 500, parce qu'un flux vide servi en
   * silence est le pire des messages d'erreur. */
  try {
    if (!voidsOnly) {
      const rs = byDay
        ? await env.DB.prepare(
          'SELECT rowid AS cursor, id, amount, method, label, ref, ts, lines ' +
          'FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND void_ts IS NULL ' +
          `ORDER BY ts DESC LIMIT ${DAY_LIMIT}`
        ).bind(merchant, legacy || merchant, from).all()
        : await env.DB.prepare(
          'SELECT rowid AS cursor, id, amount, method, label, ref, ts, lines ' +
          'FROM sales WHERE merchant IN (?, ?) AND rowid > ? AND void_ts IS NULL ORDER BY rowid ASC LIMIT 50'
        ).bind(merchant, legacy || merchant, since).all();
      rows = (rs && rs.results) || [];
    }
    const vs = await env.DB.prepare(
      'SELECT rowid AS cursor, ref FROM sales WHERE merchant IN (?, ?) AND void_ts IS NOT NULL ' +
      'ORDER BY void_ts DESC LIMIT 500'
    ).bind(merchant, legacy || merchant).all();
    voided = ((vs && vs.results) || []).map((r) => ({ c: r.cursor, r: r.ref || '' }));
  } catch (e) {
    const msg = String((e && e.message) || e);
    /* Base sans void_ts (migration pas encore passée) : on sert le flux comme
     * avant, sans liste de retraits. Une console qui ne peut pas encore annuler
     * est un manque ; un tableau de bord qui n'affiche plus aucune vente serait
     * une panne. */
    const noVoid = msg.includes('void_ts');
    /* Base sans `lines` : on sert les ventes sans le panier plutôt que rien —
     * ne pas savoir classer les produits vaut mieux que ne pas voir sa recette. */
    const noLines = msg.includes('lines');
    if (!noVoid && !noLines) {
      return json({ sales: [], cursor: since, error: 'db', detail: msg }, 500);
    }
    /* La caisse ne demandait que les retraits : sans la colonne, il n'y en a
       aucun à annoncer, et il n'y a rien d'autre à servir. */
    if (voidsOnly) return json({ sales: [], cursor: since, merchant, voided: [] });
    const cols = 'rowid AS cursor, id, amount, method, label, ref, ts' + (noLines ? '' : ', lines');
    /* Les mêmes replis, dans la forme demandée. Servir le curseur à qui a
       demandé une journée renverrait les toutes premières ventes du commerce
       sous le titre « aujourd'hui » — une erreur plus coûteuse qu'une liste
       vide, parce qu'elle a l'air juste. */
    const where = byDay ? 'ts >= ?' : 'rowid > ?';
    const order = byDay ? `ts DESC LIMIT ${DAY_LIMIT}` : 'rowid ASC LIMIT 50';
    const bound = byDay ? from : since;
    try {
      const rs = await env.DB.prepare(
        `SELECT ${cols} FROM sales WHERE merchant IN (?, ?) AND ${where} ORDER BY ${order}`
      ).bind(merchant, legacy || merchant, bound).all();
      rows = (rs && rs.results) || [];
    } catch (e2) {
      /* Il restait la combinaison des deux manques : ni void_ts, ni lines. */
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
        ? arr.map((l) => ({ name: l && l.n, qty: l && l.q, total: l && l.t, cat: (l && l.c) || '' }))
        : null;
    } catch (_) { r.lines = null; }
    return r;
  });

  /* `merchant` is the tenant actually SERVED, which is not always the one asked
   * for — an unclaimed store still snaps back to the account slug. Reporting it
   * makes a mis-scoped feed visible from the outside instead of something you
   * have to infer from whose sales showed up. */
  /* Une lecture par journée ne fait pas avancer le curseur : elle est triée à
     l'envers, si bien que sa dernière ligne est la PLUS ANCIENNE. La rendre
     comme curseur ferait reculer un tableau de bord qui appellerait les deux. */
  const cursor = (!byDay && rows.length) ? rows[rows.length - 1].cursor : since;
  return json({ sales: rows, cursor, merchant, voided });
}
