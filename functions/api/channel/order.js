// /api/channel/order — une commande venue d'un canal extérieur devient un ticket.
//
//   POST  Authorization: Bearer kwc.<id>.<secret>
//         { ref, mode, customer:{name,phone,address,note}, total, lines:[…] }
//     →   { ok, id, number }
//
// Le problème, tel que le commerçant le vit : le coursier est devant le
// comptoir et attend que l'imprimante DU PRESTATAIRE sorte son étiquette. Kiwi
// sait déjà faire « commande extérieure → ticket → imprimante » — c'est
// littéralement OrderPro depuis le téléphone d'un client. Il manquait la porte
// d'entrée pour quelqu'un qui n'est pas un client de passage.
//
// ── Pourquoi une clé porteuse et pas la porte du site ────────────────────────
// Glovo, Shopify ou un relais Make n'ont ni session ni cookie et n'en auront
// jamais. Il leur faut une clé qui voyage dans l'en-tête. Elle est donc taillée
// pour ne valoir que ça : déposer UNE commande chez UN commerçant. Elle ne lit
// rien, n'accepte rien, ne voit aucune autre commande, et ne peut pas servir à
// deviner un autre magasin — le slug ne vient PAS de la requête, il vient de la
// ligne à laquelle la clé appartient.
//
// ── Ce que cette porte ne fait volontairement pas ───────────────────────────
// Rien n'est auto-accepté. Une commande arrive `pending` et attend le même
// geste humain que celle d'un client au comptoir. Un canal qui pousserait
// directement en cuisine ferait travailler la brigade sur des commandes que
// personne n'a vues — et c'est précisément ce qui rend un prestataire capable
// d'occuper un four sans que le restaurant l'ait voulu.
//
// ── L'état de l'intégration Glovo, écrit ici pour qu'il ne se perde pas ─────
// Glovo appartient à Delivery Hero et son programme POS
// (developers.deliveryhero.com/documentation/pos.html) exige un accord signé :
// on soumet une clé publique PGP, un représentant LOCAL renvoie des identifiants
// chiffrés, on fournit l'URL HTTPS du connecteur, on teste, puis on déploie.
// Ce fichier EST cette URL. Tant que le contrat n'existe pas, aucune ligne de
// code ne peut faire arriver une commande Glovo — et Kiwi ne doit rien afficher
// qui prétende le contraire.
// Jumia Food, encore listé dans plusieurs écrans, a quitté le Maroc fin 2023.

import { json } from '../../auth/_lib.js';
import { startOfWeek } from '../order/_lib.js';

const MAX_LINES = 60;
const MAX_TOTAL = 200000;          // 200 000 MAD — garde-fou, pas une règle
const MAX_PENDING = 60;            // une file qu'aucun personnel ne pourrait traiter
const TOKEN_RE = /^kwc\.([A-Za-z0-9-]{6,64})\.([A-Za-z0-9_-]{20,120})$/;
// Fermée côté serveur : sans cela un canal inventé s'affiche tel quel sur le
// ticket de cuisine, et un ticket peut afficher ce qu'on veut.
const CHANNELS = { glovo: 1, yassir: 1, shopify: 1, generic: 1, kiwi: 1 };

const str = (v, n) => String(v == null ? '' : v).slice(0, n);

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Comparaison à temps constant : comparer deux hex avec === laisse fuir, par le
 * temps de réponse, combien de caractères de tête sont bons. */
function sameHex(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* À qui appartient cette clé ? Renvoie la ligne, ou null. */
async function linkFor(env, token) {
  const m = TOKEN_RE.exec(String(token || ''));
  if (!m) return null;
  let row;
  try {
    row = await env.DB.prepare(
      'SELECT id, merchant, channel, hash, status FROM channel_links WHERE id = ?'
    ).bind(m[1]).first();
  } catch (_) { return null; }        // table pas encore migrée
  if (!row || row.status !== 'active') return null;
  if (!sameHex(row.hash, await sha256Hex(m[2]))) return null;
  return row;
}

/* Trace ce qui vient de se passer sur la ligne du canal. C'est là que le
 * commerçant lira « ça marche » ou « ça a été refusé, et pourquoi » — sans quoi
 * un connecteur muet ne se diagnostique qu'en lisant les logs Cloudflare, ce
 * qu'aucun commerçant ne fera. Jamais bloquant : une commande n'est pas perdue
 * parce que sa trace n'a pas pu s'écrire. */
async function mark(env, id, ok, err) {
  try {
    await env.DB.prepare(
      ok ? 'UPDATE channel_links SET last_ts = ?, last_err = NULL WHERE id = ?'
         : 'UPDATE channel_links SET last_err = ? WHERE id = ?'
    ).bind(ok ? Date.now() : str(err, 120), id).run();
  } catch (_) {}
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const link = token ? await linkFor(env, token) : null;
  // Un seul message pour « pas de clé », « clé inconnue » et « clé en pause » :
  // distinguer les trois dirait à qui cherche laquelle de ses tentatives
  // approche.
  if (!link) return json({ error: 'unauthorized' }, 401);

  let b;
  try { b = await request.json(); } catch (_) {
    await mark(env, link.id, false, 'corps JSON illisible');
    return json({ error: 'bad-json' }, 400);
  }

  const merchant = String(link.merchant || '').toLowerCase();
  const channel = CHANNELS[link.channel] ? link.channel : 'generic';

  const total = Math.round(Number(b && b.total) || 0);
  if (total <= 0 || total > MAX_TOTAL) {
    await mark(env, link.id, false, 'total absent ou hors bornes');
    return json({ error: 'bad-total' }, 400);
  }

  const rawLines = Array.isArray(b && b.lines) ? b.lines : [];
  if (!rawLines.length) {
    await mark(env, link.id, false, 'commande sans ligne');
    return json({ error: 'empty-order' }, 400);
  }
  if (rawLines.length > MAX_LINES) {
    await mark(env, link.id, false, 'trop de lignes');
    return json({ error: 'too-many-lines' }, 400);
  }

  const lines = rawLines.map((l) => ({
    id: str(l && l.id, 40),
    name: str(l && l.name, 80),
    qty: Math.min(99, Math.max(1, Math.round(Number(l && l.qty) || 1))),
    unitPrice: Math.max(0, Math.round(Number(l && l.unitPrice) || 0)),
    options: str(l && l.options, 200),
    note: str(l && l.note, 200),
  }));

  /* Le coursier n'est pas le client. Un ticket de livraison sans adresse ni
   * téléphone renvoie le comptoir vers la tablette du prestataire, ce qui
   * annule tout le bénéfice de l'imprimer ici. */
  const c = (b && b.customer) || {};
  const customer = {
    name: str(c.name, 80),
    phone: str(c.phone, 32),
    address: str(c.address, 240),
    note: str(c.note, 240),
  };
  const ref = str(b && b.ref, 48);
  // 'delivery' est un troisième mode à côté de table/takeout : la cuisine
  // n'emballe pas de la même façon, et l'écran doit pouvoir le dire.
  const mode = b && b.mode === 'takeout' ? 'takeout' : 'delivery';

  /* Rejouer la même commande ne doit pas imprimer deux tickets. Les
   * prestataires REPOUSSENT sur timeout — c'est leur comportement normal, pas
   * une anomalie — et deux tickets pour une commande, c'est un plat préparé
   * deux fois. La référence du prestataire est ce qui les identifie. */
  if (ref) {
    try {
      const dup = await env.DB.prepare(
        'SELECT id, number FROM orders WHERE merchant = ? AND channel = ? AND ext_ref = ?'
      ).bind(merchant, channel, ref).first();
      if (dup) {
        await mark(env, link.id, true);
        return json({ ok: true, id: dup.id, number: dup.number, duplicate: true });
      }
    } catch (_) { /* colonnes pas encore ajoutées → l'insert le dira */ }
  }

  try {
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND status = 'pending'"
    ).bind(merchant).first();
    if (pending && pending.n >= MAX_PENDING) {
      await mark(env, link.id, false, 'file d\'attente pleine');
      return json({ error: 'queue-full' }, 429);
    }
  } catch (_) {}

  const now = Date.now();
  const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);

  let row;
  try {
    // Le numéro est attribué DANS l'insert : deux canaux qui déposent la même
    // seconde ne peuvent pas recevoir le même numéro.
    row = await env.DB.prepare(
      `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                           created_ts, updated_ts, channel, ext_ref, customer)
       SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, '', ?, ?, 'pending', ?, ?, ?, ?, ?
         FROM orders WHERE merchant = ? AND created_ts >= ?
       RETURNING number`
    ).bind(
      id, merchant, mode, total, JSON.stringify(lines), now, now,
      channel, ref, JSON.stringify(customer),
      merchant, startOfWeek(now)
    ).first();
  } catch (e) {
    const detail = String((e && e.message) || e);
    await mark(env, link.id, false, detail);
    return json({ error: 'write-failed', detail }, 500);
  }

  await mark(env, link.id, true);
  return json({ ok: true, id, number: (row && row.number) || 1 });
}
