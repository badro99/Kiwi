/* Livraisons à recevoir, côté tableau de bord.
 *
 * Une vente partie en livraison (contre-remboursement) est enregistrée à
 * 0 MAD : l'argent n'est pas entré. Le magasin des ventes du tableau de bord
 * ne garde que l'argent, si bien qu'une livraison n'apparaissait nulle part :
 * ni dans les créances, ni le jour où le transporteur payait, et personne ne
 * pouvait dire « reçue ».
 *
 * Ce module lit /api/receivables (functions/api/receivables.js) :
 *   · KiwiDeliveries.dueIn(from, to) : ce qui reste dû sur les livraisons
 *     vendues dans la fenêtre. dateRange.js l'ajoute aux « Créances ».
 *   · un clic sur la tuile « Créances » ouvre la liste, et « Reçue » (virement
 *     ou chèque) écrit côté serveur UNE vente du montant reçu. Elle revient par
 *     le flux habituel et compte dans le chiffre d'affaires du jour où l'argent
 *     arrive. Les espèces passent par la caisse, pas par ici.
 * Démo : rien, jamais de livraison inventée. */
(function () {
  'use strict';
  const L = (fr, en, ar) => ({ fr, en, ar });
  const T = {
    title: L('Livraisons à recevoir', 'Deliveries to collect', 'توصيلات للتحصيل'),
    sub: L('Vendues en contre-remboursement, pas encore payées par le transporteur.', 'Sold cash on delivery, not yet paid by the courier.', 'مبيعة بالدفع عند التسليم، لم يدفعها الناقل بعد.'),
    empty: L('Aucune livraison en attente de paiement.', 'No delivery awaiting payment.', 'لا توجد توصيلات في انتظار الدفع.'),
    total: L('Reste à recevoir', 'Still to collect', 'المتبقي للتحصيل'),
    transfer: L('Reçue · virement', 'Received · transfer', 'مستلمة · تحويل'),
    cheque: L('Reçue · chèque', 'Received · cheque', 'مستلمة · شيك'),
    confirm: L('Confirmer', 'Confirm', 'تأكيد'),
    cancel: L('Annuler', 'Cancel', 'إلغاء'),
    confirmQ: L('Enregistrer {amount} reçus par {how} ?', 'Record {amount} received by {how}?', 'تسجيل {amount} مستلمة عبر {how}؟'),
    how: { transfer: L('virement', 'transfer', 'تحويل'), cheque: L('chèque', 'cheque', 'شيك') },
    cash: L('Payée en espèces au comptoir ? Encaissez-la sur la caisse, pour que le tiroir reste juste.', 'Paid in cash at the counter? Take it on the till so the drawer stays right.', 'دُفعت نقداً في المحل؟ سجّلها في الصندوق ليبقى الدرج مضبوطاً.'),
    recent: L('Reçues récemment', 'Recently collected', 'المستلمة مؤخراً'),
    part: L('déjà reçu {amount}', '{amount} already received', 'تم استلام {amount}'),
    done: L('Livraison reçue, ajoutée aux ventes du jour', 'Delivery collected, added to today\'s sales', 'تم تحصيل التوصيل وإضافته إلى مبيعات اليوم'),
    failed: L('Impossible d\'enregistrer pour l\'instant', 'Could not record it right now', 'تعذر التسجيل الآن'),
    close: L('Fermer', 'Close', 'إغلاق'),
    currency: L('MAD', 'MAD', 'د.م'),
  };
  const lang = () => { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  const pick = (o) => (o && (o[lang()] || o.fr)) || '';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mad = (cents) => {
    let n = String(Math.round((+cents || 0) / 100));
    try { n = Math.round((+cents || 0) / 100).toLocaleString(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR'); } catch (_) {}
    return n + ' ' + pick(T.currency);
  };
  const when = (ts) => {
    try { return new Date(ts).toLocaleString(lang() === 'ar' ? 'ar-MA' : lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
  };

  let state = { slug: '', open: [], collected: [], loadedAt: 0 };
  let inflight = null;
  function real() { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; } }
  function slug() {
    try { return String((window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant()) || (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || '').trim(); }
    catch (_) { return ''; }
  }
  function changed() { try { window.dispatchEvent(new CustomEvent('kiwi:deliveries')); } catch (_) {} }

  function load(force) {
    if (!real() || typeof fetch !== 'function') return Promise.resolve(state);
    const s = slug();
    if (!s) return Promise.resolve(state);
    /* Changer de commerce vide la liste tout de suite : les livraisons d'une
       autre boutique ne s'affichent pas le temps de la réponse. */
    if (state.slug && state.slug !== s) { state = { slug: s, open: [], collected: [], loadedAt: 0 }; changed(); }
    if (!force && state.slug === s && Date.now() - state.loadedAt < 30000) return Promise.resolve(state);
    if (inflight) return inflight;
    inflight = fetch('/api/receivables?merchant=' + encodeURIComponent(s), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data) => {
        if (!data || slug() !== s) return state;
        const before = JSON.stringify([state.open, state.collected]);
        state = { slug: s, open: Array.isArray(data.open) ? data.open : [], collected: Array.isArray(data.collected) ? data.collected : [], loadedAt: Date.now() };
        if (JSON.stringify([state.open, state.collected]) !== before) changed();
        return state;
      })
      .catch(() => state)
      .finally(() => { inflight = null; });
    return inflight;
  }

  function dueIn(from, to) {
    if (!real() || state.slug !== slug()) return 0;
    return state.open.reduce((n, d) => n + (d.ts >= from && d.ts < to ? (+d.dueCents || 0) : 0), 0) / 100;
  }

  function collect(saleId, method) {
    const s = slug();
    return fetch('/api/receivables', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: s, saleId, method }),
    }).then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then((res) => {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        /* La vente d'encaissement arrive au prochain sondage du flux (Live Link) ;
           la créance, elle, sort de la liste tout de suite. */
        return load(true).then(() => res.body);
      });
  }

  function rowHtml(d) {
    return `<li class="dlv-row" data-dlv-id="${esc(d.saleId)}">
      <div class="dlv-main"><strong>${esc(d.label || d.ref || d.saleId)}</strong><span>${esc([d.ref, when(d.ts), d.collected ? pick(T.part).replace('{amount}', mad(d.collected.amountCents)) : ''].filter(Boolean).join(' · '))}</span></div>
      <div class="dlv-amt">${esc(mad(d.dueCents))}</div>
      <div class="dlv-acts">
        <button type="button" class="kb ghost" data-dlv-pay="transfer">${esc(pick(T.transfer))}</button>
        <button type="button" class="kb ghost" data-dlv-pay="cheque">${esc(pick(T.cheque))}</button>
      </div>
    </li>`;
  }
  function body() {
    const open = state.open.slice().sort((a, b) => a.ts - b.ts);
    const total = open.reduce((n, d) => n + (+d.dueCents || 0), 0);
    const recent = state.collected.slice(0, 8);
    return `<div class="dlv">
      ${open.length ? `<div class="dlv-total"><span>${esc(pick(T.total))}</span><strong>${esc(mad(total))}</strong></div>
        <ul class="dlv-list">${open.map(rowHtml).join('')}</ul>` : `<p class="dlv-empty">${esc(pick(T.empty))}</p>`}
      <p class="dlv-note">${esc(pick(T.cash))}</p>
      ${recent.length ? `<h4 class="dlv-h">${esc(pick(T.recent))}</h4><ul class="dlv-list dlv-done">${recent.map((d) => `<li class="dlv-row"><div class="dlv-main"><strong>${esc(d.label || d.ref || d.saleId)}</strong><span>${esc(pick(T.how[d.collected.method] || T.how.transfer))} · ${esc(when(d.collected.ts))}</span></div><div class="dlv-amt">${esc(mad(d.collected.amountCents))}</div></li>`).join('')}</ul>` : ''}
    </div>`;
  }

  let openDrawerRef = null;
  function render() {
    if (!openDrawerRef || !openDrawerRef.el || !openDrawerRef.el.isConnected) { openDrawerRef = null; return; }
    const host = openDrawerRef.el.querySelector('.kiwi-drawer-body');
    if (host) host.innerHTML = body();
  }
  function openDrawer() {
    if (!window.Kiwi || !window.Kiwi.drawer) return;
    style();
    openDrawerRef = window.Kiwi.drawer({ title: pick(T.title), subtitle: pick(T.sub), body: body(), width: 520,
      foot: `<button class="kb ghost" type="button" data-dismiss>${esc(pick(T.close))}</button>` });
    const el = openDrawerRef.el;
    el.addEventListener('click', (e) => {
      const row = e.target.closest('[data-dlv-id]');
      if (!row) return;
      const pay = e.target.closest('[data-dlv-pay]');
      const ok = e.target.closest('[data-dlv-ok]');
      const no = e.target.closest('[data-dlv-no]');
      const id = row.getAttribute('data-dlv-id');
      const d = state.open.find((x) => x.saleId === id);
      if (!d) return;
      const acts = row.querySelector('.dlv-acts');
      if (pay) {
        const m = pay.getAttribute('data-dlv-pay');
        acts.innerHTML = `<span class="dlv-q">${esc(pick(T.confirmQ).replace('{amount}', mad(d.dueCents)).replace('{how}', pick(T.how[m])))}</span>
          <button type="button" class="kb atlas" data-dlv-ok="${esc(m)}">${esc(pick(T.confirm))}</button>
          <button type="button" class="kb ghost" data-dlv-no>${esc(pick(T.cancel))}</button>`;
        const b = acts.querySelector('[data-dlv-ok]'); if (b) b.focus();
      } else if (no) {
        render();
      } else if (ok) {
        ok.disabled = true;
        collect(id, ok.getAttribute('data-dlv-ok'))
          .then(() => { render(); try { window.Kiwi.toast(pick(T.done), { type: 'success' }); } catch (_) {} })
          .catch(() => { ok.disabled = false; try { window.Kiwi.toast(pick(T.failed), { type: 'error' }); } catch (_) {} });
      }
    });
    load(true).then(render);
  }

  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
      .dlv-total{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0 14px;border-bottom:1px solid var(--line,rgba(10,15,13,.12));margin-bottom:6px}
      .dlv-total span{font-size:13px;color:var(--ink-2,rgba(10,15,13,.7))}
      .dlv-total strong{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
      .dlv-list{list-style:none;margin:0;padding:0}
      .dlv-row{display:grid;grid-template-columns:1fr auto;gap:6px 12px;padding:12px 0;border-bottom:1px solid var(--line,rgba(10,15,13,.08))}
      .dlv-main{min-width:0}
      .dlv-main strong{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dlv-main span{display:block;font-size:12px;color:var(--ink-3,rgba(10,15,13,.55));margin-top:2px}
      .dlv-amt{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;align-self:start}
      .dlv-acts{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .dlv-q{font-size:13px;flex:1 1 100%}
      .dlv-empty,.dlv-note{font-size:13px;color:var(--ink-3,rgba(10,15,13,.6));margin:12px 0}
      .dlv-h{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3,rgba(10,15,13,.55));margin:18px 0 4px}
      .dlv-done .dlv-amt{color:var(--atlas,#0B6E4F)}
      .kpi-m[data-kpi="receivable"]{cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  /* La tuile « Créances » ouvre la liste. Capture : la bande se reconstruit
     souvent, un écouteur posé sur la tuile disparaîtrait avec elle. */
  document.addEventListener('click', (e) => {
    const tile = e.target && e.target.closest && e.target.closest('.kpi-m[data-kpi="receivable"]');
    if (!tile || !real()) return;
    openDrawer();
  });
  window.addEventListener('kiwi:deliveries', () => { style(); render(); });
  window.addEventListener('kiwi:langchange', render);
  function tick() { if (document.visibilityState !== 'hidden') load(false); }
  window.addEventListener('load', () => { setTimeout(tick, 1500); setInterval(tick, 60000); });
  document.addEventListener('visibilitychange', tick);

  window.KiwiDeliveries = { load, dueIn, collect, openDrawer, open: () => state.open.slice(), collected: () => state.collected.slice() };
})();
