/* Kiwi · production action honesty
 * Presentation-only workflows must never claim that money moved, a customer
 * was contacted, or an external system changed in a real merchant session. */
(function () {
  'use strict';

  const GUARDED = new Set([
    'promo-schedule', 'promo-pause', 'promo-end', 'promo-edit', 'promo-segment',
    'ret-approve', 'ret-refuse', 'ret-exchange', 'ret-block', 'ret-policy-save',
    'ret-refund-original', 'ret-refund-credit', 'ret-refund-whatsapp',
    'appt-export', 'appt-auto-toggle', 'appt-cancel-confirm',
    'svc-export', 'svc-season', 'svc-season-edit', 'svc-ai-action',
    'spa-cli-add-confirm', 'spa-cli-wa-send', 'spa-cli-bday-send',
    'spa-cli-bday-batch-send', 'spa-cli-gift-confirm', 'spa-cli-block-confirm',
    'menu-mass', 'menu-schedule', 'menu-promote', 'menu-publish',
    'kds-bump', 'kds-recall', 'kds-86', 'kds-print-summary',
    /* Équipe, paie et planning : ces boutons annonçaient un envoi WhatsApp et
     * un PDF « envoyé au gérant » alors que rien ne part. 'eq-publish-plan'
     * et 'eq-gap-whatsapp' étaient ici : ils vivaient dans l'ancienne Équipe
     * de assets/venues.js, retirée le 2026-10-12, et n'ont plus rien à garder. */
    'eq-export-payroll', 'pay-export',
    'export-payroll',
    /* Stock : la commande fournisseur affichait même un montant et un
     * « WhatsApp confirmé » codés en dur. */
    'stock-send-suggested', 'stock-program-shortfall',
    /* Exports réglementaires et registres : aucun fichier n'est produit.
     * (« export », « bqx-export » et « margin-export » fabriquent un vrai
     * Blob téléchargeable : eux ne sont pas ici, ils tiennent leur promesse.) */
    /* 'fin-tva-send' était ici : « Envoyer à mon comptable », sur une
     * déclaration de TVA entièrement fabriquée. Le panneau a été supprimé de
     * assets/finance.js (section 6), donc le bouton n'existe plus et la clé
     * n'a plus rien à garder. Une clé gardée orpheline n'est pas inoffensive :
     * elle laisse croire que quelque chose est tenu. */
    /* 'mi-export' est parti avec l'ancienne carte de assets/venues.js
     * (2026-10-12) : la carte du restaurant vit dans
     * restaurant-menu-workspace.js, qui n'a pas ce bouton. */
    'audit-export', 'cal-export', 'cf-hyg-export', 'hx-taxe-export',
    'resv-sms',
    /* Audit du 2026-10-10 : des toasts de réussite sans effet. Une page réelle
     * ne montre plus ces boutons (Conformité, Dépenses, Terminaux et Équipe
     * ont leur propre état vide honnête), mais un chemin de démo qui change
     * ne doit pas suffire à les rendre de nouveau mensongers.
     *  · Conformité : clôture Z, réimpression, équipement, document « simulés ».
     *  · Dépenses : cartes Kiwi, paiement et approbation, sans Kiwi Pay.
     *  · Équipe/paie de démo : code réinitialisé, diffusion, pointage IA,
     *    départ pointé, pourboires distribués, sans rien écrire.
     *  · Terminaux de démo : transaction de test « envoyée », commande de
     *    matériel ; réservations : tampon entre deux tables.
     *  · Ultra : virement et appel au gestionnaire de compte.
     *  · Sans bouton aujourd'hui (palette, agent) : deck, appli, Ramadan. */
    'cf-z-close', 'cf-z-history', 'cf-eq-add', 'cf-doc-upload', 'cf-doc-detail',
    'dep-new-card', 'dep-pay', 'dep-approve',
    'member-reset-pin', 'eq-send-broadcast', 'ai-pointage', 'clock-out',
    'distribute-tips', 'term-test', 'catalog-order', 'resv-buffer',
    'fs-ultra-transfer', 'fs-ultra-call',
    'download-deck', 'download-app', 'ramadan-toggle'
  ]);

  function realMerchant() {
    try { return !!(window.KiwiEnv?.isReal?.() || window.KiwiVenue?.isCustom?.()); }
    catch (_) { return false; }
  }

  function copy() {
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    return ({
      fr: { title: 'Action non connectée', desc: 'Aucun paiement, message, export ni changement externe n’a été effectué.' },
      en: { title: 'Action not connected', desc: 'No payment, message, export, or external change was made.' },
      ar: { title: 'الإجراء غير متصل', desc: 'لم يتم تنفيذ أي دفع أو رسالة أو تصدير أو تغيير خارجي.' }
    })[lang] || { title: 'Action non connectée', desc: 'Aucun changement n’a été effectué.' };
  }

  function install() {
    const H = window.Kiwi?.handlers;
    if (!H) return false;
    GUARDED.forEach((key) => {
      const original = H[key];
      if (typeof original !== 'function' || original.__kiwiProductionHonesty) return;
      const guarded = function () {
        if (realMerchant()) {
          const c = copy();
          window.Kiwi?.toast?.(c.title, { type: 'warning', desc: c.desc, duration: 4200 });
          return { ok: false, reason: 'not-connected' };
        }
        return original.apply(this, arguments);
      };
      guarded.__kiwiProductionHonesty = true;
      guarded.__kiwiOriginal = original;
      H[key] = guarded;
    });
    return true;
  }

  window.KiwiProductionActions = { install, guarded: GUARDED, realMerchant };
  if (!install()) {
    const retry = setInterval(() => { if (install()) clearInterval(retry); }, 80);
    setTimeout(() => clearInterval(retry), 5000);
  }
  window.addEventListener?.('load', () => { install(); setTimeout(install, 250); });
})();
