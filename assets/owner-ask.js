/* L'ACCORD DU PATRON, DEMANDÉ PAR L'APPAREIL QUI EN A BESOIN.
 *
 * Quand le patron a gardé pour lui les annulations de salle (dashboard ›
 * Réglages › Accords du patron), /api/order/queue refuse une ligne envoyée
 * annulée, un « − » sur un plat envoyé ou une table entière avec
 * `owner-approval-required` et dit quoi demander (`ask`). Ce module, chargé
 * par service-requests.js sur le téléphone du serveur ET sur la caisse,
 * attrape cette réponse : il dépose la demande (/api/approvals), montre
 * l'attente, et dès que le patron accepte, renvoie LE MÊME geste avec
 * `ownerApproval`. L'appelant reçoit la réponse du second envoi ; il ne sait
 * rien de l'attente. Refus, expiration ou demande retirée : il reçoit un refus
 * lisible et rien n'est annulé.
 *
 * Aucun global et aucun emballage de fetch : la couche réseau de l'appareil
 * (kiwi-env.js) annonce le refus par l'événement « kiwi:owner-approval » et ce
 * module y répond. Chargé deux fois, seul le premier preneur répond (`taken`).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  const SLOTS = ['voidLine', 'editLine', 'cancelTable'];
  const POLL_MS = 2000, MAX_WAIT_MS = 10 * 60000;
  const TEXT = {
    fr: { title: 'Accord du patron', wait: 'Demande envoyée sur le téléphone du patron. En attente de sa réponse.',
      withdraw: 'Retirer la demande', withdrawn: 'Demande retirée, rien n’a été annulé', refused: 'Refusé par le patron', expired: 'Demande expirée, rien n’a été annulé',
      failed: 'Demande non envoyée, rien n’a été annulé', ok: 'Accepté par le patron',
      'void-sent': 'Annulation en cuisine', 'cancel-table': 'Annulation de table', 'cancel-order': 'Annulation de bon' },
    en: { title: 'Owner approval', wait: 'Request sent to the owner’s phone. Waiting for an answer.',
      withdraw: 'Withdraw request', withdrawn: 'Request withdrawn, nothing was cancelled', refused: 'Refused by the owner', expired: 'Request expired, nothing was cancelled',
      failed: 'Request not sent, nothing was cancelled', ok: 'Approved by the owner',
      'void-sent': 'Kitchen cancellation', 'cancel-table': 'Table cancellation', 'cancel-order': 'Ticket cancellation' },
    ar: { title: 'موافقة صاحب المحل', wait: 'أُرسل الطلب إلى هاتف صاحب المحل. في انتظار رده.',
      withdraw: 'سحب الطلب', withdrawn: 'سُحب الطلب، لم يُلغَ شيء', refused: 'رفض صاحب المحل', expired: 'انتهت مدة الطلب، لم يُلغَ شيء',
      failed: 'لم يُرسل الطلب، لم يُلغَ شيء', ok: 'وافق صاحب المحل',
      'void-sent': 'إلغاء في المطبخ', 'cancel-table': 'إلغاء طاولة', 'cancel-order': 'إلغاء طلب' },
  };
  let busy = false;

  function language(merchant) {
    const pick = (v) => { v = String(v || '').toLowerCase().split('-')[0]; return v === 'ary' ? 'ar' : (v === 'en' || v === 'ar' ? v : ''); };
    let lang = pick(document.documentElement.getAttribute('lang'));
    try {
      lang = lang || pick(localStorage.getItem('kiwi-employee-language:' + merchant))
        || (document.documentElement.classList.contains('kiwi-native') ? pick(localStorage.getItem('kiwiNativeLocale')) : '')
        || pick(localStorage.getItem('kiwiLang'));
    } catch (_) {}
    return lang || 'fr';
  }
  const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function queuePost(input, init) {
    if (!init || String(init.method || 'GET').toUpperCase() !== 'POST' || typeof init.body !== 'string') return false;
    try { return new URL(typeof input === 'string' ? input : input.url, location.href).pathname === '/api/order/queue'; } catch (_) { return false; }
  }

  function sheet(t, ask, label) {
    const dlg = document.createElement('dialog');
    dlg.className = 'koa-sheet';
    dlg.setAttribute('dir', t === TEXT.ar ? 'rtl' : 'ltr');
    dlg.setAttribute('aria-labelledby', 'koa-title');
    const style = 'border:1px solid #d9dfd8;border-radius:22px;padding:22px;width:min(420px,calc(100vw - 32px));background:#F7F5F0;color:#0A0F0D;'
      + 'font:15px/1.45 "Inter Tight","IBM Plex Sans Arabic",system-ui,sans-serif;box-shadow:0 24px 80px rgba(5,59,44,.28)';
    dlg.setAttribute('style', style);
    const amount = ask.amountCents > 0 ? (ask.amountCents / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD' : '';
    dlg.innerHTML = '<p style="margin:0 0 4px;color:#0B6E4F;font-weight:600;font-size:13px;letter-spacing:.02em"></p>'
      + '<h2 id="koa-title" style="margin:0 0 6px;font-size:20px;font-weight:600"></h2>'
      + '<p data-k="what" style="margin:0 0 14px;color:#33413a"></p>'
      + '<p data-k="state" role="status" aria-live="polite" style="margin:0 0 18px;color:#33413a"></p>'
      + '<button type="button" style="width:100%;min-height:48px;border-radius:14px;border:1px solid #c9d3cb;background:#fff;color:#053B2C;font:inherit;font-weight:600;cursor:pointer"></button>';
    dlg.children[0].textContent = t.title;
    dlg.children[1].textContent = t[ask.kind] || t.title;
    dlg.children[2].textContent = [label, amount].filter(Boolean).join(' · ');
    dlg.children[3].textContent = t.wait;
    dlg.children[4].textContent = t.withdraw;
    document.body.appendChild(dlg);
    try { dlg.showModal(); } catch (_) { dlg.setAttribute('open', ''); }
    return {
      el: dlg, button: dlg.children[4],
      say(text) { dlg.children[3].textContent = text; },
      close(after) { setTimeout(() => { try { dlg.close(); } catch (_) {} dlg.remove(); }, after || 0); },
    };
  }

  /* L'identifiant de l'accord, ou { refusal } : le texte que l'appelant affichera. */
  async function askOwner(merchant, ask) {
    const t = TEXT[language(merchant)];
    let res, data;
    try {
      res = await fetch('/api/approvals', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', merchant, kind: ask.kind, ref: ask.ref, amountCents: ask.amountCents }) });
      data = await res.json().catch(() => null);
    } catch (_) { data = null; }
    if (data && data.error === 'approval-off') return { again: true };
    if (!data || !data.ok || !data.approval) return { refusal: t.failed };
    const id = data.approval.id;
    const ui = sheet(t, ask, data.approval.label);
    let withdrawn = false, misses = 0;
    const withdraw = () => {
      if (withdrawn) return;
      withdrawn = true;
      ui.button.disabled = true;
      fetch('/api/approvals', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw', merchant, id }) }).catch(() => {});
    };
    ui.button.addEventListener('click', withdraw);
    /* Échap ou « retour » ferment la feuille : c'est retirer la demande, jamais
       la laisser courir sans écran (revue Fable). */
    ui.el.addEventListener('cancel', withdraw);
    const until = Date.now() + MAX_WAIT_MS;
    while (Date.now() < until && !withdrawn) {
      await sleep(POLL_MS);
      if (withdrawn) break;
      let status = '';
      try {
        const r = await fetch('/api/approvals?merchant=' + encodeURIComponent(merchant) + '&id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' });
        if (r.status === 403 || r.status === 404) { if (++misses >= 3) break; continue; }   // session perdue : on s'arrête
        const d = await r.json().catch(() => null);
        status = String((d && d.approval && d.approval.status) || '');
      } catch (_) { continue; }
      if (status === 'approved' || status === 'granted') { ui.say(t.ok); ui.close(700); return { id }; }
      if (status === 'refused') { ui.say(t.refused); ui.close(1600); return { refusal: t.refused }; }
      if (status && status !== 'pending') break;
    }
    ui.close();
    return { refusal: withdrawn ? t.withdrawn : t.expired };
  }

  async function settle(input, init, res) {
    let data = null, body = null;
    try { data = await res.clone().json(); body = JSON.parse(init.body); } catch (_) { return res; }
    if (!data || data.error !== 'owner-approval-required' || !data.ask || !body || !body.merchant) return res;
    /* Un bon entier (« Annuler le bon ») porte l'accord à la racine du corps. */
    const slot = SLOTS.find((k) => body[k] && typeof body[k] === 'object') || (body.status === 'rejected' && body.id ? '' : null);
    if (slot == null) return res;
    busy = true;
    try {
      const answer = await askOwner(String(body.merchant), data.ask);
      if (answer.refusal) return json({ error: answer.refusal, ownerApproval: 'refused' }, 403);
      if (answer.id && slot) body[slot] = Object.assign({}, body[slot], { ownerApproval: answer.id });
      else if (answer.id) body.ownerApproval = answer.id;
      const again = Object.assign({}, init, { body: JSON.stringify(body) });
      delete again.signal;   // le délai de l'appelant a couru pendant l'attente du patron
      return await fetch(input, again);   // un second refus repasse ici : `busy` le laisse filer
    } catch (_) {
      return res;
    } finally { busy = false; }
  }
  window.addEventListener('kiwi:owner-approval', (e) => {
    const d = e.detail;
    if (!d || d.taken || busy || !d.response || !queuePost(d.input, d.init)) return;
    d.taken = true;
    d.answer(settle(d.input, d.init, d.response));
  });
})();
