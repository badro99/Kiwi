/* Kiwi Caisse · livraisons à encaisser.
 *
 * Une vente partie en livraison est une créance : le serveur l'enregistre à 0
 * et le Z la range sous « Livraisons · à recevoir ». Quand le livreur rapporte
 * l'argent au comptoir, la caisse le dit ici, et c'est ce jour-là que l'argent
 * entre dans la recette. Le virement et le chèque se notent depuis le tableau
 * de bord ; les espèces, seulement depuis une caisse appairée.
 *
 * Contrat : GET /api/receivables?merchant= → { open: [{ saleId, ref, label, ts,
 * owedCents, dueCents, collections }] } ; POST /api/receivables { merchant,
 * saleId, method: 'cash', amountCents, id, collectedBy: { id, name } } →
 * { ok, already, sale: { id, amountCents, ts }, dueCents }. `id` est la clé
 * d'un paiement : la même à chaque nouvel essai du même paiement (un essai
 * rejoué ne compte pas deux fois), une nouvelle pour le paiement suivant.
 * 409 id-taken : la clé est déjà celle d'une autre vente, rien n'est écrit.
 *
 * Sans le serveur (route absente, hors ligne), la liste se tait au lieu
 * d'afficher une créance qu'elle ne peut pas solder. La démo passe par
 * `opts.demo`, en mémoire. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mad = (cents) => {
    const v = Math.round(+cents || 0) / 100;
    const dec = Math.abs(v % 1) > 0.004;
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }).format(v) + ' MAD';
  };
  const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const when = (ts) => { const d = new Date(+ts || 0); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  /* « 450 », « 450,5 », « 450.50 » → centimes ; rien d'autre. */
  function toCents(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return 0;
    return Math.round(parseFloat(s) * 100);
  }
  function payId() {
    try {
      if (crypto && crypto.randomUUID) return 'dlvc-' + crypto.randomUUID();
    } catch (_) {}
    return 'dlvc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  const REASON = {
    'exceeds-due': 'Montant plus élevé que ce qui reste dû sur cette livraison.',
    'nothing-due': 'Cette livraison est déjà entièrement encaissée.',
    'bad-amount': 'Montant invalide.',
    'not-a-delivery': 'Cette vente n’est plus une livraison à recevoir.',
    'id-conflict': 'Conflit d’encaissement, réessayez.',
    'id-taken': 'Conflit d’encaissement, réessayez.',
    'forbidden-merchant': 'Cette caisse n’est pas appairée à ce commerce.',
    'cash-at-till-only': 'Les espèces s’encaissent depuis une caisse appairée : appairez cette caisse, puis réessayez.',
    'bad-id': 'Encaissement refusé (référence invalide), réessayez.',
  };

  async function fetchOpen(merchant) {
    const r = await fetch('/api/receivables?merchant=' + encodeURIComponent(merchant), {
      credentials: 'same-origin', headers: { Accept: 'application/json' },
    });
    if (!r.ok) { const e = new Error('http-' + r.status); e.status = r.status; throw e; }
    const data = await r.json();
    return Array.isArray(data && data.open) ? data.open : [];
  }
  async function postCash(merchant, d, amountCents, id, by) {
    const body = { merchant, saleId: d.saleId, method: 'cash', amountCents, id };
    if (by && by.name) body.collectedBy = { id: String(by.id || '').slice(0, 80), name: String(by.name).slice(0, 80) };
    let r;
    try {
      r = await fetch('/api/receivables', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_) { return { error: 'offline' }; }
    let data = null; try { data = await r.json(); } catch (_) {}
    if (!r.ok || !data || data.error || !data.sale) return { error: (data && data.error) || 'http-' + r.status, dueCents: data && data.dueCents };
    return data;
  }

  /* host : un élément vide ; opts : { merchant, staff(), onCollected(sale, d),
     toast(msg, ms, kind, desc), demo?: { list(), collect(d, cents) } }. */
  async function render(host, opts) {
    if (!host) return;
    let rows = [];
    try { rows = opts.demo ? opts.demo.list() : await fetchOpen(opts.merchant); }
    catch (_) { host.replaceChildren(); return; }
    rows = rows.filter((d) => d && (+d.dueCents || 0) > 0).sort((a, b) => (+a.ts || 0) - (+b.ts || 0));
    if (!host.isConnected && !opts.detached) return;
    if (!rows.length) { host.replaceChildren(); return; }
    const total = rows.reduce((n, d) => n + (+d.dueCents || 0), 0);
    host.innerHTML = `<section class="kdc" aria-labelledby="kdc-h">
      <div class="kdc-head"><h2 id="kdc-h">Livraisons à encaisser</h2>
        <span class="kdc-sum">${rows.length} · ${esc(mad(total))}</span></div>
      <p class="kdc-sub">L’argent que rapporte le livreur entre dans la recette du jour où il est reçu.</p>
      <div class="kdc-list" role="list">${rows.map((d, i) => `
        <div class="kdc-card" role="listitem" data-kdc-i="${i}">
          <div class="kdc-main"><strong>${esc(d.label || d.ref || d.saleId)}</strong>
            <span class="kdc-meta">${d.ref ? 'Ticket ' + esc(d.ref) + ' · ' : ''}envoyée ${esc(when(d.ts))}${(d.collections || []).length ? ' · déjà reçu ' + esc(mad((+d.owedCents || 0) - (+d.dueCents || 0))) : ''}</span></div>
          <span class="kdc-due">Reste ${esc(mad(d.dueCents))}</span>
          <button type="button" class="kdc-go" data-kdc-open="${i}">Espèces reçues</button>
        </div>`).join('')}</div></section>`;
    host.querySelectorAll('[data-kdc-open]').forEach((b) => {
      b.addEventListener('click', () => openForm(host, opts, rows[+b.getAttribute('data-kdc-open')], b.closest('.kdc-card')));
    });
  }

  function openForm(host, opts, d, card) {
    if (!d || !card || card.querySelector('.kdc-form')) return;
    let id = payId();                        /* un paiement = une clé, gardée pour ses nouveaux essais */
    const form = document.createElement('form');
    form.className = 'kdc-form';
    form.innerHTML = `<label><span>Montant reçu en espèces</span>
        <input name="amount" inputmode="decimal" autocomplete="off" value="${esc(String((+d.dueCents || 0) / 100).replace('.', ','))}"></label>
      <p class="kdc-err" role="alert" hidden></p>
      <div class="kdc-actions"><button type="button" class="kdc-cancel">Annuler</button>
        <button data-activation=write type="submit" class="kdc-ok">Enregistrer</button></div>`;
    card.appendChild(form);
    const go = card.querySelector('.kdc-go');
    if (go) go.hidden = true;
    const input = form.querySelector('input');
    const ok = form.querySelector('.kdc-ok');
    const err = form.querySelector('.kdc-err');
    const label = () => { const c = toCents(input.value); ok.textContent = c > 0 ? `Enregistrer ${mad(c)} en espèces` : 'Enregistrer'; };
    const say = (msg) => { err.textContent = msg; err.hidden = !msg; };
    label();
    input.addEventListener('input', () => { label(); say(''); });
    form.querySelector('.kdc-cancel').addEventListener('click', () => { form.remove(); if (go) go.hidden = false; });
    try { input.focus(); input.select(); } catch (_) {}
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const cents = toCents(input.value);
      if (!(cents > 0)) { say('Saisissez le montant reçu.'); return; }
      if (cents > (+d.dueCents || 0)) { say(`Il ne reste que ${mad(d.dueCents)} à recevoir sur cette livraison.`); return; }
      busy = true; ok.disabled = true;
      const res = opts.demo ? opts.demo.collect(d, cents, id) : await postCash(opts.merchant, d, cents, id, opts.staff && opts.staff());
      busy = false; ok.disabled = false;
      if (res.error) {
        /* La clé appartient déjà à une autre vente : rien n'a été écrit, le
           prochain essai part avec une clé neuve. */
        if (res.error === 'id-taken') id = payId();
        if (res.error === 'offline' || /^http-5/.test(res.error)) say('Pas de réponse du serveur. Réessayez : un même encaissement ne compte qu’une fois.');
        else say(REASON[res.error] ? REASON[res.error] + (res.dueCents != null && res.error === 'exceeds-due' ? ` Reste ${mad(res.dueCents)}.` : '') : 'Encaissement refusé.');
        return;
      }
      const amountCents = Math.round(+res.sale.amountCents || cents);
      /* Même rejoué (already) : la première réponse a pu se perdre en route, et
         la caisse n'a alors rien noté. onCollected dédoublonne par id. */
      if (opts.onCollected) opts.onCollected({ id: res.sale.id, amountCents, ts: +res.sale.ts || Date.now() }, d);
      if (opts.toast) opts.toast(`Livraison encaissée, ${mad(amountCents)}`, 3600, 'success',
        (+res.dueCents || 0) > 0 ? `Reste ${mad(res.dueCents)} à recevoir` : 'Livraison soldée');
      void render(host, opts);
    });
  }

  window.KiwiDeliveryCollect = Object.freeze({ render, toCents });
})();
