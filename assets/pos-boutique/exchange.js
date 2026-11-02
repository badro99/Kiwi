/* La caisse boutique · « Échange » d'une livraison (Santos, 2 novembre 2026).
 *
 * La cliente a reçu sa commande, souvent payée au livreur, et veut une autre
 * taille ou une autre couleur. Dans « Livraisons », « Échange » : on coche la
 * pièce qui revient, on choisit la remplaçante (même article par défaut, ou un
 * autre), et la boutique la renvoie avec Ozon en colis « échange » : le livreur
 * la remet et reprend l'ancienne. Il n'encaisse pas le total de la commande,
 * seulement la différence de prix, plus la livraison si la cliente la paie.
 *
 *   · Les montants affichés ici sont une estimation ; le serveur décide
 *     (functions/api/ozon/exchange.js) : la valeur reprise vient du panier figé
 *     de la vente, celle envoyée du catalogue, ou du prix payé quand c'est le
 *     même article.
 *   · Le stock bouge ici, comme pour un retour, et une seule fois : sur un
 *     échange que le serveur vient d'accepter (already === false). La pièce
 *     envoyée sort, la pièce reprise rentre.
 *   · Un identifiant par échange ouvert : un double appui ou une reprise après
 *     coupure n'envoie jamais deux colis. */
const FEE_MAD = 50;
const PHRASES = {
  'Échange': ['Exchange', 'استبدال'],
  'Échanger': ['Exchange', 'استبدال'],
  'Échangée': ['Exchanged', 'مستبدلة'],
  'Pièce qui revient': ['Item coming back', 'القطعة المسترجعة'],
  'Remplacée par': ['Replaced by', 'تُستبدل بـ'],
  'Autre article': ['Another item', 'منتج آخر'],
  'Chercher un article': ['Search an item', 'ابحث عن منتج'],
  'Aucun article trouvé.': ['No item found.', 'لم يُعثر على أي منتج.'],
  'Choisissez la taille et la couleur.': ['Choose the size and colour.', 'اختر المقاس واللون.'],
  'épuisé': ['sold out', 'نفد'],
  '{n} chez la cliente': ['{n} with the customer', '{n} عند الزبونة'],
  'Repris': ['Taken back', 'المسترجع'],
  'Envoyé': ['Sent', 'المرسل'],
  'Le livreur encaisse': ['The courier collects', 'يحصّل عامل التوصيل'],
  'dont {x} de livraison': ['including {x} delivery', 'منها {x} للتوصيل'],
  'Livraison payée par la cliente ({x})': ['Delivery paid by the customer ({x})', 'التوصيل على حساب الزبونة ({x})'],
  'Article moins cher : la différence de {x} reste à la boutique.': ['Cheaper item: the {x} difference stays with the shop.', 'منتج أرخص: يبقى الفرق {x} للمتجر.'],
  'Envoyer l’échange avec Ozon': ['Send the exchange with Ozon', 'إرسال الاستبدال مع أوزون'],
  'Confirmer · le livreur encaisse {x}': ['Confirm · the courier collects {x}', 'تأكيد · يحصّل عامل التوصيل {x}'],
  'Ozon livre la nouvelle pièce et reprend l’ancienne.': ['Ozon delivers the new item and takes the old one back.', 'تسلّم أوزون القطعة الجديدة وتسترجع القديمة.'],
  'Échange envoyé': ['Exchange sent', 'تم إرسال الاستبدال'],
  'Ozon {code}': ['Ozon {code}', 'أوزون {code}'],
  'Échange non envoyé. Vérifiez la connexion et réessayez.': ['Exchange not sent. Check the connection and try again.', 'لم يُرسل الاستبدال. تحقق من الاتصال وأعد المحاولة.'],
  'Destinataire inconnu : envoyez d’abord la commande avec Ozon.': ['Unknown recipient: send the order with Ozon first.', 'المستلم غير معروف: أرسل الطلب مع أوزون أولاً.'],
  'Plus assez de stock pour cette taille.': ['Not enough stock for this size.', 'لا يوجد مخزون كافٍ لهذا المقاس.'],
  'Cette pièce a déjà été échangée ou rendue.': ['This item was already exchanged or returned.', 'سبق استبدال هذه القطعة أو إرجاعها.'],
  'Cet article n’est plus au catalogue.': ['This item is no longer in the catalogue.', 'هذا المنتج لم يعد في الكتالوج.'],
  'Ozon a refusé l’échange.': ['Ozon refused the exchange.', 'رفضت أوزون الاستبدال.'],
  '{n} pièce(s) remise(s) en stock, {m} sortie(s).': ['{n} item(s) back in stock, {m} taken out.', 'أُعيدت {n} قطعة إلى المخزون، وأُخرجت {m}.'],
  'Moins': ['Less', 'أقل'],
  'Plus': ['More', 'أكثر'],
  'Annuler': ['Cancel', 'إلغاء'],
  'Article': ['Item', 'منتج'],
};
const tr = (s) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return C && typeof C.tr === 'function' ? C.tr(s) : s;
};
/* Une phrase traduite, ses trous {x} remplis. */
const fill = (key, vars) => Object.keys(vars).reduce((out, k) => out.split('{' + k + '}').join(String(vars[k])), tr(key));
/* Codes rendus par le serveur → phrase à lire. Clés techniques, jamais du texte lu. */
const ERRORS = {
  'recipient-required': 'Destinataire inconnu : envoyez d’abord la commande avec Ozon.',
  'stock-insufficient': 'Plus assez de stock pour cette taille.',
  'exceeds-line': 'Cette pièce a déjà été échangée ou rendue.',
  'unknown-product': 'Cet article n’est plus au catalogue.',
  'unknown-variant': 'Cet article n’est plus au catalogue.',
  'ozon-refused': 'Ozon a refusé l’échange.',
};
/* Niveaux de toast : clés techniques, en table pour la garde i18n. */
const LEVEL = { success: 'success', warn: 'warn' };
const fold = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* L'échange en cours d'écriture : une commande à la fois. */
let ex = null;

function newId() {
  try { if (crypto && crypto.randomUUID) return 'xch-' + crypto.randomUUID(); } catch (_) {}
  return 'xch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}
/* pid:taille:couleur, tel que la vente l'a figé. */
function partsOf(line) {
  const p = String(line && line.variant || '').split(':');
  return p.length >= 3 && p[0] ? { pid: p[0], size: p[1], color: p.slice(2).join(':') } : null;
}
const leftOf = (l) => Math.max(0, (l.qty || 0) - (l.returnedQty || 0) - (l.exchangedQty || 0));
const swappable = (x) => (x.lines || []).filter((l) => leftOf(l) > 0 && partsOf(l));

export const exchOpenFor = (saleId) => !!(ex && ex.saleId === saleId);
export function exchClose() { ex = null; }
/* Un échange se propose quand Ozon est relié et qu'une pièce de la commande
   est encore chez la cliente. */
export function exchButton(x, esc, ozonOn) {
  if (!ozonOn || !swappable(x).length) return '';
  return '<button type="button" class="bqd-btn sm" data-bqx-open="' + esc(x.saleId) + '"><i data-icon="swap_horiz"></i>' + esc(tr('Échange')) + '</button>';
}

/* Les déclinaisons d'un article : une par taille × famille de couleur. */
function variantsOf(d, pid) {
  const P = d.products() || {};
  const p = P[pid];
  if (!p) return [];
  const cat = window.KiwiBoutiqueCatalog;
  const seen = new Map();
  (p._variants || []).forEach((v) => {
    const color = cat && cat.colorFamily ? String(cat.colorFamily(v)) : String(v.colorId || '');
    const key = String(v.size || '') + '|' + color;
    if (!seen.has(key)) seen.set(key, { size: String(v.size || ''), color });
  });
  return [...seen.values()].map((v) => Object.assign(v, { stock: Math.max(0, Number(d.variantStock(pid, v.size, v.color)) || 0) }));
}
function unitBack(line) { return Math.round((line.totalCents || 0) / (line.qty || 1)); }
/* Estimation affichée : la règle du serveur, appliquée aux chiffres de la caisse. */
function estimate(x, d) {
  const P = d.products() || {};
  let back = 0, out = 0;
  Object.entries(ex.picks).forEach(([i, pk]) => {
    const line = (x.lines || []).find((l) => l.i === Number(i));
    if (!line || !pk.size) return;
    const b = unitBack(line) * pk.q;
    const from = partsOf(line);
    back += b;
    out += from && from.pid === pk.pid ? b : Math.round(Number((P[pk.pid] || {}).price || 0) * 100) * pk.q;
  });
  const diff = Math.max(0, out - back);
  return { back, out, diff, credit: Math.max(0, back - out), cod: diff + (ex.fee ? FEE_MAD * 100 : 0) };
}
const ready = () => ex && Object.keys(ex.picks).length > 0 && Object.values(ex.picks).every((pk) => pk.size);

export function exchStart(x) {
  ex = { saleId: x.saleId, id: newId(), picks: {}, fee: true, confirm: false, busy: false, search: null, q: '' };
}

/* L'éditeur, sous la commande. `who` : le destinataire affiché par Livraisons. */
export function exchHtml(x, d, esc, who) {
  if (!exchOpenFor(x.saleId)) return '';
  const P = d.products() || {};
  const mad = (c) => d.fmtMAD((Number(c) || 0) / 100);
  const rows = swappable(x).map((l) => {
    const pk = ex.picks[l.i];
    const left = leftOf(l);
    let body = '<div class="bqx-line"><div>' + esc(l.name || tr('Article')) + '<small>' + esc(tr('{n} chez la cliente').replace('{n}', String(left))) + ' · ' + esc(mad(unitBack(l))) + '</small></div>'
      + '<button type="button" class="bqd-btn sm' + (pk ? ' go' : '') + '" data-bqx-pick="' + l.i + '" aria-pressed="' + (pk ? 'true' : 'false') + '">' + esc(tr(pk ? 'Échangée' : 'Échanger')) + '</button></div>';
    if (!pk) return '<div class="bqx-item">' + body + '</div>';
    const prod = P[pk.pid];
    if (left > 1) {
      body += '<div class="bqx-qty"><span>' + esc(tr('Pièce qui revient')) + '</span><span class="bqd-step"><button type="button" data-bqx-q="' + l.i + '" data-d="-1" aria-label="' + esc(tr('Moins')) + '">−</button><b>' + pk.q + '</b>'
        + '<button type="button" data-bqx-q="' + l.i + '" data-d="1" data-max="' + left + '" aria-label="' + esc(tr('Plus')) + '">+</button></span></div>';
    }
    body += '<div class="bqx-to"><span>' + esc(tr('Remplacée par')) + ' <b>' + esc(prod ? prod.name : tr('Article')) + '</b></span>'
      + '<button type="button" class="bqd-btn sm" data-bqx-other="' + l.i + '"><i data-icon="search"></i>' + esc(tr('Autre article')) + '</button></div>';
    if (ex.search === l.i) {
      const q = fold(ex.q);
      const hits = q ? Object.values(P).filter((p) => p && p.id && fold(p.name).includes(q)).slice(0, 6) : [];
      body += '<div class="bqx-find"><input type="search" data-bqx-q-in autocomplete="off" enterkeyhint="search" placeholder="' + esc(tr('Chercher un article')) + '" aria-label="' + esc(tr('Chercher un article')) + '" value="' + esc(ex.q) + '">'
        + '<div class="bqx-hits">' + (q && !hits.length ? '<span class="bqd-note">' + esc(tr('Aucun article trouvé.')) + '</span>'
          : hits.map((p) => '<button type="button" class="bqd-btn sm" data-bqx-prod="' + esc(p.id) + '" data-i="' + l.i + '">' + esc(p.name) + ' · ' + esc(d.fmtMAD(Number(p.price) || 0)) + '</button>').join('')) + '</div></div>';
    }
    const from = partsOf(l);
    const chips = variantsOf(d, pk.pid).filter((v) => !(from && from.pid === pk.pid && v.size === from.size && v.color === from.color));
    body += '<div class="bqx-chips" role="group" aria-label="' + esc(tr('Choisissez la taille et la couleur.')) + '">' + (chips.length ? chips.map((v) => {
      const on = pk.size === v.size && pk.color === v.color;
      return '<button type="button" class="bqx-chip' + (on ? ' on' : '') + '" data-bqx-var="' + l.i + '" data-size="' + esc(v.size) + '" data-color="' + esc(v.color) + '" aria-pressed="' + on + '"' + (v.stock < pk.q ? ' disabled' : '') + '>'
        + esc(v.size) + ' · ' + esc(d.colorLabel(v.color)) + '<small>' + (v.stock > 0 ? String(v.stock) : esc(tr('épuisé'))) + '</small></button>';
    }).join('') : '<span class="bqd-note">' + esc(tr('Aucun article trouvé.')) + '</span>') + '</div>';
    return '<div class="bqx-item">' + body + '</div>';
  }).join('');
  const e = estimate(x, d);
  const sum = ready() ? '<div class="bqx-sum">'
    + '<div><span>' + esc(tr('Repris')) + '</span><b>' + esc(mad(e.back)) + '</b></div>'
    + '<div><span>' + esc(tr('Envoyé')) + '</span><b>' + esc(mad(e.out)) + '</b></div>'
    + '<div class="bqx-cod"><span>' + esc(tr('Le livreur encaisse')) + '</span><b>' + esc(mad(e.cod)) + '</b>'
    + (ex.fee ? '<small>' + esc(tr('dont {x} de livraison').replace('{x}', d.fmtMAD(FEE_MAD))) + '</small>' : '') + '</div></div>'
    + (e.credit > 0 ? '<p class="bqd-note">' + esc(tr('Article moins cher : la différence de {x} reste à la boutique.').replace('{x}', mad(e.credit))) + '</p>' : '') : '';
  const c = who || {};
  return '<div class="bqd-ret bqx" data-bqx>' + rows
    + '<label class="bqx-fee"><input type="checkbox" data-bqx-fee' + (ex.fee ? ' checked' : '') + '> ' + esc(tr('Livraison payée par la cliente ({x})').replace('{x}', d.fmtMAD(FEE_MAD))) + '</label>'
    + sum
    + (c.name ? '<div class="bqd-addr">' + esc([c.name, c.city, c.phone].filter(Boolean).join(' · ')) + (c.address ? '<span>' + esc(c.address) + '</span>' : '') + '</div>' : '')
    + '<p class="bqd-note">' + esc(tr('Ozon livre la nouvelle pièce et reprend l’ancienne.')) + '</p>'
    + '<div class="bqd-acts"><button type="button" class="bqd-btn" data-bqx-cancel>' + esc(tr('Annuler')) + '</button>'
    + '<button type="button" class="bqd-btn go" data-bqx-send' + (ready() && !ex.busy ? '' : ' disabled') + '>'
    + esc(ex.confirm ? tr('Confirmer · le livreur encaisse {x}').replace('{x}', mad(e.cod)) : tr('Envoyer l’échange avec Ozon')) + '</button></div></div>';
}

/* Les échanges déjà partis d'une commande, avec leur suivi Ozon. */
export function exchHistory(x, esc, parcelLine) {
  return (x.exchanges || []).map((e) => '<div class="bqx-done"><span class="bqd-tag">' + esc(tr('Échange')) + '</span> '
    + esc((e.swaps || []).map((s) => s.from + ' → ' + s.to).join(', ')) + '</div>' + parcelLine(e.id)).join('');
}

/* Un clic dans l'éditeur. Rend true quand il était pour lui. */
export function exchClick(target, x, d, repaint, done) {
  const t = (sel) => target.closest(sel);
  let b;
  if ((b = t('[data-bqx-open]'))) { exchStart(x); repaint(); return true; }
  if (!ex || !x || ex.saleId !== x.saleId) return false;
  if (t('[data-bqx-cancel]')) { ex = null; repaint(); return true; }
  if ((b = t('[data-bqx-pick]'))) {
    const i = Number(b.dataset.bqxPick);
    const line = (x.lines || []).find((l) => l.i === i);
    if (ex.picks[i]) delete ex.picks[i];
    else { const from = partsOf(line); ex.picks[i] = { q: 1, pid: from ? from.pid : '', size: '', color: '' }; }
    ex.confirm = false; ex.search = null; repaint(); return true;
  }
  if ((b = t('[data-bqx-q]'))) {
    const pk = ex.picks[b.dataset.bqxQ];
    if (pk) { const max = Number(b.dataset.max || Infinity); pk.q = Math.max(1, Math.min(max, pk.q + Number(b.dataset.d))); pk.size = ''; pk.color = ''; ex.confirm = false; }
    repaint(); return true;
  }
  if ((b = t('[data-bqx-other]'))) { const i = Number(b.dataset.bqxOther); ex.search = ex.search === i ? null : i; ex.q = ''; repaint(true); return true; }
  if ((b = t('[data-bqx-prod]'))) {
    const pk = ex.picks[b.dataset.i];
    if (pk) { pk.pid = b.dataset.bqxProd; pk.size = ''; pk.color = ''; ex.confirm = false; }
    ex.search = null; ex.q = ''; repaint(); return true;
  }
  if ((b = t('[data-bqx-var]'))) {
    const pk = ex.picks[b.dataset.bqxVar];
    if (pk && !b.disabled) { pk.size = b.dataset.size; pk.color = b.dataset.color; ex.confirm = false; }
    repaint(); return true;
  }
  if ((b = t('[data-bqx-fee]'))) { ex.fee = !!b.checked; ex.confirm = false; repaint(); return true; }
  /* Deux gestes : le premier montre ce que le livreur encaissera. */
  if (t('[data-bqx-send]')) {
    if (!ready() || ex.busy) return true;
    if (!ex.confirm) { ex.confirm = true; repaint(); return true; }
    send(x, d, repaint, done);
    return true;
  }
  return false;
}
export function exchInput(target, repaint) {
  if (!ex || !target || !target.matches('[data-bqx-q-in]')) return false;
  ex.q = target.value;
  repaint(true);
  return true;
}

function send(x, d, repaint, done) {
  const mine = ex;
  mine.busy = true; repaint();
  const swaps = Object.entries(mine.picks).map(([i, pk]) => ({ i: Number(i), q: pk.q, pid: pk.pid, size: pk.size, color: pk.color }));
  const body = { merchant: d.slug(), saleId: x.saleId, id: mine.id, swaps, feeOnCustomer: mine.fee, by: d.manager() };
  fetch('/api/ozon/exchange', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json().then((res) => ({ ok: r.ok, res })))
    .then(({ ok, res }) => {
      if (!ok || !res || !res.ok) { const err = new Error((res && res.error) || 'failed'); err.detail = res && res.message; throw err; }
      /* Le stock ne bouge qu'une fois : sur l'échange que le serveur vient
         d'accepter. La pièce envoyée sort, la pièce reprise rentre. */
      let back = 0, out = 0;
      if (!res.already) {
        const ref = tr('Échange') + ' ' + (x.ref || x.saleId);
        swaps.forEach((s) => {
          const line = (x.lines || []).find((l) => l.i === s.i);
          const from = partsOf(line);
          d.persistStock(s.pid, s.size, s.color, -s.q, ref, 'vente'); out += s.q;
          if (from) { d.persistStock(from.pid, from.size, from.color, s.q, ref, 'retour'); back += s.q; }
        });
      }
      ex = null;
      const cod = res.exchange ? res.exchange.codCents : 0;
      const head = [tr('Échange envoyé'), res.parcel && res.parcel.tracking ? fill('Ozon {code}', { code: res.parcel.tracking }) : ''];
      const tail = [tr('Le livreur encaisse') + ' ' + d.fmtMAD(cod / 100), back || out ? fill('{n} pièce(s) remise(s) en stock, {m} sortie(s).', { n: back, m: out }) : ''];
      d.toast(head.filter(Boolean).join(' · '), 5000, LEVEL.success, tail.filter(Boolean).join(' · '));
      done();
    })
    .catch((e) => {
      const code = e && e.message;
      d.toast(tr(ERRORS[code] || 'Échange non envoyé. Vérifiez la connexion et réessayez.'), 7000, LEVEL.warn, (e && e.detail) || '');
      if (ex === mine) { mine.busy = false; mine.confirm = false; }
      repaint();
    });
}

export function exchCss() {
  if (document.getElementById('bqx-css')) return;
  const s = document.createElement('style');
  s.id = 'bqx-css';
  s.textContent = [
    '#pos-boutique .bqx-item{display:flex;flex-direction:column;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--line,#E2DDD2);}',
    '#pos-boutique .bqx-line{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;font-size:14px;}',
    '#pos-boutique .bqx-line small{display:block;font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqx-qty,#pos-boutique .bqx-to{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13.5px;color:var(--ink-2,#3D4441);}',
    '#pos-boutique .bqx-find{display:flex;flex-direction:column;gap:8px;}',
    '#pos-boutique .bqx-find input{min-height:44px;padding:8px 12px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:16px;color:inherit;}',
    '#pos-boutique .bqx-hits{display:flex;flex-wrap:wrap;gap:6px;}',
    '#pos-boutique .bqx-chips{display:flex;flex-wrap:wrap;gap:6px;}',
    '#pos-boutique .bqx-chip{min-height:44px;padding:4px 12px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:13.5px;color:inherit;cursor:pointer;display:inline-flex;flex-direction:column;align-items:flex-start;justify-content:center;}',
    '#pos-boutique .bqx-chip small{font-size:11px;color:var(--ink-3,#6F6C65);font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bqx-chip.on{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0);}',
    '#pos-boutique .bqx-chip.on small{color:inherit;}',
    '#pos-boutique .bqx-chip[disabled]{opacity:.4;cursor:default;}',
    '#pos-boutique .bqx-fee{display:flex;align-items:center;gap:8px;font-size:14px;min-height:40px;}',
    '#pos-boutique .bqx-fee input{width:20px;height:20px;accent-color:var(--atlas,#0B6E4F);}',
    '#pos-boutique .bqx-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}',
    '#pos-boutique .bqx-sum div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid var(--line,#E2DDD2);border-radius:10px;min-width:0;}',
    '#pos-boutique .bqx-sum span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqx-sum b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bqx-sum small{font-size:11.5px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqx-sum .bqx-cod{border-color:var(--atlas,#0B6E4F);}',
    '#pos-boutique .bqx-done{font-size:13px;color:var(--ink-2,#3D4441);}',
    '@media (max-width:760px){#pos-boutique .bqx-sum{grid-template-columns:1fr;}}',
  ].join('\n');
  document.head.appendChild(s);
}
