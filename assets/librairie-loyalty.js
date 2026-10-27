/* Kiwi · LIBRAIRIE · la fidélité du commerçant, pas un programme codé en dur.
 *
 * La librairie tenait son propre programme : 500 points, -5 %, des points
 * ajoutés sur l'appareil seulement (`cu.points += total`), jamais dépensés, et
 * un carnet de clients à elle. Une librairie réelle lit maintenant le programme
 * réglé par le commerçant (KiwiClients.config) et gagne ses points par le
 * chemin commun des autres caisses : le client est rattaché à la vente
 * (KiwiPosSale.attachClient), pos-sale l'enregistre dans le carnet avec
 * l'identifiant de la vente serveur, et /api/clients calcule les points sur le
 * montant du livre des ventes, en centimes.
 *
 * La démo garde ses six clients et un programme d'exemple (500 points, -5 %),
 * appliqué par la même règle partagée : elle ne touche jamais le carnet réel.
 *
 * Chargé par le répartiteur (assets/pos-dispatch.js, `deps`) avant la caisse. */
(function () {
  'use strict';

  /* GENERATED SHARED KiwiLoyaltyRules BEGIN */
  /* Copy of functions/api/_rules-loyalty.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiLoyaltyRules = (function () {
    // Loyalty earning, word matching, historical reversals and explicit reward policies.
    const loyaltyOn = (cfg) => !!(cfg && cfg.model && !cfg.auto);
    const pointsFor = (amount, cfg) => Math.max(0,
      Math.floor(amount * Math.max(0, Number(cfg && cfg.amount && cfg.amount.perMad) || 1) + 1e-6));
    const foldName = (v) => String(v || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const qualifyingQty = (cfg, items) => {
      const want = foldName(cfg && cfg.product && cfg.product.item);
      if (!want) return 0;
      return (Array.isArray(items) ? items : []).reduce((n, item) => {
        const name = ' ' + foldName(item && item.name) + ' ';
        return name.includes(' ' + want + ' ') ? n + Math.max(0, Math.round(Number(item && item.qty) || 0)) : n;
      }, 0);
    }
    const stampsFor = (cfg, items) => {
      if (!loyaltyOn(cfg)) return 0;
      if (cfg.model === 'visit') return 1;
      if (cfg.model !== 'product') return 0;
      return Array.isArray(items) && items.length ? qualifyingQty(cfg, items) : 1;
    }
    const refundFor = (sale, amount, cfg, items, client) => {
      const paid = Number(sale && sale.paid || 0), earned = Number(sale && sale.earned || 0);
      const refunded = Number(sale && sale.refunded || 0), clawed = Number(sale && sale.clawed || 0);
      const take = Math.max(0, Math.min(amount, Math.round((paid - refunded) * 100) / 100));
      const claw = paid > 0 && earned > 0
        ? Math.max(0, Math.min(Math.round(earned * (refunded + take) / paid) - clawed, earned - clawed)) : 0;
      const stampsLeft = Math.max(0, Number(sale && sale.stamped || 0) - Number(sale && sale.unstamped || 0));
      const lines = Array.isArray(items) ? items : [];
      const whole = paid > 0 && take >= Math.round((paid - refunded) * 100) / 100 - 0.004;
      const unstamp = cfg.model === 'product' && lines.length
        ? Math.min(stampsLeft, qualifyingQty(cfg, lines)) : (whole ? stampsLeft : 0);
      return { take, claw, unstamp,
        pointsTake: Math.min(claw, Math.max(0, Number(client.points) || 0)),
        stampsTake: Math.min(unstamp, Math.max(0, Number(client.stamps) || 0)) };
    }
    const rewardDiscount = (reward, clientId, base, units, policy = 'boutique') => {
      if (!reward || reward.clientId !== clientId) return 0;
      const down = n => Math.max(0, Math.floor((+n || 0) * 100 + 1e-6) / 100);
      if (reward.kind === 'percent') {
        if (policy === 'librairie') return Math.round(base * reward.value / 100 * 100 + 1e-9) / 100;
        return base - down(base * (100 - Math.min(100, Math.max(0, reward.value || 0))) / 100);
      }
      return reward.kind === 'free' && units.length ? Math.min.apply(null, units) : 0;
    }
    return { loyaltyOn, pointsFor, foldName, qualifyingQty, stampsFor, refundFor, rewardDiscount };
  })();
  /* GENERATED SHARED KiwiLoyaltyRules END */

  const DEMO_CFG = { model: 'amount', amount: { perMad: 1, threshold: 500, reward: '−5 %' } };
  const plural = (n, one, many) => (Math.abs(n) >= 2 ? many : one);
  const pctOf = (text, fallback) => {
    const m = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    return m ? Number(m[1].replace(',', '.')) : fallback;
  };

  function create(opts) {
    const real = () => { try { return !!opts.real(); } catch (_) { return false; } };
    const book = () => {
      const kc = real() ? window.KiwiClients : null;
      return kc && typeof kc.list === 'function' && typeof kc.config === 'function' ? kc : null;
    };

    /* Le programme du commerçant : modèle, objectif, texte de la récompense. */
    function program() {
      const kc = book();
      const cfg = kc ? kc.config() : DEMO_CFG;
      const on = kc ? !!kc.loyaltyOn() : true;
      const amount = cfg.model === 'amount';
      const goal = (amount ? cfg.amount && cfg.amount.threshold
        : cfg.model === 'product' ? cfg.product && cfg.product.target : cfg.visit && cfg.visit.target) || (amount ? 100 : 10);
      const text = amount ? cfg.amount && cfg.amount.reward
        : cfg.model === 'product' ? cfg.product && cfg.product.reward : cfg.visit && cfg.visit.reward;
      return { cfg, on, amount, goal: Number(goal), label: text || (amount ? '−10 %' : '1 offert') };
    }
    const mine = (cu, p) => Number(cu && (p.amount ? cu.points : cu.stamps)) || 0;
    const ready = (cu) => { const p = program(); return !!(cu && p.on && p.goal > 0 && mine(cu, p) >= p.goal); };
    const rewardFor = (cu) => {
      if (!ready(cu)) return null;
      const p = program();
      return { kind: p.amount ? 'percent' : 'free', value: pctOf(p.label, 10), label: p.label, clientId: cu.id };
    };

    function fromBook(c) {
      return c ? { id: c.id, name: c.name || 'Sans nom', phone: c.phone || '', points: c.points || 0, stamps: c.stamps || 0,
        visits: c.visits || 0, school: false, note: c.notes || '' } : null;
    }

    /* Texte du programme, de l'état d'un client et du ticket. */
    function rule() {
      const p = program();
      if (!p.on) return 'Aucun programme de fidélité réglé';
      if (p.amount) {
        const per = Number(p.cfg.amount && p.cfg.amount.perMad) || 1;
        return `1 MAD dépensé = ${per} ${plural(per, 'point', 'points')} · ${p.label} dès ${p.goal} points`;
      }
      return `${p.goal} ${p.cfg.model === 'product' ? 'articles' : 'passages'} = ${p.label}`;
    }
    function gauge(cu) {
      const p = program();
      const have = mine(cu, p);
      const unit = p.amount ? 'pts' : plural(p.goal - have, 'tampon', 'tampons');
      return { ready: ready(cu), have, pct: p.goal > 0 ? Math.min(100, Math.round(have / p.goal * 100)) : 0, toGo: Math.max(0, p.goal - have), unit, label: p.label };
    }
    function balance(cu) {
      const p = program();
      return p.amount ? `${Number(cu.points) || 0} pts` : `${Number(cu.stamps) || 0} ${plural(cu.stamps, 'tampon', 'tampons')}`;
    }
    /* Ce que ce ticket va rapporter, et le solde après coup (reçu). */
    function preview(cu, totalMad, items, rewardUsed) {
      const p = program();
      if (!p.on) return { earn: '', balance: balance(cu) };
      const n = p.amount ? KiwiLoyaltyRules.pointsFor(totalMad, p.cfg) : KiwiLoyaltyRules.stampsFor(p.cfg, items);
      const after = mine(cu, p) + n - (rewardUsed ? p.goal : 0);
      return { earn: `+${n}`, balance: p.amount ? `${after} pts` : `${after} ${plural(after, 'tampon', 'tampons')}` };
    }

    function discount(cu, subMad, unitsMad) {
      return KiwiLoyaltyRules.rewardDiscount(rewardFor(cu), cu && cu.id, subMad, unitsMad || [], 'librairie');
    }

    /* Le carnet : réel = KiwiClients ; démo = null (la caisse garde ses six clients). */
    const list = () => { const kc = book(); return kc ? kc.list().map(fromBook) : null; };
    const get = (id) => { const kc = book(); return kc ? fromBook(kc.get(id)) : null; };
    const add = (name, phone) => {
      const kc = book();
      return kc ? fromBook(kc.upsert({ name, phone, consent: true, source: 'caisse' })) : null;
    };

    /* L'encaissement. begin() rattache le client à la vente que pos-sale va
       enregistrer ; finish() lit ce que le carnet a réellement crédité. */
    function begin(cu) {
      const kc = book();
      if (!kc || !cu) return null;
      const sale = window.KiwiPosSale;
      try { if (sale && sale.attachClient) sale.attachClient({ id: cu.id, name: cu.name }); } catch (_) {}
      return { points: Number(cu.points) || 0, stamps: Number(cu.stamps) || 0 };
    }
    function finish(cu, mark, sale) {
      const p = program();
      if (!cu) return '';
      const kc = book();
      if (!kc) {
        if (!p.on) return '';
        const n = p.amount ? KiwiLoyaltyRules.pointsFor(sale.total, p.cfg) : KiwiLoyaltyRules.stampsFor(p.cfg, sale.items);
        if (p.amount) cu.points = (cu.points || 0) + n - (sale.rewardUsed ? p.goal : 0);
        else cu.stamps = (cu.stamps || 0) + n - (sale.rewardUsed ? p.goal : 0);
        cu.visits = (cu.visits || 0) + 1;
        return n ? ` · +${n} ${p.amount ? 'pts' : plural(n, 'tampon', 'tampons')} fidélité` : '';
      }
      try { const ps = window.KiwiPosSale; if (ps && ps.attachedClient && ps.attachedClient()) ps.attachClient(null); } catch (_) {}
      const fresh = kc.get(cu.id) || {};
      const n = Math.max(0, (p.amount ? fresh.points : fresh.stamps) - (mark ? (p.amount ? mark.points : mark.stamps) : 0)) || 0;
      if (sale.rewardUsed && kc.redeem) { try { kc.redeem(cu.id); } catch (_) {} }
      return n ? ` · +${n} ${p.amount ? 'pts' : plural(n, 'tampon', 'tampons')} fidélité` : '';
    }

    return { money: window.KiwiMoney, live: () => !!book(), program, ready, rewardFor, discount, rule, gauge, balance, preview, list, get, add, begin, finish };
  }

  window.KiwiLibrairieLoyalty = Object.freeze({ create, DEMO_CFG });
})();
