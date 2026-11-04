// Client purchase, refund and reward ledger. The route owns authorization.
import { json } from '../../auth/_lib.js';
import { loyaltyOn, pointsFor, stampsFor, refundFor } from '../_rules-loyalty.js';
import { refuseReward } from '../_client-audit.js';
import { purchaseKey, purchaseKeySql } from '../_client-merge.js';

export function createClientEvents({ str, money, resolveClientId, clientCursorStatements, clientCursorSql, missingEventTable }) {
  /* L'argent réellement reçu pour une vente, lu dans le livre des ventes et non
   * dans le corps envoyé par l'appareil. La caisse boutique envoyait la valeur du
   * ticket : un ticket réglé en avoir (bon, carte cadeau), en livraison à encaisser
   * ou en dépôt-vente comptait comme argent encaissé, et la cliente gagnait des
   * points sur de l'argent qui n'était pas rentré. Les parts de règlement figées
   * par /api/sale (espèces, carte, virement, chèque) font foi ; `amount_cents` y
   * est déjà net du bon et du dépôt-vente. Retourne des centimes, ou null quand la
   * vente n'est pas (encore) au serveur : l'appareil reste alors seule source. */
  const MONEY_IN = (method) => method !== 'credit' && method !== 'delivery';
  async function receivedCentsFor(env, merchant, clientId, ref, saleRef) {
    const prefix = 'purchase:' + clientId + ':';
    const keys = [];
    if (ref.startsWith(prefix) && ref.length > prefix.length) keys.push(ref.slice(prefix.length));
    if (saleRef) keys.push(saleRef);
    for (const key of keys) {
      let row = null;
      try {
        row = await env.DB.prepare(
          'SELECT amount, amount_cents, payment_parts FROM sales WHERE merchant = ? AND id = ? LIMIT 1'
        ).bind(merchant, key).first();
      } catch (_) {
        try {
          row = await env.DB.prepare('SELECT amount, amount_cents FROM sales WHERE merchant = ? AND id = ? LIMIT 1')
            .bind(merchant, key).first();
        } catch (_2) { row = null; }
      }
      if (!row) continue;
      let cents = row.amount_cents != null ? Number(row.amount_cents) : Math.round(Number(row.amount || 0) * 100);
      if (!Number.isFinite(cents)) cents = 0;
      let parts = null;
      try { parts = JSON.parse(row.payment_parts || 'null'); } catch (_) { parts = null; }
      if (Array.isArray(parts) && parts.length) {
        const paid = parts.reduce((sum, part) =>
          sum + (part && MONEY_IN(String(part.method || '')) ? Math.max(0, Number(part.amountCents) || 0) : 0), 0);
        cents = Math.min(cents, paid);
      }
      return Math.max(0, cents);
    }
    return null;
  }

  /* Vente pas (encore) au serveur : l'appareil reste seule source du montant,
   * mais pas contre ce qu'il déclare lui-même. Un règlement annoncé tout entier
   * en avoir, en crédit, en livraison à encaisser ou offert n'a fait rentrer
   * aucun argent : il compte zéro, exactement ce que le livre des ventes
   * donnerait une fois la vente arrivée (MONEY_IN). Les libellés de la caisse
   * (« avoir », « livraison », « crédit », « offert ») valent ceux du serveur.
   * Un règlement mixte ou une méthode inconnue garde le montant de l'appareil. */
  const NO_MONEY = new Set(['credit', 'delivery', 'complimentary', 'avoir', 'livraison', 'offert']);
  function declaredNoMoney(method) {
    const parts = String(method || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/\s*[+,/]\s*/).map((part) => part.trim()).filter(Boolean);
    return parts.length > 0 && parts.every((part) => NO_MONEY.has(part));
  }
  async function receivedOrDeclared(env, merchant, clientId, ref, saleRef, method) {
    const received = await receivedCentsFor(env, merchant, clientId, ref, saleRef).catch(() => null);
    if (received != null) return { cents: received, ledger: true };
    return declaredNoMoney(method) ? { cents: 0, ledger: false } : null;
  }

  async function applyPurchase(env, merchant, raw, attempt = 0) {
    const purchase = raw && typeof raw === 'object' ? raw : {};
    // Un id fusionné dans une autre fiche (CL-5) écrit sur celle-ci.
    const clientId = await resolveClientId(env, merchant, str(purchase.clientId || purchase.client_id, 64));
    const ref = str(purchase.ref, 120).replace(/[^A-Za-z0-9:_-]/g, '');
    const claimed = money(purchase.amount, 1e9);
    let amount = claimed;
    const method = str(purchase.method, 32);
    const saleRef = str(purchase.saleRef || purchase.sale_ref, 80);
    const items = JSON.stringify((Array.isArray(purchase.items) ? purchase.items : []).slice(0, 100).map((item) => ({
      ...(item && item.unit ? { unit: str(item.unit, 24) } : {}),
      name: str(item && item.name, 120), qty: Math.max(0, Math.min(100000, Math.round((Number(item && item.qty) || 0) * 1000) / 1000)), total: money(item && item.total, 1e9),
      ...(item && (item.id || item.itemId || item.pid) ? { id: str(item.id || item.itemId || item.pid, 80) } : {}),
    })));
    if (!clientId || !ref) return json({ error: 'client-and-ref-required' }, 400);

    const previous = await env.DB.prepare(
      'SELECT client_id, points, stamps, amount FROM client_purchase_events WHERE merchant = ? AND ref = ?'
    ).bind(merchant, ref).first();
    if (previous) {
      if (previous.client_id !== clientId) return json({ error: 'ref-conflict' }, 409);
      /* Le montant gardé peut être celui du livre des ventes, plus bas que la
       * somme annoncée par l'appareil : une reprise de la même annonce reste une
       * reprise. */
      const stored = Math.round(Number(previous.amount || 0) * 100);
      if (stored !== Math.round(claimed * 100)) {
        const received = await receivedOrDeclared(env, merchant, clientId, ref, saleRef, method);
        if (received == null || stored !== Math.min(Math.round(claimed * 100), received.cents)) {
          return json({ error: 'ref-conflict' }, 409);
        }
      }
      return json({ ok: true, replayed: true, spend: Number(previous.amount || 0), points: Number(previous.points || 0), stamps: Number(previous.stamps || 0) });
    }
    const client = await env.DB.prepare(
      'SELECT id, srv_ts FROM clients WHERE merchant = ? AND id = ? AND deleted = 0'
    ).bind(merchant, clientId).first();
    if (!client) return json({ error: 'client-not-found' }, 404);
    /* Le montant compte en centimes entiers, plafonné par le livre des ventes :
     * l'appareil ne peut que déclarer moins (une part d'addition, des articles
     * exclus), jamais plus que la vente encaissée. Sans vente au serveur,
     * l'appareil sert de repli et la réponse le dit (`amountSource: 'device'`). */
    const received = await receivedOrDeclared(env, merchant, clientId, ref, saleRef, method);
    const claimedCents = Math.round(claimed * 100);
    const amountCents = received != null ? Math.min(claimedCents, received.cents) : claimedCents;
    const amountSource = received != null && received.ledger ? 'ledger' : 'device';
    amount = amountCents / 100;
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
    const key = purchaseKey({ ref, sale_ref: saleRef });
    let duplicate = await env.DB.prepare(
      `SELECT ref FROM client_purchase_events WHERE merchant = ? AND client_id = ? AND (${purchaseKeySql}) = ? AND visits > 0 LIMIT 1`
    ).bind(merchant, clientId, key).first();
    if (!duplicate) {
      try {
        duplicate = await env.DB.prepare(
          'SELECT ref FROM employee_loyalty_events WHERE merchant = ? AND client_id = ? AND ref = ?'
        ).bind(merchant, clientId, ('employee-sale:' + key).slice(0, 96)).first();
      } catch (error) {
        if (!missingEventTable(error)) throw error;
      }
    }
    const points = !duplicate && on && cfg.model === 'amount' ? pointsFor(amountCents / 100, cfg) : 0;
    const stamps = duplicate ? 0 : stampsFor(cfg, purchase.items);
    const visits = duplicate ? 0 : 1, spend = duplicate ? 0 : amount;
    const now = Date.now();
    if (!env.DB || typeof env.DB.batch !== 'function') return json({ error: 'atomic-write-required' }, 503);
    const cursor = clientCursorSql();
    const results = await env.DB.batch([
      ...clientCursorStatements(env, merchant, now),
      env.DB.prepare(`UPDATE clients SET points = points + ?, stamps = stamps + ?,
      visits = visits + ?, spend = spend + ?, first_seen = CASE WHEN first_seen > 0 THEN first_seen ELSE ? END,
      last_seen = ?, updated_ts = ?, srv_ts = ${cursor}
      WHERE merchant = ? AND id = ? AND deleted = 0 AND srv_ts = ?
        AND NOT EXISTS (SELECT 1 FROM client_purchase_events WHERE merchant = ? AND ref = ?)`)
        .bind(points, stamps, visits, spend, now, now, now, merchant, merchant, clientId, client.srv_ts, merchant, ref),
      env.DB.prepare(`INSERT OR IGNORE INTO client_purchase_events
      (merchant, ref, client_id, amount, points, stamps, visits, created_ts, srv_ts, method, items, sale_ref)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ${cursor}, ?, ?, ? WHERE changes() > 0`)
        .bind(merchant, ref, clientId, amount, points, stamps, visits, now, merchant, method, items, saleRef),
    ]);
    if (!Number(results[2] && results[2].meta && results[2].meta.changes)) {
      const replay = await env.DB.prepare(
        'SELECT client_id, amount, points, stamps FROM client_purchase_events WHERE merchant = ? AND ref = ?'
      ).bind(merchant, ref).first();
      if (replay && replay.client_id === clientId) {
        return json({ ok: true, replayed: true, spend: Number(replay.amount || 0), points: Number(replay.points || 0), stamps: Number(replay.stamps || 0) });
      }
      if (attempt < 4) return applyPurchase(env, merchant, raw, attempt + 1);
      return json({ error: 'purchase-write-failed' }, 503);
    }
    if (!Number(results[3] && results[3].meta && results[3].meta.changes)) {
      return json({ error: 'purchase-write-failed' }, 503);
    }
    return json({ ok: true, points, stamps, visits, spend, amountSource });
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
    // Un id fusionné dans une autre fiche (CL-5) écrit sur celle-ci.
    const clientId = await resolveClientId(env, merchant, str(refund.clientId || refund.client_id, 64));
    const ref = str(refund.ref, 120).replace(/[^A-Za-z0-9:_-]/g, '');
    const amount = money(refund.amount, 1e9);
    const saleRef = str(refund.saleRef || refund.sale_ref, 80);
    const items = JSON.stringify((Array.isArray(refund.items) ? refund.items : []).slice(0, 100).map((item) => ({
      ...(item && item.unit ? { unit: str(item.unit, 24) } : {}),
      name: str(item && item.name, 120), qty: Math.max(0, Math.min(100000, Math.round((Number(item && item.qty) || 0) * 1000) / 1000)), total: money(item && item.total, 1e9),
      ...(item && (item.id || item.itemId || item.pid) ? { id: str(item.id || item.itemId || item.pid, 80) } : {}),
    })));
    if (!clientId || !ref.startsWith('refund:') || !saleRef || !(amount > 0)) return json({ error: 'refund-fields-required' }, 400);

    const previous = await env.DB.prepare(
      'SELECT client_id, amount, points, stamps FROM client_purchase_events WHERE merchant = ? AND ref = ?'
    ).bind(merchant, ref).first();
    if (previous) {
      if (previous.client_id !== clientId) return json({ error: 'ref-conflict' }, 409);
      return json({ ok: true, replayed: true, spend: Number(previous.amount || 0), points: Number(previous.points || 0), stamps: Number(previous.stamps || 0) });
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
       FROM client_purchase_events WHERE merchant = ? AND client_id = ? AND sale_ref = ?
         AND (visits > 0 OR ref LIKE 'refund:%')`
    ).bind(merchant, clientId, saleRef).first();
    const cfgRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'fidelity'")
      .bind(merchant).first();
    const cfg = (() => { try { return JSON.parse(cfgRow && cfgRow.data || '{}') || {}; } catch (_) { return {}; } })();
    // A fully returned ticket reverses its historical earning, even after a
    // catalogue rename. Partial returns still qualify their individual lines.
    const fullReturn = Number(sale?.paid) > 0 && Math.round(amount * 100) >= Math.round(Number(sale.paid) * 100) - Math.round(Number(sale.refunded || 0) * 100);
    const { take, pointsTake, stampsTake } = refundFor(sale, amount, cfg, fullReturn ? [] : refund.items, client);
    const now = Date.now();
    if (!env.DB || typeof env.DB.batch !== 'function') return json({ error: 'atomic-write-required' }, 503);
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
      const replay = await env.DB.prepare('SELECT client_id, amount, points, stamps FROM client_purchase_events WHERE merchant = ? AND ref = ?')
        .bind(merchant, ref).first();
      if (replay && replay.client_id === clientId) return json({ ok: true, replayed: true, spend: Number(replay.amount || 0), points: Number(replay.points || 0), stamps: Number(replay.stamps || 0) });
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

    // The event named after this sale first: split payments of one receipt
    // share its number, and voiding one part must not take back the others.
    // Exact matches only: no LIKE pattern built from an id.
    const own = await env.DB.prepare(
      `SELECT client_id, sale_ref, COALESCE(SUM(amount), 0) AS paid FROM client_purchase_events
      WHERE merchant = ? AND visits > 0 AND substr(ref, 1, 7) <> 'refund:' AND sale_ref <> ''
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
      WHERE merchant = ? AND visits > 0 AND substr(ref, 1, 7) <> 'refund:' AND (sale_ref = ? OR (? <> '' AND sale_ref = ?))
      GROUP BY client_id, sale_ref`
    ).bind(merchant, id, ref, ref).all();
    return (rows && rows.results) || [];
  }
  async function voidSaleLoyalty(env, merchant, sale) {
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
  async function restoreSaleLoyalty(env, merchant, sale) {
    let given = 0;
    try {
      if (typeof env.DB.batch !== 'function') return 0;

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
    // Un id fusionné dans une autre fiche (CL-5) écrit sur celle-ci.
    const clientId = await resolveClientId(env, merchant, str(redemption.clientId || redemption.client_id, 64));
    const ref = String(redemption.ref || '');
    if (!/^[A-Za-z0-9:_-]{1,96}$/.test(ref)) return json({ error: 'invalid-refusal' }, 400);
    if (!clientId || !ref) return json({ error: 'client-and-ref-required' }, 400);

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
    if (!client) return refuseReward(env, merchant, clientId, ref, 'client-not-found', 404);
    const cfgRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'fidelity'")
      .bind(merchant).first();
    const cfg = (() => { try { return JSON.parse(cfgRow && cfgRow.data || '{}') || {}; } catch (_) { return {}; } })();
    /* Sans programme ouvert, il n'y a rien à remettre : la caisse le refusait
     * déjà, l'API acceptait encore 100 points comme si un seuil existait. */
    if (!loyaltyOn(cfg)) return refuseReward(env, merchant, clientId, ref, 'loyalty-off');
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
      return refuseReward(env, merchant, clientId, ref, 'reward-not-ready');
    }
    const now = Date.now();
    if (!env.DB || typeof env.DB.batch !== 'function') return json({ error: 'atomic-write-required' }, 503);
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
      return refuseReward(env, merchant, clientId, ref, 'reward-not-ready');
    }
    if (!Number(results[3] && results[3].meta && results[3].meta.changes)) {
      return json({ error: 'reward-write-failed' }, 503);
    }
    return json({ ok: true, pointsDelta, stampsDelta });
  }

  return { applyPurchase, applyRefund, applyRedemption, voidSaleLoyalty, restoreSaleLoyalty };
}
