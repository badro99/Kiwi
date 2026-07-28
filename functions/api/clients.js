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
const PAGE = 500;

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
    points: int(raw && raw.points, 1e9),
    stamps: int(raw && raw.stamps, 1e6),
    visits: int(raw && raw.visits, 1e6),
    spend: int(raw && raw.spend, 1e10),
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
async function nextSrvTs(env, merchant) {
  const now = Date.now();
  try {
    const row = await env.DB.prepare('SELECT MAX(srv_ts) AS m FROM clients WHERE merchant = ?')
      .bind(merchant).first();
    const last = (row && row.m) || 0;
    return last >= now ? last + 1 : now;
  } catch (_) { return now; }
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
      `SELECT id, name, phone, email, birthday, gender, city, address, notes,
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

    return json({
      merchant,
      clients: rows,
      cursor,
      // Le client rappelle tant que `more` est vrai : un carnet de 2 000 fiches
      // sur un navigateur neuf ne doit pas s'arrêter à la première page.
      more: rows.length === PAGE,
    });
  } catch (_) {
    // Table absente (migration pas passée) → neutre. Le carnet local suffit.
    return json({ merchant, clients: [], cursor: since, unmigrated: true });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  const c = sanitize(body);
  if (!c.id) return json({ error: 'no-id' }, 400);

  const srv = await nextSrvTs(env, merchant);

  try {
    await env.DB.prepare(
      `INSERT INTO clients (merchant, id, name, phone, email, birthday, gender, city,
                            address, notes, points, stamps, visits, spend, consent,
                            consent_email, source, first_seen, last_seen, updated_ts,
                            srv_ts, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(merchant, id) DO UPDATE SET
         name = excluded.name, phone = excluded.phone, email = excluded.email,
         birthday = excluded.birthday, gender = excluded.gender, city = excluded.city,
         address = excluded.address, notes = excluded.notes, points = excluded.points,
         stamps = excluded.stamps, visits = excluded.visits, spend = excluded.spend,
         consent = excluded.consent, consent_email = excluded.consent_email,
         source = excluded.source, first_seen = excluded.first_seen,
         last_seen = excluded.last_seen, updated_ts = excluded.updated_ts,
         srv_ts = excluded.srv_ts, deleted = 0
       WHERE excluded.updated_ts >= clients.updated_ts`
    ).bind(
      merchant, c.id, c.name, c.phone, c.email, c.birthday, c.gender, c.city,
      c.address, c.notes, c.points, c.stamps, c.visits, c.spend, c.consent,
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
              gender = '', city = '', address = '', notes = '',
              updated_ts = ?, srv_ts = ?
        WHERE merchant = ? AND id = ?`
    ).bind(Date.now(), srv, merchant, id).run();
  } catch (_) {
    return json({ error: 'unmigrated' }, 503);
  }

  return json({ ok: true, merchant, id, deleted: true, cursor: srv });
}
