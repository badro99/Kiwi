/* /api/admin/sales — les ventes de test d'un établissement (console opérateur).
 *
 *   GET  ?merchant=slug&q=&from=&to=&min=&max=&method=&state=  → recherche
 *   GET  ?merchant=slug&ids=a,b,c&impact=1                     → ce que ça emporte
 *   POST {merchant, ids:[…], action:'void'|'restore', reason, note, force}
 *
 * ── POURQUOI ON N'EFFACE PAS ────────────────────────────────────────────────
 * Une installation, une formation, un essai d'imprimante laissent de vraies
 * lignes dans les livres d'un vrai commerçant, et il faut pouvoir les en sortir.
 * Mais DELETE sur une écriture financière est une opération sans retour, et une
 * console d'assistance qui efface des ventes finira par effacer la mauvaise —
 * un identifiant mal copié, deux établissements ouverts côte à côte, un client
 * au téléphone qui donne le mauvais montant.
 *
 * On neutralise donc, on n'efface pas : `sales.void_ts` est daté et /api/feed
 * cesse de servir la ligne. Le montant, le panier, l'heure et la référence
 * restent en base, intacts. Remettre void_ts à NULL rend la vente aux livres à
 * l'identique. Le geste est réversible dans les deux sens, et les deux sens
 * s'inscrivent au journal (`sale_audit`) — y compris la remise, parce que
 * « sortie le 12, remise le 14 » est exactement ce qu'un litige demande.
 *
 * ── CE QUE ÇA CHANGE VRAIMENT ───────────────────────────────────────────────
 * Tout ce qui compte l'argent d'un commerçant recalcule depuis le flux
 * (/api/feed → window.KiwiSales → dateRange.js) : chiffre d'affaires, nombre de
 * ventes, panier moyen, classement produits, répartition des encaissements,
 * rapport journalier d'une journée non clôturée, exports, et les réponses de
 * Kiwi AI. Une seule ligne retirée du flux les corrige tous — c'est le point de
 * passage unique, et c'est pour ça qu'on a mis la coupure là et pas dans dix
 * surfaces.
 *
 * Deux choses NE se recalculent pas toutes seules, et l'aperçu le dit au lieu de
 * le laisser croire :
 *   · le STOCK — la ligne de vente porte le nom du produit, pas l'identifiant de
 *     la déclinaison (couleur × taille) qui a été décrémentée. Deviner la
 *     variante d'après un nom, c'est corrompre un inventaire réel une fois sur
 *     dix. On liste donc exactement ce qu'il y aurait à remettre, et on le
 *     consigne au journal.
 *   · les POINTS DE FIDÉLITÉ — aucune colonne ne relie une vente à une fiche
 *     client (la caisse crédite la fiche de son côté). Même traitement : on
 *     signale, avec le montant, quand la boutique tient un carnet.
 * Inventer ces deux reprises aurait été plus impressionnant à l'écran et faux
 * en base.
 *
 * ── JAMAIS UN AUTRE ÉTABLISSEMENT ───────────────────────────────────────────
 * Chaque requête est bornée par « WHERE merchant = ? », et les identifiants
 * demandés qui ne ressortent pas de cette lecture sont refusés en bloc plutôt
 * qu'ignorés en silence. Un opérateur ayant deux boutiques ouvertes dans deux
 * onglets ne peut donc pas sortir la vente de l'une depuis le panneau de
 * l'autre : ce serait un trou dans le mur qui sépare l'argent de deux commerces.
 */

import {
  isOperator, isSeniorOperator, operatorActor, json,
} from '../../auth/_lib.js';

/* Les motifs. Fermés côté serveur : un journal dont le motif est du texte libre
   se remplit de « test », « ok », « rien » et ne répond plus à la question qu'on
   lui posera dans six mois. 'autre' reste ouvert, mais exige l'explication. */
const REASONS = {
  onboarding:   'Test d’onboarding',
  imprimante:   'Test d’imprimante',
  formation:    'Transaction de formation',
  doublon:      'Transaction en double',
  installation: 'Vérification d’installation',
  autre:        'Autre',
};

const MAX_BATCH = 50;   /* on sélectionne quelques lignes de test, pas une journée */

/* ── la journée commerciale ──────────────────────────────────────────────────
 * `cutoff` est l'heure à laquelle la journée d'un commerce bascule (un bar qui
 * ferme à 3 h du matin encaisse encore « hier »). Elle est réglée par le
 * commerçant et voyage DANS le rapport sauvé, donc on la lit au lieu de la
 * supposer. Le miroir exact de businessDay() dans assets/day-report.js. */
function pad2(n) { return String(n).padStart(2, '0'); }
function businessDay(ts, cutoffH) {
  const d = new Date(Number(ts) || 0);
  if (d.getUTCHours() < (Number(cutoffH) || 0)) d.setUTCDate(d.getUTCDate() - 1);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/* Le classeur des clôtures, tel que la caisse l'a poussé (store_docs, feature
   'dayreports'). Absent ⇒ ce commerce ne clôture pas, et l'aperçu le dira —
   plutôt que d'affirmer « journée ouverte », ce qui serait une conclusion tirée
   d'une absence. */
async function dayIndex(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT data FROM store_docs WHERE merchant = ? AND feature = ?'
    ).bind(merchant, 'dayreports').first();
    if (!row || !row.data) return null;
    const doc = JSON.parse(row.data);
    const days = (doc && doc.days) || null;
    return days && typeof days === 'object' ? days : null;
  } catch (_) { return null; }
}

/* La vente porte-t-elle déjà les marques d'un retour ? /api/sale refuse les
   montants négatifs, donc un remboursement n'atteint JAMAIS cette table : il
   n'existe que dans le rapport journalier. On ne peut donc pas prétendre relier
   une vente à son avoir. Ce qu'on peut faire honnêtement, c'est lire le libellé
   que la caisse a écrit — « Retour », « Avoir », « Remb. » — et le signaler. */
function looksLikeReturn(row) {
  const s = ((row && row.label) || '') + ' ' + ((row && row.ref) || '');
  return /\b(retour|avoir|remb|refund|annul)/i.test(s);
}

function parseLines(raw) {
  if (raw == null) return null;
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return null;
    return a.map((l) => ({
      name: (l && l.n) || '', qty: (l && l.q) || 0, total: (l && l.t) || 0, cat: (l && l.c) || '',
    }));
  } catch (_) { return null; }
}

/* Les colonnes d'annulation manquent-elles encore sur cette base ? La console
   doit pouvoir le DIRE ("relancez schema.sql") au lieu de renvoyer une erreur
   SQL brute, et surtout au lieu d'avoir l'air de fonctionner. */
function isMissingColumn(e) {
  return /no such column|has no column/i.test(String((e && e.message) || e));
}
function isMissingVoidColumn(e) {
  return isMissingColumn(e) && /void_/i.test(String((e && e.message) || e));
}

const SELECT_COLS =
  'rowid AS cursor, id, amount, method, label, ref, ts, lines, ' +
  'void_ts, void_reason, void_note, void_actor';

async function guard(context, senior) {
  if (!(await isOperator(context.request, context.env))) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  /* Lire, tout opérateur ; AGIR, seulement un code nommé. Voir isSeniorOperator()
     dans auth/_lib.js : le laissez-passer d'équipe est un secret partagé, il ne
     peut pas signer une écriture financière. */
  if (senior && !(await isSeniorOperator(context.request, context.env))) {
    return json({ error: 'operator-code-required' }, 403);
  }
  return null;
}

/* ── LECTURE ────────────────────────────────────────────────────────────────*/

export async function onRequestGet(context) {
  const bad = await guard(context, false); if (bad) return bad;
  const { env } = context;
  const url = new URL(context.request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);

  const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_BATCH);
  if (url.searchParams.get('impact') === '1') {
    if (!ids.length) return json({ error: 'ids-required' }, 400);
    try {
      const rows = await byIds(env, merchant, ids);
      if (rows.length !== ids.length) return json({ error: 'foreign-sale' }, 409);
      return json(await impactFor(env, merchant, rows));
    } catch (e) {
      if (isMissingVoidColumn(e)) return json({ error: 'migration-needed' }, 503);
      return json({ error: 'query-failed', detail: String(e && e.message || e) }, 500);
    }
  }

  /* Recherche. Chaque critère est facultatif et s'ajoute au WHERE avec son
     paramètre lié — jamais de concaténation de valeurs dans le SQL. */
  const where = ['merchant = ?'];
  const args = [merchant];

  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  if (q) {
    /* Ce qu'un opérateur a sous les yeux quand il appelle : un numéro de ticket
       lu sur un reçu, un libellé, ou l'identifiant technique d'une ligne
       repérée dans le flux. Les trois cherchent au même endroit. */
    where.push('(label LIKE ? OR ref LIKE ? OR id LIKE ?)');
    const like = '%' + q.replace(/[%_]/g, (c) => '\\' + c) + '%';
    args.push(like, like, like);
  }
  const from = Number(url.searchParams.get('from')) || 0;
  const to = Number(url.searchParams.get('to')) || 0;
  if (from) { where.push('ts >= ?'); args.push(from); }
  if (to) { where.push('ts <= ?'); args.push(to); }
  const min = Number(url.searchParams.get('min')) || 0;
  const max = Number(url.searchParams.get('max')) || 0;
  if (min) { where.push('amount >= ?'); args.push(Math.round(min)); }
  if (max) { where.push('amount <= ?'); args.push(Math.round(max)); }
  const method = (url.searchParams.get('method') || '').trim().slice(0, 16);
  if (method) { where.push('method = ?'); args.push(method); }

  const state = (url.searchParams.get('state') || 'all').trim();
  if (state === 'live') where.push('void_ts IS NULL');
  else if (state === 'voided') where.push('void_ts IS NOT NULL');

  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '60', 10) || 60));

  try {
    const rs = await env.DB.prepare(
      `SELECT ${SELECT_COLS} FROM sales WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT ?`
    ).bind(...args, limit + 1).all();
    const rows = (rs && rs.results) || [];
    const truncated = rows.length > limit;
    if (truncated) rows.pop();
    return json({
      sales: rows.map((r) => ({ ...r, lines: parseLines(r.lines), returnish: looksLikeReturn(r) })),
      truncated, merchant, reasons: REASONS,
    });
  } catch (e) {
    /* Base pas encore migrée : on sert quand même la recherche, sans les
       colonnes d'annulation, et on le signale. La console affiche alors la liste
       en lecture seule avec un bandeau, au lieu d'un panneau vide inexplicable. */
    /* N'importe quelle colonne manquante mène ici : sur une base ancienne
       SQLite signale la PREMIÈRE inconnue de la liste, qui peut être `lines`
       plutôt que `void_ts`. Ne reconnaître que `void_` renvoyait alors un 500
       opaque sur une base qui pouvait parfaitement être servie. */
    if (isMissingColumn(e)) {
      const plain = where.filter((w) => !w.includes('void_ts'));
      /* Sur une base sans colonnes d'annulation, AUCUNE vente ne peut être
         sortie des livres : « les sorties » est donc une liste vide, pas la
         liste entière. Retirer la condition du WHERE sans traiter ce cas aurait
         affiché toutes les ventes du magasin sous l'onglet « sorties ». */
      if (state === 'voided') {
        return json({ sales: [], truncated: false, merchant, reasons: REASONS, migration: 'needed' });
      }
      /* Deux formes possibles en dessous : avec `lines` (le cas courant, cette
         migration-là a été livrée bien avant) et sans (une base très ancienne).
         On essaie la plus riche, puis la plus pauvre — servir la recherche sans
         le détail des paniers vaut mieux que ne rien servir du tout. */
      for (const cols of ['rowid AS cursor, id, amount, method, label, ref, ts, lines',
                          'rowid AS cursor, id, amount, method, label, ref, ts']) {
        try {
          const rs = await env.DB.prepare(
            `SELECT ${cols} FROM sales WHERE ${plain.join(' AND ')} ORDER BY ts DESC LIMIT ?`
          ).bind(...args, limit).all();
          return json({
            sales: ((rs && rs.results) || []).map((r) => ({ ...r, lines: parseLines(r.lines), returnish: looksLikeReturn(r) })),
            truncated: false, merchant, reasons: REASONS, migration: 'needed',
          });
        } catch (_) { /* forme suivante */ }
      }
    }
    return json({ error: 'query-failed', detail: String(e && e.message || e) }, 500);
  }
}

/* Les lignes demandées, ET SEULEMENT celles de cet établissement. Le filtre
   merchant est dans la requête, pas dans un test après coup : un identifiant
   appartenant à une autre boutique ne remonte tout simplement pas, et l'appelant
   voit rows.length < ids.length — d'où le 409 'foreign-sale'. */
async function byIds(env, merchant, ids) {
  if (!ids.length) return [];
  const holes = ids.map(() => '?').join(',');
  const rs = await env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM sales WHERE merchant = ? AND id IN (${holes})`
  ).bind(merchant, ...ids).all();
  return ((rs && rs.results) || []).map((r) => ({ ...r, lines: parseLines(r.lines) }));
}

/* ── L'APERÇU : tout ce que le geste emporte, avant de le faire ─────────────*/

async function impactFor(env, merchant, rows) {
  const days = await dayIndex(env, merchant);
  const totals = { amount: 0, count: rows.length };
  const methods = {};
  const stock = [];          /* ce qu'il y aurait à remettre en rayon */
  const touched = {};        /* jour commercial → ce qu'on en sait */
  const warnings = [];
  const blockers = [];

  rows.forEach((r) => {
    totals.amount += Number(r.amount) || 0;
    const m = r.method || 'cash';
    methods[m] = (methods[m] || 0) + (Number(r.amount) || 0);
    (r.lines || []).forEach((l) => {
      if (!l || !(l.qty > 0)) return;
      stock.push({ name: l.name, qty: l.qty, cat: l.cat || '', sale: r.id });
    });
    if (r.void_ts) blockers.push({ code: 'already-void', sale: r.id, label: 'Vente déjà sortie des livres — utilisez « Remettre ».' });
    if (looksLikeReturn(r)) {
      warnings.push({ code: 'return', sale: r.id,
        label: 'Le libellé de cette vente évoque un retour ou un avoir. Sortir un remboursement des livres REMONTE le chiffre d’affaires au lieu de le baisser — vérifiez le ticket avant.' });
    }
  });
  totals.basket = totals.count ? Math.round(totals.amount / totals.count) : 0;

  /* La journée est-elle clôturée ? C'est le blocage qui compte le plus, et pour
     une raison précise : le rapport journalier d'une journée clôturée est un
     INSTANTANÉ, pas un calcul. Le tableau de bord le sert tel quel (voir
     assets/day-report-dash.js — « le rapport n'est jamais recalculé par-dessus
     l'instantané »). Sortir une vente d'une journée fermée corrige donc le
     chiffre d'affaires courant mais PAS le Z de cette journée-là : il faudra
     rouvrir et re-clôturer. Le dire ici est la différence entre un opérateur qui
     sait ce qu'il laisse derrière lui et un commerçant qui découvre deux
     vérités pour une même journée. */
  rows.forEach((r) => {
    if (!days) return;
    /* On ne connaît pas l'heure de bascule de ce commerce a priori : on la lit
       dans les rapports déjà sauvés. Le premier qui en porte une fait foi. */
    let cut = 0;
    for (const k of Object.keys(days)) { const c = Number(days[k] && days[k].cutoff); if (c > 0) { cut = c; break; } }
    const day = businessDay(r.ts, cut);
    const rep = days[day];
    if (!rep) return;
    const closed = Number(rep.closedCount || 0) > 0 || Number(rep.closedAt || 0) > 0;
    touched[day] = {
      day, closed, gross: rep.gross || 0, txns: rep.txns || 0,
      closedAt: rep.closedAt || 0, closedBy: rep.closedBy || '',
      refunds: (rep.refunds && rep.refunds.count) || 0,
    };
    if (closed) {
      blockers.push({ code: 'day-closed', sale: r.id,
        label: 'Journée du ' + day + ' déjà clôturée' + (rep.closedBy ? ' par ' + rep.closedBy : '') +
               '. Le Z de cette journée est un instantané : il gardera ses chiffres tant qu’il n’est pas rouvert et re-clôturé.' });
    }
    if ((rep.refunds && rep.refunds.count) > 0) {
      warnings.push({ code: 'day-refunds', sale: r.id,
        label: 'Cette journée contient ' + rep.refunds.count + ' remboursement' + (rep.refunds.count > 1 ? 's' : '') +
               '. Assurez-vous que cette vente n’est pas celle qui a été remboursée.' });
    }
  });

  /* Le carnet clients existe-t-il chez ce commerçant ? S'il existe, la caisse a
     pu créditer une fiche au moment de l'encaissement — et aucune colonne ne
     relie les deux. On le signale avec le montant, plutôt que de deviner. */
  let loyalty = null;
  try {
    const c = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM clients WHERE merchant = ? AND deleted = 0'
    ).bind(merchant).first();
    if (c && Number(c.n) > 0) loyalty = { clients: Number(c.n), amount: totals.amount };
  } catch (_) { /* pas de carnet → rien à signaler */ }

  return {
    merchant,
    sales: rows.map((r) => ({
      id: r.id, cursor: r.cursor, amount: r.amount, method: r.method,
      label: r.label, ref: r.ref, ts: r.ts, lines: r.lines, void_ts: r.void_ts,
    })),
    totals, methods, stock, loyalty,
    days: Object.keys(touched).map((k) => touched[k]),
    dayBookKnown: !!days,
    warnings, blockers,
    /* Ce qui se corrige tout seul, énuméré pour l'écran de confirmation : ce sont
       exactement les surfaces qui relisent le flux. */
    auto: ['revenue', 'count', 'basket', 'products', 'methods', 'dayreport-open', 'exports', 'agent'],
    manual: (stock.length ? ['stock'] : []).concat(loyalty ? ['loyalty'] : []),
  };
}

/* ── ÉCRITURE ───────────────────────────────────────────────────────────────*/

export async function onRequestPost(context) {
  const bad = await guard(context, true); if (bad) return bad;
  const { env } = context;

  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = (body.merchant || '').toString().trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  const action = (body.action || '').toString().trim();
  if (action !== 'void' && action !== 'restore') return json({ error: 'bad-action' }, 400);

  const ids = Array.isArray(body.ids)
    ? body.ids.map((s) => String(s || '').trim()).filter(Boolean).slice(0, MAX_BATCH) : [];
  if (!ids.length) return json({ error: 'ids-required' }, 400);

  /* Le motif est imposé à l'écriture, pas seulement proposé à l'écran : un
     bouton peut être contourné, une colonne NOT NULL non. */
  const reason = (body.reason || '').toString().trim();
  const note = (body.note || '').toString().trim().slice(0, 400);
  if (action === 'void') {
    if (!Object.prototype.hasOwnProperty.call(REASONS, reason)) return json({ error: 'reason-required', reasons: REASONS }, 400);
    if (reason === 'autre' && note.length < 3) return json({ error: 'note-required' }, 400);
  }

  let rows;
  try {
    rows = await byIds(env, merchant, ids);
  } catch (e) {
    /* Ici, N'IMPORTE QUELLE colonne manquante veut dire la même chose : cette
       base n'a pas la forme que l'annulation exige, donc on ne touche à rien et
       on le dit. Ne reconnaître que `void_` renvoyait un 500 opaque sur une base
       à qui il manquait aussi `lines`, alors que la réponse utile — « relancez
       schema.sql » — est identique dans les deux cas. */
    if (isMissingColumn(e)) return json({ error: 'migration-needed' }, 503);
    return json({ error: 'query-failed', detail: String(e && e.message || e) }, 500);
  }
  /* Un identifiant qui n'appartient pas à CET établissement fait échouer le lot
     entier. Traiter les autres et taire celui-là serait le pire des deux mondes :
     l'opérateur croirait avoir sorti cinq lignes et en aurait sorti quatre. */
  if (rows.length !== ids.length) return json({ error: 'foreign-sale', found: rows.length, asked: ids.length }, 409);

  /* L'état d'abord, le risque ensuite. « Déjà sortie » n'est pas un danger à
     assumer, c'est une erreur de manipulation, et aucun `force` ne la passe —
     donc elle se tranche AVANT les blocages. Rangée après, elle se faisait
     absorber par le 409 'blocked' générique : la console affichait alors
     l'écran de conséquences et un bouton « sortir malgré l'avertissement » sur
     une vente déjà sortie, c'est-à-dire un bouton qui ne pouvait rien faire. */
  if (action === 'void' && rows.some((r) => r.void_ts)) return json({ error: 'already-void' }, 409);
  if (action === 'restore' && rows.every((r) => !r.void_ts)) return json({ error: 'not-void' }, 409);

  const impact = await impactFor(env, merchant, rows);
  /* Les blocages, eux, sont des risques que l'opérateur PEUT assumer : on
     refuse, on renvoie les conséquences, et la console les montre. `force`
     n'est acceptable qu'après ce passage-là — il est envoyé par le bouton qui
     apparaît SOUS la liste des blocages, jamais par le premier clic. */
  if (action === 'void' && impact.blockers.length && body.force !== true) {
    return json({ error: 'blocked', impact }, 409);
  }

  const actor = await operatorActor(context.request, env);
  const ts = Date.now();
  const stmts = [];

  rows.forEach((r) => {
    if (action === 'void') {
      stmts.push(env.DB.prepare(
        `UPDATE sales SET void_ts = ?, void_reason = ?, void_note = ?, void_actor = ?, void_actor_id = ?
          WHERE id = ? AND merchant = ?`
      ).bind(ts, reason, note, actor.label, actor.id, r.id, merchant));
    } else {
      stmts.push(env.DB.prepare(
        `UPDATE sales SET void_ts = NULL, void_reason = NULL, void_note = NULL, void_actor = NULL, void_actor_id = NULL
          WHERE id = ? AND merchant = ?`
      ).bind(r.id, merchant));
    }
  });

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (isMissingVoidColumn(e)) return json({ error: 'migration-needed' }, 503);
    return json({ error: 'update-failed', detail: String(e && e.message || e) }, 500);
  }

  /* Le journal, après coup et sans jamais faire échouer le geste : si la table
     manque encore, la vente est bel et bien sortie des livres et la console le
     dira — mieux vaut une trace manquante qu'un état incohérent entre la vente
     et son historique. Le renvoi de `journal:false` rend l'absence visible. */
  let journal = true;
  try {
    const perSale = (r) => JSON.stringify({
      totals: { amount: r.amount, count: 1 },
      method: r.method,
      stock: (r.lines || []).filter((l) => l && l.qty > 0).map((l) => ({ name: l.name, qty: l.qty })),
      days: impact.days,
      loyalty: impact.loyalty ? { clients: impact.loyalty.clients, amount: r.amount } : null,
      warnings: impact.warnings.filter((w) => w.sale === r.id).map((w) => w.code),
      blockers: impact.blockers.filter((b) => b.sale === r.id).map((b) => b.code),
      forced: action === 'void' && body.force === true && impact.blockers.length > 0,
    });
    await env.DB.batch(rows.map((r) => env.DB.prepare(
      `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id,
                               amount, method, ref, sale_ts, impact, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(merchant, r.id, action, action === 'void' ? reason : '', action === 'void' ? note : '',
           actor.label, actor.id, r.amount || 0, r.method || '', r.ref || '', r.ts || 0,
           perSale(r), ts)));
  } catch (_) { journal = false; }

  return json({ ok: true, action, merchant, count: rows.length, ts, journal,
                cursors: rows.map((r) => r.cursor) });
}
