/* Glovo · l'API Partners, côté Kiwi.
 *
 * Glovo ne fournit pas de connecteur de caisse (ticket NFQC-5519, 19 nov. 2026) :
 * c'est le logiciel de caisse qui héberge les webhooks et qui rend compte.
 *   Glovo → Kiwi  POST dispatched / picked_up / cancelled  (functions/api/channel/glovo/)
 *   Kiwi → Glovo  PUT /api/v0/integrations/orders/{id}/accept | ready_for_pickup
 *                 | customer_picked_up | out_for_delivery, PUT /api/v1/…/delivered
 *                 | adjust_preparation_time (notifyGlovo, _glovo-ops.js), la
 *                 fermeture temporaire, le menu et les mises à jour en lot
 *                 (_glovo-menu.js) ; tous par _glovo-api.js › glovoCall (limite
 *                 de 120 appels/min par adresse, règles de relance de Glovo).
 * Doc : https://api-docs.glovoapp.com/partners/index.html
 *
 * UN jeton pour toute l'intégration (secret Cloudflare GLOVO_TOKEN) : Glovo
 * l'envoie dans `Authorization` sur nos webhooks, nous le renvoyons sur leurs
 * routes. Le commerçant ne vient donc pas du jeton mais du `store_id` du corps,
 * traduit par la table glovo_stores. GLOVO_API_BASE choisit Stage ou production.
 *
 * Ce qui est volontairement absent : l'annulation côté magasin (« Available
 * soon », à ne pas appeler avant l'annonce de Glovo), la modification de
 * commande (replace_products, change_price), les promotions, la validation de
 * carte de fidélité en temps réel (un code reçu s'affiche sur le ticket). */
import { json } from '../../../auth/_lib.js';
import { startOfWeek } from '../../order/_lib.js';
import { merchantZone } from '../../_business-day.js';
import { storeSuspended, storeSubscriptionPending } from '../../_private.js';
import { glovoCall } from './_glovo-api.js';

const MAX_BODY = 256 * 1024;
const MAX_LINES = 60;
const MAX_PENDING = 60;
const DEFAULT_BASE = 'https://api.glovoapp.com';
const STORE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const cents = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const mad = (c) => Math.round(c) / 100;

/* Comparaison à temps constant du jeton partagé. Un jeton absent côté serveur
 * n'est jamais « égal » à un en-tête vide : le webhook répond 503 avant. */
function sameToken(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* La doc dit `Authorization: token` ; certains clients HTTP préfixent « Bearer ». */
export function glovoAuth(request, env) {
  const expected = String((env && env.GLOVO_TOKEN) || '');
  if (!expected) return json({ error: 'not-configured' }, 503);
  let got = String(request.headers.get('Authorization') || '').trim();
  if (/^Bearer\s+/i.test(got)) got = got.replace(/^Bearer\s+/i, '');
  return sameToken(got, expected) ? null : json({ error: 'unauthorized' }, 401);
}

export async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return { error: json({ error: 'too-large' }, 413) };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return { error: json({ error: 'too-large' }, 413) };
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return { body };
  } catch (_) { return { error: json({ error: 'bad-json' }, 400) }; }
}

export async function storeFor(env, storeId) {
  const id = str(storeId, 64);
  if (!STORE_ID.test(id)) return null;
  try {
    let row;
    try {
      row = await env.DB.prepare(
        'SELECT store_id, merchant, prep_minutes, status, marketplace FROM glovo_stores WHERE store_id = ?'
      ).bind(id).first();
    } catch (_) {
      /* Base sans 0035 : le connecteur de 0026 continue, sans Marketplace. */
      row = await env.DB.prepare(
        'SELECT store_id, merchant, prep_minutes, status, 0 AS marketplace FROM glovo_stores WHERE store_id = ?'
      ).bind(id).first();
    }
    return row && row.status === 'active' ? row : null;
  } catch (_) { return null; }
}

async function stampStore(env, storeId, ok, err) {
  try {
    await env.DB.prepare(ok
      ? 'UPDATE glovo_stores SET last_ts = ?, last_err = NULL WHERE store_id = ?'
      : 'UPDATE glovo_stores SET last_err = ? WHERE store_id = ?'
    ).bind(ok ? Date.now() : str(err, 120), storeId).run();
  } catch (_) {}
}

/* ── Traduction d'une commande Glovo ──────────────────────────────────────────
 * Glovo compte en centimes. Le prix d'un produit n'inclut pas ses attributs
 * (« Extra meat » +3,00) : le prix unitaire du ticket les additionne, comme le
 * total Glovo (exemple de la doc : 2 × (10,00 + 3,00) + 4,80 = 30,80). Un menu
 * (sub_products) se lit sur une ligne, ses éléments dans les options. */
function attrList(attrs) {
  return (Array.isArray(attrs) ? attrs : []).filter((a) => a && a.name).slice(0, 20);
}
function attrCents(attrs) {
  return attrList(attrs).reduce((s, a) => s + cents(a.price) * Math.max(1, cents(a.quantity) || 1), 0);
}
function attrName(a) {
  const q = cents(a.quantity);
  return (q > 1 ? q + '× ' : '') + str(a.name, 60);
}
/* Glovo date ses heures en heure LOCALE du magasin (« yyyy-MM-dd HH:mm:ss »)
 * et donne l'écart à part (utc_offset_minutes) : on rend un instant UTC. */
export function glovoLocalToIso(local, offsetMinutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(local || '').trim());
  if (!m) return null;
  const off = Number(offsetMinutes);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - (Number.isFinite(off) ? off : 0) * 60000;
  return Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
}
const kg = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? String(Math.round(n * 1000) / 1000).replace('.', ',') : ''; };
/* Ce que la préparation doit savoir d'une ligne, au-delà du nom : le poids
 * (produits au poids, avec la fourchette que Glovo accepte), l'emballage, la
 * remise de la ligne, et que faire si le produit manque. */
function lineFacts(x) {
  const bits = [];
  const disc = cents(x.discount);
  if (disc > 0) bits.push('remise −' + (disc / 100).toFixed(2) + ' MAD');
  if (kg(x.weight)) {
    const unit = str(x.pricing_type, 12);
    const range = kg(x.min_weight) && kg(x.max_weight) ? ' (' + kg(x.min_weight) + ' à ' + kg(x.max_weight) + ')' : '';
    bits.push('poids ' + kg(x.weight) + (unit ? ' ' + unit : '') + range);
  }
  const pk = x.packaging && typeof x.packaging === 'object' ? x.packaging : null;
  if (pk) {
    if (cents(pk.price) > 0) bits.push('emballage +' + (cents(pk.price) / 100).toFixed(2) + ' MAD');
    if (pk.is_returnable) bits.push('emballage consigné');
  }
  const us = x.unavailability_strategy && typeof x.unavailability_strategy === 'object' ? x.unavailability_strategy : null;
  const alts = us && Array.isArray(us.alternative_products) ? us.alternative_products.filter((a) => a && a.id) : [];
  const altRef = (a) => str((Array.isArray(a.eans) && a.eans[0]) || a.id, 32);
  const ifMissing = !us ? ''
    : us.action === 'REMOVE' ? 'Si manquant : retirer'
    : us.action === 'REPLACE_WITH_CUSTOMER_SELECTION' && alts.length ? 'Si manquant : remplacer par le choix du client (' + altRef(alts[0]) + ')'
    : us.action === 'REPLACE_WITH_BEST_MATCH' && alts.length ? 'Si manquant : remplacer par ' + alts.slice(0, 3).map(altRef).join(', ') + (alts.length > 3 ? '…' : '')
    : '';
  return { bits, note: ifMissing, packagingCents: pk ? Math.max(0, cents(pk.price)) : 0 };
}

export function mapGlovoOrder(p, opts) {
  let packagingCents = 0;
  const products = Array.isArray(p && p.products) ? p.products.filter((x) => x && x.name) : [];
  const lines = products.slice(0, MAX_LINES).map((x) => {
    const subs = (Array.isArray(x.sub_products) ? x.sub_products : []).filter((s) => s && s.name).slice(0, 12);
    const unit = cents(x.price) + attrCents(x.attributes)
      + subs.reduce((s, sp) => s + (cents(sp.price) + attrCents(sp.attributes)) * Math.max(1, cents(sp.quantity) || 1), 0);
    const facts = lineFacts(x);
    /* Les faits de la ligne passent avant les options : une option tronquée
     * se devine, un poids ou une remise tronqués non. */
    const options = facts.bits.concat(attrList(x.attributes).map(attrName), subs.map((sp) => {
      const inner = attrList(sp.attributes).map(attrName);
      return (cents(sp.quantity) > 1 ? cents(sp.quantity) + '× ' : '') + str(sp.name, 60) + (inner.length ? ' (' + inner.join(', ') + ')' : '');
    }));
    const qty = Math.min(99, Math.max(1, cents(x.quantity) || 1));
    packagingCents += facts.packagingCents * qty;
    return {
      id: str(x.id, 40), name: str(x.name, 80),
      qty,
      unitPrice: mad(unit), options: str(options.join(' · '), 240), note: str(facts.note, 160),
      /* L'identifiant de CETTE sélection chez Glovo : celui qu'une modification
       * de commande (replace_products) devra citer. */
      ...(str(x.purchased_product_id, 64) ? { glovoPid: str(x.purchased_product_id, 64) } : {}),
    };
  });

  /* Ce que le magasin facture, en centimes entiers :
   *   produits après SA propre remise (partner_discounted_products_total ; la
   *   remise financée par Glovo ne touche pas le commerçant)
   * + le sac (bag_fee, quand Glovo l'envoie)
   * + Marketplace seulement (le magasin livre) : la livraison et le
   *   supplément panier minimum, que le livreur du magasin encaisse.
   * Les frais de service restent à Glovo : notés, jamais sur le ticket.
   * Chaque montant entre en ligne de ticket ; ce que les lignes n'expliquent
   * pas reste visible (« Écart Glovo »), jamais corrigé en silence. */
  const has = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const marketplace = !!(opts && opts.marketplace);
  const productsCents = has(p && p.partner_discounted_products_total)
    ? cents(p.partner_discounted_products_total) : cents(p && p.estimated_total_price);
  const fee = (id, name, v) => (has(v) && cents(v) > 0
    ? { id, name, qty: 1, unitPrice: mad(cents(v)), options: '', note: '', fee: true } : null);
  const fees = [
    fee('glovo-bag', 'Sac', p && p.bag_fee),
    marketplace ? fee('glovo-delivery', 'Livraison', p && p.delivery_fee) : null,
    marketplace ? fee('glovo-surcharge', 'Supplément panier minimum', p && p.minimum_basket_surcharge) : null,
  ].filter(Boolean);
  const feeCents = fees.reduce((t, f) => t + Math.round(f.unitPrice * 100), 0);
  const totalCents = productsCents + feeCents;
  let productLineCents = lines.reduce((t, l) => t + Math.round(l.unitPrice * 100) * l.qty, 0);
  const partnerDiscount = has(p && p.partner_discounts_products) ? Math.max(0, cents(p.partner_discounts_products)) : 0;
  /* L'emballage payant : quand c'est exactement ce que les produits seuls
   * n'expliquent pas, il devient une ligne (comptée dans les produits, le
   * total ne bouge pas). Sinon il reste écrit sur sa ligne et l'écart, s'il y
   * en a un, reste visible plus bas. */
  if (packagingCents > 0 && productsCents - productLineCents + partnerDiscount === packagingCents) {
    lines.push({ id: 'glovo-packaging', name: 'Emballage', qty: 1, unitPrice: mad(packagingCents), options: '', note: '', fee: true });
    productLineCents += packagingCents;
  }
  lines.push(...fees);

  const c = (p && p.customer) || {};
  const phone = str(c.phone_number, 32);
  const a = (p && p.delivery_address) || {};
  const addressBits = [
    str(a.label, 160),
    a.building_name ? 'Imm. ' + str(a.building_name, 40) : '',
    a.floor_number ? 'Étage ' + str(a.floor_number, 10) : '',
    a.door_number ? 'Porte ' + str(a.door_number, 10) : '',
    str(a.additional_information, 120),
  ].filter(Boolean);
  const adjustment = totalCents - productLineCents - feeCents;
  const money = (v) => (v / 100).toFixed(2) + ' MAD';
  const currency = str(p && p.currency, 8).toUpperCase();
  const inv = c.invoicing_details && typeof c.invoicing_details === 'object' ? c.invoicing_details : null;
  const invoice = inv && (str(inv.company_name, 80) || str(inv.tax_id, 32))
    ? { company: str(inv.company_name, 80), taxId: str(inv.tax_id, 32), address: str(inv.company_address, 160) } : null;
  const courier = p && p.courier && typeof p.courier === 'object' ? p.courier : {};
  const courierPhone = str(courier.phone_number, 32);
  const bundled = Array.isArray(p && p.bundled_orders) ? p.bundled_orders.map((x) => str(x, 64)).filter(Boolean).slice(0, 10) : [];
  const others = bundled.filter((x) => x !== str(p && p.order_id, 64));
  const voucherCents = has(p && p.meal_voucher_amount) ? cents(p.meal_voucher_amount) : 0;
  /* L'argent d'abord (une note tronquée ne perd jamais un montant), le texte libre ensuite. */
  const notes = [
    currency && currency !== 'MAD' ? 'Devise ' + currency + ' (montants à vérifier)' : '',
    p && p.pick_up_code ? 'Code retrait ' + str(p.pick_up_code, 12) : '',
    marketplace && has(p && p.total_customer_to_pay) ? 'Client paie ' + money(cents(p.total_customer_to_pay)) : '',
    marketplace && has(p && p.customer_cash_payment_amount) ? 'Espèces remises ' + money(cents(p.customer_cash_payment_amount)) : '',
    p && p.payment_method === 'CASH' ? (marketplace ? 'Paiement en espèces au livreur du magasin' : 'Coursier paie en espèces') : '',
    voucherCents > 0 ? 'Titre-restaurant ' + money(voucherCents) + (str(p.meal_voucher_provider, 30) ? ' (' + str(p.meal_voucher_provider, 30) + ')' : '') : '',
    adjustment && adjustment === -partnerDiscount ? 'Remise du magasin ' + money(adjustment)
      : (adjustment ? 'Ajustement canal: ' + (adjustment / 100).toFixed(2) + ' MAD (Écart Glovo, à vérifier)' : ''),
    marketplace && has(p && p.service_fee) && cents(p.service_fee) > 0 ? 'Frais de service Glovo ' + money(cents(p.service_fee)) + ' (hors ticket)' : '',
    invoice ? 'Facture demandée : ' + [invoice.company, invoice.taxId ? 'ICE/IF ' + invoice.taxId : '', invoice.address].filter(Boolean).join(', ') : '',
    str(p && p.allergy_info, 160) ? 'Allergie : ' + str(p.allergy_info, 160) : '',
    /* Le coursier et les commandes groupées vivent sur la carte de la caisse (glovo.*), pas dans la note. */
    p && p.cutlery_requested ? 'Couverts' : '',
    str(p && p.loyalty_card, 40) ? 'Carte fidélité ' + str(p.loyalty_card, 40) : '',
    str(p && p.voucher_code, 40) ? 'Bon ' + str(p.voucher_code, 40) : '',
    str(p && p.special_requirements, 160),
  ].filter(Boolean);

  return {
    ref: str((p && p.order_code) || (p && p.order_id), 48),
    mode: p && p.is_picked_up_by_customer ? 'takeout' : 'delivery',
    total: mad(totalCents),
    lines,
    customer: {
      name: str(c.name, 80),
      phone: /^n\/?a$/i.test(phone) ? '' : phone,
      address: str(addressBits.join(', '), 240),
      note: str(notes.join(' · '), 600),
      channelAdjustmentCents: adjustment,
      glovo: {
        marketplace,
        productsCents, partnerDiscountCents: partnerDiscount, feeCents,
        bagCents: has(p && p.bag_fee) ? cents(p.bag_fee) : 0,
        serviceFeeCents: has(p && p.service_fee) ? cents(p.service_fee) : 0,
        customerToPayCents: has(p && p.total_customer_to_pay) ? cents(p.total_customer_to_pay) : null,
        cashCents: has(p && p.customer_cash_payment_amount) ? cents(p.customer_cash_payment_amount) : null,
        cutlery: !!(p && p.cutlery_requested),
        loyaltyCard: str(p && p.loyalty_card, 40),
        voucher: str(p && p.voucher_code, 40),
        currency: currency || 'MAD',
        orderTime: glovoLocalToIso(p && p.order_time, p && p.utc_offset_minutes),
        courierEta: glovoLocalToIso(p && p.estimated_pickup_time, p && p.utc_offset_minutes),
        courier: str(courier.name, 40) || courierPhone ? { name: str(courier.name, 40), phone: /^n\/?a$/i.test(courierPhone) ? '' : courierPhone } : null,
        bundled: others,
        invoice,
        customerHash: str(c.hash, 64),
        packagingCents,
        /* La part financée par Glovo ne touche pas le commerçant : notée, hors ticket. */
        glovoDiscountCents: has(p && p.glovo_discounts_products) ? cents(p.glovo_discounts_products) : null,
        discountedTotalCents: has(p && p.discounted_products_total) ? cents(p.discounted_products_total) : null,
        mealVoucherCents: voucherCents || null,
        mealVoucherProvider: str(p && p.meal_voucher_provider, 30),
      },
    },
  };
}

/* ── Dépôt : un order_id Glovo = un ticket Kiwi ───────────────────────────── */
export async function depositGlovoOrder(env, store, p, now = Date.now()) {
  const merchant = String(store.merchant || '').toLowerCase();
  const orderId = str(p && p.order_id, 64);
  if (!orderId) return json({ error: 'missing-order-id' }, 400);
  if (await storeSuspended(env, merchant) || await storeSubscriptionPending(env, merchant)) {
    await stampStore(env, store.store_id, false, 'commerce suspendu');
    return json({ error: 'store-unavailable' }, 404);
  }
  const replay = async () => {
    const row = await env.DB.prepare(
      `SELECT o.id, o.number FROM glovo_orders g JOIN orders o ON o.id = g.kiwi_order_id
        WHERE g.order_id = ?`
    ).bind(orderId).first();
    return row ? json({ ok: true, id: row.id, number: row.number, duplicate: true }) : null;
  };
  try { const dup = await replay(); if (dup) return dup; } catch (_) {}

  const m = mapGlovoOrder(p, { marketplace: Number(store.marketplace) === 1 });
  if (!m.lines.length) { await stampStore(env, store.store_id, false, 'commande sans produit'); return json({ error: 'empty-order' }, 400); }
  if (!(m.total > 0)) { await stampStore(env, store.store_id, false, 'total absent'); return json({ error: 'bad-total' }, 400); }

  try {
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND status = 'pending'"
    ).bind(merchant).first();
    if (pending && pending.n >= MAX_PENDING) {
      await stampStore(env, store.store_id, false, 'file d\'attente pleine');
      return json({ error: 'queue-full' }, 429);
    }
  } catch (_) {}

  const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
  let number = 1;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                             created_ts, updated_ts, channel, ext_ref, customer)
         SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, '', ?, ?, 'pending', ?, ?, 'glovo', ?, ?
           FROM orders WHERE merchant = ? AND created_ts >= ?
         RETURNING number`
      ).bind(id, merchant, m.mode, m.total, JSON.stringify(m.lines), now, now, m.ref,
        JSON.stringify(m.customer), merchant, startOfWeek(now, await merchantZone(env, merchant))),
      env.DB.prepare(
        `INSERT INTO glovo_orders (order_id, store_id, merchant, kiwi_order_id, order_code, pickup, created_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(orderId, store.store_id, merchant, id, m.ref, m.mode === 'takeout' ? 1 : 0, now),
    ]);
    const first = results && results[0];
    number = (first && first.results && first.results[0] && first.results[0].number) || 1;
  } catch (e) {
    /* Deux relances simultanées : la clé primaire de glovo_orders a tranché,
     * et le lot entier de la perdante a été annulé. */
    try { const dup = await replay(); if (dup) return dup; } catch (_) {}
    await stampStore(env, store.store_id, false, String((e && e.message) || e));
    return json({ error: 'write-failed' }, 500);
  }
  await stampStore(env, store.store_id, true);
  return json({ ok: true, id, number });
}

/* ── Annulation venue de Glovo ────────────────────────────────────────────── */
export async function cancelGlovoOrder(env, p, now = Date.now()) {
  const orderId = str(p && p.order_id, 64);
  const storeId = str(p && p.store_id, 64);
  let link = null;
  try {
    link = await env.DB.prepare(
      'SELECT order_id, store_id, merchant, kiwi_order_id, cancelled_ts FROM glovo_orders WHERE order_id = ? AND store_id = ?'
    ).bind(orderId, storeId).first();
  } catch (_) {}
  /* 200 quand même : Glovo relance tout ce qui n'est pas 2xx, et une commande
   * qui ne nous a jamais été confiée n'a rien à annuler ici. */
  if (!link) return json({ ok: true, ignored: true });
  if (link.cancelled_ts) return json({ ok: true, replayed: true });
  const reason = str(p && p.cancel_reason, 40);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE orders SET status = 'rejected', updated_ts = ?, cancel_actor_id = 'glovo',
                cancel_actor_name = 'Glovo', cancel_ts = ?
          WHERE id = ? AND merchant = ? AND status IN ('pending','accepted','ready') AND paid_ts IS NULL`
      ).bind(now, now, link.kiwi_order_id, link.merchant),
      env.DB.prepare('UPDATE glovo_orders SET cancelled_ts = ?, cancel_reason = ? WHERE order_id = ?')
        .bind(now, reason, orderId),
    ]);
  } catch (_) { return json({ error: 'write-failed' }, 500); }
  return json({ ok: true });
}

/* ── Retour vers Glovo ────────────────────────────────────────────────────────
 * Appelé APRÈS qu'une commande a bougé dans la file (waitUntil) : la caisse n'attend
 * jamais Glovo, et un refus de Glovo ne défait rien chez nous. Il s'écrit sur
 * glovo_orders.last_call_err, que l'opérateur lit. */
const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/* Le passage de la file → la route Glovo, selon le type de commande :
 *   coursier Glovo  accepted → accept (heure promise), ready → ready_for_pickup
 *   retrait client  accepted → accept, served → customer_picked_up
 *   Marketplace     accepted → accept, served (remise au livreur du magasin)
 *                   → out_for_delivery ; « livrée » est un geste à part
 *                   (deliveredGlovoOrder), Glovo y date la livraison. */
export function glovoRoute(status, row) {
  const pickup = Number(row && row.pickup) === 1, market = Number(row && row.marketplace) === 1;
  if (status === 'accepted') return 'accept';
  if (status === 'ready') return pickup || market ? null : 'ready_for_pickup';
  if (status === 'served') return pickup ? 'customer_picked_up' : (market ? 'out_for_delivery' : null);
  return null;
}

async function orderLink(env, merchant, kiwiOrderId) {
  const q = (cols) => env.DB.prepare(
    `SELECT g.order_id, g.store_id, g.pickup, g.cancelled_ts, s.prep_minutes${cols}
       FROM glovo_orders g JOIN glovo_stores s ON s.store_id = g.store_id
      WHERE g.kiwi_order_id = ? AND g.merchant = ?`
  ).bind(String(kiwiOrderId || ''), String(merchant || '')).first();
  try { return await q(', s.marketplace, g.delivered_ts, g.out_ts'); }
  catch (_) { return await q(', 0 AS marketplace, NULL AS delivered_ts, NULL AS out_ts'); }
}

export async function notifyGlovo(env, merchant, kiwiOrderId, status, now = Date.now(), deps = {}) {
  if (!env || !env.GLOVO_TOKEN || !env.DB) return { ok: true, skipped: 'not-configured' };
  let row = null;
  try { row = await orderLink(env, merchant, kiwiOrderId); } catch (_) { return { ok: true, skipped: 'no-table' }; }
  if (!row || row.cancelled_ts) return { ok: true, skipped: 'not-glovo' };
  const route = glovoRoute(status, row);
  if (!route) return { ok: true, skipped: 'no-route' };

  const pickupAt = route === 'accept' ? isoSeconds(now + Math.max(1, Number(row.prep_minutes) || 15) * 60000) : null;
  const res = await glovoCall(env, row.store_id, {
    method: 'PUT', orderRoute: true,
    path: '/api/v0/integrations/orders/' + encodeURIComponent(row.order_id) + '/' + route,
    body: route === 'accept' ? { committedPreparationTime: pickupAt } : undefined,
  }, Object.assign({ now }, deps));
  const err = res.ok ? null : (res.error || 'HTTP ' + res.status);
  try {
    await env.DB.prepare('UPDATE glovo_orders SET last_call = ?, last_call_ts = ?, last_call_err = ? WHERE order_id = ?')
      .bind(route, now, err, row.order_id).run();
    if (res.ok && (pickupAt || route === 'out_for_delivery')) {
      await env.DB.prepare(pickupAt ? 'UPDATE glovo_orders SET pickup_at = ? WHERE order_id = ?' : 'UPDATE glovo_orders SET out_ts = ? WHERE order_id = ?')
        .bind(pickupAt || now, row.order_id).run();
    }
  } catch (_) {}
  return err ? { ok: false, route, error: err } : { ok: true, route };
}

/* ── Liaison d'une adresse Glovo à un commerçant (console opérateur) ──────── */
export async function upsertGlovoStore(env, input, now = Date.now()) {
  const storeId = str(input && input.storeId, 64);
  const merchant = str(input && input.merchant, 80).toLowerCase();
  if (!STORE_ID.test(storeId)) return { ok: false, error: 'bad-store-id' };
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(merchant)) return { ok: false, error: 'bad-merchant' };
  const prep = Math.min(120, Math.max(1, Math.round(Number(input && input.prepMinutes) || 15)));
  const status = input && input.status === 'paused' ? 'paused' : 'active';
  await env.DB.prepare(
    `INSERT INTO glovo_stores (store_id, merchant, prep_minutes, status, created_ts, updated_ts)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id) DO UPDATE SET merchant = excluded.merchant, prep_minutes = excluded.prep_minutes,
       status = excluded.status, updated_ts = excluded.updated_ts`
  ).bind(storeId, merchant, prep, status, now, now).run();
  return { ok: true, storeId, merchant, prepMinutes: prep, status };
}
