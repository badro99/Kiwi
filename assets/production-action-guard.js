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
    'kds-bump', 'kds-recall', 'kds-86', 'kds-print-summary'
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
