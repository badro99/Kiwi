/* Owner: caisse delivery mode (« Livraison »), spec
 * docs/specs/2026-11-24-plateformes-de-livraison.md.
 * Exposes classic global declarations named dlv* that the catalogue, the 2027
 * frame, the kitchen and the accounting parts call behind a typeof guard.
 * Requires caisse-app.js shared lexical state (mode, cart, kdsOrders,
 * vrapEditingNum, tenderInFlight) at call time, and window.KiwiDelivery
 * (assets/delivery.js, deferred). Nothing here runs at load but one
 * DOMContentLoaded hook that mounts the pill.
 *
 * LE GESTE : le caissier lit la commande sur la tablette Glovo, touche
 * « Livraison », choisit la plateforme, tape les plats. La carte est aux prix
 * de CETTE plateforme ; un plat qu'elle ne vend pas est grisé. Le numéro de la
 * plateforme est facultatif et rien ne bloque jamais. « Envoyer » part en
 * cuisine et range la vente comme réglée par la plateforme (méthode
 * `platform`, canal = la plateforme), jamais en espèces ni en carte. La
 * livraison maison garde les prix de la salle, ajoute ses frais, et se règle
 * comme une vente normale.
 *
 * Rien n'apparaît tant que le patron n'a pas allumé une option. */

let dlvCtx = null;        // { id, ref } : la commande de livraison en cours de saisie
let dlvPayLabel = null;   // le libellé livré de « Encaisser », rendu en sortant
let dlvSending = false;

const DLV_T = {
  pill: { fr: 'Livraison', en: 'Delivery', ar: 'توصيل' },
  pick: { fr: 'Quelle livraison ?', en: 'Which delivery?', ar: 'أي توصيل؟' },
  cancel: { fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' },
  ref: { fr: 'N° de commande {n} (facultatif)', en: '{n} order no. (optional)', ar: 'رقم طلب {n} (اختياري)' },
  dup: { fr: 'Déjà saisie à {t} · #{n}', en: 'Already entered at {t} · #{n}', ar: 'سبق إدخالها على {t} · #{n}' },
  off: { fr: 'Pas vendu sur {n}', en: 'Not sold on {n}', ar: 'غير معروض على {n}' },
  send: { fr: 'Envoyer · {n}', en: 'Send · {n}', ar: 'إرسال · {n}' },
  fee: { fr: 'Frais de livraison', en: 'Delivery fee', ar: 'رسوم التوصيل' },
  leave: { fr: 'Quitter la livraison', en: 'Leave delivery', ar: 'الخروج من التوصيل' },
  sent: { fr: '{n} · commande envoyée en cuisine', en: '{n} · order sent to the kitchen', ar: '{n} · أُرسل الطلب إلى المطبخ' },
  check: { fr: 'Encaissement à vérifier dans le journal avant de réessayer', en: 'Check the journal before trying again', ar: 'تحقق من السجل قبل إعادة المحاولة' },
  handover: { fr: 'Remis au livreur', en: 'Handed to rider', ar: 'سُلّم للسائق' },
  platform: { fr: 'Plateforme', en: 'Platform', ar: 'منصة' },
};
function dlvLang() {
  try { const l = window.KiwiCaisseLang ? window.KiwiCaisseLang.get() : localStorage.getItem('kiwiCaisseLang'); return l === 'en' || l === 'ar' ? l : 'fr'; } catch (_) { return 'fr'; }
}
function dlvT(key, vars) {
  const o = DLV_T[key] || {};
  let s = o[dlvLang()] || o.fr || key;
  Object.keys(vars || {}).forEach((k) => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}
const dlvEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dlvApi = () => window.KiwiDelivery || null;

/* ── où en est-on ── */
function dlvOn() { const D = dlvApi(); try { return !!(D && D.enabled()); } catch (_) { return false; } }
/* Une commande de livraison rouverte depuis le tableau (pour l'encaisser ou y
   ajouter un plat) reste une commande de livraison : ses prix et son canal la
   suivent sans que le caissier ait à re-choisir la plateforme. */
function dlvOpenOrder() {
  if (typeof mode === 'undefined' || mode !== 'vrap' || vrapEditingNum == null) return null;
  const o = kdsOrders.find((x) => x && x.num === vrapEditingNum);
  return o && o.delivery && o.delivery.id ? o.delivery : null;
}
function dlvCur() {
  if (typeof mode === 'undefined' || mode !== 'vrap') return null;
  return dlvOpenOrder() || dlvCtx;
}
const dlvIsHouse = (c) => !!c && c.id === 'livraison';
function dlvIsPlatform() { const c = dlvCur(); return !!c && !dlvIsHouse(c); }
function dlvName(id) { const D = dlvApi(); return (D && D.labelOf(id)) || id; }

/* ── les prix ── */
function dlvPriceFor(m) {
  const c = dlvCur(), D = dlvApi();
  if (!m || !c || dlvIsHouse(c)) return m ? m.price : null;
  return D ? D.priceOf(m.id, c.id) : null;
}
/* La carte affichée : à la plateforme, chaque plat à SON prix ; sans prix, il
   reste visible mais grisé (le caissier voit qu'il existe et qu'il n'est pas
   vendu là). La salle et la livraison maison ne changent rien. */
function dlvList(list) {
  const c = dlvCur();
  if (!c || dlvIsHouse(c) || !Array.isArray(list)) return list;
  return list.map((m) => {
    const p = dlvPriceFor(m);
    return p == null ? Object.assign({}, m, { dlvOff: true }) : Object.assign({}, m, { price: p });
  });
}
/* « Pas sur Glovo » sur la tuile grisée du kit 2027 (sinon il dirait « Épuisé »). */
function dlvOffLabel() { const c = dlvCur(); return c ? dlvT('off', { n: dlvName(c.id) }) : ''; }
/* L'article qui entre dans la note : au prix de la plateforme, ou refusé avec
   un mot si elle ne le vend pas. */
function dlvItem(m) {
  const c = dlvCur();
  if (!m || !c || dlvIsHouse(c)) return m;
  const p = dlvPriceFor(m);
  if (p == null) { toast(dlvT('off', { n: dlvName(c.id) })); return null; }
  return Object.assign({}, m, { price: p });
}
/* Les suppléments (lait d'avoine, double fromage) : le prix plateforme quand le
   patron en a mis un, sinon celui de la salle. */
function dlvGroups(groups) {
  const c = dlvCur(), D = dlvApi();
  if (!c || dlvIsHouse(c) || !D || !Array.isArray(groups)) return groups;
  return groups.map((g) => Object.assign({}, g, {
    choices: (g.choices || []).map((ch) => {
      const p = D.choicePriceOf(ch.id, c.id);
      return p == null ? ch : Object.assign({}, ch, { price: p });
    }),
  }));
}
/* Une promotion de la carte vise la salle : elle ne s'applique pas au prix
   d'une plateforme, qui a déjà sa propre logique. */
function dlvNoPromo() { return dlvIsPlatform(); }

/* ── ce qui voyage avec la commande ── */
function dlvTag() {
  if (!dlvCtx || typeof mode === 'undefined' || mode !== 'vrap') return undefined;
  const tag = { id: dlvCtx.id, ref: String(dlvCtx.ref || '').slice(0, 16), name: dlvName(dlvCtx.id) };
  if (dlvIsHouse(dlvCtx)) {
    const fee = (cart || []).filter((l) => l && l.kind === 'fee').reduce((s, l) => s + (+l.price || 0) * (+l.qty || 0), 0);
    if (fee > 0) tag.fee = Math.round(fee * 100) / 100;
  }
  return tag;
}
/* Les frais de livraison ne partent pas en cuisine. */
function dlvKitchenLine(l) { return !l || l.kind !== 'fee'; }
/* Une commande maison rouverte retrouve sa ligne de frais (le bon de cuisine ne
   l'avait pas emportée). */
function dlvFeeLines(o) {
  const d = o && o.delivery, fee = d && +d.fee;
  if (!d || !(fee > 0)) return [];
  const have = (o.billItems || []).some((i) => i && i.kind === 'fee');
  return have ? [] : [{ n: dlvT('fee'), p: fee, q: 1, kind: 'fee' }];
}
function dlvMethod(method) { return dlvIsPlatform() ? 'platform' : method; }
/* La vente : son canal est l'option (« glovo », « livraison »), son libellé dit
   la plateforme et son numéro, comme la tablette du livreur. */
function dlvSaleTag(entry, order) {
  const d = (order && order.delivery) || dlvTag();
  if (!entry || !d || !/^[a-z]{2,24}$/.test(String(d.id || ''))) return;
  entry.channel = d.id;
  entry.delivery = { id: d.id, ref: String(d.ref || '') };
  const head = [d.name || dlvName(d.id), d.ref].filter(Boolean).join(' ');
  entry.label = (head + (entry.ref ? ' #' + entry.ref : '')).slice(0, 80);
}
/* Le Z imprimé nomme chaque plateforme, y compris celles que le patron a
   ajoutées (« pfjahez » → « Jahez »). */
function dlvMethodLabels() {
  const D = dlvApi(), out = {};
  try { (D ? D.platforms() : []).forEach((p) => { out[p.id] = p.name; }); } catch (_) {}
  return out;
}
function dlvLabel(e) { return e && e.delivery ? dlvName(e.delivery.id) : dlvT('platform'); }
/* « GLOVO · A3F9 » en tête du bon de cuisine, là où la salle écrit sa table. */
function dlvTicketHead(order) {
  const d = order && order.delivery;
  if (!d) return '';
  return [String(d.name || dlvName(d.id)).toUpperCase(), d.ref].filter(Boolean).join(' · ');
}
function dlvBadge(o) {
  const d = o && o.delivery, D = dlvApi();
  if (!d) return '';
  if (D) { D.ensureCSS(); return ' ' + D.badgeHTML(d.id, d.ref, 20); }
  return ' <span class="kdl-badge"><b>' + dlvEsc(d.name || d.id) + '</b>' + (d.ref ? ' ' + dlvEsc(d.ref) : '') + '</span>';
}
const DLV_LOGOS = { glovo: 1, kooul: 1, yassir: 1 };
function dlvSource(o) {
  const d = o.delivery;
  return { kind: 'delivery', label: [d.name || dlvName(d.id), d.ref].filter(Boolean).join(' '),
    logo: DLV_LOGOS[d.id] ? 'assets/brands/delivery/' + d.id + '.png' : '' };
}
function dlvHandoverLabel(o) { return o && o.delivery ? dlvT('handover') : 'Remettre au client'; }

/* ── entrer, sortir ── */
function dlvStart(id) {
  const D = dlvApi(), opt = D && D.option(id);
  if (!opt) return;
  if (typeof isFeatureOff === 'function' && isFeatureOff('vrap')) return;
  dlvCtx = null;
  /* Le chemin livré vers « À emporter » (il ferme ce qui doit l'être et garde
     une commande de table en cours) : on ne réinvente pas la transition. */
  if (mode !== 'vrap') { const v = document.querySelector('.mode-pill[data-mode="vrap"]'); if (v) v.click(); }
  if (mode !== 'vrap') return;
  currentOrder().setEditing(null);
  clearCart();
  dlvCtx = { id, ref: '' };
  setVrapView('builder');
  if (opt.kind === 'house' && opt.fee > 0) {
    currentOrder().append(cart, { uid: newLineUid(), id: 'dlv-fee', kind: 'fee', name: dlvT('fee'), price: opt.fee, qty: 1, note: '', opts: [], optSig: '' });
  }
  dlvRepaint();
  const input = document.querySelector('.kdl-band input');
  if (input && !window.matchMedia('(pointer: coarse)').matches) input.focus();
}
/* `quiet` : appelé par le retour au tableau (après l'envoi ou la flèche
   retour) ; la note a déjà été vidée ou rangée par son propre chemin. */
function dlvEnd(quiet) {
  if (!dlvCtx && quiet) { dlvPaint(); return; }
  const had = !!dlvCtx;
  dlvCtx = null;
  if (!quiet && had && vrapEditingNum == null) clearCart();
  if (!quiet && had) setVrapView('board');
  dlvRepaint();
}
function dlvRepaint() {
  try { renderMenu(); } catch (_) {}
  try { renderCart(); } catch (_) {}
  dlvPaint();
  try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
}

/* ── envoyer : la plateforme a encaissé ── */
async function dlvSend() {
  const c = dlvCur();
  if (!c || dlvIsHouse(c) || tenderInFlight || dlvSending) return;
  if (!(cart || []).some((l) => l && l.qty > 0 && l.kind !== 'fee')) return;
  const name = dlvName(c.id);
  dlvSending = true;
  tenderInFlight = true;
  let settled;
  try { settled = await finalizeTender('platform'); }
  catch (_) { tenderInFlight = false; dlvSending = false; toast(dlvT('check')); return; }
  tenderInFlight = false;
  dlvSending = false;
  if (settled === 'complete') toast(dlvT('sent', { n: name }));
  dlvRepaint();
}
/* Le bouton « Encaisser » livré (et la carte) devient « Envoyer · Glovo » sur
   une commande de plateforme : on l'intercepte avant son propre écouteur. */
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest && e.target.closest('#pay-charge, #pay-card');
  if (!t || !dlvIsPlatform()) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  dlvSend();
}, true);
/* Le kit 2027 : son « Encaisser » passe par ici. Vrai = c'est réglé. */
function dlvPay() {
  if (!dlvIsPlatform()) return false;
  dlvSend();
  return true;
}

/* ── le choix de la plateforme ── */
let dlvVeil = null;
function dlvOpen() {
  const D = dlvApi();
  if (!D || !dlvOn()) return;
  const opts = D.options();
  if (opts.length === 1) { dlvStart(opts[0].id); return; }
  if (!dlvVeil) {
    dlvVeil = document.createElement('div');
    dlvVeil.className = 'cloture-veil kdl-veil';
    dlvVeil.setAttribute('role', 'dialog');
    dlvVeil.setAttribute('aria-modal', 'true');
    document.body.appendChild(dlvVeil);
    dlvVeil.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kdl-pick]');
      if (b) { dlvVeil.classList.remove('is-open'); dlvStart(b.getAttribute('data-kdl-pick')); return; }
      if (e.target === dlvVeil || e.target.closest('[data-kdl-cancel]')) dlvVeil.classList.remove('is-open');
    });
  }
  D.ensureCSS();
  dlvVeil.innerHTML = '<div class="cloture-card kdl-pick-card"><div class="clo-title">' + dlvEsc(dlvT('pick')) + '</div>'
    + '<div class="kdl-pick">' + opts.map((o) => '<button type="button" class="kdl-pick-btn" data-kdl-pick="' + dlvEsc(o.id) + '">'
      + D.logoHTML(o.id, 40) + '<span>' + dlvEsc(o.name) + '</span>'
      + (o.kind === 'house' && o.fee ? '<small class="mono">+' + dlvEsc(fmtMAD(o.fee)) + '</small>' : '') + '</button>').join('') + '</div>'
    + '<div class="clo-foot"><button type="button" data-kdl-cancel>' + dlvEsc(dlvT('cancel')) + '</button></div></div>';
  dlvVeil.classList.add('is-open');
}

/* ── ce qui se voit : la pastille, le bandeau, le bouton ── */
function dlvCSS() {
  if (document.getElementById('kdl-till-css')) return;
  const s = document.createElement('style');
  s.id = 'kdl-till-css';
  s.textContent = '.kdl-band{display:flex;align-items:center;gap:10px;margin:0 0 10px;padding:8px 10px 8px 12px;border:1px solid var(--k-line,var(--line,rgba(0,0,0,.12)));border-inline-start:5px solid var(--kdl-c,#0B6E4F);border-radius:12px;background:var(--k-surface-1,var(--paper,#F7F5F0))}'
    + '.kdl-band-name{font-weight:600;font-size:15px;white-space:nowrap}'
    + '.kdl-band input{flex:1;min-width:0;height:36px;padding:0 10px;border:1px solid var(--k-line,var(--line,rgba(0,0,0,.15)));border-radius:8px;background:transparent;color:inherit;font:inherit;font-family:"JetBrains Mono",ui-monospace,monospace;text-transform:uppercase}'
    + '.kdl-band input::placeholder{text-transform:none;font-family:inherit;opacity:.6}'
    + '.kdl-band-dup{font-size:12px;color:var(--k-warning,#9A6700);white-space:nowrap}'
    + '.kdl-band-x{flex:none;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.kdl-band-x svg{width:20px;height:20px}'
    + '.menu-item.is-dlv-off{opacity:.38;filter:grayscale(1)}'
    + '.kdl-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:14px 0}'
    + '.kdl-pick-btn{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 10px;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:14px;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}'
    + '.kdl-pick-btn:hover,.kdl-pick-btn:focus-visible{background:color-mix(in srgb,currentColor 8%,transparent)}'
    + '.kdl-pick-btn small{font-weight:400;opacity:.7}'
    + '.mode-pill[data-mode="livraison"] .kdl-tile{width:18px;height:18px}'
    + 'body.kdl-platform #pay-card,body.kdl-platform #pay-split,body.kdl-platform #rp-pay-normal [data-action="discount"]{display:none}'
    + 'body.kdl-platform #pay-charge .kdl-tile{margin-inline-end:6px}';
  (document.head || document.documentElement).appendChild(s);
}
const DLV_X = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>';
function dlvPill() {
  const sel = document.querySelector('.mode-selector');
  if (!sel) return null;
  let b = sel.querySelector('.mode-pill[data-mode="livraison"]');
  const vrap = sel.querySelector('.mode-pill[data-mode="vrap"]');
  const show = dlvOn() && !!vrap && !vrap.hidden && !(typeof isFeatureOff === 'function' && isFeatureOff('vrap'));
  if (!show) { if (b) b.remove(); return null; }
  if (!b) {
    b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode-pill';
    b.setAttribute('data-mode', 'livraison');
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M200-160q-66 0-113-47T40-320q0-66 47-113t113-47q51 0 92 29t59 77h75l-60-178h-84q-17 0-28.5-11.5T242-592q0-17 11.5-28.5T282-632h84q26 0 46 14t28 38l66 196 132-130-30-80h-50q-17 0-28.5-11.5T518-634q0-17 11.5-28.5T558-674h52q25 0 45.5 14t28.5 38l38 104h38q66 0 113 47t47 113q0 66-47 113t-113 47q-66 0-113-47t-47-113q0-27 8-51.5t24-44.5l-10-25-122 122q-11 11-25.5 17t-30.5 6h-77q-18 48-59 77t-92 29Zm0-80q38 0 63-25.5t25-54.5h-88q-17 0-28.5-11.5T160-360q0-17 11.5-28.5T200-400h88q0-29-25-54.5T200-480q-33 0-56.5 23.5T120-400q0 33 23.5 56.5T200-320Zm560 0q33 0 56.5-23.5T840-400q0-33-23.5-56.5T760-480q-33 0-56.5 23.5T680-400q0 33 23.5 56.5T760-320Z"/></svg><span></span>';
    b.addEventListener('click', () => { if (typeof closeSideScreens === 'function') closeSideScreens(); dlvOpen(); });
    vrap.insertAdjacentElement('afterend', b);
  }
  b.querySelector('span').textContent = dlvT('pill');
  return b;
}
function dlvRef(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16); }
/* Le même numéro de plateforme déjà saisi aujourd'hui : on le DIT, on ne
   bloque pas (deux commandes peuvent légitimement se suivre). */
function dlvDuplicate(c) {
  if (!c || !c.ref) return null;
  const since = Date.now() - 18 * 3600000;
  const editing = vrapEditingNum;
  return kdsOrders.find((o) => o && o.delivery && o.delivery.id === c.id && o.delivery.ref === c.ref
    && o.num !== editing && new Date(o.sentAt).getTime() > since) || null;
}
function dlvBand() {
  const builder = document.getElementById('vrap-builder');
  let band = builder && builder.querySelector('.kdl-band');
  const c = dlvCur(), D = dlvApi();
  if (!builder || !c || !D) { if (band) band.remove(); return; }
  const opt = D.option(c.id) || { id: c.id, name: dlvName(c.id), color: '' };
  if (!band) {
    band = document.createElement('div');
    band.className = 'kdl-band';
    const back = document.getElementById('vrap-back-board');
    if (back) back.insertAdjacentElement('afterend', band); else builder.prepend(band);
    band.addEventListener('input', (e) => {
      if (!e.target.matches('input')) return;
      const v = dlvRef(e.target.value);
      if (e.target.value !== v) e.target.value = v;
      const open = dlvOpenOrder();
      if (open) open.ref = v; else if (dlvCtx) dlvCtx.ref = v;
      dlvDup(band);
    });
    band.addEventListener('click', (e) => { if (e.target.closest('.kdl-band-x')) dlvEnd(false); });
  }
  if (band.getAttribute('data-id') !== c.id) {
    band.setAttribute('data-id', c.id);
    band.style.setProperty('--kdl-c', opt.color || 'var(--k-ink-2,#5b635f)');
    band.innerHTML = D.logoHTML(c.id, 28) + '<span class="kdl-band-name">' + dlvEsc(opt.name) + '</span>'
      + (dlvIsHouse(c) ? '<span style="flex:1"></span>' : '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="16" aria-label="' + dlvEsc(dlvT('ref', { n: opt.name })) + '" placeholder="' + dlvEsc(dlvT('ref', { n: opt.name })) + '">')
      + '<span class="kdl-band-dup" hidden></span>'
      + (dlvOpenOrder() ? '' : '<button type="button" class="kdl-band-x" aria-label="' + dlvEsc(dlvT('leave')) + '" title="' + dlvEsc(dlvT('leave')) + '">' + DLV_X + '</button>');
  }
  const input = band.querySelector('input');
  if (input && document.activeElement !== input) input.value = c.ref || '';
  dlvDup(band);
}
function dlvDup(band) {
  const el = band.querySelector('.kdl-band-dup');
  const o = dlvDuplicate(dlvCur());
  if (!el) return;
  el.hidden = !o;
  if (o) {
    const at = new Date(o.sentAt);
    el.textContent = dlvT('dup', { t: String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0'), n: ticketNo(o) });
  }
}
function dlvPaint() {
  dlvCSS();
  if (dlvCtx && mode !== 'vrap') dlvCtx = null;
  const pill = dlvPill();
  const c = dlvCur();
  if (pill) {
    pill.setAttribute('aria-pressed', c ? 'true' : 'false');
    const vrap = document.querySelector('.mode-pill[data-mode="vrap"]');
    if (vrap && c) vrap.setAttribute('aria-pressed', 'false');
    else if (vrap && mode === 'vrap') vrap.setAttribute('aria-pressed', 'true');
  }
  dlvBand();
  const platform = dlvIsPlatform();
  document.body.classList.toggle('kdl-platform', platform);
  const lbl = document.querySelector('#pay-charge .pay-charge-lbl');
  if (lbl) {
    if (platform) {
      if (dlvPayLabel == null) dlvPayLabel = lbl.innerHTML;
      const D = dlvApi();
      lbl.innerHTML = (D ? D.logoHTML(c.id, 20) : '') + dlvEsc(dlvT('send', { n: dlvName(c.id) }));
    } else if (dlvPayLabel != null) { lbl.innerHTML = dlvPayLabel; dlvPayLabel = null; }
  }
}
/* Le rail du kit 2027 : « Livraison » sous « À emporter », seulement quand une
   option est allumée. */
function dlvRailItem() {
  if (!dlvPill()) return null;
  return { id: 'delivery', icon: 'two_wheeler', label: dlvT('pill') };
}

/* Le module partagé (assets/delivery.js) arrive APRÈS les scripts différés,
   dont venue-store.js qu'il lit au chargement : la caisse est à son plafond de
   balises <script>, il se charge donc d'ici. */
function dlvBoot() {
  const D = dlvApi();
  if (D && D.subscribe) D.subscribe(() => { if (!dlvOn() && dlvCtx) dlvEnd(false); else dlvPaint(); try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {} });
  dlvPaint();
  /* Le panneau livré se repeint par ses propres chemins (choix d'une commande,
     retour au tableau) : on suit le mode et la commande ouverte. */
  const sync = () => { try { dlvPaint(); } catch (_) {} };
  document.addEventListener('click', (e) => {
    /* « À emporter » touché pendant une livraison : on revient au comptoir. */
    if (dlvCtx && e.target && e.target.closest && e.target.closest('.mode-pill[data-mode="vrap"]')) { dlvEnd(false); return; }
    setTimeout(sync, 0);
  });
  document.addEventListener('kiwi-config', sync);
  /* Le rail du kit 2027 s'est peint avant ce module : il le repeint. */
  try { if (typeof tillKitPaint === 'function') tillKitPaint(); } catch (_) {}
}
document.addEventListener('DOMContentLoaded', () => {
  if (dlvApi()) { dlvBoot(); return; }
  const s = document.createElement('script');
  s.src = 'assets/delivery.js?v=4';
  s.onload = dlvBoot;
  document.head.appendChild(s);
});
