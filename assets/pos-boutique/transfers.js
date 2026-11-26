/* La caisse boutique · « Transferts » entre boutiques (Santos, 19 novembre 2026).
 *
 * Ce que le propriétaire a demandé :
 *   · Casablanca crée « Transfert vers Rabat » et scanne les pièces une fois :
 *     elles quittent son stock et sont en route ;
 *   · Rabat reçoit le transfert tout de suite, SANS fenêtre qui s'ouvre et sans
 *     rien sur la page de vente ni l'inventaire : il vit dans le pied du rail
 *     (le menu du caissier), avec au plus un petit point sur le bouton ;
 *   · trois boutons : « Tout reçu », « Reçu en partie », « Il manque quelque chose ».
 *
 * Le bouton n'existe que si la boutique partage son catalogue avec une autre
 * (functions/api/_catalog-family.js) : ailleurs, la caisse ne change pas.
 * Le serveur (functions/api/stock-transfers.js) fait bouger le stock ; la caisse
 * relit ensuite le catalogue, elle ne recalcule rien elle-même.
 * La douchette : d.armScanCapture / d.disarmScanCapture / d.normScan (checkout.js),
 * passés par pos-boutique.js : tant que l'envoi est ouvert, un scan ne tombe jamais sur le ticket. */

const POLL = 2 * 60 * 1000;
const STATUS = { route: 'en-route', partial: 'partiel', done: 'recu', short: 'manque' };
const MODE = { all: 'all', partial: 'partial', missing: 'missing' };
const LEVEL = { warn: 'warn', success: 'success' };   // niveaux de toast : des clés, jamais du texte lu
/* Les phrases de cet écran, en anglais et en arabe (même règle que livraisons.js). */
const PHRASES = {
  'Transferts': ['Transfers', 'التحويلات'],
  'À recevoir': ['To receive', 'للاستلام'],
  'Rien à recevoir.': ['Nothing to receive.', 'لا شيء للاستلام.'],
  'Envoyer': ['Send', 'إرسال'],
  'Transfert vers {shop}': ['Transfer to {shop}', 'تحويل إلى {shop}'],
  'Envoyés': ['Sent', 'المُرسَلة'],
  'Aucun envoi.': ['Nothing sent yet.', 'لا توجد إرسالات.'],
  'De {shop}': ['From {shop}', 'من {shop}'],
  'Vers {shop}': ['To {shop}', 'إلى {shop}'],
  '{n} en route': ['{n} on the way', '{n} في الطريق'],
  'Non reçu depuis 3 jours': ['Not received for 3 days', 'لم يُستلم منذ 3 أيام'],
  'Tout reçu': ['All received', 'تم استلام الكل'],
  'Reçu en partie': ['Partly received', 'استلام جزئي'],
  'Il manque quelque chose': ['Something is missing', 'هناك شيء ناقص'],
  'Combien sont arrivés ?': ['How many arrived?', 'كم وصل؟'],
  'Combien manquent ?': ['How many are missing?', 'كم ينقص؟'],
  'Valider': ['Confirm', 'تأكيد'],
  'Annuler': ['Cancel', 'إلغاء'],
  'Fermer': ['Close', 'إغلاق'],
  'En route': ['On the way', 'في الطريق'],
  'Reçu': ['Received', 'تم الاستلام'],
  'Il manquait {n} pièce(s)': ['{n} piece(s) were missing', 'نقصت {n} قطعة'],
  'Scannez les pièces à envoyer, ou tapez le code puis Entrée': ['Scan the pieces to send, or type the code then Enter', 'امسح القطع المراد إرسالها، أو اكتب الرمز ثم Entrée'],
  'Aucune pièce scannée.': ['No piece scanned yet.', 'لم تُمسح أي قطعة بعد.'],
  'Envoyer {n} pièce(s) vers {shop}': ['Send {n} piece(s) to {shop}', 'إرسال {n} قطعة إلى {shop}'],
  'Code inconnu : {code}': ['Unknown code: {code}', 'رمز غير معروف: {code}'],
  'Plus de stock ici pour cet article.': ['No more stock here for this item.', 'لا مخزون هنا لهذه السلعة.'],
  'Transfert envoyé : les pièces sont en route.': ['Transfer sent: the pieces are on the way.', 'تم إرسال التحويل: القطع في الطريق.'],
  'Réception enregistrée : le stock est à jour.': ['Receipt recorded: stock is up to date.', 'تم تسجيل الاستلام: المخزون محدّث.'],
  'Écart enregistré : le propriétaire le verra.': ['Shortfall recorded: the owner will see it.', 'تم تسجيل النقص: سيراه المالك.'],
  'Pas assez de stock ici pour envoyer cela.': ['Not enough stock here to send that.', 'لا يوجد مخزون كافٍ هنا لإرسال ذلك.'],
  'Ces quantités dépassent ce qui est en route.': ['These quantities are more than what is on the way.', 'هذه الكميات أكثر مما هو في الطريق.'],
  'Non enregistré. Vérifiez la connexion et réessayez.': ['Not recorded. Check the connection and try again.', 'لم يُسجَّل. تحقق من الاتصال وأعد المحاولة.'],
  'Retirer': ['Remove', 'إزالة'],
  'Envoyé par {who}': ['Sent by {who}', 'أرسله {who}'],
};
const tr = (s, vars) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  let out = own && (lang === 'en' || lang === 'ar') ? own[lang === 'en' ? 0 : 1] : (C && typeof C.tr === 'function' ? C.tr(s) : s);
  if (vars) Object.keys(vars).forEach((k) => { out = out.split('{' + k + '}').join(String(vars[k])); });
  return out;
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOCALE = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
const when = (ts) => { try { const C = window.KiwiCaisseLang; return new Date(ts).toLocaleString(LOCALE[(C && C.get && C.get()) || 'fr'] || 'fr-FR', { numberingSystem: 'latn', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
const left = (l) => Math.max(0, (l.qty || 0) - (l.received || 0) - (l.missing || 0));
const lineName = (l) => [l.name, l.size, l.color].filter(Boolean).join(' · ');

const CSS = [
  '.bq-tr-dot{display:inline-block;inline-size:8px;block-size:8px;border-radius:50%;background:var(--atlas);margin-inline-start:6px;vertical-align:middle}',
  '.bq-tr-veil{position:fixed;top:0;right:0;bottom:0;left:0;z-index:950;display:flex;align-items:center;justify-content:center;background:rgba(10,15,13,.45);padding:16px}',
  '.bq-tr-veil[hidden]{display:none}',
  '.bq-tr{background:var(--paper);color:var(--ink);border-radius:16px;inline-size:min(720px,100%);max-block-size:88vh;overflow:auto;padding:20px 22px;box-sizing:border-box}',
  '.bq-tr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-block-end:12px}',
  '.bq-tr-head h2{margin:0;font-size:22px;font-weight:600}',
  '.bq-tr h3{margin:18px 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft)}',
  '.bq-tr-card{border:1px solid var(--n-200);background:var(--paper-elev);border-radius:12px;padding:12px 14px;margin-block-end:10px}',
  '.bq-tr-top{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;justify-content:space-between}',
  '.bq-tr-top b{font-weight:600}',
  '.bq-tr-meta{font-size:13px;color:var(--ink-soft)}',
  '.bq-tr-late{font-size:12px;font-weight:600;color:var(--danger);padding:2px 8px;border-radius:999px;background:var(--warn-soft)}',
  '.bq-tr-lines{list-style:none;margin:8px 0;padding:0;font-size:14px}',
  '.bq-tr-lines li{display:flex;justify-content:space-between;gap:10px;padding:4px 0;align-items:center}',
  '.bq-tr-acts{display:flex;flex-wrap:wrap;gap:8px;margin-block-start:8px}',
  '.bq-tr-btn{border:1px solid var(--n-300);background:transparent;color:inherit;border-radius:10px;padding:10px 14px;font:inherit;font-size:14px;cursor:pointer;min-block-size:44px}',
  '.bq-tr-btn.is-main{background:var(--atlas);border-color:var(--atlas);color:var(--paper)}',
  '.bq-tr-btn[disabled]{opacity:.45;cursor:default}',
  '.bq-tr-step{display:inline-flex;align-items:center;gap:6px}',
  '.bq-tr-step button{inline-size:36px;block-size:36px;border-radius:8px;border:1px solid var(--n-300);background:transparent;color:inherit;font-size:18px;cursor:pointer}',
  '.bq-tr-step b{min-inline-size:28px;text-align:center}',
  '.bq-tr-scan{inline-size:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid var(--n-300);font:inherit;font-size:15px;background:transparent;color:inherit}',
  '.bq-tr-empty{color:var(--ink-soft);font-size:14px;margin:4px 0 8px}',
];

/* La famille vue par la dernière lecture : la fiche de livraison y prend
   « Envoyé de » (delivery-card.js). Vide hors catalogue partagé. */
let family = null;
export function shipChoices() { return family && family.self ? [family.self].concat(family.shops) : []; }
/* « Mouvements de stock › Nouveau › Transfert » (stock-move.js) ouvre ce même
   envoi, déjà adressé à la boutique choisie. Faux tant que la famille n'est pas lue. */
let live = null;
export function startTransfer(merchant) { return !!(live && live(merchant)); }

export function bqTransfers(root, d) {
  const slug = typeof d.slug === 'function' ? d.slug() : d.slug;
  if (!root || d.demo || !slug) return null;
  const foot = root.querySelector('.bq-rail-foot');
  if (!foot) return null;
  const noop = () => {};
  const armScanCapture = d.armScanCapture || noop, disarmScanCapture = d.disarmScanCapture || noop;
  const normScan = d.normScan || ((x) => String(x || '').trim());
  const st = { data: null, open: false, compose: null, receiving: null, busy: false, timer: 0 };
  let btn = null, veil = null;

  function api(method, body) {
    const url = '/api/stock-transfers' + (method === 'GET' ? '?merchant=' + encodeURIComponent(slug) : '');
    return fetch(url, { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify({ merchant: slug, ...body }) : undefined })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ status: r.status, j })));
  }
  const openIncoming = () => ((st.data && st.data.incoming) || []).filter((t) => !t.closedAt);

  function ensureButton() {
    if (btn || !st.data || !(st.data.shops || []).length) return;
    if (!document.getElementById('bq-tr-css')) {
      const s = document.createElement('style'); s.id = 'bq-tr-css'; s.textContent = CSS.join('\n'); document.head.appendChild(s);
    }
    btn = document.createElement('button');
    btn.className = 'bq-lock'; btn.id = 'bq-transfers'; btn.type = 'button';
    btn.innerHTML = `<i data-icon="swap_horiz"></i><span>${esc(tr('Transferts'))}</span><b class="bq-tr-dot" hidden></b>`;
    const lock = foot.querySelector('#bq-lock');
    foot.insertBefore(btn, lock || null);
    btn.addEventListener('click', open);
    if (typeof d.icons === 'function') d.icons();
  }
  function paintDot() {
    if (!btn) return;
    const n = openIncoming().length;
    const dot = btn.querySelector('.bq-tr-dot');
    if (dot) dot.hidden = !n;
    btn.setAttribute('aria-label', tr('Transferts') + (n ? ' · ' + tr('À recevoir') + ' ' + n : ''));
  }
  function refresh() {
    return api('GET').then(({ status, j }) => {
      if (status !== 200 || !j) return;
      /* Rien de neuf : on ne repeint pas (un repeint sous le doigt avale le toucher). */
      const sig = JSON.stringify(j);
      if (sig === st.sig) return;
      st.sig = sig; st.data = j;
      family = (j.shops || []).length && j.self ? { self: j.self, shops: j.shops } : null;
      ensureButton(); paintDot();
      if (st.open) paint();
    }).catch(() => {});
  }

  function open() {
    st.open = true;
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'bq-tr-veil';
      veil.setAttribute('role', 'dialog'); veil.setAttribute('aria-modal', 'true');
      veil.addEventListener('click', onClick);
      veil.addEventListener('keydown', onKey);
      document.body.appendChild(veil);
    }
    veil.hidden = false;
    paint();
    refresh();
  }
  function close() {
    st.open = false; st.compose = null; st.receiving = null;
    disarmScanCapture(onScan);
    if (veil) veil.hidden = true;
  }

  function addCode(raw) {
    const c = st.compose; if (!c) return;
    const code = normScan(raw);
    if (!code) return;
    const K = window.KiwiBoutiqueCatalog;
    const hit = K && K.findByBarcode ? K.findByBarcode(code) : null;
    if (!hit || !hit.variant) { d.toast(tr('Code inconnu : {code}', { code }), 3000, LEVEL.warn); return; }
    const v = hit.variant, p = hit.product || {};
    const row = c.lines.find((l) => l.vid === v.id);
    const have = Math.max(0, Number(v.stock) || 0);
    if ((row ? row.qty : 0) + 1 > have) { d.toast(tr('Plus de stock ici pour cet article.'), 3000, LEVEL.warn); return; }
    if (row) row.qty += 1;
    else c.lines.push({ vid: v.id, qty: 1, max: have, name: lineName({ name: p.name, size: v.size, color: v.colorLabel || v.colorFamily || v.colorId }) });
    paint();
  }
  function onScan(code) { addCode(code); }

  function card(t, incoming) {
    const late = t.overdue ? `<span class="bq-tr-late">${esc(tr('Non reçu depuis 3 jours'))}</span>` : '';
    const head = incoming ? tr('De {shop}', { shop: t.fromName }) : tr('Vers {shop}', { shop: t.toName });
    const missing = (t.lines || []).reduce((s, l) => s + (l.missing || 0), 0);
    const status = t.status === STATUS.route ? tr('En route') : t.status === STATUS.partial ? tr('Reçu en partie')
      : t.status === STATUS.short ? tr('Il manquait {n} pièce(s)', { n: missing }) : tr('Reçu');
    const recv = st.receiving && st.receiving.id === t.id ? st.receiving : null;
    const lines = (t.lines || []).filter((l) => !incoming || t.closedAt || left(l) > 0).map((l) => {
      const n = incoming && !t.closedAt ? left(l) : l.qty;
      const right = recv
        ? `<span class="bq-tr-step"><button type="button" data-tr-dec="${esc(l.vid)}" aria-label="−">−</button><b>${recv.q[l.vid] || 0}</b><button type="button" data-tr-inc="${esc(l.vid)}" aria-label="+">+</button></span>`
        : `<b>${n}</b>`;
      return `<li><span>${esc(lineName(l))}</span>${right}</li>`;
    }).join('');
    const by = t.by ? ' · ' + esc(tr('Envoyé par {who}', { who: t.by })) : '';
    let acts = '';
    if (incoming && !t.closedAt) {
      acts = recv
        ? `<p class="bq-tr-meta">${esc(recv.mode === MODE.partial ? tr('Combien sont arrivés ?') : tr('Combien manquent ?'))}</p>
           <div class="bq-tr-acts"><button type="button" class="bq-tr-btn is-main" data-tr-confirm="${esc(t.id)}">${esc(tr('Valider'))}</button>
           <button type="button" class="bq-tr-btn" data-tr-cancel>${esc(tr('Annuler'))}</button></div>`
        : `<div class="bq-tr-acts"><button type="button" class="bq-tr-btn is-main" data-tr-all="${esc(t.id)}">${esc(tr('Tout reçu'))}</button>
           <button type="button" class="bq-tr-btn" data-tr-partial="${esc(t.id)}">${esc(tr('Reçu en partie'))}</button>
           <button type="button" class="bq-tr-btn" data-tr-missing="${esc(t.id)}">${esc(tr('Il manque quelque chose'))}</button></div>`;
    }
    const sub = incoming && !t.closedAt ? tr('{n} en route', { n: t.remaining }) : status;
    return `<div class="bq-tr-card"><div class="bq-tr-top"><b>${esc(head)}</b>${late}<span class="bq-tr-meta">${esc(when(t.at))}${by} · ${esc(sub)}</span></div>
      <ul class="bq-tr-lines">${lines}</ul>${acts}</div>`;
  }

  function paint() {
    if (!veil || !st.open) return;
    const data = st.data || { incoming: [], outgoing: [], shops: [] };
    const c = st.compose;
    let body = '';
    if (c) {
      const total = c.lines.reduce((s, l) => s + l.qty, 0);
      const rows = c.lines.map((l) => `<li><span>${esc(l.name)}</span><span class="bq-tr-step">
        <button type="button" data-tr-cdec="${esc(l.vid)}" aria-label="${esc(tr('Retirer'))}">−</button><b>${l.qty}</b>
        <button type="button" data-tr-cinc="${esc(l.vid)}" aria-label="+">+</button></span></li>`).join('');
      body = `<h3>${esc(tr('Transfert vers {shop}', { shop: c.toName }))}</h3>
        <input class="bq-tr-scan" id="bq-tr-scan" autocomplete="off" inputmode="numeric" placeholder="${esc(tr('Scannez les pièces à envoyer, ou tapez le code puis Entrée'))}">
        ${rows ? `<ul class="bq-tr-lines">${rows}</ul>` : `<p class="bq-tr-empty">${esc(tr('Aucune pièce scannée.'))}</p>`}
        <div class="bq-tr-acts"><button type="button" class="bq-tr-btn is-main" data-tr-send ${total && !st.busy ? '' : 'disabled'}>${esc(tr('Envoyer {n} pièce(s) vers {shop}', { n: total, shop: c.toName }))}</button>
        <button type="button" class="bq-tr-btn" data-tr-cancel>${esc(tr('Annuler'))}</button></div>`;
    } else {
      const inc = (data.incoming || []).filter((t) => !t.closedAt);
      const out = (data.outgoing || []).slice(0, 10);
      body = `<h3>${esc(tr('À recevoir'))}</h3>${inc.length ? inc.map((t) => card(t, true)).join('') : `<p class="bq-tr-empty">${esc(tr('Rien à recevoir.'))}</p>`}
        <h3>${esc(tr('Envoyer'))}</h3><div class="bq-tr-acts">${(data.shops || []).map((s) => `<button type="button" class="bq-tr-btn" data-tr-to="${esc(s.merchant)}">${esc(tr('Transfert vers {shop}', { shop: s.name }))}</button>`).join('')}</div>
        <h3>${esc(tr('Envoyés'))}</h3>${out.length ? out.map((t) => card(t, false)).join('') : `<p class="bq-tr-empty">${esc(tr('Aucun envoi.'))}</p>`}`;
    }
    veil.innerHTML = `<div class="bq-tr"><div class="bq-tr-head"><h2>${esc(tr('Transferts'))}</h2>
      <button type="button" class="bq-tr-btn" data-tr-close>${esc(tr('Fermer'))}</button></div>${body}</div>`;
    const scan = veil.querySelector('#bq-tr-scan');
    if (scan) {
      scan.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault(); e.stopPropagation();
        const v = scan.value; scan.value = '';
        addCode(v);
      });
      try { scan.focus(); } catch (_) {}
    }
  }

  function post(body, okMsg) {
    st.busy = true; paint();
    return api('POST', { ...body, by: (typeof d.by === 'function' ? d.by() : '') || '' }).then(({ status, j }) => {
      st.busy = false;
      if (status === 200 && j && j.ok) {
        d.toast(okMsg, 3500, LEVEL.success);
        try { const K = window.KiwiBoutiqueCatalog; if (K && K.sync) K.sync(); } catch (_) {}
        return refresh().then(() => true);
      }
      const err = j && j.error;
      d.toast(err === 'stock-insufficient' ? tr('Pas assez de stock ici pour envoyer cela.')
        : err === 'more-than-en-route' ? tr('Ces quantités dépassent ce qui est en route.')
        : tr('Non enregistré. Vérifiez la connexion et réessayez.'), 5000, LEVEL.warn);
      paint();
      return false;
    }).catch(() => { st.busy = false; d.toast(tr('Non enregistré. Vérifiez la connexion et réessayez.'), 5000, LEVEL.warn); paint(); return false; });
  }

  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); if (st.compose || st.receiving) { st.compose = null; st.receiving = null; disarmScanCapture(onScan); paint(); } else close(); } }
  function onClick(e) {
    if (e.target === veil) { close(); return; }
    const t = e.target.closest('button'); if (!t || t.disabled) return;
    const a = (k) => t.getAttribute(k);
    if (t.hasAttribute('data-tr-close')) { close(); return; }
    if (t.hasAttribute('data-tr-cancel')) { st.compose = null; st.receiving = null; disarmScanCapture(onScan); paint(); return; }
    if (a('data-tr-to')) {
      const shop = (st.data.shops || []).find((s) => s.merchant === a('data-tr-to'));
      st.compose = { to: shop.merchant, toName: shop.name, lines: [], ref: 'snd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) };
      armScanCapture(onScan); paint(); return;
    }
    if (a('data-tr-cinc') || a('data-tr-cdec')) {
      const l = st.compose.lines.find((x) => x.vid === (a('data-tr-cinc') || a('data-tr-cdec')));
      if (!l) return;
      if (a('data-tr-cinc')) { if (l.qty < l.max) l.qty += 1; else d.toast(tr('Plus de stock ici pour cet article.'), 3000, LEVEL.warn); }
      else { l.qty -= 1; if (!l.qty) st.compose.lines = st.compose.lines.filter((x) => x !== l); }
      paint(); return;
    }
    if (t.hasAttribute('data-tr-send')) {
      const c = st.compose;
      post({ action: 'send', to: c.to, ref: c.ref, lines: c.lines.map((l) => ({ vid: l.vid, qty: l.qty })) }, tr('Transfert envoyé : les pièces sont en route.'))
        .then((ok) => { if (ok) { st.compose = null; disarmScanCapture(onScan); paint(); } });
      return;
    }
    if (a('data-tr-all')) { post({ action: 'receive', id: a('data-tr-all'), mode: MODE.all }, tr('Réception enregistrée : le stock est à jour.')); return; }
    if (a('data-tr-partial') || a('data-tr-missing')) {
      st.receiving = { id: a('data-tr-partial') || a('data-tr-missing'), mode: a('data-tr-partial') ? MODE.partial : MODE.missing, q: {} };
      paint(); return;
    }
    if (a('data-tr-inc') || a('data-tr-dec')) {
      const r = st.receiving; if (!r) return;
      const vid = a('data-tr-inc') || a('data-tr-dec');
      const tf = openIncoming().find((x) => x.id === r.id);
      const l = tf && tf.lines.find((x) => x.vid === vid);
      if (!l) return;
      r.q[vid] = Math.max(0, Math.min(left(l), (r.q[vid] || 0) + (a('data-tr-inc') ? 1 : -1)));
      paint(); return;
    }
    if (a('data-tr-confirm')) {
      const r = st.receiving;
      const lines = Object.keys(r.q).filter((k) => r.q[k] > 0).map((vid) => ({ vid, qty: r.q[vid] }));
      if (!lines.length) return;
      post({ action: 'receive', id: r.id, mode: r.mode, lines },
        r.mode === MODE.missing ? tr('Écart enregistré : le propriétaire le verra.') : tr('Réception enregistrée : le stock est à jour.'))
        .then((ok) => { if (ok) { st.receiving = null; paint(); } });
    }
  }

  refresh();
  st.timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  live = (merchant) => {
    const shop = ((st.data && st.data.shops) || []).find((x) => x.merchant === merchant);
    if (!shop) return false;
    open();
    st.compose = { to: shop.merchant, toName: shop.name, lines: [], ref: 'snd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) };
    armScanCapture(onScan); paint();
    return true;
  };
  return { refresh, open, close };
}
